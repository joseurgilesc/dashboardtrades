/* test/bpt-badges.test.js
 * VM harness for the BPT two-category badge system in js/store.js.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure badge helpers against hand-built trades. No browser, no
 * Firebase, no build step.
 *
 * Two-category rule under test:
 *   - PROCESO  badges (`category === 'process'`) earn a FIXED XP_BADGE per
 *     rung. The award never scales with P&L or volume, and the per-trade XP
 *     breakdown (`xpBreakdown`) stays P&L/contract-free.
 *   - RESULTADO badges (`category === 'outcome'`) read realised P&L as
 *     informational statistics, award ZERO XP and are never marked as earned.
 *
 * Run: node test/bpt-badges.test.js
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
const NQ_POINT_VALUE = 20;
const NQ_COMMISSION = 4.18;

function trade(over) {
  idSeq += 1;
  return Object.assign({
    id: 't' + idSeq,
    tradeNumber: idSeq,
    account: 'Sim',
    instrument: 'NQ',
    contracts: 1,
    strategy: 'vela-a-vela',
    direction: 'Largo',
    entryDate: '2026-01-05',
    entryTime: '09:30',
    entryPrice: 100,
    exitDate: '2026-01-05',
    exitTime: '09:35',
    exitPrice: 100,
    stop: 0,
    target: 0,
    plannedRisk: 0,
    exitType: 'Profit',
    emotion: 'Control',
    notes: ''
  }, over || {});
}

/** Long/short trade whose computed `net` equals `target` (NQ, entry 100). */
function tradeWithNet(target, over) {
  const o = over || {};
  const contracts = Number.isFinite(o.contracts) ? o.contracts : 1;
  const entry = Number.isFinite(o.entryPrice) ? o.entryPrice : 100;
  const delta = (target + NQ_COMMISSION * contracts) / (NQ_POINT_VALUE * contracts);
  const exit = o.direction === 'Corto' ? entry - delta : entry + delta;
  return trade(Object.assign({}, o, { contracts: contracts, entryPrice: entry, exitPrice: exit }));
}

function nTrades(n, over) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(trade(over));
  return out;
}

