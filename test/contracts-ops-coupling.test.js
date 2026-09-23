/* test/contracts-ops-coupling.test.js
 * VM harness for the contracts ⇄ operations coupling in the risk calculator.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context, then
 * extracts the REAL `syncInstrument`, `syncContracts`, `clampDailyRiskPct`,
 * `renderRiskPanel`, `renderContractsHint` and `activeAccount` functions from
 * js/app.js (brace-matched, not re-implemented) and runs them against a tiny
 * fake DOM. No browser, no Firebase, no build step.
 *
 * Proves:
 *   [1] contracts is the master: a typed contracts value is never overwritten
 *   [2] contracts -> operations: renderContractsHint derives maxOps from the
 *       daily budget and the contract count (contracts x P_m stays in budget)
 *   [3] operations -> contracts: changing Op/día moves the suggested contracts
 *       while the field is untouched
 *   [4] bounds: a contracts value exceeding the budget drives the derived ops
 *       to 0 (never above budget)
 *   [5] gating: contractsTouched stops the suggestion prefill (user-owned value)
 *   [6] cap: getMaxContracts clamps the suggestion (never computeRisk/hint)
 *
 * Run: node test/contracts-ops-coupling.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const instrumentsSrc = fs.readFileSync(path.join(ROOT, 'js', 'instruments.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

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
  extractFunction(appSrc, 'function renderContractsHint()'),
  extractFunction(appSrc, 'function activeAccount()')
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
  'var lastRisk = null;',
  'var stopTicksTouched = false;',
  'var tradesPerDayTouched = false;',
  'var contractsTouched = false;',
  'var touchedFields = { stop: false, exitPrice: false };',
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

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-coupling-functions.js' });

function hintText() { return $('contractsHint').textContent; }

/* ------------------------------------------------------------------ */
/* Fixture: Sim 100k, MES, 2 % / 3 op, manual stop 8 ticks.           */
/*   tickValue   = 1.25,  P_m = 8 x 1.25 = 10                         */
/*   dailyBudget = 2000,  perTradeBudget = 666.67                      */
/*   suggestion  = floor(666.67 / 10) = 66                             */
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
uiContext.stopTicksTouched = true;
uiContext.contractsTouched = false;
uiContext.lastRiskAccount = null;
uiContext.renderRiskPanel();

/* ------------------------------------------------------------------ */
/* [1] contracts is the master input                                   */
/* ------------------------------------------------------------------ */

console.log('\n[1] contracts is the master: a typed value is never overwritten');

uiContext.contractsTouched = true;
$('contracts').value = '5';
uiContext.renderRiskPanel();
eq('typed contracts stays', $('contracts').value, '5');
eq('the calculator view mirrors the typed value', $('riskContracts').value, '5');
/* The readout still derives operations FROM contracts (one direction). */
uiContext.renderContractsHint();
check('the hint still derives ops from the typed contracts', hintText().indexOf('op/día') !== -1);

/* ------------------------------------------------------------------ */
/* [2] contracts -> operations (readout, budget-bounded)               */
/* ------------------------------------------------------------------ */

console.log('\n[2] contracts -> operations: renderContractsHint readout');

uiContext.contractsTouched = true;
$('contracts').value = '2';
uiContext.renderRiskPanel();
uiContext.renderContractsHint();
/* maxStop = floor(533 / 2) = 266; maxOps = floor(2000 / (2 x 10)) = 100. */
eq('2 contracts -> 266 max stop', hintText(), 'stop máx. 266 ticks · 100 op/día');

$('contracts').value = '66';
uiContext.renderRiskPanel();
uiContext.renderContractsHint();
/* maxOps = floor(2000 / (66 x 10)) = 3. */
eq('66 contracts -> 3 op/día', hintText(), 'stop máx. 8 ticks · 3 op/día');

/* ------------------------------------------------------------------ */
/* [3] operations -> contracts (suggestion while untouched)            */
/* ------------------------------------------------------------------ */

console.log('\n[3] operations -> contracts: Op/día moves the suggestion');

uiContext.contractsTouched = false;
$('riskTradesPerDayInput').value = '1';
uiContext.renderRiskPanel();
/* 1 op/day -> perTradeBudget 2000 -> floor(2000/10) = 200 contracts. */
eq('1 op/day -> suggests 200 contracts', $('contracts').value, '200');

$('riskTradesPerDayInput').value = '4';
uiContext.renderRiskPanel();
/* 4 op/day -> perTradeBudget 500 -> floor(500/10) = 50 contracts. */
eq('4 op/day -> suggests 50 contracts', $('contracts').value, '50');

/* ------------------------------------------------------------------ */
/* [4] bounds: contracts x P_m stays within the daily budget           */
/* ------------------------------------------------------------------ */

console.log('\n[4] bounds: an oversized contracts value drives ops to 0');

uiContext.contractsTouched = true;
$('contracts').value = '300'; /* 300 x 10 = 3000 > 2000 budget */
uiContext.renderRiskPanel();
uiContext.renderContractsHint();
/* maxOps = floor(2000 / (300 x 10)) = 0; the readout respects the budget. */
eq('300 contracts -> 0 op/día (budget-bounded)', hintText(), 'stop máx. 1 ticks · 0 op/día');

/* ------------------------------------------------------------------ */
/* [5] gating: contractsTouched stops the suggestion prefill           */
/* ------------------------------------------------------------------ */

console.log('\n[5] gating: contractsTouched keeps the user-owned value');

uiContext.contractsTouched = true;
$('contracts').value = '7';
$('riskTradesPerDayInput').value = '1'; /* would suggest 200 */
uiContext.renderRiskPanel();
eq('touched: Op/día change never overwrites contracts', $('contracts').value, '7');

uiContext.contractsTouched = false;
$('contracts').value = '999';
uiContext.renderRiskPanel();
eq('untouched: the suggestion is re-prefilled', $('contracts').value, '200');

/* ------------------------------------------------------------------ */
/* [6] cap: getMaxContracts clamps only the suggestion                  */
/* ------------------------------------------------------------------ */

console.log('\n[6] cap: getMaxContracts clamps the suggestion (not computeRisk/hint)');

uiContext.contractsTouched = false;
Store.setMaxContracts(10);
$('riskTradesPerDayInput').value = '3';
uiContext.renderRiskPanel();
eq('maxContracts 10 caps the suggestion (66 -> 10)', $('contracts').value, '10');

/* The hint still derives from the ACTUAL contracts (10), not the uncapped 66. */
uiContext.renderContractsHint();
eq('hint derives from the clamped contracts', hintText(), 'stop máx. 53 ticks · 20 op/día');

Store.setMaxContracts(0);
uiContext.renderRiskPanel();
eq('maxContracts 0 removes the cap (back to 66)', $('contracts').value, '66');

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Contracts-operations coupling result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
