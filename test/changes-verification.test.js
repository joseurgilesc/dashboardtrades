/* test/changes-verification.test.js
 * VM harness for the six-change batch.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure helpers. No browser, no Firebase, no build step.
 *
 * Proves:
 *   [1] Change 2/3 data defaults: last-used instrument = MES, emotion = Confianza
 *   [2] Change 3: EMOTION_COLORS is a complete, token-based data map
 *   [3] Change 6: a -$200 loser dated today moves usedToday and drops available
 *   [4] Change 4: suggestStopTarget math for Largo vs Corto (+ invalid input)
 *
 * Run: node test/changes-verification.test.js
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
  '\n;globalThis.EMOTIONS = EMOTIONS; globalThis.EMOTION_COLORS = EMOTION_COLORS;' +
  '\n;globalThis.DEFAULT_INSTRUMENT = DEFAULT_INSTRUMENT; globalThis.DEFAULT_EMOTION = DEFAULT_EMOTION;',
  context,
  { filename: 'store-bundle.js' }
);
const Store = context.Store;
const INSTRUMENTS = context.INSTRUMENTS;
const EMOTIONS = context.EMOTIONS;
const EMOTION_COLORS = context.EMOTION_COLORS;
const DEFAULT_INSTRUMENT = context.DEFAULT_INSTRUMENT;
const DEFAULT_EMOTION = context.DEFAULT_EMOTION;

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

/* Local ISO date, matching Store.todayISO(). */
function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

const TODAY = todayISO();

/* ------------------------------------------------------------------ */
/* [1] Change 2/3: last-entry defaults (MES / Confianza)               */
/* ------------------------------------------------------------------ */

console.log('\n[1] Last-entry defaults (Change 2/3)');

eq('DEFAULT_INSTRUMENT is MES', DEFAULT_INSTRUMENT, 'MES');
eq('DEFAULT_EMOTION is Confianza', DEFAULT_EMOTION, 'Confianza');

const fresh = Store.getLastEntry();
eq('no remembered instrument -> MES', fresh.instrument, 'MES');
eq('no remembered emotion -> Confianza', fresh.emotion, 'Confianza');
/* The other remembered fields keep the first catalog value. */
eq('account still defaults to the first account', fresh.account, 'Sim');
eq('direction still defaults to the first direction', fresh.direction, 'Largo');

/* A remembered value still wins over the default. */
Store.saveLastEntry({ instrument: 'ES', emotion: 'Miedo' });
const remembered = Store.getLastEntry();
eq('remembered instrument wins over the default', remembered.instrument, 'ES');
eq('remembered emotion wins over the default', remembered.emotion, 'Miedo');
/* A stored-but-unknown value is sanitized to the default, not the first item. */
Store.setSettings({ lastEntry: { instrument: 'NOPE', emotion: 'NOPE' } });
eq('unknown stored instrument falls back to MES', Store.getLastEntry().instrument, 'MES');
eq('unknown stored emotion falls back to Confianza', Store.getLastEntry().emotion, 'Confianza');

/* ------------------------------------------------------------------ */
/* [2] Change 3: EMOTION_COLORS data map                               */
/* ------------------------------------------------------------------ */

console.log('\n[2] EMOTION_COLORS data map (Change 3)');

check('EMOTION_COLORS is defined', !!EMOTION_COLORS && typeof EMOTION_COLORS === 'object');
check('every emotion has a color', EMOTIONS.every(function (e) { return !!EMOTION_COLORS[e]; }));
eq('Confianza is green (positive)', EMOTION_COLORS.Confianza, 'var(--pos)');
eq('Control is blue (accent)', EMOTION_COLORS.Control, 'var(--accent)');
eq('FOMO is red (negative)', EMOTION_COLORS.FOMO, 'var(--neg)');
eq('Ansiedad is amber (warning)', EMOTION_COLORS.Ansiedad, 'var(--amber)');
eq('Duda is muted grey (neutral)', EMOTION_COLORS.Duda, 'var(--text-faint)');

/* ------------------------------------------------------------------ */
/* [3] Change 6: usedToday / available update on a today loser         */
/* ------------------------------------------------------------------ */

console.log('\n[3] Usado hoy updates on a today loser (Change 6)');

/* Selected account = Sim. Start-of-day capital 10000, risk 3% -> budget 300.
 * One losing MES trade (pointValue 5, commission 1.22) with a net of -$200:
 *   points = 4960.244 - 5000 = -39.756 -> gross -198.78, minus 1.22 = -200.00. */