/** Stable ISO day, `i` days after 2026-01-01. */
function isoDay(i) {
  const d = new Date(2026, 0, 1 + i);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

function badgeMap(trades, opts) {
  const out = {};
  Store.evaluateBadges(trades, 'Sim', opts).forEach(function (b) { out[b.id] = b; });
  return out;
}

function processXp(trades, opts) {
  return Store.evaluateBadges(trades, 'Sim', opts)
    .filter(function (b) { return b.category === 'process' && b.earned; })
    .reduce(function (sum, b) { return sum + b.xp; }, 0);
}

const baseOpts = { limit: 3, riskPct: 2, minRR: 2, initialBalance: 10000 };

/* ------------------------------------------------------------------ */
/* [1] Catalog shape                                                   */
/* ------------------------------------------------------------------ */

console.log('\n[1] Catalog shape');

eq('nine badge families', Store.BADGES.length, 9);
eq('fixed XP per process rung', Store.XP_BADGE, 25);
const allRungs = Store.evaluateBadges([], 'Sim', baseOpts);
eq('25 process rungs + 3 outcome rungs', allRungs.length, 28);
eq('outcome rungs are three',
  allRungs.filter(function (b) { return b.category === 'outcome'; }).length, 3);

/* ------------------------------------------------------------------ */
/* [2] Ladder thresholds (each rung its own tier)                      */
/* ------------------------------------------------------------------ */

console.log('\n[2] Ladder thresholds');

/* 2a. Completed trades: 50 -> 150 -> 300 -> 500 -> 700 */
function completed(n) { return badgeMap(nTrades(n), baseOpts); }
eq('49 completed -> rung 1 locked', completed(49)['bpt-700-trades-t1'].earned, false);
eq('50 completed -> rung 1 earned', completed(50)['bpt-700-trades-t1'].earned, true);
eq('50 completed -> rung 2 locked', completed(50)['bpt-700-trades-t2'].earned, false);
eq('149 completed -> rung 2 locked', completed(149)['bpt-700-trades-t2'].earned, false);
eq('150 completed -> rung 2 earned', completed(150)['bpt-700-trades-t2'].earned, true);
eq('300 completed -> rung 3 earned', completed(300)['bpt-700-trades-t3'].earned, true);
eq('499 completed -> rung 4 locked', completed(499)['bpt-700-trades-t4'].earned, false);
eq('500 completed -> rung 4 earned', completed(500)['bpt-700-trades-t4'].earned, true);
eq('699 completed -> rung 5 locked', completed(699)['bpt-700-trades-t5'].earned, false);
eq('700 completed -> rung 5 earned', completed(700)['bpt-700-trades-t5'].earned, true);
eq('lower rung does not grant the higher one',
  completed(150)['bpt-700-trades-t1'].earned && !completed(150)['bpt-700-trades-t5'].earned, true);

/* 2b. Capital guardian: consecutive trades risking 0.5%-2% (5/10/20/30).
 * stop 95 -> 5 pts * 1 * 20 USD = 100 USD = 1% of 10000. */
const guardOpts = { limit: 10, riskPct: 2, minRR: 2, initialBalance: 10000 };
function guard(n) { return badgeMap(nTrades(n, { stop: 95, entryPrice: 100, exitPrice: 100 }), guardOpts); }
eq('4 guarded -> rung 1 locked', guard(4)['bpt-capital-guardian-t1'].earned, false);
eq('5 guarded -> rung 1 earned', guard(5)['bpt-capital-guardian-t1'].earned, true);
eq('9 guarded -> rung 2 locked', guard(9)['bpt-capital-guardian-t2'].earned, false);
eq('10 guarded -> rung 2 earned', guard(10)['bpt-capital-guardian-t2'].earned, true);
eq('19 guarded -> rung 3 locked', guard(19)['bpt-capital-guardian-t3'].earned, false);
eq('20 guarded -> rung 3 earned', guard(20)['bpt-capital-guardian-t3'].earned, true);
eq('29 guarded -> rung 4 locked', guard(29)['bpt-capital-guardian-t4'].earned, false);
eq('30 guarded -> rung 4 earned', guard(30)['bpt-capital-guardian-t4'].earned, true);
/* An over-risk trade breaks the run before it reaches 5 consecutive. */
const guarded = { stop: 95, entryPrice: 100, exitPrice: 100 };
const overRisk = nTrades(4, guarded)
  .concat([trade({ stop: 100, entryPrice: 100, exitPrice: 100 })]) /* 0 risk -> NaN -> breaks */
  .concat(nTrades(4, guarded));
eq('a broken run does not reach 5 consecutive',
  badgeMap(overRisk, guardOpts)['bpt-capital-guardian-t1'].earned, false);

/* 2c. Mosquito repellent: clean 3%-5% days (1/3/5/10). */
function cleanDaySeries(n, initialBalance) {
  const out = [];
  let balance = initialBalance;
  for (let i = 0; i < n; i += 1) {
    const day = '2026-03-' + String(i + 1).padStart(2, '0');
    const loss = balance * 0.035; /* 3.5% of the start-of-day balance */
    out.push(tradeWithNet(-loss, { entryDate: day, exitDate: day }));
    balance -= loss;
  }
  return out;
}
function mosquito(n) { return badgeMap(cleanDaySeries(n, 10000), baseOpts); }
eq('0 clean days -> rung 1 locked', mosquito(0)['bpt-mosquito-repellent-t1'].earned, false);
eq('1 clean day -> rung 1 earned', mosquito(1)['bpt-mosquito-repellent-t1'].earned, true);
eq('2 clean days -> rung 2 locked', mosquito(2)['bpt-mosquito-repellent-t2'].earned, false);
eq('3 clean days -> rung 2 earned', mosquito(3)['bpt-mosquito-repellent-t2'].earned, true);
eq('5 clean days -> rung 3 earned', mosquito(5)['bpt-mosquito-repellent-t3'].earned, true);
eq('10 clean days -> rung 4 earned', mosquito(10)['bpt-mosquito-repellent-t4'].earned, true);
/* A trade after the 3% stop invalidates the day. */
const notStopped = [
  tradeWithNet(-350, { entryDate: '2026-04-01', exitDate: '2026-04-01' }),
  tradeWithNet(-50, { entryDate: '2026-04-01', exitDate: '2026-04-01' })
];
eq('3% reached before the last trade -> not clean',
  badgeMap(notStopped, baseOpts)['bpt-mosquito-repellent-t1'].earned, false);
/* A single loss above 5% is not the 3%-5% band. */
eq('day loss above 5% -> not clean',
  badgeMap([tradeWithNet(-550, { entryDate: '2026-04-02' })], baseOpts)
    ['bpt-mosquito-repellent-t1'].earned, false);
/* A single loss below 3% never triggered the stop. */
eq('day loss below 3% -> not clean',
  badgeMap([tradeWithNet(-250, { entryDate: '2026-04-03' })], baseOpts)
    ['bpt-mosquito-repellent-t1'].earned, false);

/* 2d. Emergency stop: days ending on 3+ consecutive losses (1/3/5/10). */
function emergencySeries(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const day = '2026-05-' + String(i + 1).padStart(2, '0');
    out.push(tradeWithNet(-10, { entryDate: day }));
    out.push(tradeWithNet(-10, { entryDate: day }));
    out.push(tradeWithNet(-10, { entryDate: day }));
  }
  return out;
}
function emergency(n) { return badgeMap(emergencySeries(n), baseOpts); }
eq('0 emergency days -> rung 1 locked', emergency(0)['bpt-emergency-stop-t1'].earned, false);
eq('1 emergency day -> rung 1 earned', emergency(1)['bpt-emergency-stop-t1'].earned, true);
eq('2 emergency days -> rung 2 locked', emergency(2)['bpt-emergency-stop-t2'].earned, false);
eq('3 emergency days -> rung 2 earned', emergency(3)['bpt-emergency-stop-t2'].earned, true);
eq('5 emergency days -> rung 3 earned', emergency(5)['bpt-emergency-stop-t3'].earned, true);
eq('10 emergency days -> rung 4 earned', emergency(10)['bpt-emergency-stop-t4'].earned, true);
const dayEndsOnWin = [
  tradeWithNet(-10, { entryDate: '2026-06-01' }),
  tradeWithNet(-10, { entryDate: '2026-06-01' }),
  tradeWithNet(50, { entryDate: '2026-06-01' })
];
eq('day ending on a win -> not an emergency stop',
  badgeMap(dayEndsOnWin, baseOpts)['bpt-emergency-stop-t1'].earned, false);

