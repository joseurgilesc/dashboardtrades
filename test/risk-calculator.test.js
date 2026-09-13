/* test/risk-calculator.test.js
 * VM harness for the BPT/Francisca Serrano risk calculator in js/store.js.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure helpers. No browser, no Firebase, no build step.
 *
 * Proves:
 *   [1] Market lookup: valor_tick = tick × pointValue for ES/MES/6E/FDAX/FDXM
 *   [2] P_m = ticks × valor_tick (ES 8 -> 100, MES 8 -> 10)
 *   [3] N = floor(effectiveBudget / P_m) and the small-account filter (<= 5000 -> 1)
 *   [4] 5% daily drawdown + 3-loss streak circuit breakers (0 contracts + alert)
 *   [5] Ticks_TP = 2 × ticks (and ×3) and %Recuperacion = p / (1 - p)
 *
 * Run: node test/risk-calculator.test.js
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
  '\n;globalThis.Store = Store; globalThis.INSTRUMENTS = INSTRUMENTS;' +
  '\n;globalThis.SMALL_ACCOUNT_MAX = SMALL_ACCOUNT_MAX;',
  context,
  { filename: 'store-bundle.js' }
);
const Store = context.Store;
const INSTRUMENTS = context.INSTRUMENTS;
const SMALL_ACCOUNT_MAX = context.SMALL_ACCOUNT_MAX;

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
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TODAY = '2026-06-01';
let idSeq = 0;

/* ES: pointValue 50, commission 4.18. A Largo entry 5000 -> exit 4998 is a
 * -$104.18 net loser (gross -100, commission 4.18). */
function trade(over) {
  idSeq += 1;
  return Object.assign({
    id: 't' + idSeq,
    tradeNumber: idSeq,
    account: 'Sim',
    instrument: 'ES',
    contracts: 1,
    strategy: 'vela-a-vela',
    direction: 'Largo',
    entryDate: TODAY,
    entryTime: '09:30',
    entryPrice: 5000,
    exitDate: TODAY,
    exitTime: '09:35',
    exitPrice: 5000,
    stop: 0,
    target: 0,
    plannedRisk: 0,
    exitType: 'Stop',
    emotion: 'Control',
    notes: ''
  }, over || {});
}

function tickValue(id) {
  const spec = INSTRUMENTS[id];
  return spec.tick * spec.pointValue;
}

/* ------------------------------------------------------------------ */
/* [1] Market lookup table                                             */
/* ------------------------------------------------------------------ */

console.log('\n[1] Market lookup (valor_tick = tick x pointValue)');

close('ES tick value = 12.50 USD', tickValue('ES'), 12.5);
close('MES tick value = 1.25 USD', tickValue('MES'), 1.25);
close('6E tick value = 12.50 USD', tickValue('6E'), 12.5);
close('FDAX tick value = 12.50 EUR', tickValue('FDAX'), 12.5);
close('FDXM tick value = 2.50 EUR', tickValue('FDXM'), 2.5);
eq('ES tick size = 0.25', INSTRUMENTS.ES.tick, 0.25);
eq('MES tick size = 0.25', INSTRUMENTS.MES.tick, 0.25);
eq('6E tick size = 0.0001', INSTRUMENTS['6E'].tick, 0.0001);
eq('FDAX tick size = 0.50', INSTRUMENTS.FDAX.tick, 0.5);
eq('FDXM tick size = 0.50', INSTRUMENTS.FDXM.tick, 0.5);
eq('FDAX is EUR-denominated', INSTRUMENTS.FDAX.currency, 'EUR');
eq('FDXM is EUR-denominated', INSTRUMENTS.FDXM.currency, 'EUR');
eq('small-account threshold is 5000', SMALL_ACCOUNT_MAX, 5000);

/* ------------------------------------------------------------------ */
/* [2] P_m = distancia_stop_ticks x valor_tick                         */
/* ------------------------------------------------------------------ */

console.log('\n[2] P_m = ticks x valor_tick');

const es = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: 'ES', stopTicks: 8 });
const mes = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: 'MES', stopTicks: 8 });

