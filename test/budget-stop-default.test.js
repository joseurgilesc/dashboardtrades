/* test/budget-stop-default.test.js
 * VM harness for the budget-derived default stop distance.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure helpers (no browser, no Firebase, no build step), then
 * runs structural checks against index.html / app.js.
 *
 * Proves the magic "8" is gone and the default now comes from the budget:
 *   (a) the AUTO default equals `maxTicksForOneContract` for an account +
 *       instrument (the same budget `computeRisk` sizes contracts from)
 *   (b) it CHANGES with capital, risk %, trades/day and instrument (numbers
 *       are printed)
 *   (c) a fixed per-instrument value overrides the derived one
 *   (d) a user-touched #riskStopTicks is never re-seeded
 *   (e) MES vs ES no longer share a default and each default risk fits the
 *       per-trade budget
 *
 * Run: node test/budget-stop-default.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const instrumentsSrc = fs.readFileSync(path.join(ROOT, 'js', 'instruments.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const context = vm.createContext({ console: console });
vm.runInContext(
  instrumentsSrc + '\n' + storeSrc +
  '\n;globalThis.Store = Store; globalThis.INSTRUMENTS = INSTRUMENTS;' +
  '\n;globalThis.FALLBACK_STOP_TICKS = FALLBACK_STOP_TICKS;',
  context,
  { filename: 'store-bundle.js' }
);
const Store = context.Store;
const INSTRUMENTS = context.INSTRUMENTS;
const FALLBACK_STOP_TICKS = context.FALLBACK_STOP_TICKS;

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

/* The AUTO stop for an account + explicit budget inputs. */
function autoStop(account, instrument, budget) {
  return Store.resolveInstrumentConfig(account, instrument, budget);
}

/* ------------------------------------------------------------------ */
/* (a) AUTO default == maxTicksForOneContract                          */
/* ------------------------------------------------------------------ */

console.log('\n(a) AUTO default equals maxTicksForOneContract');

const BUDGET_100K = { balance: 100000, riskPct: 2, tradesPerDay: 3 };
const perTrade100k = (100000 * 0.02) / 3;
const mes100k = autoStop('Sim', 'MES', BUDGET_100K);

eq('MES 100k/2%/3 -> 533 ticks', mes100k.stopTicks, 533);
eq('MES AUTO flag set', mes100k.stopTicksAuto, true);
eq('MES AUTO has no fixed value', mes100k.fixedStopTicks, null);
eq('AUTO == maxTicksForOneContract(effectiveBudget, tickValue)',
  mes100k.stopTicks,
  Store.maxTicksForOneContract({ effectiveRisk: perTrade100k, tickValue: tickValue('MES') }));

const mesRisk = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, tradesPerDay: 3,
  instrument: 'MES', stopTicks: mes100k.stopTicks
});
eq('computeRisk.maxTicksForOneContract mirrors the AUTO default',
  mesRisk.maxTicksForOneContract, mes100k.stopTicks);
eq('budgetStopTicks matches the resolved AUTO default',
  Store.budgetStopTicks({ instrument: 'MES', balance: 100000, riskPct: 2, tradesPerDay: 3 }),
  mes100k.stopTicks);

/* ------------------------------------------------------------------ */
/* (b) it changes with capital / risk / trades / instrument            */
/* ------------------------------------------------------------------ */

console.log('\n(b) The derived default changes with its inputs');

const mes10k = autoStop('Sim', 'MES', { balance: 10000, riskPct: 2, tradesPerDay: 3 });
const mesRisk1 = autoStop('Sim', 'MES', { balance: 100000, riskPct: 1, tradesPerDay: 3 });
const mesRisk3 = autoStop('Sim', 'MES', { balance: 100000, riskPct: 3, tradesPerDay: 3 });
const mesTrades1 = autoStop('Sim', 'MES', { balance: 100000, riskPct: 2, tradesPerDay: 1 });
const es100k = autoStop('Sim', 'ES', BUDGET_100K);

console.log('  capital 10k  -> MES ' + mes10k.stopTicks + ' ticks');
console.log('  capital 100k -> MES ' + mes100k.stopTicks + ' ticks');
console.log('  risk 1%      -> MES ' + mesRisk1.stopTicks + ' ticks');
console.log('  risk 3%      -> MES ' + mesRisk3.stopTicks + ' ticks');
console.log('  trades/day 1 -> MES ' + mesTrades1.stopTicks + ' ticks');
console.log('  trades/day 3 -> MES ' + mes100k.stopTicks + ' ticks');
console.log('  ES 100k/2%/3 -> ES  ' + es100k.stopTicks + ' ticks');

