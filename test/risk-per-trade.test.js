/* test/risk-per-trade.test.js
 * VM harness for the per-trade risk model in js/store.js.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure helpers. No browser, no Firebase, no build step.
 *
 * Proves (Fix 4):
 *   [1] perTradeBudget = dailyBudget / tradesPerDay and
 *       effectiveBudget = min(perTradeBudget, available)
 *   [2] Changing the INSTRUMENT changes the suggested stop ticks
 *       (different tickValue -> different maxTicksForOneContract)
 *   [3] Changing the TRADES/DAY changes the suggested stop ticks
 *       (more trades/day -> fewer ticks for one contract)
 *   [4] The suggested stop/target PRICES move accordingly, Largo and Corto
 *   [5] The BPT R/B range (Ticks_SL x2 and x3) and the circuit breakers
 *       (5% drawdown, 3-loss streak, small account <= 5000) are unchanged
 *
 * Run: node test/risk-per-trade.test.js
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

function tickValue(id) {
  const spec = INSTRUMENTS[id];
  return spec.tick * spec.pointValue;
}

/* One account, 2% risk on a 10,000 start-of-day balance -> 200 daily budget. */
function risk(over) {
  return Store.computeRisk(Object.assign({
    balance: 10000,
    capital: 10000,
    riskPct: 2,
    instrument: 'MES',
    stopTicks: 8,
    tradesPerDay: 1
  }, over || {}));
}

/* ------------------------------------------------------------------ */
/* [1] Per-trade budget and effective budget                           */
/* ------------------------------------------------------------------ */

console.log('\n[1] Per-trade budget = dailyBudget / tradesPerDay');

const one = risk({ tradesPerDay: 1 });
const three = risk({ tradesPerDay: 3 });
const six = risk({ tradesPerDay: 6 });

eq('daily budget = 2% of 10000 = 200', one.dailyBudget, 200);
close('1 trade/day -> perTradeBudget 200', one.perTradeBudget, 200, 1e-9);
close('3 trades/day -> perTradeBudget 66.67', three.perTradeBudget, 200 / 3, 1e-9);
close('6 trades/day -> perTradeBudget 33.33', six.perTradeBudget, 200 / 6, 1e-9);
close('effectiveBudget = min(perTrade, available) when available is larger',
  three.effectiveBudget, 200 / 3, 1e-9);
close('perTradeRisk mirrors perTradeBudget', three.perTradeRisk, three.perTradeBudget, 1e-9);
close('effectiveRisk mirrors effectiveBudget', three.effectiveRisk, three.effectiveBudget, 1e-9);

/* Available caps the per-trade budget when smaller. */
const capped = risk({ tradesPerDay: 1, available: 50 });
close('effectiveBudget = min(200, 50) = 50', capped.effectiveBudget, 50, 1e-9);
eq('maxTicks with the cap = floor(50 / 1.25) = 40', capped.maxTicksForOneContract, 40);
eq('sizing with the cap: floor(50 / 10) = 5 contracts', capped.contracts, 5);

/* An exhausted day clamps the effective budget to 0, never negative. */
const exhausted = risk({ tradesPerDay: 1, available: -10 });
eq('negative available -> effectiveBudget 0', exhausted.effectiveBudget, 0);
eq('negative available -> exhausted', exhausted.exhausted, true);
eq('negative available -> maxTicks 0', exhausted.maxTicksForOneContract, 0);

/* ------------------------------------------------------------------ */
/* [2] Instrument changes the suggested stop ticks                     */
/* ------------------------------------------------------------------ */

console.log('\n[2] Instrument -> different tickValue -> different stop ticks');

const mes = risk({ instrument: 'MES', tradesPerDay: 1 });
const nq = risk({ instrument: 'NQ', tradesPerDay: 1 });
const es = risk({ instrument: 'ES', tradesPerDay: 1 });

close('MES tickValue = 1.25', tickValue('MES'), 1.25);
close('NQ tickValue = 5', tickValue('NQ'), 5);
close('ES tickValue = 12.50', tickValue('ES'), 12.5);

eq('MES maxTicks = floor(200 / 1.25) = 160', mes.maxTicksForOneContract, 160);
eq('NQ maxTicks = floor(200 / 5) = 40', nq.maxTicksForOneContract, 40);
eq('ES maxTicks = floor(200 / 12.50) = 16', es.maxTicksForOneContract, 16);
check('different instruments yield different stop ticks',
  mes.maxTicksForOneContract !== es.maxTicksForOneContract &&
  mes.maxTicksForOneContract !== nq.maxTicksForOneContract);
check('maxTicks = floor(effectiveBudget / tickValue) for every instrument',
  mes.maxTicksForOneContract === Math.floor(mes.effectiveBudget / tickValue('MES')) &&
  nq.maxTicksForOneContract === Math.floor(nq.effectiveBudget / tickValue('NQ')) &&
  es.maxTicksForOneContract === Math.floor(es.effectiveBudget / tickValue('ES')));

/* ------------------------------------------------------------------ */
/* [3] Trades/day changes the suggested stop ticks                     */
/* ------------------------------------------------------------------ */

console.log('\n[3] Trades/day -> fewer ticks for one contract');

eq('MES 1 trade/day -> 160 ticks', one.maxTicksForOneContract, 160);
eq('MES 3 trades/day -> 53 ticks', three.maxTicksForOneContract, 53);
eq('MES 6 trades/day -> 26 ticks', six.maxTicksForOneContract, 26);
check('3 trades/day afford fewer ticks than 1 trade/day',
  three.maxTicksForOneContract < one.maxTicksForOneContract);
check('6 trades/day afford fewer ticks than 3 trades/day',
  six.maxTicksForOneContract < three.maxTicksForOneContract);
