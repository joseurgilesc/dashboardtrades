/* test/gain-factor.test.js
 * VM harness for the gain-based risk factor (pure helpers in js/store.js).
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure helpers. No browser, no Firebase, no build step.
 *
 * Proves:
 *   [1] normalizeGainFactor: presets 20/30/50/60 preserved, anything else -> 50
 *   [2] todayGains: sum of net > 0 of today's account-scoped trades only
 *   [3] gainsAdjustedAvailable: formula, hard cap, no-op when used = 0
 *   [4] dailyRiskUsage: gain-adjusted available + todayGains/gainFactor fields
 *   [5] getRiskSettings: per-account gainFactor with default 50
 *
 * Run: node test/gain-factor.test.js
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
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TODAY = '2026-06-01';
let idSeq = 0;

/* ES: pointValue 50, commission 4.18. A Largo entry 5000 -> exit 5002 is a
 * +$95.82 net winner; exit 4998 is a -$104.18 net loser. */
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

/* ------------------------------------------------------------------ */
/* [1] normalizeGainFactor                                             */
/* ------------------------------------------------------------------ */

console.log('\n[1] normalizeGainFactor presets and default');

eq('preset 20 preserved', Store.normalizeGainFactor(20), 20);
eq('preset 30 preserved', Store.normalizeGainFactor(30), 30);
eq('preset 50 preserved', Store.normalizeGainFactor(50), 50);
eq('preset 60 preserved', Store.normalizeGainFactor(60), 60);
eq('numeric string "60" preserved', Store.normalizeGainFactor('60'), 60);
eq('45 falls back to 50', Store.normalizeGainFactor(45), 50);
eq('0 falls back to 50', Store.normalizeGainFactor(0), 50);
eq('negative falls back to 50', Store.normalizeGainFactor(-10), 50);
eq('non-numeric falls back to 50', Store.normalizeGainFactor('abc'), 50);
eq('missing falls back to 50', Store.normalizeGainFactor(), 50);
eq('null falls back to 50', Store.normalizeGainFactor(null), 50);

/* ------------------------------------------------------------------ */
/* [2] todayGains                                                      */
/* ------------------------------------------------------------------ */

console.log('\n[2] todayGains sums only today\'s account winners');

const winner = trade({ exitPrice: 5002 });                 /* +95.82 today Sim  */
const loser = trade({ exitPrice: 4998 });                  /* -104.18 today Sim */
const otherDayWinner = trade({
  entryDate: '2026-05-31', exitDate: '2026-05-31', exitPrice: 5002
});                                                        /* +95.82 yesterday */
const otherAccountWinner = trade({ account: 'Real', exitPrice: 5002 }); /* +95.82 Real */

const mixed = [winner, loser, otherDayWinner, otherAccountWinner];

eq('todayGains sums only today winners', Store.todayGains({ account: 'Sim', today: TODAY, trades: mixed }), 95.82);
eq('todayGains ignores losers', Store.todayGains({ account: 'Sim', today: TODAY, trades: [loser] }), 0);
eq('todayGains is empty without trades', Store.todayGains({ account: 'Sim', today: TODAY, trades: [] }), 0);
eq('todayGains is account-scoped', Store.todayGains({ account: 'Real', today: TODAY, trades: mixed }), 95.82);
eq('other account has no Sim winners', Store.todayGains({ account: 'Sim', today: TODAY, trades: [otherAccountWinner] }), 0);

/* ------------------------------------------------------------------ */
/* [3] gainsAdjustedAvailable                                          */
/* ------------------------------------------------------------------ */

console.log('\n[3] gainsAdjustedAvailable formula, cap, no-op');

eq('300 - 200 + 50% of 100 = 150',
  Store.gainsAdjustedAvailable({ dailyBudget: 300, used: 200, todayGains: 100, gainFactor: 50 }), 150);
eq('hard cap clamps to the daily budget',
  Store.gainsAdjustedAvailable({ dailyBudget: 300, used: 200, todayGains: 500, gainFactor: 60 }), 300);
