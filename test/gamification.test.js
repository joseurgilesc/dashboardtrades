/* test/gamification.test.js
 * VM harness for the Phase 2/3 discipline gamification in js/store.js.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure helpers against hand-built trades. No browser, no
 * Firebase, no build step.
 *
 * Run: node test/gamification.test.js
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
    id: 't' + idSeq,
    tradeNumber: idSeq,
    account: 'Sim',
    instrument: 'NQ',        /* pointValue 20, commission 4.18 */
    contracts: 1,
    strategy: 'vela-a-vela',
    direction: 'Largo',
    entryDate: '2026-01-05',
    entryTime: '09:30',
    entryPrice: 100,
    exitDate: '2026-01-05',
    exitTime: '09:35',
    exitPrice: 100,          /* net = -commission only */
    stop: 0,
    target: 0,
    plannedRisk: 0,
    exitType: 'Profit',
    emotion: 'Control',
    notes: ''
  }, over || {});
}

function nTrades(n, over) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(trade(over));
  return out;
}

/* ------------------------------------------------------------------ */
/* 1. Discipline streak increments / decrements                        */
/* ------------------------------------------------------------------ */

console.log('\n[1] Discipline streak');

const streakDays = []
  .concat(nTrades(1, { entryDate: '2026-01-05' }))
  .concat(nTrades(2, { entryDate: '2026-01-06' }))
  .concat(nTrades(2, { entryDate: '2026-01-07' }));
const streak3 = Store.disciplineStreak(streakDays, 'Sim', 2);
eq('three disciplined days -> current 3', streak3.current, 3);
eq('three disciplined days -> best 3', streak3.best, 3);

/* A day with exactly the limit is disciplined (did NOT exceed). */
const atLimit = Store.disciplineDays(nTrades(2, { entryDate: '2026-01-06' }), 'Sim', 2);
eq('count == limit is disciplined', atLimit[0].disciplined, true);
eq('count == limit is not overTraded', atLimit[0].overTraded, false);

/* Over-trading the latest day resets the current streak, keeps the best. */
const afterOvertrade = streakDays.concat(nTrades(3, { entryDate: '2026-01-08' }));
const streakAfter = Store.disciplineStreak(afterOvertrade, 'Sim', 2);
eq('over-traded latest day -> current 0', streakAfter.current, 0);
eq('over-traded latest day -> best preserved 3', streakAfter.best, 3);

/* A new disciplined day after the reset starts a fresh run of 1. */
const afterRecovery = afterOvertrade.concat(nTrades(1, { entryDate: '2026-01-09' }));
const streakRecovered = Store.disciplineStreak(afterRecovery, 'Sim', 2);
eq('disciplined day after reset -> current 1', streakRecovered.current, 1);
eq('disciplined day after reset -> best still 3', streakRecovered.best, 3);

/* Non-trading calendar gaps do not break the streak. */
const gapped = []
  .concat(nTrades(1, { entryDate: '2026-01-05' }))
  .concat(nTrades(1, { entryDate: '2026-01-12' }))
  .concat(nTrades(1, { entryDate: '2026-01-20' }));
eq('calendar gaps do not break the streak', Store.disciplineStreak(gapped, 'Sim', 2).current, 3);

/* A limit of 0 makes any trade over-trading. */
eq('limit 0 -> any trade over-trades', Store.disciplineStreak(nTrades(1), 'Sim', 0).current, 0);

/* Account scoping: Real trades never count toward Sim. */
const mixed = nTrades(3, { entryDate: '2026-01-05' })
  .concat(nTrades(1, { account: 'Real', entryDate: '2026-01-05' }));
eq('streak is account-scoped', Store.disciplineStreak(mixed, 'Sim', 2).current, 0);

/* ------------------------------------------------------------------ */
/* 2. XP is awarded only for process (never P&L or leverage)           */
/* ------------------------------------------------------------------ */

console.log('\n[2] XP is process-only');

const baseOpts = { limit: 3, riskPct: 2, minRR: 2, initialBalance: 5000 };

const processTrades = nTrades(3, {
  entryDate: '2026-01-05',
  stop: 99.9,
  plannedRisk: 20,
  target: 60,
  exitPrice: 100              /* flat: net negative by commission */
});
const winnerTrades = processTrades.map(function (t, i) {
  return Object.assign({}, t, { id: 'w' + i, exitPrice: 200 }); /* big win */
});
const loserTrades = processTrades.map(function (t, i) {
  return Object.assign({}, t, { id: 'l' + i, exitPrice: 0 });   /* big loss */
});

