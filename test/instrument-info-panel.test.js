/* test/instrument-info-panel.test.js
 * VM harness for the instrument info panel that now lives with the risk
 * calculator's instrument selector (Block 1) instead of the trade form.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context, then
 * extracts the REAL `instrumentMeta`, `sizeLabel`, `syncInstrument`,
 * `renderInstrumentInfo`, `toggleInstrumentInfo` and `updatePreview`
 * functions from js/app.js (brace-matched, not re-implemented) and runs them
 * against a tiny fake DOM. No browser, no Firebase, no build step.
 *
 * Proves:
 *   [1] the info renders for the selected instrument (type / volatility / tip);
 *   [2] it updates when the instrument changes from the calculator selector;
 *   [3] it updates when the instrument changes from the trade form selector,
 *       and the two selectors stay in sync;
 *   [4] empty / unknown instruments keep the honest empty-state message;
 *   [5] the Info button toggles the panel and its aria-expanded state;
 *   [6] the markup has exactly ONE info panel and ONE info button, both inside
 *       the calculator, and the mobile `.field-inline .btn-info` fix still
 *       applies to the moved button.
 *
 * Run: node test/instrument-info-panel.test.js
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
const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');

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

function countOccurrences(haystack, needle) {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
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
  extractFunction(appSrc, 'function instrumentMeta(id)'),
  extractFunction(appSrc, 'function sizeLabel(size)'),
  extractFunction(appSrc, 'function syncInstrument(value)'),
  extractFunction(appSrc, 'function renderInstrumentInfo()'),
  extractFunction(appSrc, 'function toggleInstrumentInfo()'),
  extractFunction(appSrc, 'function updatePreview()')
].join('\n');

/* ------------------------------------------------------------------ */
/* Real Store (instruments + store) in its own context                 */
/* ------------------------------------------------------------------ */

const storeContext = vm.createContext({ console: console });
vm.runInContext(
  instrumentsSrc + '\n' + storeSrc +
  '\n;globalThis.Store = Store; globalThis.INSTRUMENTS = INSTRUMENTS;',
  storeContext,
  { filename: 'store-bundle.js' }
);

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
    attrs: {},
    classes: {},
    classList: {
      toggle: function (name, on) { el.classes[name] = !!on; },
      add: function () {},
      remove: function () {},
      contains: function () { return false; }
    },
    addEventListener: function () {},
    setAttribute: function (name, value) { el.attrs[name] = String(value); },
    getAttribute: function (name) { return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null; },
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
  Store: storeContext.Store,
  INSTRUMENTS: storeContext.INSTRUMENTS,
  $: $,
  Number: Number,
  Math: Math,
  String: String
});

/* Deterministic stubs for the collaborators updatePreview/renderInstrumentInfo
 * depend on. They run INSIDE the vm context so they can see the real
 * `syncInstrument`/`$` globals. The catalog, sync and info rendering stay REAL. */
const stubs = [
  'function formatNumber(v) { return String(v); }',
  'function formatMoney(v) { return "$" + String(v); }',
  'function escapeHtml(v) { return String(v); }',
  'function signClass() { return ""; }',
  'function renderEntryWarnings() {}',
  'function renderEmotionDot() {}',
  /* Mirrors the real renderRiskPanel contract: it syncs the calculator's
   * selector to the canonical #instrument value on every render. */
  'function renderRiskPanel() { syncInstrument($("instrument").value); }',
  'function readForm() { return { entryPrice: NaN, exitPrice: NaN, contracts: NaN, instrument: "" }; }'
].join('\n');

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-instrument-info-functions.js' });

/* Seed the fake DOM with a valid initial instrument. */
$('instrument').value = 'MES';
$('riskInstrument').value = 'MES';

function panelHtml() { return elements.instrumentInfo.innerHTML; }
function contains(text) { return panelHtml().indexOf(text) !== -1; }

/* ------------------------------------------------------------------ */
/* [1] The info renders for the selected instrument                    */
/* ------------------------------------------------------------------ */

console.log('\n[1] Info renders for the selected instrument (type / volatility / tip)');

uiContext.updatePreview();
check('panel is populated on first render', panelHtml().length > 0);
check('MES title includes the id and product name', contains('MES · Micro E-mini S&amp;P 500') || contains('MES · Micro E-mini S&P 500'));
check('MES shows the type', contains('Índice (S&amp;P 500)') || contains('Índice (S&P 500)'));
check('MES shows the volatility', contains('Media-alta'));
check('MES shows the tip', contains('El más líquido; ideal para empezar'));
check('MES labels the type field', contains('Tipo'));
check('MES labels the volatility field', contains('Volatilidad'));
check('MES labels the tip field', contains('Tip'));

/* ------------------------------------------------------------------ */
/* [2] Calculator selector drives the info                             */
/* ------------------------------------------------------------------ */

console.log('\n[2] Calculator selector updates the info');

elements.riskInstrument.value = 'NQ';
uiContext.syncInstrument(elements.riskInstrument.value);
uiContext.updatePreview();
eq('calculator change writes the canonical form select', elements.instrument.value, 'NQ');
check('info follows the calculator selection', contains('NQ · E-mini Nasdaq-100'));
check('info shows the NQ type', contains('Índice (Nasdaq-100)'));
check('info shows the NQ volatility', contains('Alta'));
check('info shows the NQ tip', contains('Movimientos amplios; ajusta el tamaño'));
check('the previous instrument tip is gone', !contains('El más líquido; ideal para empezar'));

/* ------------------------------------------------------------------ */
/* [3] Trade form selector drives the info (and both stay in sync)     */
/* ------------------------------------------------------------------ */

console.log('\n[3] Trade form selector updates the info');

