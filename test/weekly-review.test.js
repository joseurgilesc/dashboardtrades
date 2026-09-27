/* test/weekly-review.test.js
 * VM harness for the weekly-review helpers in js/store.js:
 * executionQualityScore, realizedRResult, pickBestWorstExecution, and the
 * additive setWeeklyReview / getWeeklyReview persistence.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context.
 * Run: node test/weekly-review.test.js
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
  check(name, actual === expected, 'expected ' + expected + ', got ' + actual);
}

function closeTo(name, actual, expected, eps) {
  check(name, Math.abs(actual - expected) <= (eps || 1e-9),
    'expected ~' + expected + ', got ' + actual);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

let idSeq = 0;

function trade(over) {
  idSeq += 1;
  return Object.assign({
    id: 'w' + idSeq,
    tradeNumber: idSeq,
    account: 'Sim',
    instrument: 'NQ',        /* pointValue 20, commission 4.18 */
    contracts: 1,
    strategy: '',
    direction: 'Largo',
    entryDate: '2026-01-05',
    entryTime: '09:30',
    entryPrice: 100,
    exitDate: '2026-01-05',
    exitTime: '09:35',
    exitPrice: 100,          /* flat: net = -commission only */
    stop: 0,
    target: 0,
    plannedRisk: 0,
    exitType: '',
    emotion: '',
    notes: '',
    respectedEntry: false,
    respectedStop: false,
    respectedSize: false,
    planDeviation: ''
  }, over || {});
}

/* ------------------------------------------------------------------ */
/* 1. Execution-quality score                                          */
/* ------------------------------------------------------------------ */

console.log('\n[1] executionQualityScore');

eq('full adherence -> 3',
  Store.executionQualityScore(trade({ respectedEntry: true, respectedStop: true, respectedSize: true })), 3);
eq('deviation penalized -> 2',
  Store.executionQualityScore(trade({
    respectedEntry: true, respectedStop: true, respectedSize: true, planDeviation: 'Salir antes'
  })), 2);
eq('no adherence -> -1',
  Store.executionQualityScore(trade({ planDeviation: 'Salir antes' })), -1);

/* ------------------------------------------------------------------ */
/* 2. Realized R result                                                */
/* ------------------------------------------------------------------ */

console.log('\n[2] realizedRResult');

/* Stop recorded: risk = |100 - 99.5| * 1 * 20 = 10; net = 20 - 4.18. */
closeTo('stop recorded -> net / tradeRiskUsd',
  Store.realizedRResult(trade({ entryPrice: 100, exitPrice: 101, stop: 99.5, contracts: 1 })),
  (20 - 4.18) / 10);

/* No stop: fall back to the planned ratio target / plannedRisk. */
eq('no stop -> fallback planned ratio',
  Store.realizedRResult(trade({ stop: 0, plannedRisk: 100, target: 300 })), 3);

/* Neither realized risk nor a valid plan -> empty (NaN). */
check('neither -> NaN',
  Number.isNaN(Store.realizedRResult(trade({ stop: 0, plannedRisk: 0, target: 0 }))));

/* ------------------------------------------------------------------ */
/* 3. Best/worst execution picker                                      */
/* ------------------------------------------------------------------ */

console.log('\n[3] pickBestWorstExecution');

const distinct = Store.pickBestWorstExecution([
  trade({ id: 'best', entryDate: '2026-01-05', respectedEntry: true, respectedStop: true, respectedSize: true }),
  trade({ id: 'mid', entryDate: '2026-01-06', respectedEntry: true }),
  trade({ id: 'worst', entryDate: '2026-01-07', planDeviation: 'x' })
], 'Sim', '2026-01-05');
eq('distinct: best is the score-3 trade', distinct.best.id, 'best');
eq('distinct: worst is the score--1 trade', distinct.worst.id, 'worst');
eq('distinct: total', distinct.total, 3);
eq('distinct: weekStart', distinct.weekStart, '2026-01-05');
eq('distinct: weekEnd', distinct.weekEnd, '2026-01-11');

/* Score tie breaks by net: higher for best, lower for worst. */
const tieNet = Store.pickBestWorstExecution([
  trade({ id: 'hiA', entryDate: '2026-01-05', exitPrice: 110, respectedEntry: true, respectedStop: true, respectedSize: true }),
  trade({ id: 'hiB', entryDate: '2026-01-05', exitPrice: 105, respectedEntry: true, respectedStop: true, respectedSize: true })
], 'Sim', '2026-01-05');
eq('net tie: best is the higher-net trade', tieNet.best.id, 'hiA');
eq('net tie: worst is the lower-net trade', tieNet.worst.id, 'hiB');

