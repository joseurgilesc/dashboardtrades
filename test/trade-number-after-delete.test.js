/* test/trade-number-after-delete.test.js
 * VM harness for trade numbering after deletions.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context, then
 * extracts the REAL `refreshNextTradeNumber`, `resetForm`, `handleDelete` and
 * `handleClearAll` functions from js/app.js (brace-matched, not re-implemented)
 * and runs them against a tiny fake DOM. No browser, no Firebase, no build.
 *
 * Proves the reported bug is fixed:
 *   [1] store semantics stay max(existing) + 1, so deleting the trailing
 *       trades FREES their numbers (delete #3 -> next 3; delete all -> 1)
 *   [2] handleDelete refreshes #tradeNumber when the form is NOT editing
 *   [3] handleDelete never clobbers #tradeNumber while editing another trade
 *   [4] deleting the trade being edited exits edit mode and refreshes
 *   [5] handleClearAll leaves #tradeNumber at 1
 *   [6] structural: the refresh helper is wired and the stale direct write is
 *       gone from resetForm
 *
 * Run: node test/trade-number-after-delete.test.js
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
  extractFunction(appSrc, 'function refreshNextTradeNumber()'),
  extractFunction(appSrc, 'function writeTimeSelect(prefix, value)'),
  extractFunction(appSrc, 'function applyTradeMode()'),
  extractFunction(appSrc, 'function activeAccount()'),
  extractFunction(appSrc, 'function resetForm()'),
  extractFunction(appSrc, 'function handleDelete(id)'),
  extractFunction(appSrc, 'function handleClearAll()')
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
const Store = storeContext.Store;

/* ------------------------------------------------------------------ */
/* Fake DOM + the extracted UI functions                               */
/* ------------------------------------------------------------------ */

