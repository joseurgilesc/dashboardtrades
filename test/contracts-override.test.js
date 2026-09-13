/* test/contracts-override.test.js
 * VM harness for the calculator's manual contracts override.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context, then
 * extracts the REAL `syncInstrument`, `syncContracts`, `clampDailyRiskPct`,
 * `renderRiskPanel` and `readForm` functions from js/app.js (brace-matched,
 * not re-implemented) and runs them against a tiny fake DOM. No browser, no
 * Firebase, no build step.
 *
 * Proves:
 *   [1] #riskContracts syncs BOTH ways with the canonical #contracts;
 *   [2] an untouched field is re-prefilled with the suggestion, a user-typed
 *       value is NEVER overwritten;
 *   [3] the reported real risk is `contracts × stopTicks × tickValue` and the
 *       `% del capital` follows it, for several contract values;
 *   [4] the advisory warning fires only when the real risk exceeds the
 *       per-trade cupo, and never blocks or zeroes the calculation;
 *   [5] THE LOOP IS BROKEN: changing contracts leaves the resolved stop ticks,
 *       the daily budget, the per-trade cupo and the max-ticks-one-contract
 *       EXACTLY unchanged;
 *   [6] structural: the input markup, the wiring and the single-source read.
 *
 * Run: node test/contracts-override.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const instrumentsSrc = fs.readFileSync(path.join(ROOT, 'js', 'instruments.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ------------------------------------------------------------------ */
/* Tiny assertion harness                                              */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('  PASS  ' + name);
  } else {
    failures.push(name);
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected,
    'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

/* ------------------------------------------------------------------ */
/* Extract the real functions from app.js (brace matching)             */
/* ------------------------------------------------------------------ */

function extractFunction(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error('signature not found: ' + signature);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) { i += 1; break; }
    }
  }
  return src.slice(start, i);
}

const extracted = [
  extractFunction(appSrc, 'function syncInstrument(value)'),
  extractFunction(appSrc, 'function syncContracts(value)'),
  extractFunction(appSrc, 'function clampDailyRiskPct(value)'),
  extractFunction(appSrc, 'function renderRiskPanel()'),
  extractFunction(appSrc, 'function readForm()')
].join('\n');

/* ------------------------------------------------------------------ */
/* Real Store (instruments + store) in its own context                 */
/* ------------------------------------------------------------------ */

const storeContext = vm.createContext({ console: console });
vm.runInContext(
  instrumentsSrc + '\n' + storeSrc +
  '\n;globalThis.Store = Store; globalThis.INSTRUMENTS = INSTRUMENTS;' +
  '\n;globalThis.DEFAULT_INSTRUMENT = DEFAULT_INSTRUMENT;',
  storeContext,
  { filename: 'store-bundle.js' }
);
const Store = storeContext.Store;
const INSTRUMENTS = storeContext.INSTRUMENTS;

/* ------------------------------------------------------------------ */
/* Fake DOM + the extracted UI functions                               */
/* ------------------------------------------------------------------ */