check('maxTicks = floor(perTradeBudget / tickValue) when it binds',
  three.maxTicksForOneContract === Math.floor(three.perTradeBudget / tickValue('MES')));

/* ------------------------------------------------------------------ */
/* [4] Suggested stop/target prices move (Largo and Corto)             */
/* ------------------------------------------------------------------ */

console.log('\n[4] Suggested prices follow the per-trade stop ticks');

/* MES tick 0.25, entry 5000. 1/day -> 160 ticks = 40 points;
 * 3/day -> 53 ticks = 13.25 points. */
const largoOne = Store.suggestStopTarget({
  instrument: 'MES', entryPrice: 5000, direction: 'Largo', ticks: one.maxTicksForOneContract
});
const largoThree = Store.suggestStopTarget({
  instrument: 'MES', entryPrice: 5000, direction: 'Largo', ticks: three.maxTicksForOneContract
});
check('Largo 1/day suggestion is valid', largoOne.valid);
check('Largo 3/day suggestion is valid', largoThree.valid);
eq('Largo 1/day stop = 5000 - 40', largoOne.stopPrice, 4960);
eq('Largo 1/day target = 5000 + 80', largoOne.targetPrice, 5080);
eq('Largo 3/day stop = 5000 - 13.25', largoThree.stopPrice, 4986.75);
eq('Largo 3/day target = 5000 + 26.5', largoThree.targetPrice, 5026.5);
check('more trades/day moves the Largo stop closer to entry',
  largoThree.stopPrice > largoOne.stopPrice);

const cortoOne = Store.suggestStopTarget({
  instrument: 'MES', entryPrice: 5000, direction: 'Corto', ticks: one.maxTicksForOneContract
});
const cortoThree = Store.suggestStopTarget({
  instrument: 'MES', entryPrice: 5000, direction: 'Corto', ticks: three.maxTicksForOneContract
});
check('Corto 1/day suggestion is valid', cortoOne.valid);
check('Corto 3/day suggestion is valid', cortoThree.valid);
eq('Corto 1/day stop = 5000 + 40', cortoOne.stopPrice, 5040);
eq('Corto 1/day target = 5000 - 80', cortoOne.targetPrice, 4920);
eq('Corto 3/day stop = 5000 + 13.25', cortoThree.stopPrice, 5013.25);
eq('Corto 3/day target = 5000 - 26.5', cortoThree.targetPrice, 4973.5);
check('more trades/day moves the Corto stop closer to entry',
  cortoThree.stopPrice < cortoOne.stopPrice);

/* Instrument change also moves the prices (ES 16 ticks = 4 points). */
const esLargo = Store.suggestStopTarget({
  instrument: 'ES', entryPrice: 5000, direction: 'Largo', ticks: es.maxTicksForOneContract
});
eq('ES 1/day stop = 5000 - 4', esLargo.stopPrice, 4996);
eq('ES 1/day target = 5000 + 8', esLargo.targetPrice, 5008);
check('instrument change moves the suggested stop price',
  esLargo.stopPrice !== largoOne.stopPrice);

/* ------------------------------------------------------------------ */
/* [5] R/B range and circuit breakers stay intact                      */
/* ------------------------------------------------------------------ */

console.log('\n[5] R/B range + circuit breakers');

eq('Ticks TP min (x2) = 2 x stop ticks', one.ticksTP2, 16);
eq('Ticks TP alt (x3) = 3 x stop ticks', one.ticksTP3, 24);
eq('ticksTP alias still 2 x stop ticks', one.ticksTP, 16);
eq('ticksSL equals the stop ticks', one.ticksSL, 8);

const blocked = risk({ tradesPerDay: 1, dayLoss: 500 }); /* 5% of 10000 */
eq('5% drawdown still blocks', blocked.blocked, true);
eq('blocked -> 0 contracts', blocked.contracts, 0);
check('blocked -> reason drawdown', blocked.blockReasons.indexOf('drawdown') !== -1);

const streak = risk({ tradesPerDay: 1, losingStreak: 3 });
eq('3-loss streak still blocks', streak.blocked, true);
eq('3-loss streak -> 0 contracts', streak.contracts, 0);

const small = risk({ balance: 5000, capital: 5000, tradesPerDay: 1 });
eq('small account (<= 5000) still forced to 1 contract', small.contracts, 1);
eq('small account flag set', small.smallAccount, true);

const invalid = Store.computeRisk({
  balance: 10000, capital: 10000, riskPct: 2, instrument: 'MES', stopTicks: 0, tradesPerDay: 1
});
eq('stopTicks 0 -> invalid', invalid.valid, false);
eq('stopTicks 0 -> reason stopTicks', invalid.reason, 'stopTicks');
eq('invalid -> 0 contracts', invalid.contracts, 0);

/* ------------------------------------------------------------------ */
/* [6] Gain term widens effectiveBudget / maxTicks when it binds       */
/* ------------------------------------------------------------------ */

console.log('\n[6] Gain term widens the per-trade budget when available binds');

const gainLifted = risk({ tradesPerDay: 1, available: 120 });
close('boosted available 120 -> effectiveBudget 120', gainLifted.effectiveBudget, 120, 1e-9);
eq('boosted available 120 -> maxTicks floor(120/1.25)=96', gainLifted.maxTicksForOneContract, 96);
eq('boosted available 120 -> contracts floor(120/10)=12', gainLifted.contracts, 12);

const gainLifted2 = risk({ tradesPerDay: 1, available: 150 });
eq('boosted available 150 -> contracts floor(150/10)=15', gainLifted2.contracts, 15);
check('a larger gain boosts the contract count', gainLifted2.contracts > gainLifted.contracts);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Per-trade risk test result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
