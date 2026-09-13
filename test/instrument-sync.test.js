/* test/instrument-sync.test.js
 * VM harness for the bidirectional instrument sync between the risk
 * calculator's selector (#riskInstrument, Block 1) and the trade form's
 * selector (#instrument).
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context, then
 * extracts the REAL `syncInstrument`, `renderRiskPanel`, `readForm` and
 * `clampDailyRiskPct` functions from js/app.js (brace-matched, not
 * re-implemented) and runs them against a tiny fake DOM. No browser, no
 * Firebase, no build step.
 *
 * Proves:
 *   [1] changing the calculator selector updates the form's #instrument;
 *   [2] changing the form's #instrument updates the calculator selector;
 *   [3] the two views never diverge across a sequence of instrument changes;
 *   [4] exactly one instrument value reaches the save payload (readForm);
 *   [5] an instrument change propagates to the calculator's derived values,
 *       the NinjaTrader preview context, the R/B suggestion ticks and the
 *       AUTO budget-derived stop default;
 *   [6] the pure normalizeInstrument helper rejects unknown ids.
 *
 * Run: node test/instrument-sync.test.js
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
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
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
const DEFAULT_INSTRUMENT = storeContext.DEFAULT_INSTRUMENT;

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
  DEFAULT_INSTRUMENT: DEFAULT_INSTRUMENT,
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
  'var contractsTouched = false;',
  'var touchedFields = { stop: false, exitPrice: false };',
  'var riskItems = {};',
  'var suggestions = [];',
  'var previews = [];',
  'var marketRenders = 0;',
  'function instrumentMeta(id) { return INSTRUMENTS[id] || null; }',
  'function setRiskItem(id, text, cls) { riskItems[id] = { text: text, cls: cls || "" }; }',
  'function formatMoney(v) { return String(v); }',
  'function formatNumber(v, d) { return String(v); }',
  'function formatTicks(v) { return String(v) + " ticks"; }',
  'function renderRiskMarketTable() { marketRenders += 1; }',
  'function renderPriceSuggestions(ticks) { suggestions.push(ticks); }',
  'function renderRiskPreview(ctx) { previews.push(ctx); }',
  'function riskBlockMessage() { return "blocked"; }'
].join('\n');

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-instrument-functions.js' });

/* Seed the fake DOM with the values renderRiskPanel reads. */
$('instrument').value = 'MES';
$('riskInstrument').value = 'MES';
$('direction').value = 'Largo';
$('entryPrice').value = '5000';

function lastSuggestion() { return uiContext.suggestions[uiContext.suggestions.length - 1]; }
function lastPreview() { return uiContext.previews[uiContext.previews.length - 1]; }

/* ------------------------------------------------------------------ */
/* [1] Calculator selector -> trade form                               */
/* ------------------------------------------------------------------ */

console.log('\n[1] Calculator selector updates the trade form');

elements.riskInstrument.value = 'ES';
uiContext.syncInstrument(elements.riskInstrument.value);
eq('calculator change writes #instrument', elements.instrument.value, 'ES');
eq('calculator selector keeps the value', elements.riskInstrument.value, 'ES');
uiContext.renderRiskPanel();
eq('after render the two views are identical', elements.instrument.value, elements.riskInstrument.value);

/* ------------------------------------------------------------------ */
/* [2] Trade form -> calculator selector                               */
/* ------------------------------------------------------------------ */

console.log('\n[2] Trade form updates the calculator selector');

elements.instrument.value = 'NQ';
elements.riskInstrument.value = ''; /* force a divergence to prove the mirror */
uiContext.renderRiskPanel();
eq('render mirrors #instrument to the calculator', elements.riskInstrument.value, 'NQ');
eq('canonical form value untouched', elements.instrument.value, 'NQ');

/* ------------------------------------------------------------------ */
/* [3] The two views never diverge                                     */
/* ------------------------------------------------------------------ */

console.log('\n[3] The two views never diverge');

['CL', '6E', 'FDAX', 'MNQ', 'MES', 'ES'].forEach(function (id) {
  /* Drive from the calculator side. */
  elements.riskInstrument.value = id;
  uiContext.syncInstrument(id);
  uiContext.renderRiskPanel();
  eq('calculator-driven sync keeps both views on ' + id,
    elements.instrument.value === id && elements.riskInstrument.value === id, true);
  /* Drive from the form side. */
  elements.instrument.value = id;
  uiContext.renderRiskPanel();
  eq('form-driven sync keeps both views on ' + id,
    elements.instrument.value === id && elements.riskInstrument.value === id, true);
});

/* ------------------------------------------------------------------ */
/* [4] Exactly one instrument reaches the save payload                 */
/* ------------------------------------------------------------------ */

console.log('\n[4] A single instrument reaches readForm');