/* 2e. Crocodile: days with <= 3 entries (10/25/50/100). */
function crocodileSeries(days) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    out.push(tradeWithNet(-5, { entryDate: isoDay(i) }));
  }
  return out;
}
function crocodile(n) { return badgeMap(crocodileSeries(n), baseOpts); }
eq('9 patient days -> rung 1 locked', crocodile(9)['bpt-crocodile-t1'].earned, false);
eq('10 patient days -> rung 1 earned', crocodile(10)['bpt-crocodile-t1'].earned, true);
eq('24 patient days -> rung 2 locked', crocodile(24)['bpt-crocodile-t2'].earned, false);
eq('25 patient days -> rung 2 earned', crocodile(25)['bpt-crocodile-t2'].earned, true);
eq('50 patient days -> rung 3 earned', crocodile(50)['bpt-crocodile-t3'].earned, true);
eq('100 patient days -> rung 4 earned', crocodile(100)['bpt-crocodile-t4'].earned, true);
eq('a 4-entry day is not a crocodile day',
  badgeMap(nTrades(4, { entryDate: '2026-08-01' }), baseOpts)['bpt-crocodile-t1'].earned, false);

/* 2f. Earned step: 2+ contracts at 25/50/75/100% of doubling. */
function stepSeries(gain) {
  return [
    tradeWithNet(gain, { contracts: 1, entryDate: '2026-09-01' }),
    trade({ contracts: 2, entryDate: '2026-09-02' })
  ];
}
const stepOpts = { limit: 10, riskPct: 2, minRR: 2, initialBalance: 1000 };
function step(gain) { return badgeMap(stepSeries(gain), stepOpts); }
eq('equity below 1.25x -> rung 25 locked', step(200)['bpt-earned-step-t1'].earned, false);
eq('equity at 1.25x -> rung 25 earned', step(250)['bpt-earned-step-t1'].earned, true);
eq('equity at 1.25x -> rung 50 locked', step(250)['bpt-earned-step-t2'].earned, false);
eq('equity at 1.5x -> rung 50 earned', step(500)['bpt-earned-step-t2'].earned, true);
eq('equity at 1.75x -> rung 75 earned', step(750)['bpt-earned-step-t3'].earned, true);
eq('equity at 2x -> rung 100 earned', step(1000)['bpt-earned-step-t4'].earned, true);
eq('milestone requires 2+ contracts',
  badgeMap([
    tradeWithNet(1000, { contracts: 1, entryDate: '2026-09-03' }),
    trade({ contracts: 1, entryDate: '2026-09-04' })
  ], stepOpts)['bpt-earned-step-t4'].earned, false);