check('ES 8 ticks -> tickValue 12.50', es.valid && es.tickValue === 12.5, 'tickValue=' + es.tickValue);
eq('ES 8 ticks -> P_m 100', es.pm, 100);
check('ES P_m equals stopTicks x tickValue', es.pm === es.stopTicks * es.tickValue);
eq('MES 8 ticks -> P_m 10', mes.pm, 10);
check('MES P_m equals stopTicks x tickValue', mes.pm === mes.stopTicks * mes.tickValue);

/* ------------------------------------------------------------------ */
/* [3] N = floor(disponible / P_m) + small-account filter              */
/* ------------------------------------------------------------------ */

console.log('\n[3] Contract sizing (effective per-trade budget) + small account');

/* No losses: available = dailyBudget = 2% of 100000 = 2000. With the default
 * 3 trades/day, perTradeBudget = 2000 / 3 = 666.67 and effectiveBudget =
 * min(666.67, 2000) = 666.67; ES P_m 100 -> 6 contracts. */
eq('ES: floor(666.67 / 100) = 6 contracts', es.contracts, 6);
check('ES contracts = floor(effectiveBudget / P_m)',
  es.contracts === Math.floor(es.effectiveBudget / es.pm));
eq('ES: available defaults to the daily budget', es.available, 2000);
close('ES: per-trade budget = dailyBudget / tradesPerDay', es.perTradeBudget, 2000 / 3, 1e-9);
close('ES: effective budget = min(perTrade, available)', es.effectiveBudget, 2000 / 3, 1e-9);

/* Explicit remaining budget binds. */
const es250 = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: 'ES', stopTicks: 8, available: 250 });
eq('ES: floor(250 / 100) = 2 contracts', es250.contracts, 2);
eq('ES: presupuesto mirrors available', es250.presupuesto, 250);
eq('ES: effective budget is capped by available', es250.effectiveBudget, 250);

const mes250 = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: 'MES', stopTicks: 8, available: 250 });
eq('MES: floor(250 / 10) = 25 contracts', mes250.contracts, 25);

/* Small account: capital <= 5000 forces exactly 1 contract. */
const small = Store.computeRisk({ balance: 5000, capital: 5000, riskPct: 2, instrument: 'MES', stopTicks: 8 });
eq('small account (5000) -> forced 1 contract', small.contracts, 1);
eq('small account flag set', small.smallAccount, true);
const justAbove = Store.computeRisk({ balance: 5001, capital: 5001, riskPct: 2, instrument: 'MES', stopTicks: 8 });
eq('capital 5001 is not small', justAbove.smallAccount, false);
eq('capital 5001 -> floor(33.34 / 10) = 3 contracts', justAbove.contracts, 3);

/* Reconciliation: the day's realized losses consume the budget. */
const losers = [
  trade({ entryPrice: 5000, exitPrice: 4998 }),
  trade({ entryPrice: 5000, exitPrice: 4998 })
];
const usage = Store.dailyRiskUsage({ account: 'Sim', riskPct: 2, balance: 100000, today: TODAY, trades: losers });
close('used = sum of |net| of today losers', usage.used, 208.36, 1e-9);
close('available = 2000 - 208.36', usage.available, 1791.64, 1e-9);
const reconciled = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, instrument: 'ES', stopTicks: 8,
  available: usage.available
});
eq('reconciled contracts = floor(666.67 / 100) = 6', reconciled.contracts, 6);

/* ------------------------------------------------------------------ */
/* [4] Circuit breakers: 5% drawdown and 3-loss streak                 */
/* ------------------------------------------------------------------ */

console.log('\n[4] Circuit breakers (Block 4)');

/* 5% daily drawdown on 10000 capital = 500. */
const ddAtLimit = Store.computeRisk({
  balance: 10000, capital: 10000, riskPct: 2, instrument: 'MES', stopTicks: 8, dayLoss: 500
});
eq('drawdown 5% -> blocked', ddAtLimit.blocked, true);
check('drawdown 5% -> reason drawdown', ddAtLimit.blockReasons.indexOf('drawdown') !== -1);
eq('drawdown 5% -> 0 contracts', ddAtLimit.contracts, 0);
close('drawdownPct reported', ddAtLimit.drawdownPct, 5, 1e-9);