eq('no-op when used = 0 (equals daily budget)',
  Store.gainsAdjustedAvailable({ dailyBudget: 300, used: 0, todayGains: 300, gainFactor: 50 }), 300);
eq('negative result is preserved (exhausted)',
  Store.gainsAdjustedAvailable({ dailyBudget: 300, used: 350, todayGains: 0, gainFactor: 50 }), -50);
eq('gainFactor is normalized inside (999 -> 50)',
  Store.gainsAdjustedAvailable({ dailyBudget: 300, used: 200, todayGains: 100, gainFactor: 999 }), 150);
eq('rounds to the cent',
  Store.gainsAdjustedAvailable({ dailyBudget: 100, used: 50, todayGains: 1, gainFactor: 30 }), 50.3);

/* ------------------------------------------------------------------ */
/* [4] dailyRiskUsage gain-adjusted available                          */
/* ------------------------------------------------------------------ */

console.log('\n[4] dailyRiskUsage applies the gain term once');

/* Sim 3% on 10000 -> daily budget 300. One loser + one winner today. */
const both = [trade({ exitPrice: 4998 }), trade({ exitPrice: 5002 })];

const usageDefault = Store.dailyRiskUsage({ account: 'Sim', riskPct: 3, balance: 10000, today: TODAY, trades: both });
eq('used = 104.18', usageDefault.used, 104.18);
eq('todayGains = 95.82', usageDefault.todayGains, 95.82);
eq('gainFactor defaults to 50', usageDefault.gainFactor, 50);
close('available = 300 - 104.18 + 50% of 95.82 = 243.73', usageDefault.available, 243.73, 1e-9);

const usage60 = Store.dailyRiskUsage({ account: 'Sim', riskPct: 3, balance: 10000, today: TODAY, trades: both, gainFactor: 60 });
eq('gainFactor 60 is normalized and echoed', usage60.gainFactor, 60);
close('available = 300 - 104.18 + 60% of 95.82 = 253.31', usage60.available, 253.31, 1e-9);

/* No losers: the gain term is a no-op. */
const onlyWinner = Store.dailyRiskUsage({ account: 'Sim', riskPct: 3, balance: 10000, today: TODAY, trades: [trade({ exitPrice: 5002 })] });
eq('no losers -> used 0', onlyWinner.used, 0);
eq('no losers -> available stays at the daily budget', onlyWinner.available, 300);

/* Hard cap: a huge winner never lifts available above the daily budget. */
const bigWinner = trade({ exitPrice: 5100 }); /* +100 points -> +4995.82 */
const capped = Store.dailyRiskUsage({ account: 'Sim', riskPct: 3, balance: 10000, today: TODAY, trades: [trade({ exitPrice: 4998 }), bigWinner], gainFactor: 60 });
eq('hard cap: available never exceeds the daily budget', capped.available, 300);

/* ------------------------------------------------------------------ */
/* [5] getRiskSettings per-account gainFactor                          */
/* ------------------------------------------------------------------ */

console.log('\n[5] getRiskSettings exposes per-account gainFactor');

Store.setSettings({ gainFactor: { Sim: 30, Real: 45, Fondeo: 60 } });
const set = Store.getRiskSettings();
eq('Sim gainFactor 30', set.Sim.gainFactor, 30);
eq('Real gainFactor invalid 45 -> 50', set.Real.gainFactor, 50);
eq('Fondeo gainFactor 60', set.Fondeo.gainFactor, 60);

Store.clearAll();
const defaults = Store.getRiskSettings();
eq('default Sim gainFactor 50', defaults.Sim.gainFactor, 50);
eq('default Real gainFactor 50', defaults.Real.gainFactor, 50);
eq('default Fondeo gainFactor 50', defaults.Fondeo.gainFactor, 50);
eq('riskPct still normalized alongside', defaults.Sim.riskPct, 2);
eq('dailyTradeLimit still normalized alongside', defaults.Sim.dailyTradeLimit, 3);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Gain factor result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