elements.instrument.value = 'ES';
uiContext.updatePreview();
check('info follows the form selection', contains('ES · E-mini S&amp;P 500') || contains('ES · E-mini S&P 500'));
check('info shows the ES type', contains('Índice (S&amp;P 500)') || contains('Índice (S&P 500)'));
check('info shows the ES volatility', contains('Media-alta'));
check('info shows the ES tip', contains('El más líquido; ideal para empezar'));
eq('form change mirrors the calculator selector', elements.riskInstrument.value, 'ES');

/* A sequence of changes from either side always lands on the same instrument. */
['CL', '6E', 'FDAX', 'MNQ', 'MES'].forEach(function (id) {
  elements.riskInstrument.value = id;
  uiContext.syncInstrument(id);
  uiContext.updatePreview();
  check('calculator-driven info is ' + id, contains(id + ' · '));
  elements.instrument.value = id;
  uiContext.updatePreview();
  check('form-driven info is ' + id, contains(id + ' · '));
  eq('both selectors agree on ' + id,
    elements.instrument.value === id && elements.riskInstrument.value === id, true);
});

/* ------------------------------------------------------------------ */
/* [4] Empty / unknown instrument keeps the honest empty state         */
/* ------------------------------------------------------------------ */

console.log('\n[4] Empty / unknown instrument handling is preserved');

elements.instrument.value = '';
uiContext.updatePreview();
eq('empty instrument shows the empty-state message', panelHtml(),
  '<p class="instrument-info-note">Sin información para este instrumento.</p>');

elements.instrument.value = 'NOPE';
uiContext.updatePreview();
eq('unknown instrument shows the empty-state message', panelHtml(),
  '<p class="instrument-info-note">Sin información para este instrumento.</p>');

/* ------------------------------------------------------------------ */
/* [5] The Info button toggles the panel                               */
/* ------------------------------------------------------------------ */

console.log('\n[5] Info button toggles the panel and aria-expanded');

elements.instrument.value = 'MES';
uiContext.updatePreview();
elements.instrumentInfo.hidden = true;
$('btnInstrumentInfo').attrs['aria-expanded'] = 'false';

uiContext.toggleInstrumentInfo();
eq('first toggle shows the panel', elements.instrumentInfo.hidden, false);
eq('first toggle sets aria-expanded=true', $('btnInstrumentInfo').attrs['aria-expanded'], 'true');
check('showing re-renders the current instrument', contains('MES · '));

uiContext.toggleInstrumentInfo();
eq('second toggle hides the panel', elements.instrumentInfo.hidden, true);
eq('second toggle sets aria-expanded=false', $('btnInstrumentInfo').attrs['aria-expanded'], 'false');

/* ------------------------------------------------------------------ */
/* [6] Structural: one panel, one button, in the calculator            */
/* ------------------------------------------------------------------ */

console.log('\n[6] Structural: exactly one info surface, next to #riskInstrument');

eq('exactly one #instrumentInfo in the markup',
  countOccurrences(htmlSrc, 'id="instrumentInfo"'), 1);
eq('exactly one #btnInstrumentInfo in the markup',
  countOccurrences(htmlSrc, 'id="btnInstrumentInfo"'), 1);
eq('exactly one .instrument-info element in the markup',
  countOccurrences(htmlSrc, 'class="instrument-info"'), 1);

const panelIdx = htmlSrc.indexOf('id="instrumentInfo"');
const formIdx = htmlSrc.indexOf('id="tradeForm"');
check('the info panel sits inside the calculator (before the trade form)',
  panelIdx !== -1 && formIdx !== -1 && panelIdx < formIdx);

const calcSelectIdx = htmlSrc.indexOf('for="riskInstrument"');
check('the calculator exposes #riskInstrument', htmlSrc.indexOf('id="riskInstrument"') !== -1);
const calcFieldWindow = htmlSrc.slice(calcSelectIdx, calcSelectIdx + 400);
check('the Info button sits in the same .field-inline as #riskInstrument',
  calcSelectIdx !== -1 &&
  calcFieldWindow.indexOf('class="field-inline"') !== -1 &&
  calcFieldWindow.indexOf('id="btnInstrumentInfo"') !== -1);

const formSelectIdx = htmlSrc.indexOf('for="instrument"');
const formFieldWindow = htmlSrc.slice(formSelectIdx, formSelectIdx + 300);
check('the trade form instrument field no longer carries the Info button',
  formFieldWindow.indexOf('btnInstrumentInfo') === -1);
check('the trade form instrument field is a plain select (no field-inline wrapper)',
  formFieldWindow.indexOf('field-inline') === -1);

/* The mobile fix must still match the moved button. */
check('CSS keeps the .field-inline .btn-info mobile rule',
  cssSrc.indexOf('.field-inline .btn-info') !== -1);
check('the mobile rule keeps the button compact (width: auto)',
  /\.field-inline\s+\.btn-info\s*\{[^}]*width:\s*auto/.test(cssSrc));
check('the mobile rule keeps the button from flexing (flex: 0 0 auto)',
  /\.field-inline\s+\.btn-info\s*\{[^}]*flex:\s*0\s+0\s+auto/.test(cssSrc));

/* The app still wires the button and reads the synced canonical value. */
check('app.js wires the Info button click to toggleInstrumentInfo',
  appSrc.indexOf("infoButton.addEventListener('click', toggleInstrumentInfo)") !== -1);
check('renderInstrumentInfo reads the canonical #instrument (synced) value',
  extractFunction(appSrc, 'function renderInstrumentInfo()').indexOf("$('instrument')") !== -1);
check('updatePreview re-renders the info on every pass',
  extractFunction(appSrc, 'function updatePreview()').indexOf('renderInstrumentInfo()') !== -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Instrument info panel result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