const xpProcess = Store.xpBreakdown(processTrades, 'Sim', baseOpts).total;
const xpWinner = Store.xpBreakdown(winnerTrades, 'Sim', baseOpts).total;
const xpLoser = Store.xpBreakdown(loserTrades, 'Sim', baseOpts).total;
eq('XP ignores profit (flat == winner)', xpProcess, xpWinner);
eq('XP ignores loss (flat == loser)', xpProcess, xpLoser);

/* Leverage / contract count must not change XP. */
const leveraged = processTrades.map(function (t, i) {
  return Object.assign({}, t, { id: 'x' + i, contracts: 10 });
});
eq('XP ignores leverage (contracts)', xpProcess, Store.xpBreakdown(leveraged, 'Sim', baseOpts).total);

/* Recording a stop is rewarded. */
const noStop = processTrades.map(function (t, i) {
  return Object.assign({}, t, { id: 'n' + i, stop: 0 });
});
eq('stop adds +5 XP per trade',
  xpProcess - Store.xpBreakdown(noStop, 'Sim', baseOpts).total, 3 * 5);

/* Meeting the min R/R is rewarded. */
const noRR = processTrades.map(function (t, i) {
  return Object.assign({}, t, { id: 'r' + i, plannedRisk: 0, target: 0 });
});
eq('meeting min R/R adds +5 XP per trade',
  xpProcess - Store.xpBreakdown(noRR, 'Sim', baseOpts).total, 3 * 5);

/* Volume beyond the daily limit earns nothing (and loses the day bonus). */
const oneTrade = nTrades(1, { entryDate: '2026-01-05' });
const fiveTrades = nTrades(5, { entryDate: '2026-01-05' });
const xpOne = Store.xpBreakdown(oneTrade, 'Sim', baseOpts);
const xpFive = Store.xpBreakdown(fiveTrades, 'Sim', baseOpts);
eq('base XP caps at the daily limit (1 trade -> +2)', xpOne.base, 2);
eq('base XP caps at the daily limit (5 trades -> +6)', xpFive.base, 6);
eq('over-trading forfeits the disciplined-day bonus', xpFive.dayBonus, 0);
eq('over-trading earns less XP than one disciplined trade', xpFive.total < xpOne.total, true);

/* XP is account-scoped. */
eq('XP is account-scoped',
  Store.xpBreakdown(processTrades, 'Real', baseOpts).total, 0);

/* Level mapping. */
eq('level 1 at 0 XP', Store.levelInfo(0).level, 1);
eq('level 2 at 100 XP', Store.levelInfo(100).level, 2);
eq('level progress within a level', Store.levelInfo(150).intoLevel, 50);
eq('level progress percent', Store.levelInfo(150).progressPct, 50);

/* ------------------------------------------------------------------ */
/* 3. Process achievements unlock on the right condition               */
/* ------------------------------------------------------------------ */

console.log('\n[3] Achievements');

function earnedMap(trades, opts) {
  const out = {};
  Store.evaluateAchievements(trades, 'Sim', opts).forEach(function (a) { out[a.id] = a.earned; });
  return out;
}

/* first-stop */
eq('first-stop locked with no stop', earnedMap(nTrades(3, { stop: 0 }), baseOpts)['first-stop'], false);
eq('first-stop unlocks with one stop', earnedMap(nTrades(1, { stop: 99.9 }), baseOpts)['first-stop'], true);

/* disciplined-day */
eq('disciplined-day locked when over-trading', earnedMap(nTrades(5, { limit: 3 }), baseOpts)['disciplined-day'], false);
eq('disciplined-day unlocks with a day under the limit',
  earnedMap(nTrades(1, {}), baseOpts)['disciplined-day'], true);

/* risk-10: 10 trades that respect the per-account risk budget. */
const riskOpts = { limit: 10, riskPct: 2, minRR: 2, initialBalance: 100000 };
const respected = nTrades(10, { stop: 99, entryPrice: 100, contracts: 1 }); /* 1pt * 20 = 20 USD */
const notRespected = nTrades(10, { stop: 0, entryPrice: 100, plannedRisk: 5000 }); /* > per-trade cap */
eq('risk-10 locked with 9 respected trades',
  earnedMap(respected.slice(0, 9), riskOpts)['risk-10'], false);
eq('risk-10 unlocks with 10 respected trades',
  earnedMap(respected, riskOpts)['risk-10'], true);
