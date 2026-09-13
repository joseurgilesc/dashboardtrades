/* test/trades-per-day-input.test.js
 * VM harness for the "Operaciones por día" input (#riskTradesPerDayInput).
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context, then
 * extracts the REAL `syncInstrument`, `clampDailyRiskPct`, `renderRiskPanel`,
 * `persistTradesPerDay` and `onTradesPerDayChanged` functions from js/app.js
 * (brace-matched, not re-implemented) and runs them against a tiny fake DOM.
 * No browser, no Firebase, no build step.
 *
 * Proves the reported bug is fixed:
 *   [1] typing 2 / 1 / 4 (any positive integer) keeps the value in the DOM
 *   [2] clearing to '' does NOT snap back to the default 3; the math still
 *       uses a valid fallback (the account default) without writing it back
 *   [3] an account switch re-seeds while untouched but NOT once touched
 *   [4] a typed value persists to the account's dailyTradeLimit (and mirrors
 *       into the Ajustes field) so it survives a reload
 *   [5] structural: the touched rule is wired and the old clobber is gone
 *
 * Run: node test/trades-per-day-input.test.js
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
  extractFunction(appSrc, 'function clampDailyRiskPct(value)'),
  extractFunction(appSrc, 'function persistTradesPerDay(raw)'),
  extractFunction(appSrc, 'function onTradesPerDayChanged()'),
  extractFunction(appSrc, 'function renderRiskPanel()')
].join('\n');

/* ------------------------------------------------------------------ */
/* Real Store (instruments + store) in its own context                 */
/* ------------------------------------------------------------------ */

const storeContext = vm.createContext({ console: console });
vm.runInContext(
  instrumentsSrc + '\n' + storeSrc +
  '\n;globalThis.Store = Store; globalThis.INSTRUMENTS = INSTRUMENTS;' +
  '\n;globalThis.DEFAULT_INSTRUMENT = DEFAULT_INSTRUMENT;' +
  '\n;globalThis.DEFAULT_DAILY_TRADE_LIMIT = DEFAULT_DAILY_TRADE_LIMIT;',
  storeContext,
  { filename: 'store-bundle.js' }
);
const Store = storeContext.Store;
const INSTRUMENTS = storeContext.INSTRUMENTS;
const DEFAULT_INSTRUMENT = storeContext.DEFAULT_INSTRUMENT;
const DEFAULT_DAILY_TRADE_LIMIT = storeContext.DEFAULT_DAILY_TRADE_LIMIT;

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
  DEFAULT_INSTRUMENT: DEFAULT_INSTRUMENT,
  ACCOUNTS: ['Sim', 'Real', 'Fondeo'],
  DEFAULT_RISK_PCT: 2,
  DEFAULT_DAILY_TRADE_LIMIT: DEFAULT_DAILY_TRADE_LIMIT,
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
  'var riskItems = {};',
  'function instrumentMeta(id) { return INSTRUMENTS[id] || null; }',
  'function setRiskItem(id, text, cls) { riskItems[id] = { text: text, cls: cls || "" }; }',
  'function formatMoney(v) { return String(v); }',
  'function formatNumber(v, d) { return String(v); }',
  'function formatTicks(v) { return String(v) + " ticks"; }',
  'function renderRiskMarketTable() {}',
  'function renderPriceSuggestions() {}',
  'function renderRiskPreview() {}',
  'function riskBlockMessage() { return "blocked"; }',
  'function readRatio() { var el = $("riskRatio"); var n = el ? parseFloat(el.value) : NaN; return (isFinite(n) && n > 0) ? n : 2; }',
  'function ratioLabel(v) { return "1:" + v; }'
].join('\n');

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-trades-per-day-functions.js' });

function riskText(id) { return (uiContext.riskItems[id] || {}).text; }

/* The real input handler: mark touched, then persist (mirrors the listener
 * order in wireEvents: handler first, then the live-update loop's render). */
function type(raw) {
  $('riskTradesPerDayInput').value = raw;
  uiContext.onTradesPerDayChanged();
}

/* ------------------------------------------------------------------ */
/* Seed the fake DOM + per-account limits                              */
/* ------------------------------------------------------------------ */

/* Sim 2/day, Real 5/day. Fondeo keeps the default. */
Store.setSettings({ dailyTradeLimit: { Sim: 2, Real: 5, Fondeo: DEFAULT_DAILY_TRADE_LIMIT } });

$('account').value = 'Sim';
$('instrument').value = 'MES';
$('riskInstrument').value = 'MES';
$('direction').value = 'Largo';
$('entryPrice').value = '5000';
$('riskRatio').value = '2';
$('riskDailyPctInput').value = '2';
$('riskStopTicks').value = '';
uiContext.stopTicksTouched = false;
uiContext.tradesPerDayTouched = false;
uiContext.lastRiskAccount = null;

/* ------------------------------------------------------------------ */
/* [1] Typing any positive integer keeps the DOM value                 */
/* ------------------------------------------------------------------ */

console.log('\n[1] Typing 1 / 2 / 4 / 10 keeps the value');

uiContext.renderRiskPanel();
eq('initial render seeds the account limit (Sim 2)', $('riskTradesPerDayInput').value, '2');

['2', '1', '4', '10'].forEach(function (v) {
  type(v);
  uiContext.renderRiskPanel();
  eq('typed "' + v + '" stays in the DOM after render', $('riskTradesPerDayInput').value, v);
});