/* 2g. Positive math: 20 winners with realized R/R >= 2. */
function rrWin(over) {
  return trade(Object.assign({ stop: 99, entryPrice: 100, exitPrice: 102 }, over || {}));
}
function positive(n, over) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(rrWin(over));
  return badgeMap(out, baseOpts);
}
eq('19 winners with R/R 2 -> rung locked', positive(19)['bpt-positive-math-t1'].qualifies, false);
eq('20 winners with R/R 2 -> rung in range', positive(20)['bpt-positive-math-t1'].qualifies, true);
eq('R/R 1.5 does not count',
  badgeMap([trade({ stop: 99, entryPrice: 100, exitPrice: 101.5 })], baseOpts)
    ['bpt-positive-math-t1'].qualifies, false);
eq('short R/R 2 counts',
  positive(20, { direction: 'Corto', stop: 102, entryPrice: 100, exitPrice: 96 })
    ['bpt-positive-math-t1'].qualifies, true);
eq('a losing trade with R/R >= 2 is not a winner',
  badgeMap([trade({ direction: 'Corto', stop: 102, entryPrice: 100, exitPrice: 101 })], baseOpts)
    ['bpt-positive-math-t1'].qualifies, false);

/* ------------------------------------------------------------------ */
/* [3] Outcome badges (informational, zero XP)                         */
/* ------------------------------------------------------------------ */

console.log('\n[3] Outcome badges');

/* 7 wins + 3 losses per 10 trades keeps any 100-window at exactly 70%. */
function ratioSeries(blocks) {
  const out = [];
  let i = 0;
  for (let b = 0; b < blocks; b += 1) {
    for (let w = 0; w < 7; w += 1) { out.push(tradeWithNet(1, { entryDate: isoDay(i) })); i += 1; }
    for (let l = 0; l < 3; l += 1) { out.push(tradeWithNet(-1, { entryDate: isoDay(i) })); i += 1; }
  }
  return out;
}

const range100 = badgeMap(ratioSeries(10), baseOpts); /* 100 trades, 70% wins */
eq('100 trades at 70% -> green range in range', range100['bpt-green-range-t1'].qualifies, true);
eq('green range is never marked earned', range100['bpt-green-range-t1'].earned, false);
eq('green range awards zero XP', range100['bpt-green-range-t1'].xp, 0);

const range69 = badgeMap(nTrades(69, { exitPrice: 102 }).concat(nTrades(31, { exitPrice: 90 })), baseOpts);
eq('69% window -> below the 70% threshold', range69['bpt-green-range-t1'].qualifies, false);
eq('fewer than 100 trades -> no window', badgeMap(nTrades(99), baseOpts)['bpt-green-range-t1'].raw, 0);