const loser = {
  tradeNumber: 1,
  account: 'Sim',
  instrument: 'MES',
  contracts: 1,
  strategy: 'vela-a-vela',
  direction: 'Largo',
  entryDate: TODAY,
  entryTime: '09:30',
  entryPrice: 5000,
  exitDate: TODAY,
  exitTime: '09:35',
  exitPrice: 4960.244,
  stop: 0,
  target: 0,
  plannedRisk: 0,
  exitType: 'Stop',
  emotion: 'Confianza',
  notes: ''
};
const loserNet = Store.computeTrade(loser).net;
close('fixture net is -$200', loserNet, -200, 1e-9);

/* Nothing recorded yet: used 0, available = full budget. */
const before = Store.dailyRiskUsage({ account: 'Sim', riskPct: 3, balance: 10000, today: TODAY, trades: [] });
eq('before: used 0', before.used, 0);
eq('before: budget 300', before.dailyBudget, 300);
eq('before: available 300', before.available, 300);

/* Record the loser for the selected account. */
Store.addTrade(loser);
const after = Store.dailyRiskUsage({ account: 'Sim', riskPct: 3, balance: 10000, today: TODAY });
eq('after: used = $200', after.used, 200);
eq('after: available drops to $100', after.available, 100);
close('after: used is the |net| of the today loser', after.used, Math.abs(loserNet), 1e-9);
eq('after: available = budget - used', after.available, after.dailyBudget - after.used);
eq('after: one losing trade counted', after.trades, 1);

/* The account filter still applies: another account sees nothing. */
const other = Store.dailyRiskUsage({ account: 'Real', riskPct: 3, balance: 10000, today: TODAY });
eq('other account: used 0', other.used, 0);
eq('other account: available untouched', other.available, 300);

/* Winners never reduce the budget. */
Store.addTrade(Object.assign({}, loser, {
  tradeNumber: 2,
  exitPrice: 5039.756 /* +200 winner */
}));
const withWinner = Store.dailyRiskUsage({ account: 'Sim', riskPct: 3, balance: 10000, today: TODAY });
eq('winner does not change used', withWinner.used, 200);

/* ------------------------------------------------------------------ */
/* [4] Change 4: suggestStopTarget math (Largo vs Corto)               */
/* ------------------------------------------------------------------ */

console.log('\n[4] Stop/target suggestions (Change 4)');

/* MES tick 0.25; entry 5000; 8 ticks -> distance 2. */
const largo = Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Largo', ticks: 8 });
check('Largo suggestion is valid', largo.valid);
eq('Largo: stop below entry (5000 - 2)', largo.stopPrice, 4998);
eq('Largo: target above entry (5000 + 4)', largo.targetPrice, 5004);

const corto = Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Corto', ticks: 8 });
check('Corto suggestion is valid', corto.valid);
eq('Corto: stop above entry (5000 + 2)', corto.stopPrice, 5002);
eq('Corto: target below entry (5000 - 4)', corto.targetPrice, 4996);

/* Tick-grid snapping for a fractional instrument (6E tick 0.0001). */
const fx = Store.suggestStopTarget({ instrument: '6E', entryPrice: 1.0865, direction: 'Largo', ticks: 10 });
check('6E suggestion is valid', fx.valid);
close('6E: stop = entry - 10 ticks', fx.stopPrice, 1.0855, 1e-9);
close('6E: target = entry + 20 ticks', fx.targetPrice, 1.0885, 1e-9);

/* Invalid input never produces a suggestion. */
eq('missing entry -> invalid', Store.suggestStopTarget({ instrument: 'MES', direction: 'Largo', ticks: 8 }).valid, false);
eq('ticks 0 -> invalid', Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Largo', ticks: 0 }).valid, false);
eq('unknown instrument -> invalid', Store.suggestStopTarget({ instrument: 'NOPE', entryPrice: 5000, direction: 'Largo', ticks: 8 }).valid, false);
eq('missing direction -> invalid', Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: '', ticks: 8 }).valid, false);
eq('invalid reason is direction', Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'X', ticks: 8 }).reason, 'direction');

/* `ticks` can come from maxTicksForOneContract as a fallback. */
const maxTicks = Store.maxTicksForOneContract({ effectiveRisk: 100, tickValue: 1.25 });
eq('maxTicksForOneContract(100 / 1.25) = 80', maxTicks, 80);
const fallback = Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Largo', ticks: maxTicks });
eq('fallback ticks: stop = entry - 80*0.25', fallback.stopPrice, 4980);
eq('fallback ticks: target = entry + 160*0.25', fallback.targetPrice, 5040);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Changes verification result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