const elements = {};
function makeElement() {
  const el = {
    value: '',
    hidden: false,
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    classes: {},
    classList: {
      toggle: function (name, on) { el.classes[name] = !!on; },
      add: function () {},
      remove: function () {},
      contains: function () { return false; }
    },
    addEventListener: function () {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    appendChild: function () {},
    removeChild: function () {},
    focus: function () {}
  };
  return el;
}

function $(id) {
  if (!elements[id]) elements[id] = makeElement();
  return elements[id];
}

const uiContext = vm.createContext({
  console: console,
  Store: Store,
  INSTRUMENTS: INSTRUMENTS,
  DEFAULT_INSTRUMENT: storeContext.DEFAULT_INSTRUMENT,
  ACCOUNTS: ['Sim', 'Real', 'Fondeo'],
  DEFAULT_RISK_PCT: 2,
  DEFAULT_DAILY_TRADE_LIMIT: 3,
  DAILY_DD_WARN_PCT: 5,
  STREAK_WARN: 3,
  state: { editingId: null },
  $: $
});

const stubs = [
  'var lastRiskAccount = null;',
  'var stopTicksTouched = false;',
  'var tradesPerDayTouched = false;',
  'var contractsTouched = false;',
  'var touchedFields = { stop: false, exitPrice: false };',
  'var editingTarget = 0;',
  'var riskItems = {};',
  'function instrumentMeta(id) { return INSTRUMENTS[id] || null; }',
  'function setRiskItem(id, text, cls) { riskItems[id] = { text: text, cls: cls || "" }; }',
  'function formatMoney(v) { return "$" + Number(v).toFixed(2); }',
  'function formatNumber(v, d) { return Number(v).toFixed(d); }',
  'function formatTicks(v) { return String(v) + " ticks"; }',
  'function renderRiskMarketTable() {}',
  'function renderPriceSuggestions() {}',
  'function renderRiskPreview() {}',
  'function riskBlockMessage() { return "blocked"; }',
  'function readRatio() { var el = $("riskRatio"); var n = el ? parseFloat(el.value) : NaN; return (isFinite(n) && n > 0) ? n : 2; }',
  'function ratioLabel(v) { return "1:" + v; }'
].join('\n');

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-contracts-functions.js' });

function riskText(id) { return (uiContext.riskItems[id] || {}).text; }
function riskCls(id) { return (uiContext.riskItems[id] || {}).cls; }

/* ------------------------------------------------------------------ */
/* Fixture: Sim 100k, MES, 2 % / 3 op, manual stop 8 ticks.            */
/*   tickValue      = 0.25 x 5          = 1.25                         */
/*   P_m            = 8 x 1.25          = 10                           */
/*   dailyBudget    = 2 % x 100000      = 2000                         */
/*   perTradeBudget = 2000 / 3          = 666.67                       */
/*   maxTicks       = floor(666.67/1.25)= 533                          */
/*   suggestion     = floor(666.67/10)  = 66                           */
/* ------------------------------------------------------------------ */

Store.setBalances({ Sim: 100000, Real: 5000, Fondeo: 50000 });
$('account').value = 'Sim';
$('instrument').value = 'MES';
$('riskInstrument').value = 'MES';
$('direction').value = 'Largo';
$('entryPrice').value = '5000';
$('riskRatio').value = '2';
$('riskDailyPctInput').value = '2';
$('riskTradesPerDayInput').value = '3';
$('riskStopTicks').value = '8';
uiContext.stopTicksTouched = true;   /* fix the stop so the chain is stable */
uiContext.contractsTouched = false;
uiContext.lastRiskAccount = null;
uiContext.renderRiskPanel();

/* ------------------------------------------------------------------ */
/* [1] Bidirectional sync with the canonical #contracts                */
/* ------------------------------------------------------------------ */

console.log('\n[1] #riskContracts syncs both ways with #contracts');

eq('untouched render prefills the form field', $('contracts').value, '66');
eq('untouched render prefills the calculator input', $('riskContracts').value, '66');
eq('both views hold the same value', $('contracts').value, $('riskContracts').value);

/* Calculator -> form (mirrors the riskContracts change handler). */
$('riskContracts').value = '5';
uiContext.contractsTouched = true;
uiContext.syncContracts($('riskContracts').value);
eq('calculator input reaches #contracts', $('contracts').value, '5');
eq('calculator input keeps its value', $('riskContracts').value, '5');

/* Form -> calculator (mirrors the contracts change handler). */
$('contracts').value = '9';
uiContext.syncContracts($('contracts').value);
eq('form input reaches #riskContracts', $('riskContracts').value, '9');

/* renderRiskPanel mirrors the canonical value while touched. */
$('riskContracts').value = '';       /* force a divergence to prove the mirror */
$('contracts').value = '9';
uiContext.renderRiskPanel();
eq('render mirrors the canonical value while touched', $('riskContracts').value, '9');

/* Exactly one value reaches the save payload. */
eq('readForm reads the canonical contracts', uiContext.readForm().contracts, 9);
check('readForm never reads the calculator input',
  extractFunction(appSrc, 'function readForm()').indexOf('riskContracts') === -1);

/* ------------------------------------------------------------------ */
/* [2] Untouched -> suggestion; touched -> user-owned                  */
/* ------------------------------------------------------------------ */

console.log('\n[2] Untouched suggestion vs user-owned value');

uiContext.contractsTouched = true;
$('contracts').value = '3';
uiContext.renderRiskPanel();
eq('a user-typed value is never overwritten', $('contracts').value, '3');
eq('the calculator view mirrors the user value', $('riskContracts').value, '3');
eq('readForm sees the user value', uiContext.readForm().contracts, 3);

uiContext.contractsTouched = false;
$('contracts').value = '999';
uiContext.renderRiskPanel();
eq('an untouched field is re-prefilled with the suggestion', $('contracts').value, '66');
eq('the calculator view is re-prefilled too', $('riskContracts').value, '66');

/* ------------------------------------------------------------------ */
/* [3] Reported real risk = contracts x stopTicks x tickValue          */
/* ------------------------------------------------------------------ */

console.log('\n[3] Reported real risk and % of capital');

const STOP_TICKS = 8;
const TICK_VALUE = 1.25;
const CAPITAL = 100000;

[1, 2, 5, 10, 66].forEach(function (n) {
  uiContext.contractsTouched = true;
  $('contracts').value = String(n);
  uiContext.renderRiskPanel();
  const expectedRisk = n * STOP_TICKS * TICK_VALUE;
  const expectedPct = (expectedRisk / CAPITAL) * 100;
  eq(n + ' contracts -> real risk', riskText('riskRealRisk'), '$' + expectedRisk.toFixed(2));
  eq(n + ' contracts -> % capital', riskText('riskRealRiskPct'), expectedPct.toFixed(2) + ' %');
});

/* The report follows a stop change too (same formula, new stop). */
uiContext.stopTicksTouched = true;
$('riskStopTicks').value = '16';
$('contracts').value = '4';
uiContext.renderRiskPanel();
eq('real risk follows the stop distance', riskText('riskRealRisk'), '$' + (4 * 16 * TICK_VALUE).toFixed(2));
eq('per-contract risk follows the stop distance', riskText('riskPerContract'), '$' + (16 * TICK_VALUE).toFixed(2));

/* Restore the 8-tick fixture for the remaining checks. */
$('riskStopTicks').value = '8';
uiContext.renderRiskPanel();

/* ------------------------------------------------------------------ */
/* [4] Warning when the real risk exceeds the per-trade cupo           */
/* ------------------------------------------------------------------ */

console.log('\n[4] Advisory warning on the per-trade cupo');

/* 66 x 10 = 660 <= 666.67 -> within the cupo. */
uiContext.contractsTouched = true;
$('contracts').value = '66';
uiContext.renderRiskPanel();
eq('within the cupo: no warning', $('riskContractsWarning').hidden, true);
eq('within the cupo: no warn class', riskCls('riskRealRisk'), '');
eq('within the cupo: calculation stays operative', riskText('riskState'), 'Operativo');

/* 67 x 10 = 670 > 666.67 -> exceeds the cupo. */
$('contracts').value = '67';
uiContext.renderRiskPanel();
eq('above the cupo: warning shown', $('riskContractsWarning').hidden, false);
check('warning names the per-operation cupo',
  $('riskContractsWarning').textContent.indexOf('cupo por operación') !== -1);
eq('above the cupo: warn class on the real risk', riskCls('riskRealRisk'), 'warn');
eq('above the cupo: warn class on the percentage', riskCls('riskRealRiskPct'), 'warn');
eq('the calculation is never blocked', riskText('riskState'), 'Operativo');
eq('the contract count is never zeroed', uiContext.readForm().contracts, 67);

/* A far larger override still only warns (never blocks/zeroes). */
$('contracts').value = '500';
uiContext.renderRiskPanel();
eq('a large override still reports the real risk', riskText('riskRealRisk'), '$5000.00');
eq('a large override still warns (not blocks)', riskText('riskState'), 'Operativo');
eq('a large override keeps the user value', uiContext.readForm().contracts, 500);

/* ------------------------------------------------------------------ */
/* [5] The loop is broken: contracts never feed the sizing chain       */
/* ------------------------------------------------------------------ */

console.log('\n[5] Changing contracts leaves the sizing chain unchanged');

uiContext.contractsTouched = true;
$('contracts').value = '1';
uiContext.renderRiskPanel();
const before = {
  stopTicks: riskText('riskTicksSL'),
  dailyBudget: riskText('riskBudget'),
  perTradeBudget: riskText('riskPerTradeBudget'),
  maxTicks: riskText('riskMaxTicks'),
  effectiveBudget: riskText('riskEffectiveBudget'),
  stopDaily: riskText('riskStopDaily'),
  tickValue: riskText('riskTickValue'),
  perContract: riskText('riskPerContract'),
  realRisk: riskText('riskRealRisk')
};

$('contracts').value = '50';
uiContext.renderRiskPanel();
const after = {
  stopTicks: riskText('riskTicksSL'),
  dailyBudget: riskText('riskBudget'),
  perTradeBudget: riskText('riskPerTradeBudget'),
  maxTicks: riskText('riskMaxTicks'),
  effectiveBudget: riskText('riskEffectiveBudget'),
  stopDaily: riskText('riskStopDaily'),
  tickValue: riskText('riskTickValue'),
  perContract: riskText('riskPerContract'),
  realRisk: riskText('riskRealRisk')
};

['stopTicks', 'dailyBudget', 'perTradeBudget', 'maxTicks', 'effectiveBudget',
  'stopDaily', 'tickValue', 'perContract'].forEach(function (key) {
  eq('changing contracts leaves ' + key + ' unchanged', after[key], before[key]);
});
check('only the reported real risk moved', before.realRisk !== after.realRisk,
  'before ' + before.realRisk + ', after ' + after.realRisk);

/* The exact numbers the chain resolved to (independent of contracts). */
eq('stop ticks stay the manual 8', before.stopTicks, '8 ticks');
eq('daily budget stays 2000', before.dailyBudget, '$2000.00');
eq('per-trade cupo stays 666.67', before.perTradeBudget, '$666.67');
eq('max-ticks-one-contract stays 533', before.maxTicks, '533 ticks');

/* Pure level: computeRisk has no contracts input, so two identical calls can
 * never disagree because of the DOM override. */
const sizingA = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, tradesPerDay: 3,
  instrument: 'MES', stopTicks: 8
});
const sizingB = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, tradesPerDay: 3,
  instrument: 'MES', stopTicks: 8
});
eq('computeRisk is contracts-free and deterministic', sizingA.contracts, sizingB.contracts);
eq('the suggestion stays 66 regardless of the DOM', sizingA.contracts, 66);