const elements = {};
function makeElement() {
  return {
    value: '',
    hidden: false,
    open: false,
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    reset: function () {},
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
}
function $(id) {
  if (!elements[id]) elements[id] = makeElement();
  return elements[id];
}

const uiContext = vm.createContext({
  console: console,
  Store: Store,
  window: { confirm: function () { return true; } },
  state: { editingId: null },
  $: $,
  ACCOUNTS: ['Sim', 'Real', 'Fondeo'],
  DEFAULT_DAILY_TRADE_LIMIT: 3,
  EXIT_TYPES: ['Manual']
});

const stubs = [
  'var contractsTouched = false;',
  'var editingTarget = 0;',
  'var touchedFields = { stop: false, exitPrice: false };',
  'var tradesPerDayTouched = false;',
  'function applyLastEntry() {}',
  'function todayISO() { return "2026-09-13"; }',
  'function nowTime() { return "09:30"; }',
  'function setDraftField() {}',
  'function showFormErrors() {}',
  'function updatePreview() {}',
  'function showToast() {}',
  'function renderAll() {}',
  'function loadBalancesIntoForm() {}',
  'function loadRiskSettingsIntoForm() {}',
  'function loadInstrumentConfigIntoForm() {}',
  'function setStatus() {}'
].join('\n');

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-trade-number-functions.js' });

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeTrade(tradeNumber) {
  return {
    tradeNumber: tradeNumber,
    account: 'Sim',
    instrument: 'MES',
    contracts: 1,
    strategy: 'vela-a-vela',
    direction: 'Largo',
    entryDate: '2026-09-13',
    entryTime: '09:30',
    entryPrice: 5000,
    exitDate: '2026-09-13',
    exitTime: '09:35',
    exitPrice: 5000,
    stop: 0,
    target: 0,
    plannedRisk: 0,
    exitType: 'Manual',
    emotion: 'Confianza',
    notes: ''
  };
}

/* Rebuilds the store with trades numbered exactly like `numbers`. */
function seed(numbers) {
  Store.clearAll();
  numbers.forEach(function (n) { Store.addTrade(makeTrade(n)); });
}

function findTradeByNumber(n) {
  return Store.getTrades().find(function (t) { return t.tradeNumber === n; });
}

/* ------------------------------------------------------------------ */
/* [1] Store semantics: max(existing) + 1 frees trailing numbers       */
/* ------------------------------------------------------------------ */

console.log('\n[1] Store nextTradeNumber() reuses freed numbers');

seed([1, 2, 3]);
eq('{1,2,3} -> next is 4', Store.nextTradeNumber(), 4);

Store.deleteTrade(findTradeByNumber(3).id);
eq('delete #3 from {1,2} -> next is 3', Store.nextTradeNumber(), 3);

seed([1, 2, 3]);
Store.deleteTrade(findTradeByNumber(2).id);
eq('delete #2 from {1,3} -> next is 4', Store.nextTradeNumber(), 4);

Store.deleteTrade(findTradeByNumber(1).id);
Store.deleteTrade(findTradeByNumber(3).id);
eq('delete all -> next is 1', Store.nextTradeNumber(), 1);
eq('store is empty', Store.getTrades().length, 0);

/* A new trade without an explicit number takes the computed one. */
seed([1, 2, 3]);
Store.deleteTrade(findTradeByNumber(3).id);
const added = Store.addTrade(makeTrade(undefined));
eq('a new trade after deleting #3 gets number 3', added.tradeNumber, 3);

/* ------------------------------------------------------------------ */
/* [2] handleDelete refreshes #tradeNumber when NOT editing            */
/* ------------------------------------------------------------------ */

console.log('\n[2] handleDelete refreshes the form while not editing');

seed([1, 2, 3]);
uiContext.state.editingId = null;
$('tradeNumber').value = '999'; /* stale value left by a previous render */
uiContext.handleDelete(findTradeByNumber(3).id);
eq('#tradeNumber shows the next free number (3)', $('tradeNumber').value, '3');

/* Deleting the last remaining trailing trade keeps freeing numbers. */
seed([1, 2]);
uiContext.state.editingId = null;
$('tradeNumber').value = '999';
uiContext.handleDelete(findTradeByNumber(2).id);
eq('delete #2 from {1} -> #tradeNumber is 2', $('tradeNumber').value, '2');

/* ------------------------------------------------------------------ */
/* [3] handleDelete never clobbers the field while editing another     */
/* ------------------------------------------------------------------ */

console.log('\n[3] handleDelete preserves the number while editing another trade');

seed([1, 2, 3]);
const editTarget = findTradeByNumber(1);
uiContext.state.editingId = editTarget.id;
$('tradeNumber').value = '1';
uiContext.handleDelete(findTradeByNumber(3).id);
eq('#tradeNumber is untouched while editing #1', $('tradeNumber').value, '1');
check('editingId is still set to the edited trade', uiContext.state.editingId === editTarget.id);

/* ------------------------------------------------------------------ */
/* [4] Deleting the trade being edited exits edit mode and refreshes   */
/* ------------------------------------------------------------------ */

console.log('\n[4] Deleting the edited trade exits edit mode and refreshes');

seed([1, 2, 3]);
const edited = findTradeByNumber(2);
uiContext.state.editingId = edited.id;
$('tradeNumber').value = '2';
uiContext.handleDelete(edited.id);
eq('editingId is cleared', uiContext.state.editingId, null);
eq('#tradeNumber is the next free number (4)', $('tradeNumber').value, '4');

/* ------------------------------------------------------------------ */
/* [5] handleClearAll resets the next number to 1                      */
/* ------------------------------------------------------------------ */

console.log('\n[5] handleClearAll resets #tradeNumber to 1');

seed([1, 2, 3]);
uiContext.state.editingId = null;
$('tradeNumber').value = '999';
uiContext.handleClearAll();
eq('#tradeNumber is 1 after clearing all', $('tradeNumber').value, '1');
eq('store has no trades after clearAll', Store.getTrades().length, 0);

/* ------------------------------------------------------------------ */
/* [6] Structural checks (app.js / store.js)                           */
/* ------------------------------------------------------------------ */

console.log('\n[6] Structural: helper wired, stale write removed');

const resetSrc = extractFunction(appSrc, 'function resetForm()');
const deleteSrc = extractFunction(appSrc, 'function handleDelete(id)');
const clearSrc = extractFunction(appSrc, 'function handleClearAll()');
const helperSrc = extractFunction(appSrc, 'function refreshNextTradeNumber()');

check('app.js declares refreshNextTradeNumber()',
  appSrc.indexOf('function refreshNextTradeNumber()') !== -1);
check('the helper bails out while editing (state.editingId guard)',
  helperSrc.indexOf('if (state.editingId) return;') !== -1);
check('resetForm delegates to the helper',
  resetSrc.indexOf('refreshNextTradeNumber()') !== -1);
check('resetForm no longer writes the number directly',
  resetSrc.indexOf("$('tradeNumber').value = String(Store.nextTradeNumber())") === -1);
check('handleDelete calls the helper on the non-editing branch',
  deleteSrc.indexOf('refreshNextTradeNumber()') !== -1);
check('handleClearAll calls the helper',
  clearSrc.indexOf('refreshNextTradeNumber()') !== -1);
check('store nextTradeNumber stays max + 1 (no monotonic counter)',
  storeSrc.indexOf('return max + 1;') !== -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Trade numbering after delete result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