eq('capital 10k -> 53 ticks', mes10k.stopTicks, 53);
eq('capital 100k -> 533 ticks', mes100k.stopTicks, 533);
check('more capital -> more ticks', mes100k.stopTicks > mes10k.stopTicks);
eq('risk 1% -> 266 ticks', mesRisk1.stopTicks, 266);
eq('risk 3% -> 800 ticks', mesRisk3.stopTicks, 800);
check('more risk % -> more ticks', mesRisk3.stopTicks > mesRisk1.stopTicks);
eq('trades/day 1 -> 1600 ticks', mesTrades1.stopTicks, 1600);
check('fewer trades/day -> more ticks', mesTrades1.stopTicks > mes100k.stopTicks);
eq('ES 100k/2%/3 -> 53 ticks', es100k.stopTicks, 53);
check('same budget, different instrument -> different ticks', es100k.stopTicks !== mes100k.stopTicks);

/* ------------------------------------------------------------------ */
/* (c) a fixed per-instrument value overrides the derived one          */
/* ------------------------------------------------------------------ */

console.log('\n(c) A fixed per-instrument value wins');

Store.setInstrumentConfig('Sim', 'MES', { stopTicks: 7, targetR: 2, targetRAlt: 3 });
const fixed = autoStop('Sim', 'MES', BUDGET_100K);
eq('fixed stop ticks = 7', fixed.stopTicks, 7);
eq('fixed stop is not AUTO', fixed.stopTicksAuto, false);
eq('fixed stop is reported', fixed.fixedStopTicks, 7);
check('fixed value differs from the derived 533', fixed.stopTicks !== mes100k.stopTicks);

const fixedDraft = Store.draftAutofill({
  account: 'Sim', instrument: 'MES', entryPrice: 5000, direction: 'Largo',
  touched: { stop: false, exitPrice: false }
});
eq('draft autofill uses the fixed stop', fixedDraft.stopTicks, 7);
eq('draft stop price follows the fixed stop', fixedDraft.stop.value, 4998.25);

/* Clearing it (null) returns the instrument to AUTO. */
Store.setInstrumentConfig('Sim', 'MES', { stopTicks: null });
const cleared = autoStop('Sim', 'MES', BUDGET_100K);
eq('null -> AUTO again', cleared.stopTicksAuto, true);
eq('null -> derived value restored', cleared.stopTicks, mes100k.stopTicks);

/* ------------------------------------------------------------------ */
/* (d) a user-touched #riskStopTicks is never re-seeded                */
/* ------------------------------------------------------------------ */

console.log('\n(d) A user-touched stop is never re-seeded');

/* Pure decision + a tiny input simulation across input changes. */
const input = { value: '' };
let touched = false;
function seed(resolved) {
  const v = Store.resolveStopTicksSeed(touched, resolved);
  if (v !== null) input.value = String(v);
}

seed(26);
eq('untouched seeds the derived value', input.value, '26');
seed(53);
eq('untouched re-seeds when capital changes', input.value, '53');
seed(800);
eq('untouched re-seeds when risk % changes', input.value, '800');

touched = true;
input.value = '12'; /* the user's own value */
seed(53);
eq('touched keeps the user value on capital change', input.value, '12');
seed(1600);
eq('touched keeps the user value on trades/day change', input.value, '12');
eq('touched returns null (no write)', Store.resolveStopTicksSeed(true, 533), null);
eq('non-positive resolved value never seeds', Store.resolveStopTicksSeed(false, 0), null);

/* Structural: the UI delegates the decision and never resets the touched flag. */
check('app.js delegates the seed decision to the Store',
  appSrc.indexOf('resolveStopTicksSeed') !== -1);
/* The only `= false` is the initial declaration; a re-seed reset would add
 * another assignment. */
const touchedResets = appSrc.split('stopTicksTouched = false').length - 1;
check('app.js never resets the touched flag after it is set', touchedResets === 1);
check('app.js marks the field touched on input',
  appSrc.indexOf('markStopTicksTouched') !== -1);