/* Net tie breaks by earliest entry datetime. */
const tieDate = Store.pickBestWorstExecution([
  trade({ id: 'e2', entryDate: '2026-01-05', entryTime: '10:30', exitPrice: 110, respectedEntry: true, respectedStop: true, respectedSize: true }),
  trade({ id: 'e1', entryDate: '2026-01-05', entryTime: '09:30', exitPrice: 110, respectedEntry: true, respectedStop: true, respectedSize: true }),
  trade({ id: 'low', entryDate: '2026-01-06', planDeviation: 'x' })
], 'Sim', '2026-01-05');
eq('date tie: best is the earliest trade', tieDate.best.id, 'e1');
eq('date tie: worst is still the low scorer', tieDate.worst.id, 'low');

const tieWorst = Store.pickBestWorstExecution([
  trade({ id: 'w2', entryDate: '2026-01-05', entryTime: '10:30', planDeviation: 'x' }),
  trade({ id: 'w1', entryDate: '2026-01-05', entryTime: '09:30', planDeviation: 'x' }),
  trade({ id: 'wb', entryDate: '2026-01-06', respectedEntry: true, respectedStop: true, respectedSize: true })
], 'Sim', '2026-01-05');
eq('date tie: worst is the earliest low trade', tieWorst.worst.id, 'w1');

/* Fewer than two trades -> empty (null). */
eq('no trades -> null', Store.pickBestWorstExecution([], 'Sim', '2026-01-05'), null);
eq('one trade -> null', Store.pickBestWorstExecution([trade({})], 'Sim', '2026-01-05'), null);

/* Account scoping: a Real trade never counts toward Sim. */
eq('account-scoped (one Sim trade -> null)',
  Store.pickBestWorstExecution([
    trade({ id: 'sim1', entryDate: '2026-01-05', respectedEntry: true, respectedStop: true, respectedSize: true }),
    trade({ id: 'real1', account: 'Real', entryDate: '2026-01-05', respectedEntry: true, respectedStop: true, respectedSize: true })
  ], 'Sim', '2026-01-05'), null);

/* ------------------------------------------------------------------ */
/* 4. Weekly review persistence + scoping                              */
/* ------------------------------------------------------------------ */

console.log('\n[4] setWeeklyReview / getWeeklyReview');

Store.setWeeklyReview('Sim', '2026-01-05', {
  bestTradeId: 't-best',
  worstTradeId: 't-worst',
  repeat: 'Respetar el stop',
  deviationTrigger: 'Noticia',
  nextGoal: 'Menos trades'
});
const rev = Store.getWeeklyReview('Sim', '2026-01-05');
eq('round-trip bestTradeId', rev.bestTradeId, 't-best');
eq('round-trip worstTradeId', rev.worstTradeId, 't-worst');
eq('round-trip repeat', rev.repeat, 'Respetar el stop');
eq('round-trip deviationTrigger', rev.deviationTrigger, 'Noticia');
eq('round-trip nextGoal', rev.nextGoal, 'Menos trades');
eq('unknown week -> null', Store.getWeeklyReview('Sim', '2026-01-12'), null);

/* Account and week isolation. */
Store.setWeeklyReview('Real', '2026-01-05', { bestTradeId: 'r-best' });
Store.setWeeklyReview('Sim', '2026-01-12', { bestTradeId: 's-next' });
eq('Sim week 1 unchanged by Real', Store.getWeeklyReview('Sim', '2026-01-05').bestTradeId, 't-best');
eq('Real isolated', Store.getWeeklyReview('Real', '2026-01-05').bestTradeId, 'r-best');
eq('Sim next week isolated', Store.getWeeklyReview('Sim', '2026-01-12').bestTradeId, 's-next');

/* Additive merge: a partial patch keeps the other fields. */
Store.setWeeklyReview('Sim', '2026-01-05', { nextGoal: 'Más disciplina' });
const merged = Store.getWeeklyReview('Sim', '2026-01-05');
eq('merge keeps bestTradeId', merged.bestTradeId, 't-best');
eq('merge keeps repeat', merged.repeat, 'Respetar el stop');
eq('merge updates nextGoal', merged.nextGoal, 'Más disciplina');

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Weekly review result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
