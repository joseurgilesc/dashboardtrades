/* test/trade-nudges.test.js
 * VM harness for the two non-blocking process nudges in the trade save path:
 *   [1] first trade of the day + no daily goal  -> "Define tu meta…"
 *   [2] third trade of the day + no session review -> "Cierra la sesión…"
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context, then
 * extracts the REAL `nudgeBeforeNewTrade`, `handleSubmit` and `activeAccount`
 * from js/app.js (brace-matched, not re-implemented) and runs them against a
 * tiny fake DOM with a showToast recorder. No browser, no Firebase, no build.
 *
 * Proves:
 *   [1] goal-warning fires ONLY on first-trade-of-day + empty goal
 *   [2] review-reminder fires ONLY on 3rd-trade-of-day + no review
 *   [3] neither fires otherwise (defined goal, existing review, other counts)
 *   [4] neither blocks saving, and the nudge hooks only the NEW-trade branch
 *
 * Run: node test/trade-nudges.test.js
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
  extractFunction(appSrc, 'function nudgeBeforeNewTrade()'),
  extractFunction(appSrc, 'function handleSubmit(event)'),
  extractFunction(appSrc, 'function activeAccount()')
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
/* Fake DOM + showToast recorder                                       */
/* ------------------------------------------------------------------ */

const DATE = '2026-09-27';

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

const toasts = [];
function showToast(message, kind) {
  toasts.push({ message: message, kind: kind });
}

const uiContext = vm.createContext({
  console: console,
  Store: Store,
  state: { editingId: null, globalDate: '' },
  $: $,
  ACCOUNTS: ['Sim', 'Real', 'Fondeo'],
  showToast: showToast
});