/* Structural: the hardcoded value="8" is gone and a provenance hint exists. */
const stopFieldIdx = htmlSrc.indexOf('id="riskStopTicks"');
const stopField = stopFieldIdx === -1 ? '' : htmlSrc.slice(stopFieldIdx, htmlSrc.indexOf('>', stopFieldIdx));
check('#riskStopTicks exists', stopFieldIdx !== -1);
check('#riskStopTicks no longer hardcodes value="8"', stopField.indexOf('value="8"') === -1);
check('#riskStopTicks carries the Auto placeholder', stopField.indexOf('placeholder="Auto"') !== -1);
check('#riskStopHint exists', htmlSrc.indexOf('id="riskStopHint"') !== -1);
check('UI shows the AUTO provenance copy',
  appSrc.indexOf('Auto: máx. que aguanta tu presupuesto') !== -1);
check('Ajustes table renders an Auto label', appSrc.indexOf("'Auto (' + cfg.stopTicks") !== -1);

/* ------------------------------------------------------------------ */
/* (e) MES vs ES default risk no longer matches / fits the budget      */
/* ------------------------------------------------------------------ */

console.log('\n(e) MES vs ES default risk (capital 5000, 2%, 3/day)');

const smallBudget = { balance: 5000, riskPct: 2, tradesPerDay: 3 };
const perTradeSmall = (5000 * 0.02) / 3;
const mesSmall = autoStop('Sim', 'MES', smallBudget);
const esSmall = autoStop('Sim', 'ES', smallBudget);
const mesSmallRisk = mesSmall.stopTicks * tickValue('MES');
const esSmallRisk = esSmall.stopTicks * tickValue('ES');
const oldMagicRiskMes = 8 * tickValue('MES');
const oldMagicRiskEs = 8 * tickValue('ES');

console.log('  instrument | ticks | risk/contract | per-trade budget');
console.log('  MES        | ' + mesSmall.stopTicks + '     | $' + mesSmallRisk.toFixed(2) +
  '        | $' + perTradeSmall.toFixed(2));
console.log('  ES         | ' + esSmall.stopTicks + '      | $' + esSmallRisk.toFixed(2) +
  '        | $' + perTradeSmall.toFixed(2));
console.log('  (old magic 8: MES $' + oldMagicRiskMes.toFixed(2) + ' vs ES $' + oldMagicRiskEs.toFixed(2) + ')');

eq('MES default is 26 ticks', mesSmall.stopTicks, 26);
eq('ES default is 2 ticks', esSmall.stopTicks, 2);
check('MES and ES no longer share the same default ticks',
  mesSmall.stopTicks !== esSmall.stopTicks);
check('MES and ES no longer share the same default risk',
  mesSmallRisk !== esSmallRisk);
check('MES default risk fits the per-trade budget',
  mesSmallRisk <= perTradeSmall + 1e-9);
check('ES default risk fits the per-trade budget',
  esSmallRisk <= perTradeSmall + 1e-9);
check('the default is no longer the arbitrary 8 ticks',
  mesSmall.stopTicks !== 8 && esSmall.stopTicks !== 8);

/* ------------------------------------------------------------------ */
/* Fallback only when the budget cannot be computed                    */
/* ------------------------------------------------------------------ */

console.log('\nFallback when the budget cannot be computed');

eq('honest fallback is a single tick', FALLBACK_STOP_TICKS, 1);
eq('budgetStopTicks with no balance -> 0',
  Store.budgetStopTicks({ instrument: 'MES', riskPct: 2, tradesPerDay: 3 }), 0);
eq('AUTO with no balance falls back to 1 tick',
  autoStop('Sim', 'MES', { balance: NaN, riskPct: 2, tradesPerDay: 3 }).stopTicks,
  FALLBACK_STOP_TICKS);

/* ------------------------------------------------------------------ */
/* (f) The AUTO stop reflects a gain-adjusted available                */
/* ------------------------------------------------------------------ */

console.log('\n(f) The AUTO stop reflects a gain-adjusted available');

const boosted = autoStop('Sim', 'MES', { balance: 100000, riskPct: 2, tradesPerDay: 3, available: 250 });
eq('available 250 binds the AUTO stop (floor(250/1.25)=200 ticks)', boosted.stopTicks, 200);

const boostedRisk = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, tradesPerDay: 3,
  instrument: 'MES', stopTicks: boosted.stopTicks, available: 250
});
eq('computeRisk.maxTicks mirrors the boosted AUTO stop', boostedRisk.maxTicksForOneContract, boosted.stopTicks);
eq('both consumers read the same available', boostedRisk.effectiveBudget, 250);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Budget-derived stop default result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