const hot700 = badgeMap(ratioSeries(70), baseOpts);
eq('700 trades at 70% -> hot bath in range', hot700['bpt-hot-bath-t1'].qualifies, true);
eq('hot bath is never marked earned', hot700['bpt-hot-bath-t1'].earned, false);
eq('hot bath awards zero XP', hot700['bpt-hot-bath-t1'].xp, 0);
eq('hot bath stat counts the 700 trades', hot700['bpt-hot-bath-t1'].stat.count, 700);
check('hot bath stat carries the date span',
  !!hot700['bpt-hot-bath-t1'].stat.span && hot700['bpt-hot-bath-t1'].stat.span.indexOf('→') !== -1,
  JSON.stringify(hot700['bpt-hot-bath-t1'].stat));
eq('fewer than 700 trades -> hot bath below range',
  badgeMap(ratioSeries(69), baseOpts)['bpt-hot-bath-t1'].qualifies, false);

/* Every outcome rung: category outcome, zero XP, never earned. */
const bigSet = ratioSeries(70);
Store.evaluateBadges(bigSet, 'Sim', baseOpts).forEach(function (b) {
  if (b.category !== 'outcome') return;
  check('outcome rung ' + b.id + ' awards zero XP', b.xp === 0, 'xp=' + b.xp);
  check('outcome rung ' + b.id + ' is never earned', b.earned === false, 'earned=' + b.earned);
});

/* ------------------------------------------------------------------ */
/* [4] Process XP is a fixed award (never P&L- or volume-scaled)       */
/* ------------------------------------------------------------------ */

console.log('\n[4] Process XP is a fixed award');

/* Same risk profile, different P&L: the count-based ladder is identical. */
const flatSet = nTrades(700, { exitPrice: 100 });
const winSet = nTrades(700, { exitPrice: 200 });
const lossSet = nTrades(700, { exitPrice: 0 });
eq('completed ladder ignores P&L (wins)',
  badgeMap(winSet, baseOpts)['bpt-700-trades-t5'].earned, true);
eq('completed ladder ignores P&L (losses)',
  badgeMap(lossSet, baseOpts)['bpt-700-trades-t5'].earned, true);

/* Earned process XP is always an integer multiple of the fixed award. */
const flatXp = processXp(flatSet, baseOpts);
eq('process XP is a fixed multiple of XP_BADGE', flatXp % Store.XP_BADGE, 0);
check('process XP is positive once rungs are earned', flatXp > 0, 'xp=' + flatXp);

/* The per-trade XP breakdown ignores P&L and contract count. */
const xpOpts = { limit: 3, riskPct: 2, minRR: 2, initialBalance: 5000 };
const xpBase = nTrades(3, { stop: 99.9, plannedRisk: 20, target: 60, exitPrice: 100 });
const xpWin = xpBase.map(function (t, i) { return Object.assign({}, t, { id: 'w' + i, exitPrice: 200 }); });
const xpLeveraged = xpBase.map(function (t, i) { return Object.assign({}, t, { id: 'x' + i, contracts: 10 }); });
eq('xpBreakdown ignores P&L',
  Store.xpBreakdown(xpBase, 'Sim', xpOpts).total, Store.xpBreakdown(xpWin, 'Sim', xpOpts).total);
eq('xpBreakdown ignores contract count',
  Store.xpBreakdown(xpBase, 'Sim', xpOpts).total, Store.xpBreakdown(xpLeveraged, 'Sim', xpOpts).total);

/* Outcome badges never contribute to the process XP total. */
eq('outcome badges contribute zero to process XP',
  Store.evaluateBadges(bigSet, 'Sim', baseOpts)
    .filter(function (b) { return b.category === 'outcome' && b.qualifies; })
    .reduce(function (s, b) { return s + b.xp; }, 0), 0);

/* ------------------------------------------------------------------ */
/* [5] Legacy achievements are untouched                               */
/* ------------------------------------------------------------------ */

console.log('\n[5] Legacy achievements');

const legacy = Store.evaluateAchievements(nTrades(3, { stop: 0 }), 'Sim', baseOpts);
eq('legacy achievement count unchanged', legacy.length, 6);
eq('legacy ids unchanged',
  legacy.map(function (a) { return a.id; }).join(','),
  'first-stop,disciplined-day,risk-10,rr-10,streak-5,streak-10');