/* The math follows the typed value (Sim 5000 / 2% -> daily budget 100). */
type('1');
uiContext.renderRiskPanel();
eq('1 op/day -> per-op 80 ticks', riskText('riskMaxTicks'), '80 ticks');
eq('1 op/day -> day row labels 1 op', riskText('riskStopDaily'), '80 ticks · 1 op');
type('4');
uiContext.renderRiskPanel();
eq('4 op/day -> per-op 20 ticks', riskText('riskMaxTicks'), '20 ticks');
eq('4 op/day -> day row labels 4 op', riskText('riskStopDaily'), '80 ticks · 4 op');

/* ------------------------------------------------------------------ */
/* [2] Clearing to '' does not snap back; math uses the fallback       */
/* ------------------------------------------------------------------ */

console.log('\n[2] A transient empty field is preserved (no snap to 3)');

/* Restore the account default so the fallback is deterministic (Sim 2). */
Store.setSettings({ dailyTradeLimit: { Sim: 2, Real: 5, Fondeo: DEFAULT_DAILY_TRADE_LIMIT } });
type('');
uiContext.renderRiskPanel();
eq('empty field stays empty in the DOM', $('riskTradesPerDayInput').value, '');
check('empty field never snaps back to the default 3',
  $('riskTradesPerDayInput').value !== '3');
eq('math falls back to the account default (Sim 2 -> 40 per-op ticks)',
  riskText('riskMaxTicks'), '40 ticks');
eq('day row reflects the fallback count', riskText('riskStopDaily'), '80 ticks · 2 op');

/* ------------------------------------------------------------------ */
/* [3] Account switch: re-seeds untouched, keeps the value touched     */
/* ------------------------------------------------------------------ */

console.log('\n[3] Account switch re-seeds only while untouched');

uiContext.tradesPerDayTouched = false;
$('account').value = 'Real';
uiContext.renderRiskPanel();
eq('untouched switch to Real re-seeds 5', $('riskTradesPerDayInput').value, '5');
$('account').value = 'Sim';
uiContext.renderRiskPanel();
eq('untouched switch back to Sim re-seeds 2', $('riskTradesPerDayInput').value, '2');

/* Now touch it and switch accounts: the user value must survive. */
type('7');
uiContext.renderRiskPanel();
eq('typed 7 stays', $('riskTradesPerDayInput').value, '7');
$('account').value = 'Real';
uiContext.renderRiskPanel();
eq('touched value survives an account switch', $('riskTradesPerDayInput').value, '7');
check('touched flag blocks the account-switch re-seed', uiContext.tradesPerDayTouched === true);

/* ------------------------------------------------------------------ */
/* [4] Persistence to dailyTradeLimit + Ajustes field sync             */
/* ------------------------------------------------------------------ */

console.log('\n[4] The value persists to the account dailyTradeLimit');

/* "7" was typed while Sim was selected (before the switch). */
eq('Sim dailyTradeLimit persisted 7', Store.getRiskSettings().Sim.dailyTradeLimit, 7);
eq('Ajustes field #dailyLimitSim mirrors 7', $('dailyLimitSim').value, '7');

/* A valid value typed on Real persists to Real only. */
type('9');
eq('Real dailyTradeLimit persisted 9', Store.getRiskSettings().Real.dailyTradeLimit, 9);
eq('Sim limit is untouched by the Real edit', Store.getRiskSettings().Sim.dailyTradeLimit, 7);
eq('Ajustes field #dailyLimitReal mirrors 9', $('dailyLimitReal').value, '9');

/* Invalid/empty input never overwrites the stored limit. */
type('');
eq('empty input keeps the stored Real limit', Store.getRiskSettings().Real.dailyTradeLimit, 9);

/* ------------------------------------------------------------------ */
/* [5] Structural checks (app.js / index.html)                         */
/* ------------------------------------------------------------------ */

console.log('\n[5] Structural: touched rule wired, old clobber gone');

check('app.js declares the trades-per-day touched flag',
  appSrc.indexOf('tradesPerDayTouched') !== -1);
check('app.js marks the field touched on input/change',
  appSrc.indexOf("riskTradesField.addEventListener('input', onTradesPerDayChanged)") !== -1 &&
  appSrc.indexOf("riskTradesField.addEventListener('change', onTradesPerDayChanged)") !== -1);
check('the handler persists through Store.setSettings({ dailyTradeLimit })',
  appSrc.indexOf('Store.setSettings({ dailyTradeLimit: limits })') !== -1);
check('the old DOM clobber is gone',
  appSrc.indexOf('tradesInput.value !== String(tradesPerDay)') === -1);
check('renderRiskPanel seeds only on an untouched account switch',
  appSrc.indexOf('accountChanged && !tradesPerDayTouched') !== -1);
check('resetForm resets the touched flag',
  extractFunction(appSrc, 'function resetForm()').indexOf('tradesPerDayTouched = false') !== -1);
check('Ajustes save mirrors the saved limit into the untouched calculator input',
  appSrc.indexOf('tradesMirrorEl') !== -1);

const tradesIdx = htmlSrc.indexOf('id="riskTradesPerDayInput"');
const tradesField = tradesIdx === -1 ? '' : htmlSrc.slice(tradesIdx, htmlSrc.indexOf('>', tradesIdx));
check('#riskTradesPerDayInput exists', tradesIdx !== -1);
check('the input accepts any positive integer (min=1, step=1, no max)',
  tradesField.indexOf('min="1"') !== -1 &&
  tradesField.indexOf('step="1"') !== -1 &&
  tradesField.indexOf('max=') === -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Trades-per-day input result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