const ddBelow = Store.computeRisk({
  balance: 10000, capital: 10000, riskPct: 2, instrument: 'MES', stopTicks: 8, dayLoss: 499.99
});
eq('drawdown just below 5% -> not blocked', ddBelow.blocked, false);
eq('drawdown just below 5% -> sizes per-trade (floor(66.67 / 10) = 6)', ddBelow.contracts, 6);

/* 3 consecutive losses today, drawdown well under 5% (capital 100000). */
const threeLosers = [
  trade({ entryPrice: 5000, exitPrice: 4998 }),
  trade({ entryPrice: 5000, exitPrice: 4998 }),
  trade({ entryPrice: 5000, exitPrice: 4998 })
];
const guardStreak = Store.riskGuard({ account: 'Sim', capital: 100000, today: TODAY, trades: threeLosers });
eq('riskGuard dayLoss = 3 x 104.18', guardStreak.dayLoss, 312.54);
eq('riskGuard streak = 3', guardStreak.losingStreak, 3);
eq('riskGuard blocked on 3 losses', guardStreak.blocked, true);
check('riskGuard reason streak', guardStreak.blockReasons.indexOf('streak') !== -1);

const streakRisk = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, instrument: 'MES', stopTicks: 8,
  dayLoss: guardStreak.dayLoss, losingStreak: guardStreak.losingStreak
});
eq('3-loss streak -> blocked', streakRisk.blocked, true);
eq('3-loss streak -> 0 contracts', streakRisk.contracts, 0);
check('3-loss streak -> reason streak', streakRisk.blockReasons.indexOf('streak') !== -1);

/* riskGuard ignores winners, other days and other accounts. */
const mixed = [
  trade({ entryPrice: 5000, exitPrice: 4998 }),                       /* today loser  */
  trade({ entryPrice: 5000, exitPrice: 5002 }),                       /* today winner */
  trade({ entryDate: '2026-05-31', entryPrice: 5000, exitPrice: 4990 }), /* other day */
  trade({ account: 'Real', entryPrice: 5000, exitPrice: 4990 })       /* other acct */
];
const guardMixed = Store.riskGuard({ account: 'Sim', capital: 100000, today: TODAY, trades: mixed });
eq('riskGuard counts only today account losers', guardMixed.dayLoss, 104.18);
eq('riskGuard streak reset by a winner', guardMixed.losingStreak, 0);
eq('riskGuard not blocked when clean', guardMixed.blocked, false);

/* ------------------------------------------------------------------ */
/* [5] Ticks_TP and %Recuperacion                                      */
/* ------------------------------------------------------------------ */

console.log('\n[5] Ticks_TP and %Recuperacion');

eq('Ticks_TP = 2 x ticks (8 -> 16)', es.ticksTP2, 16);
eq('Ticks_TP alias = 2 x ticks', es.ticksTP, 16);
eq('Ticks_TP alternative = 3 x ticks (8 -> 24)', es.ticksTP3, 24);
eq('Ticks SL = stop ticks', es.ticksSL, 8);

/* recovery = p / (1 - p). */
close('recovery(0.5) = 1 (100%)', Store.recoveryPct(0.5), 1, 1e-12);
close('recovery(0.02) = 0.020408...', Store.recoveryPct(0.02), 0.02 / 0.98, 1e-12);

/* Position-level recovery from computeRisk: capital 100000, per-trade budget
 * 666.67, MES P_m 10 -> 66 contracts, totalRisk 660, lossPct 0.0066. */
close('computeRisk lossPct', mes.lossPct, 0.0066, 1e-12);
close('computeRisk recoveryPct = lossPct/(1-lossPct)', mes.recoveryPct, 0.0066 / (1 - 0.0066), 1e-12);
eq('computeRisk totalRisk = N x P_m', mes.totalRisk, mes.contracts * mes.pm);

/* Invalid input never sizes silently. */
const invalid = Store.computeRisk({ balance: 100000, capital: 100000, riskPct: 2, instrument: 'ES', stopTicks: 0 });
eq('stopTicks 0 -> invalid', invalid.valid, false);
eq('stopTicks 0 -> reason stopTicks', invalid.reason, 'stopTicks');
eq('invalid -> 0 contracts', invalid.contracts, 0);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Risk calculator test result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
