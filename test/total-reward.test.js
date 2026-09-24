/* test/total-reward.test.js
 * VM harness for the `totalReward` field added to Store.computeRisk.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure calculator. No browser, no Firebase, no build step.
 *
 * Proves:
 *   [1] totalReward === ticksTP x tickValue x contracts
 *   [2] totalReward === targetR x totalRisk (the equivalent identity)
 *   [3] totalReward scales with the selected R/B ratio, not the sizing
 *   [4] totalReward is GROSS (commission is never folded in)
 *   [5] an invalid result still carries the default totalReward = 0
 *
 * Run: node test/total-reward.test.js
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
  instrumentsSrc + '\n' + storeSrc +
  '\n;globalThis.Store = Store; globalThis.INSTRUMENTS = INSTRUMENTS;',
  context,
  { filename: 'store-bundle.js' }
);
const Store = context.Store;
const INSTRUMENTS = context.INSTRUMENTS;

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

function close(name, actual, expected, tol) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= (tol || 1e-9);
  check(name, ok, 'expected ~' + expected + ', got ' + actual);
}

/* ------------------------------------------------------------------ */
/* [1] totalReward === ticksTP x tickValue x contracts                 */
/* ------------------------------------------------------------------ */

console.log('\n[1] totalReward = ticksTP x tickValue x contracts');

/* MES: tick 0.25, pointValue 5 -> tickValue 1.25. Capital 100000, 2% risk,
 * 3 trades/day -> perTradeBudget 666.67, pm 10, contracts 66. */
const mes = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: 'MES', stopTicks: 8 });
check('MES result is valid', mes.valid, 'reason=' + mes.reason);
eq('MES contracts = 66', mes.contracts, 66);
eq('MES tickValue = 1.25', mes.tickValue, 1.25);
eq('MES totalRisk = 660', mes.totalRisk, 660);
/* ticksTP = stopTicks x targetR = 8 x 2 = 16; 16 x 1.25 x 66 = 1320. */
eq('MES totalReward = 1320', mes.totalReward, 1320);
check('totalReward === ticksTP x tickValue x contracts',
  mes.totalReward === mes.ticksTP * mes.tickValue * mes.contracts);

/* ES: tick 0.25, pointValue 50 -> tickValue 12.5; pm 100, contracts 6. */
const es = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: 'ES', stopTicks: 8 });
check('ES result is valid', es.valid, 'reason=' + es.reason);
eq('ES contracts = 6', es.contracts, 6);
eq('ES totalRisk = 600', es.totalRisk, 600);
eq('ES totalReward = 1200', es.totalReward, 1200);
check('totalReward === ticksTP x tickValue x contracts',
  es.totalReward === es.ticksTP * es.tickValue * es.contracts);

/* ------------------------------------------------------------------ */
/* [2] totalReward === targetR x totalRisk (equivalent identity)       */
/* ------------------------------------------------------------------ */

console.log('\n[2] totalReward = targetR x totalRisk');

check('MES totalReward === targetR x totalRisk',
  mes.totalReward === mes.targetR * mes.totalRisk);
check('ES totalReward === targetR x totalRisk',
  es.totalReward === es.targetR * es.totalRisk);

/* ------------------------------------------------------------------ */
/* [3] totalReward follows the R/B ratio, not the sizing               */
/* ------------------------------------------------------------------ */

console.log('\n[3] totalReward scales with the selected ratio');

/* Same sizing (targetR does not change contracts), larger reward multiple. */
const mes3 = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, instrument: 'MES',
  stopTicks: 8, targetR: 3, targetRAlt: 3
});
eq('ratio 1:3 keeps the same contracts', mes3.contracts, mes.contracts);
eq('ratio 1:3 totalReward = 1980', mes3.totalReward, 1980);
check('ratio 1:3 totalReward === targetR x totalRisk',
  mes3.totalReward === mes3.targetR * mes3.totalRisk);
check('totalReward moves with the ratio', mes3.totalReward > mes.totalReward);
eq('totalRisk unchanged by the ratio', mes3.totalRisk, mes.totalRisk);

/* ------------------------------------------------------------------ */
/* [4] totalReward is gross: commission is never folded in             */
/* ------------------------------------------------------------------ */

console.log('\n[4] totalReward is gross (commission excluded)');

/* ES carries a non-zero catalog commission (4.18 per contract). */
check('ES commission is non-zero', es.commission > 0);
check('totalReward ignores commission (gross)',
  es.totalReward === es.targetR * es.totalRisk);
check('totalReward is not reduced by commission',
  es.totalReward === es.totalRisk * es.targetR &&
  Math.abs(es.totalReward - (es.totalRisk * es.targetR - es.commission)) > 1e-9);

/* ------------------------------------------------------------------ */
/* [5] invalid input still returns the default totalReward = 0         */
/* ------------------------------------------------------------------ */

console.log('\n[5] invalid input -> totalReward defaults to 0');

const invalid = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: 'ES', stopTicks: 0 });
eq('stopTicks 0 -> invalid', invalid.valid, false);
eq('invalid -> totalReward 0', invalid.totalReward, 0);

const noInstrument = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: '', stopTicks: 8 });
eq('missing instrument -> invalid', noInstrument.valid, false);
eq('missing instrument -> totalReward 0', noInstrument.totalReward, 0);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Total reward test result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