elements.riskInstrument.value = 'CL';
uiContext.syncInstrument(elements.riskInstrument.value);
uiContext.renderRiskPanel();
const draft = uiContext.readForm();
eq('readForm.instrument is the synced value', draft.instrument, 'CL');
eq('readForm reads the canonical form select', draft.instrument, elements.instrument.value);

/* ------------------------------------------------------------------ */
/* [5] The change propagates to the calculator's derived values        */
/* ------------------------------------------------------------------ */

console.log('\n[5] Derived values + AUTO stop default follow the instrument');

uiContext.stopTicksTouched = false;

elements.instrument.value = 'MES';
elements.riskInstrument.value = 'MES';
elements.riskStopTicks.value = '';
uiContext.renderRiskPanel();
const mesAutoTicks = elements.riskStopTicks.value;
const mesTickValue = riskItemsOf('riskTickValue');
const mesSL = riskItemsOf('riskTicksSL');
const mesSuggestion = lastSuggestion();
const mesPreviewStop = lastPreview().stopTicks;
const mesMarketRenders = uiContext.marketRenders;

elements.riskInstrument.value = 'ES';
uiContext.syncInstrument(elements.riskInstrument.value);
uiContext.renderRiskPanel();
const esAutoTicks = elements.riskStopTicks.value;
const esTickValue = riskItemsOf('riskTickValue');
const esSL = riskItemsOf('riskTicksSL');
const esSuggestion = lastSuggestion();
const esPreviewStop = lastPreview().stopTicks;

console.log('  MES: AUTO ' + mesAutoTicks + ' ticks · tickValue ' + mesTickValue +
  ' · SL ' + mesSL + ' · suggestion ' + mesSuggestion + ' ticks');
console.log('  ES : AUTO ' + esAutoTicks + ' ticks · tickValue ' + esTickValue +
  ' · SL ' + esSL + ' · suggestion ' + esSuggestion + ' ticks');

eq('MES AUTO stop default is 26 ticks (capital 5000, 2%, 3/day)', mesAutoTicks, '26');
eq('ES AUTO stop default is 2 ticks (same budget)', esAutoTicks, '2');
check('the AUTO stop default changes with the instrument', mesAutoTicks !== esAutoTicks);
check('the calculator tick value changes with the instrument', mesTickValue !== esTickValue);
check('the R/B SL ticks change with the instrument', mesSL !== esSL);
check('the price suggestion ticks follow the instrument', mesSuggestion !== esSuggestion);
check('the NinjaTrader preview stop ticks follow the instrument', mesPreviewStop !== esPreviewStop);
check('the market lookup table is re-rendered on the change', uiContext.marketRenders > mesMarketRenders);

function riskItemsOf(id) {
  return (uiContext.riskItems[id] || {}).text;
}

/* ------------------------------------------------------------------ */
/* [6] Pure normalizeInstrument helper                                 */
/* ------------------------------------------------------------------ */

console.log('\n[6] normalizeInstrument is catalog-aware');

eq('known id is returned as-is', Store.normalizeInstrument('MES'), 'MES');
eq('unknown id falls back to a known fallback', Store.normalizeInstrument('NOPE', 'ES'), 'ES');
eq('unknown id with unknown fallback collapses to empty', Store.normalizeInstrument('NOPE', 'ALSO-NOPE'), '');
eq('empty value falls back to a known fallback', Store.normalizeInstrument('', 'MES'), 'MES');
eq('every catalog id round-trips', Object.keys(INSTRUMENTS).every(function (id) {
  return Store.normalizeInstrument(id) === id;
}), true);

/* ------------------------------------------------------------------ */
/* Structural checks (index.html / app.js)                             */
/* ------------------------------------------------------------------ */

console.log('\nStructural: selector markup, wiring and single-source reads');

check('calculator exposes #riskInstrument', htmlSrc.indexOf('id="riskInstrument"') !== -1);
const calcIdx = htmlSrc.indexOf('id="riskInstrument"');
const formIdx = htmlSrc.indexOf('id="tradeForm"');
check('calculator selector sits inside the calculator (before the trade form)',
  calcIdx !== -1 && formIdx !== -1 && calcIdx < formIdx);
check('app.js populates #riskInstrument from the same catalog as #instrument',
  appSrc.indexOf("fillSelect($('riskInstrument'), Object.keys(INSTRUMENTS))") !== -1);
check('app.js syncs the canonical value from the calculator change',
  appSrc.indexOf('syncInstrument(riskInstrumentField.value)') !== -1);
check('renderRiskPanel mirrors the canonical value on every render',
  appSrc.indexOf('syncInstrument($(\'instrument\') ? $(\'instrument\').value : \'\')') !== -1);
check('readForm reads the canonical #instrument', appSrc.indexOf("instrument: $('instrument').value") !== -1);
check('readForm never reads the calculator selector',
  extractFunction(appSrc, 'function readForm()').indexOf('riskInstrument') === -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Instrument sync result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