eq('first-stop still locked with no stop',
  Store.evaluateAchievements(nTrades(1, { stop: 0 }), 'Sim', baseOpts)[0].earned, false);
eq('first-stop still unlocks with a stop',
  Store.evaluateAchievements(nTrades(1, { stop: 99.9 }), 'Sim', baseOpts)[0].earned, true);
eq('disciplined-day still locked when over-trading',
  Store.evaluateAchievements(nTrades(5, { limit: 3 }), 'Sim', baseOpts)[1].earned, false);

/* ------------------------------------------------------------------ */
/* [6] Persistence is backward compatible                              */
/* ------------------------------------------------------------------ */

console.log('\n[6] Persistence');

const normalized = Store.normalizeGamification({
  xp: 10,
  achievements: {
    'first-stop': true,
    'bpt-700-trades-t1': true,
    'bpt-green-range-t1': true
  },
  bestStreak: 3,
  weeklyDisciplineGoal: 4
});
eq('legacy earned id persists', normalized.achievements['first-stop'], true);
eq('process badge id persists', normalized.achievements['bpt-700-trades-t1'], true);
eq('unknown/outcome ids are tolerated', normalized.achievements['bpt-green-range-t1'], true);
eq('normalization invents no ids', normalized.achievements['does-not-exist'], undefined);
eq('normalization keeps the XP', normalized.xp, 10);

Store.setSettings({
  gamification: { xp: 0, achievements: { 'first-stop': true }, bestStreak: 0, weeklyDisciplineGoal: 5 }
});
eq('pre-earned achievement survives getGamification',
  Store.getGamification().achievements['first-stop'], true);

const summary = Store.getDisciplineSummary('Sim');
const firstStop = summary.achievements.filter(function (a) { return a.id === 'first-stop'; })[0];
eq('pre-earned achievement stays earned in the summary', firstStop.earned, true);
check('badge XP is surfaced separately', Number.isFinite(summary.badgeXp), 'badgeXp=' + summary.badgeXp);
check('total XP includes badge XP',
  summary.xp >= summary.computedXp.total + summary.badgeXp,
  'xp=' + summary.xp + ' computed=' + summary.computedXp.total + ' badge=' + summary.badgeXp);
check('summary exposes process and outcome badges',
  Array.isArray(summary.processBadges) && Array.isArray(summary.outcomeBadges) &&
  summary.processBadges.length === 25 && summary.outcomeBadges.length === 3,
  'process=' + summary.processBadges.length + ' outcome=' + summary.outcomeBadges.length);
check('outcome badges in the summary carry zero XP',
  summary.outcomeBadges.every(function (b) { return b.xp === 0 && b.earned === false; }), '');

/* Integration: real store state earns a process rung and its XP. */
Store.addTrade(tradeWithNet(100, { entryDate: '2026-10-01', stop: 50, entryPrice: 100 }));
for (let i = 0; i < 49; i += 1) Store.addTrade(trade({ entryDate: '2026-10-02', stop: 50, entryPrice: 100 }));
const summary2 = Store.getDisciplineSummary('Sim');
const rung1 = summary2.processBadges.filter(function (b) { return b.id === 'bpt-700-trades-t1'; })[0];
check('50 completed trades earn the first process rung', rung1.earned, 'earned=' + rung1.earned);
check('the earned rung contributes its fixed XP', summary2.badgeXp >= Store.XP_BADGE,
  'badgeXp=' + summary2.badgeXp);
eq('sync persists the earned badge id',
  Store.getGamification().achievements['bpt-700-trades-t1'], true);

const xpAfter = Store.getGamification().xp;
Store.getDisciplineSummary('Sim');
eq('badge sync stays idempotent', Store.getGamification().xp, xpAfter);

/* ------------------------------------------------------------------ */
/* [7] UI rendering: the two categories are visually distinct          */
/* ------------------------------------------------------------------ */

console.log('\n[7] UI rendering');

const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

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