/* ------------------------------------------------------------------ */
/* [6] Structural: input markup, wiring and single-source read         */
/* ------------------------------------------------------------------ */

console.log('\n[6] Structural: input markup, wiring and single-source read');

const inputIdx = htmlSrc.indexOf('id="riskContracts"');
check('#riskContracts exists in the markup', inputIdx !== -1);
const inputStart = inputIdx === -1 ? -1 : htmlSrc.lastIndexOf('<input', inputIdx);
const inputEnd = inputIdx === -1 ? -1 : htmlSrc.indexOf('>', inputIdx);
const inputTag = (inputStart !== -1 && inputStart < inputIdx && inputEnd !== -1)
  ? htmlSrc.slice(inputStart, inputEnd + 1)
  : '';
check('#riskContracts is a number input',
  inputTag.indexOf('id="riskContracts"') !== -1 && inputTag.indexOf('type="number"') !== -1);
check('#riskContracts is min 0, step 1, numeric',
  inputTag.indexOf('min="0"') !== -1 &&
  inputTag.indexOf('step="1"') !== -1 &&
  inputTag.indexOf('inputmode="numeric"') !== -1);
check('the old read-only preview span is gone',
  htmlSrc.indexOf('<span class="preview-value" id="riskContracts">') === -1);
check('#riskRealRisk row exists', htmlSrc.indexOf('id="riskRealRisk"') !== -1);
check('#riskRealRiskPct row exists', htmlSrc.indexOf('id="riskRealRiskPct"') !== -1);
check('#riskContractsWarning exists', htmlSrc.indexOf('id="riskContractsWarning"') !== -1);
check('#riskContractsWarning reuses the risk-hint styling',
  htmlSrc.slice(htmlSrc.indexOf('id="riskContractsWarning"') - 40,
    htmlSrc.indexOf('id="riskContractsWarning"')).indexOf('risk-hint') !== -1);

check('app.js defines syncContracts', appSrc.indexOf('function syncContracts(value)') !== -1);
check('renderRiskPanel prefills the suggestion through syncContracts',
  extractFunction(appSrc, 'function renderRiskPanel()').indexOf('syncContracts(risk.contracts)') !== -1);
check('the calculator contracts handler mirrors into #contracts',
  appSrc.indexOf('syncContracts(riskContractsField.value)') !== -1);
check('the form contracts handler mirrors into #riskContracts',
  appSrc.indexOf('syncContracts(contractsField.value)') !== -1);
check('readForm reads the canonical #contracts only',
  appSrc.indexOf("contracts: parseFloat($('contracts').value)") !== -1);
check('the real-risk formula is contracts x stopTicks x tickValue',
  appSrc.indexOf('reportedContracts * stopTicks * risk.tickValue') !== -1);
check('the warning compares against the per-trade cupo',
  appSrc.indexOf('realRisk > risk.perTradeBudget') !== -1);
check('the result reset list includes the new real-risk rows',
  extractFunction(appSrc, 'function renderRiskPanel()').indexOf('riskRealRisk') !== -1 &&
  extractFunction(appSrc, 'function renderRiskPanel()').indexOf("'riskRealRiskPct'") !== -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Contracts override result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