eq('risk-10 locked when risk exceeds the cap',
  earnedMap(notRespected, riskOpts)['risk-10'], false);

/* rr-10: 10 trades meeting the min R/R. */
const rrGood = nTrades(10, { plannedRisk: 100, target: 300 });
const rrBad = nTrades(10, { plannedRisk: 100, target: 150 });
eq('rr-10 locked with 9 compliant trades',
  earnedMap(rrGood.slice(0, 9), baseOpts)['rr-10'], false);
eq('rr-10 unlocks with 10 compliant trades', earnedMap(rrGood, baseOpts)['rr-10'], true);
eq('rr-10 locked when R/R is below the minimum', earnedMap(rrBad, baseOpts)['rr-10'], false);

/* streak-5 / streak-10 */
function daysRun(n, limit) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const day = '2026-02-' + String(i + 1).padStart(2, '0');
    out.push(trade({ entryDate: day, exitDate: day }));
  }
  return out;
}
eq('streak-5 locked at 4 days', earnedMap(daysRun(4), baseOpts)['streak-5'], false);
eq('streak-5 unlocks at 5 days', earnedMap(daysRun(5), baseOpts)['streak-5'], true);
eq('streak-10 unlocks at 10 days', earnedMap(daysRun(10), baseOpts)['streak-10'], true);
eq('achievement progress is capped at the target',
  Store.evaluateAchievements(daysRun(10), 'Sim', baseOpts)
    .filter(function (a) { return a.id === 'streak-5'; })[0].progressPct, 100);

/* ------------------------------------------------------------------ */
/* 4. Weekly recap + goals (supporting checks)                         */
/* ------------------------------------------------------------------ */

console.log('\n[4] Weekly recap + goals');

const week = []
  .concat(nTrades(2, { entryDate: '2026-01-05', stop: 99.9 }))
  .concat(nTrades(4, { entryDate: '2026-01-06', stop: 0 }))
  .concat(nTrades(1, { entryDate: '2026-01-12', stop: 99.9 })); /* next week */
const recap = Store.weeklyRecap(week, 'Sim', { today: '2026-01-07', limit: 3, minRR: 2 });
eq('week starts Monday', recap.weekStart, '2026-01-05');
eq('week ends Sunday', recap.weekEnd, '2026-01-11');
eq('recap excludes next-week trades', recap.totalTrades, 6);
eq('recap counts disciplined days', recap.disciplinedDays, 1);
eq('recap counts over-traded days', recap.overTradedDays, 1);
eq('recap counts missing stops', recap.missingStop, 4);
eq('recap picks the highest-ratio habit (1/2 days > 2/6 stops)', recap.bestHabit.key, 'discipline');
eq('recap picks missing stops as the worst leak', recap.worstLeak.key, 'missingStop');

const goals = Store.goalProgress(week, 'Sim', { today: '2026-01-07', limit: 3, minRR: 2, weeklyGoal: 4 }, recap);
eq('goal: weekly discipline value', goals.weeklyDiscipline.value, 1);
eq('goal: weekly discipline target', goals.weeklyDiscipline.target, 4);
eq('goal: daily limit surfaced', goals.dailyLimit.target, 3);

/* ------------------------------------------------------------------ */
/* 5. Integration: summary + additive persistence in settings          */
/* ------------------------------------------------------------------ */

console.log('\n[5] Integration (real store state)');

Store.addTrade(trade({ entryDate: '2026-03-02', stop: 99.9, exitPrice: 100 }));
Store.addTrade(trade({ entryDate: '2026-03-03', stop: 99.9, exitPrice: 100 }));

const summary = Store.getDisciplineSummary('Sim');
check('summary level is at least 1', summary.level.level >= 1, 'level=' + summary.level.level);
eq('summary current streak counts the two disciplined days', summary.streak.current, 2);
check('gamification block persisted into settings',
  !!(Store.getSettings().gamification && Store.getSettings().gamification.xp > 0));
eq('earned achievement persisted', Store.getGamification().achievements['first-stop'], true);

const xpAfterFirst = Store.getGamification().xp;
Store.getDisciplineSummary('Sim');
eq('sync is idempotent (no XP growth on re-read)', Store.getGamification().xp, xpAfterFirst);

Store.setWeeklyDisciplineGoal(6);
eq('weekly goal persists', Store.getWeeklyDisciplineGoal(), 6);
Store.setWeeklyDisciplineGoal(-3);
eq('weekly goal rejects negative input', Store.getWeeklyDisciplineGoal(), 6);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Gamification test result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
