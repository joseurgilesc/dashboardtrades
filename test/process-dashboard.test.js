/* test/process-dashboard.test.js
 * VM harness for the process-dashboard aggregators in js/store.js:
 * isPlanRegistered, planRegisteredPct, respectedStopRiskCount/Pct,
 * goalCompliance, sessionsReviewedCount, behaviorPatternCounts.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context.
 * Run: node test/process-dashboard.test.js
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

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

let idSeq = 0;

function trade(over) {
  idSeq += 1;
  return Object.assign({
    id: 'p' + idSeq,
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
/* 1. Plan-registered predicate + percentage                           */
/* ------------------------------------------------------------------ */

console.log('\n[1] isPlanRegistered');

eq('all three present -> true',
  Store.isPlanRegistered(trade({ plannedRisk: 20, stop: 99, target: 60 })), true);
eq('missing plannedRisk -> false',
  Store.isPlanRegistered(trade({ plannedRisk: 0, stop: 99, target: 60 })), false);
eq('missing stop -> false',
  Store.isPlanRegistered(trade({ plannedRisk: 20, stop: 0, target: 60 })), false);
eq('missing target -> false',
  Store.isPlanRegistered(trade({ plannedRisk: 20, stop: 99, target: 0 })), false);

console.log('\n[2] planRegisteredPct');

eq('every trade has a plan -> 100',
  Store.planRegisteredPct([
    trade({ plannedRisk: 20, stop: 99, target: 60 }),
    trade({ plannedRisk: 20, stop: 99, target: 60 })
  ], 'Sim'), 100);
eq('partial plan -> 50',
  Store.planRegisteredPct([
    trade({ plannedRisk: 20, stop: 99, target: 60 }),
    trade({ plannedRisk: 0, stop: 99, target: 60 })
  ], 'Sim'), 50);
eq('empty account -> 0', Store.planRegisteredPct([], 'Sim'), 0);

/* ------------------------------------------------------------------ */
/* 3. Respected stop AND risk percentage                               */
/* ------------------------------------------------------------------ */

console.log('\n[3] respectedStopRiskCount / respectedStopRiskPct');

/* per-trade cap = 2% of the running balance (limit 1). */
const opts = { limit: 1, riskPct: 2, minRR: 2, initialBalance: 100000 };

eq('stop + within-cap respected count',
  Store.respectedStopRiskCount([trade({ stop: 99, entryPrice: 100, contracts: 1, respectedStop: true })], 'Sim', opts), 1);
eq('stop + within-cap respected pct',
  Store.respectedStopRiskPct([trade({ stop: 99, entryPrice: 100, contracts: 1, respectedStop: true })], 'Sim', opts), 100);
eq('over-cap risk is not respected',
  Store.respectedStopRiskCount([trade({ stop: 0, plannedRisk: 5000, respectedStop: true })], 'Sim', opts), 0);
eq('respectedStop false is excluded',
  Store.respectedStopRiskCount([trade({ stop: 99, entryPrice: 100, contracts: 1, respectedStop: false })], 'Sim', opts), 0);
eq('mixed respected pct -> 50',
  Store.respectedStopRiskPct([
    trade({ stop: 99, entryPrice: 100, contracts: 1, respectedStop: true }),
    trade({ stop: 0, plannedRisk: 5000, respectedStop: true })
  ], 'Sim', opts), 50);
eq('empty respected count', Store.respectedStopRiskCount([], 'Sim', opts), 0);
eq('empty respected pct', Store.respectedStopRiskPct([], 'Sim', opts), 0);

/* ------------------------------------------------------------------ */
/* 4. Daily process-goal compliance                                    */
/* ------------------------------------------------------------------ */

console.log('\n[4] goalCompliance');

const mixedGoals = {
  '2026-09-21': { goal: 'Respetar el stop', status: 'cumplida' },
  '2026-09-22': { goal: 'Mantener R/R', status: 'no' }
};
const gc = Store.goalCompliance(mixedGoals);
eq('mixed goals total', gc.total, 2);
eq('mixed goals complied', gc.complied, 1);
eq('mixed goals pct', gc.pct, 50);

const emptyGoals = Store.goalCompliance({});
eq('no goals total', emptyGoals.total, 0);
eq('no goals pct', emptyGoals.pct, 0);

const partialGoals = Store.goalCompliance({
  '2026-09-21': { status: 'parcial' },
  '2026-09-22': { status: '' }
});
eq('parcial and empty statuses never count', partialGoals.complied, 0);

/* ------------------------------------------------------------------ */
/* 5. Sessions-reviewed count                                          */
/* ------------------------------------------------------------------ */

console.log('\n[5] sessionsReviewedCount');

eq('three reviews -> 3',
  Store.sessionsReviewedCount({ '2026-09-21': {}, '2026-09-22': {}, '2026-09-23': {} }), 3);
eq('no reviews -> 0', Store.sessionsReviewedCount({}), 0);

/* ------------------------------------------------------------------ */
/* 6. Repeating behavior patterns                                      */
/* ------------------------------------------------------------------ */

console.log('\n[6] behaviorPatternCounts');

const emotionPats = Store.behaviorPatternCounts([
  trade({ emotion: 'Miedo' }),
  trade({ emotion: 'Miedo' }),
  trade({ emotion: 'Miedo' })
], 'Sim');
eq('recurring emotion count', emotionPats.emotion['Miedo'], 3);

const exitPats = Store.behaviorPatternCounts([
  trade({ exitType: 'Stop' }),
  trade({ exitType: 'Stop' }),
  trade({ exitType: 'Profit' })
], 'Sim');
eq('exitType Stop count', exitPats.exitType['Stop'], 2);
eq('exitType Profit count', exitPats.exitType['Profit'], 1);

const deviationPats = Store.behaviorPatternCounts([
  trade({ planDeviation: '' }),
  trade({ planDeviation: 'Salir antes' })
], 'Sim');
check('empty planDeviation is excluded',
  !Object.prototype.hasOwnProperty.call(deviationPats.planDeviation, ''));
eq('non-empty planDeviation counted', deviationPats.planDeviation['Salir antes'], 1);

const noPats = Store.behaviorPatternCounts([], 'Sim');
check('no trades -> empty emotion', Object.keys(noPats.emotion).length === 0);
check('no trades -> empty exitType', Object.keys(noPats.exitType).length === 0);
check('no trades -> empty planDeviation', Object.keys(noPats.planDeviation).length === 0);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Process dashboard result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
