/* test/draft-autofill-ui.test.js
 * UI-level VM harness for the DRAFT autofill wiring in js/app.js.
 *
 * Extracts the REAL `decimalsForTick`, `formatPrice`, `setDraftField` and
 * `applyDraftAutofill` functions from js/app.js (brace-matched, not
 * re-implemented) and runs them against a tiny fake DOM plus the real Store.
 * No browser, no Firebase, no build step.
 *
 * Proves the end-to-end rule:
 *   - an untouched field receives the draft stop / exit value + draft mark;
 *   - once touched, the user's value is NEVER overwritten and the mark clears;
 *   - recomputing (new entry price) only refreshes the still-untouched field;
 *   - losing the plan clears an untouched draft but keeps a user value.
 *
 * Run: node test/draft-autofill-ui.test.js
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
  extractFunction(appSrc, 'function decimalsForTick(tick)'),
  extractFunction(appSrc, 'function formatPrice(value, tick)'),
  extractFunction(appSrc, 'function setDraftField(input, badge, value, isDraft)'),
  extractFunction(appSrc, 'function applyDraftAutofill(account, instrument, ticks, tick, ratio)')
].join('\n');

/* ------------------------------------------------------------------ */
/* Fake DOM + real Store                                               */
/* ------------------------------------------------------------------ */

const storeContext = vm.createContext({ console: console });
vm.runInContext(
  instrumentsSrc + '\n' + storeSrc + '\n;globalThis.Store = Store;',
  storeContext,
  { filename: 'store-bundle.js' }
);

const elements = {};
function makeElement() {
  const el = { value: '', hidden: false, classes: {} };
  el.classList = {
    toggle: function (name, on) { el.classes[name] = !!on; }
  };
  return el;
}

const uiContext = vm.createContext({
  console: console,
  Store: storeContext.Store,
  touchedFields: { stop: false, exitPrice: false },
  $: function (id) { return elements[id] || null; },
  parseFloat: parseFloat,
  Number: Number,
  Math: Math,
  String: String
});
vm.runInContext(extracted, uiContext, { filename: 'app-draft-functions.js' });

elements.stop = makeElement();
elements.exitPrice = makeElement();
elements.stopDraftBadge = makeElement();
elements.exitPriceDraftBadge = makeElement();
elements.entryPrice = makeElement();
elements.direction = makeElement();
elements.entryPrice.value = '5000';
elements.direction.value = 'Largo';

function apply() {
  uiContext.applyDraftAutofill('Sim', 'MES', 8, 0.25);
}

function isDraft(el) { return el.classes['is-draft'] === true; }

/* ------------------------------------------------------------------ */
/* [1] Untouched: both fields get the draft + mark                     */
/* ------------------------------------------------------------------ */

console.log('\n[1] Untouched fields receive the draft');

apply();
eq('stop draft written', elements.stop.value, '4998.00');
eq('stop marked as draft', isDraft(elements.stop), true);
eq('stop badge shown', elements.stopDraftBadge.hidden, false);
eq('exit draft written (2:1)', elements.exitPrice.value, '5004.00');
eq('exit marked as draft', isDraft(elements.exitPrice), true);
eq('exit badge shown', elements.exitPriceDraftBadge.hidden, false);

/* ------------------------------------------------------------------ */
/* [2] Touched stop: never overwritten, mark clears                    */
/* ------------------------------------------------------------------ */

console.log('\n[2] Touched stop is never overwritten');

uiContext.touchedFields.stop = true;
elements.stop.value = '4990'; /* the user's own value */
apply();
eq('user stop value kept', elements.stop.value, '4990');
eq('stop draft mark cleared', isDraft(elements.stop), false);
eq('stop badge hidden', elements.stopDraftBadge.hidden, true);
eq('untouched exit still updated', elements.exitPrice.value, '5004.00');

/* ------------------------------------------------------------------ */
/* [3] Recompute does not clobber the touched field                    */
/* ------------------------------------------------------------------ */

console.log('\n[3] Recompute keeps the touched field, refreshes the other');

elements.entryPrice.value = '5100';
apply();
eq('recompute keeps the user stop', elements.stop.value, '4990');
eq('recompute refreshes the untouched exit', elements.exitPrice.value, '5104.00');

/* ------------------------------------------------------------------ */
/* [4] Both touched: nothing is written                                */
/* ------------------------------------------------------------------ */

console.log('\n[4] Both touched -> no writes');

uiContext.touchedFields.exitPrice = true;
elements.exitPrice.value = '5102'; /* the user's own value */
apply();
eq('user stop kept', elements.stop.value, '4990');
eq('user exit kept', elements.exitPrice.value, '5102');
eq('exit draft mark cleared', isDraft(elements.exitPrice), false);

/* ------------------------------------------------------------------ */
/* [5] Lost plan clears untouched drafts, keeps user values            */
/* ------------------------------------------------------------------ */

console.log('\n[5] Lost plan clears only untouched drafts');

uiContext.touchedFields.stop = false;
uiContext.touchedFields.exitPrice = true;
elements.entryPrice.value = ''; /* no plan anymore */
apply();
eq('untouched stop draft cleared', elements.stop.value, '');
eq('touched exit value kept', elements.exitPrice.value, '5102');

/* ------------------------------------------------------------------ */
/* [6] The selected R/B ratio moves the draft exit                     */
/* ------------------------------------------------------------------ */

console.log('\n[6] Ratio drives the draft exit');

uiContext.touchedFields.stop = true;       /* keep the user stop out of the way */
uiContext.touchedFields.exitPrice = false;
elements.entryPrice.value = '5000';
uiContext.applyDraftAutofill('Sim', 'MES', 8, 0.25, 3);
eq('ratio 1:3 exit = entry + 3 x 8 x 0.25', elements.exitPrice.value, '5006.00');
eq('exit still marked as draft', isDraft(elements.exitPrice), true);

uiContext.applyDraftAutofill('Sim', 'MES', 8, 0.25, 2.5);
eq('ratio 1:2.5 exit = entry + 2.5 x 8 x 0.25', elements.exitPrice.value, '5005.00');

/* The default ratio keeps the 2:1 behaviour when no ratio is passed. */
uiContext.applyDraftAutofill('Sim', 'MES', 8, 0.25);
eq('default ratio exit = entry + 2 x 8 x 0.25', elements.exitPrice.value, '5004.00');

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Draft autofill UI result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