const stubs = [
  'function todayISO() { return "2026-09-27"; }',
  'function validateForm() { return []; }',
  'function showErrorModal() {}',
  'function showFormErrors() {}',
  'function resetForm() {}',
  'function renderAll() {}',
  'function readForm() {' +
  '  return {' +
  '    account: "Sim", instrument: "MES", contracts: 1, strategy: "vela-a-vela",' +
  '    direction: "Largo", entryDate: "2026-09-27", entryTime: "09:30",' +
  '    entryPrice: 5000, exitDate: "2026-09-27", exitTime: "09:35",' +
  '    exitPrice: 5000, stop: 0, target: 0, plannedRisk: 0,' +
  '    exitType: "Manual", emotion: "Confianza", notes: ""' +
  '  };' +
  '}'
].join('\n');

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-trade-nudges-functions.js' });

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeTrade(entryDate) {
  return {
    account: 'Sim',
    instrument: 'MES',
    contracts: 1,
    strategy: 'vela-a-vela',
    direction: 'Largo',
    entryDate: entryDate || DATE,
    entryTime: '09:30',
    entryPrice: 5000,
    exitDate: entryDate || DATE,
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

/* Reset the store + toast recorder for a clean scenario. */
function resetScenario() {
  Store.clearAll();
  toasts.length = 0;
  uiContext.state.editingId = null;
  uiContext.state.globalDate = '';
}

/* Seeds `n` trades for the active account ("Sim") on DATE. */
function seedToday(n) {
  for (let i = 0; i < n; i += 1) Store.addTrade(makeTrade(DATE));
}

function warnCount() {
  return toasts.filter(function (t) { return t.kind === 'warn'; }).length;
}

function hasWarn(message) {
  return toasts.some(function (t) { return t.kind === 'warn' && t.message === message; });
}

/* ------------------------------------------------------------------ */
/* [1] Goal warning: first trade of the day + empty goal               */
/* ------------------------------------------------------------------ */

console.log('\n[1] Goal warning fires only on first-trade-of-day + empty goal');

resetScenario();
uiContext.nudgeBeforeNewTrade();
eq('0 trades + no goal -> goal warning fires', hasWarn('Define tu meta de proceso antes de operar'), true);
eq('goal warning is the only warn', warnCount(), 1);

resetScenario();
Store.setDailyGoal(DATE, { goal: 'Respetar el stop', status: '', note: '' });
uiContext.nudgeBeforeNewTrade();
eq('0 trades + defined goal -> no goal warning', hasWarn('Define tu meta de proceso antes de operar'), false);

resetScenario();
Store.setDailyGoal(DATE, { goal: '   ', status: '', note: '' });
uiContext.nudgeBeforeNewTrade();
eq('0 trades + whitespace goal -> still warns', hasWarn('Define tu meta de proceso antes de operar'), true);

/* ------------------------------------------------------------------ */
/* [2] Review reminder: 3rd trade of the day + no review               */
/* ------------------------------------------------------------------ */

console.log('\n[2] Review reminder fires only on 3rd-trade-of-day + no review');

resetScenario();
Store.setDailyGoal(DATE, { goal: 'Respetar el stop', status: '', note: '' }); /* so goal nudge stays quiet */
seedToday(2);
uiContext.nudgeBeforeNewTrade();
eq('2 trades + no review -> review reminder fires', hasWarn('Cierra la sesión: completa tu revisión diaria'), true);

resetScenario();
Store.setDailyGoal(DATE, { goal: 'Respetar el stop', status: '', note: '' });
seedToday(2);
Store.setSessionReview(DATE, { q1: 'a', q2: 'b', q3: 'c', nextAction: 'c' });
uiContext.nudgeBeforeNewTrade();
eq('2 trades + review exists -> no reminder', hasWarn('Cierra la sesión: completa tu revisión diaria'), false);

/* ------------------------------------------------------------------ */
/* [3] Neither fires otherwise                                         */
/* ------------------------------------------------------------------ */

console.log('\n[3] Neither nudge fires on other trade counts');

resetScenario();
seedToday(1); /* second trade, empty goal -> not 0, not 2 */
uiContext.nudgeBeforeNewTrade();
eq('1 trade + empty goal -> no toasts at all', toasts.length, 0);

resetScenario();
seedToday(3); /* fourth trade, empty goal + no review -> not 0, not 2 */
uiContext.nudgeBeforeNewTrade();
eq('3 trades + empty goal + no review -> no toasts at all', toasts.length, 0);

resetScenario();
seedToday(2); /* 3rd trade but WITH a review -> no reminder, no goal warn */
Store.setDailyGoal(DATE, { goal: '', status: '', note: '' });
Store.setSessionReview(DATE, { q1: 'x', q2: '', q3: '', nextAction: '' });
uiContext.nudgeBeforeNewTrade();
eq('3rd trade with review -> no toasts at all', toasts.length, 0);

/* ------------------------------------------------------------------ */
/* [4] Non-blocking + new-vs-edit wiring                               */
/* ------------------------------------------------------------------ */

console.log('\n[4] Nudges never block saving and only run on the new-trade branch');

resetScenario();
uiContext.handleSubmit({ preventDefault: function () {} });
eq('save still adds the trade (0 -> 1)', Store.getTrades().length, 1);
eq('save success toast fires', hasWarn('Trade guardado'), false);
check('goal warning fired alongside the save',
  hasWarn('Define tu meta de proceso antes de operar'));
check('trade was saved (non-blocking)', Store.getTrades().length === 1);

/* Edit path must not nudge. */
resetScenario();
seedToday(1);
const existing = Store.addTrade(makeTrade(DATE));
uiContext.state.editingId = existing.id;
uiContext.handleSubmit({ preventDefault: function () {} });
eq('edit path fires no warn nudges', warnCount(), 0);
eq('edit path does not add a new trade', Store.getTrades().length, 2);

/* ------------------------------------------------------------------ */
/* [5] Structural checks (app.js)                                      */
/* ------------------------------------------------------------------ */

console.log('\n[5] Structural: nudge hooked on the new-trade branch only');

const submitSrc = extractFunction(appSrc, 'function handleSubmit(event)');
const nudgeIdx = submitSrc.indexOf('nudgeBeforeNewTrade()');
const updateIdx = submitSrc.indexOf('Store.updateTrade');
const addIdx = submitSrc.indexOf('Store.addTrade(trade)');

check('app.js declares nudgeBeforeNewTrade()',
  appSrc.indexOf('function nudgeBeforeNewTrade()') !== -1);
check('handleSubmit calls nudgeBeforeNewTrade()', nudgeIdx !== -1);
check('the nudge runs AFTER the edit branch (never on update)',
  nudgeIdx !== -1 && updateIdx !== -1 && nudgeIdx > updateIdx);
check('Store.addTrade still follows the nudge (save proceeds)',
  nudgeIdx !== -1 && addIdx !== -1 && addIdx > nudgeIdx);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Trade nudges result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
