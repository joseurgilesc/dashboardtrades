/* test/daily-goal.test.js
 * VM harness for the Steenbarger daily process goal + session review helpers
 * in js/store.js (getDailyGoal / setDailyGoal / getSessionReview /
 * setSessionReview / getPreviousSessionAction).
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context.
 * Run: node test/daily-goal.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const instrumentsSrc = fs.readFileSync(path.join(ROOT, 'js', 'instruments.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

const context = vm.createContext({ console: console });
vm.runInContext(
  instrumentsSrc + '\n' + storeSrc + '\n;globalThis.Store = Store;',
  context,
  { filename: 'store-bundle.js' }
);
const Store = context.Store;

/* ------------------------------------------------------------------ */
/* Tiny assertion harness                                              */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

function eq(name, a, b) {
  if (a === b) {
    passed += 1;
    console.log('  PASS  ' + name);
  } else {
    failures.push(name);
    console.log('  FAIL  ' + name + ' -> expected "' + b + '", got "' + a + '"');
  }
}

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log('  PASS  ' + name);
  } else {
    failures.push(name);
    console.log('  FAIL  ' + name);
  }
}

/* ------------------------------------------------------------------ */
/* [1] Defaults                                                        */
/* ------------------------------------------------------------------ */

console.log('\n[1] No goal / no review by default');

eq('no goal by default', Store.getDailyGoal('2026-09-27'), null);
eq('no review by default', Store.getSessionReview('2026-09-27'), null);
eq('no previous action by default', Store.getPreviousSessionAction('2026-09-27'), '');

/* ------------------------------------------------------------------ */
/* [2] Daily goal round-trips                                          */
/* ------------------------------------------------------------------ */

console.log('\n[2] setDailyGoal / getDailyGoal round-trip');

Store.setDailyGoal('2026-09-27', { goal: 'Respetar el stop', status: 'cumplida', note: 'bien' });
const g = Store.getDailyGoal('2026-09-27');
eq('goal text round-trips', g.goal, 'Respetar el stop');
eq('status round-trips', g.status, 'cumplida');
eq('note round-trips', g.note, 'bien');

/* ------------------------------------------------------------------ */
/* [3] Partial update preserves the other fields                       */
/* ------------------------------------------------------------------ */

console.log('\n[3] Partial update keeps the other fields');

Store.setDailyGoal('2026-09-27', { status: 'parcial' });
eq('partial update keeps the goal text', Store.getDailyGoal('2026-09-27').goal, 'Respetar el stop');
eq('partial update changes the status', Store.getDailyGoal('2026-09-27').status, 'parcial');

/* ------------------------------------------------------------------ */
/* [4] Session review round-trips                                      */
/* ------------------------------------------------------------------ */

console.log('\n[4] setSessionReview / getSessionReview round-trip');

Store.setSessionReview('2026-09-27', { q1: 'a', q2: 'b', q3: 'c', nextAction: 'Esperar setup' });
const r = Store.getSessionReview('2026-09-27');
eq('review q1 round-trips', r.q1, 'a');
eq('review nextAction round-trips', r.nextAction, 'Esperar setup');

/* ------------------------------------------------------------------ */
/* [5] Previous action picks the latest BEFORE the date                */
/* ------------------------------------------------------------------ */

console.log('\n[5] getPreviousSessionAction picks the latest before the date');

Store.setSessionReview('2026-09-25', { nextAction: 'Viejo' });
Store.setSessionReview('2026-09-26', { nextAction: 'Reciente' });
eq('picks the latest before today', Store.getPreviousSessionAction('2026-09-27'), 'Reciente');
eq('ignores the same day', Store.getPreviousSessionAction('2026-09-26'), 'Viejo');
eq('ignores future days', Store.getPreviousSessionAction('2026-09-25'), '');

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Daily goal result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