const uiCode = [
  extractFunction(appSrc, 'function familyLabelFallback(family)'),
  extractFunction(appSrc, 'function achievementCardHtml(a)'),
  extractFunction(appSrc, 'function outcomeCardHtml(a)'),
  extractFunction(appSrc, 'function badgeFamilyHtml(rungs, meta, cardHtml)'),
  extractFunction(appSrc, 'function renderAchievements(summary)'),
  extractFunction(appSrc, 'function renderOutcomeBadges(summary)')
].join('\n');

const elements = {};
const uiContext = vm.createContext({
  console: console,
  $: function (id) { return elements[id] || null; },
  escapeHtml: function (v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  formatNumber: function (v, d) { return Number(v).toFixed(d); }
});
vm.runInContext(uiCode, uiContext, { filename: 'app-badge-render.js' });

elements.achievementsList = { innerHTML: '' };
elements.achievementsSummary = { textContent: '' };
elements.outcomeList = { innerHTML: '' };
elements.outcomeSummary = { textContent: '' };

const uiSummary = {
  achievements: [{
    id: 'first-stop', label: 'Primer stop registrado', description: 'Registra tu primer trade con stop.',
    target: 1, value: 1, earned: true, progressPct: 100
  }],
  processBadges: [{
    id: 'bpt-700-trades-t1', family: 'bpt-700-trades', familyLabel: 'Trades completados', color: 'accent',
    label: '50 trades completados', description: 'Entrada y salida.',
    target: 50, value: 50, earned: true, xp: 25, progressPct: 100
  }],
  outcomeBadges: [{
    id: 'bpt-green-range-t1', family: 'bpt-green-range', familyLabel: 'Rango verde', color: 'pos',
    label: 'Rango verde', description: 'Ventana de 100+ trades.',
    target: 70, value: 70, earned: false, qualifies: true, xp: 0, progressPct: 100,
    stat: { label: 'Mejor ventana (100+ trades)', value: 72.5, unit: '%' }
  }]
};

uiContext.renderAchievements(uiSummary);
uiContext.renderOutcomeBadges(uiSummary);

/* New structure: family blocks with the catalog accent + ladder counts. */
check('process list groups rungs into .badge-family blocks',
  elements.achievementsList.innerHTML.indexOf('.badge-family') === -1 &&
  elements.achievementsList.innerHTML.indexOf('badge-family') !== -1,
  elements.achievementsList.innerHTML);
check('process list carries the family data-color',
  elements.achievementsList.innerHTML.indexOf('data-color="accent"') !== -1);
check('process list counts the ladder length',
  elements.achievementsList.innerHTML.indexOf('badge-family-count">1/1<') !== -1);
check('legacy achievements render under Fundamentos',
  elements.achievementsList.innerHTML.indexOf('Fundamentos') !== -1);
check('outcome list groups into .badge-family blocks',
  elements.outcomeList.innerHTML.indexOf('badge-family') !== -1);
check('outcome family keeps its token (pos)',
  elements.outcomeList.innerHTML.indexOf('data-color="pos"') !== -1);
check('outcome ladder count uses qualifies (1/1)',
  elements.outcomeList.innerHTML.indexOf('badge-family-count">1/1<') !== -1);

/* Value semantics stay untouched. */
check('process list shows the fixed XP tag', elements.achievementsList.innerHTML.indexOf('+25 XP') !== -1);
check('outcome list is labelled Estadística', elements.outcomeList.innerHTML.indexOf('Estadística') !== -1);
check('outcome list never uses the earned class',
  elements.outcomeList.innerHTML.indexOf('achievement earned') === -1);
check('outcome list uses the outcome class',
  elements.outcomeList.innerHTML.indexOf('achievement outcome') !== -1);
check('outcome stat shows the informational value',
  elements.outcomeList.innerHTML.indexOf('72.5') !== -1);
check('outcome never carries an XP chip', elements.outcomeList.innerHTML.indexOf('XP') === -1);
check('process summary counts process logros only',
  elements.achievementsSummary.textContent.indexOf('2 / 2 logros de proceso') !== -1,
  elements.achievementsSummary.textContent);
check('outcome summary counts en rango',
  elements.outcomeSummary.textContent.indexOf('1 / 1 en rango') !== -1,
  elements.outcomeSummary.textContent);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('BPT badges test result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
