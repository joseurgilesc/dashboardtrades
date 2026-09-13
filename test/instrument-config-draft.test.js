/* test/instrument-config-draft.test.js
 * VM harness for the per-instrument stop/target config and the DRAFT autofill.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure helpers (no browser, no Firebase, no build step), then
 * runs structural checks against index.html / app.js.
 *
 * Proves:
 *   (a) ticks <-> points conversion per instrument (MES 0.25 -> 1 pt = 4 ticks;
 *       FDAX 0.5 -> 1 pt = 2 ticks)
 *   (b) the draft autofill writes stop + primary (2:1) exit for Largo and Corto
 *   (c) a user-touched field is never overwritten (write=false, value kept)
 *   (d) the per-instrument config changes the suggested stop (and exit)
 *   (e) default fallback when an instrument has no config
 *   (+) structural: calculator above the form, draft badges, config card
 *
 * Run: node test/instrument-config-draft.test.js
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
  '\n;globalThis.DEFAULT_STOP_TICKS = DEFAULT_STOP_TICKS;' +
  '\n;globalThis.DEFAULT_TARGET_R = DEFAULT_TARGET_R;' +
  '\n;globalThis.DEFAULT_TARGET_R_ALT = DEFAULT_TARGET_R_ALT;',
  context,
  { filename: 'store-bundle.js' }
);
const Store = context.Store;
const INSTRUMENTS = context.INSTRUMENTS;
const DEFAULT_STOP_TICKS = context.DEFAULT_STOP_TICKS;
const DEFAULT_TARGET_R = context.DEFAULT_TARGET_R;
const DEFAULT_TARGET_R_ALT = context.DEFAULT_TARGET_R_ALT;

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
/* (a) ticks <-> points conversion per instrument                      */
/* ------------------------------------------------------------------ */

console.log('\n(a) Ticks <-> points conversion per instrument');

eq('MES tick is 0.25', INSTRUMENTS.MES.tick, 0.25);
eq('FDAX tick is 0.5', INSTRUMENTS.FDAX.tick, 0.5);
eq('MES: 1 point = 4 ticks', Store.pointsToTicks(1, 'MES'), 4);
eq('MES: 4 ticks = 1 point', Store.ticksToPoints(4, 'MES'), 1);
eq('FDAX: 1 point = 2 ticks', Store.pointsToTicks(1, 'FDAX'), 2);
eq('FDAX: 2 ticks = 1 point', Store.ticksToPoints(2, 'FDAX'), 1);
close('MES: 8 ticks = 2 points', Store.ticksToPoints(8, 'MES'), 2, 1e-9);
close('MES: 10 points = 40 ticks', Store.pointsToTicks(10, 'MES'), 40, 1e-9);
close('FDAX: 5 ticks = 2.5 points', Store.ticksToPoints(5, 'FDAX'), 2.5, 1e-9);
check('unknown instrument -> NaN', Number.isNaN(Store.pointsToTicks(1, 'NOPE')));
check('non-numeric ticks -> NaN', Number.isNaN(Store.ticksToPoints('x', 'MES')));

/* ------------------------------------------------------------------ */
/* (b) draft autofill writes stop + 2:1 exit (Largo / Corto)           */
/* ------------------------------------------------------------------ */

console.log('\n(b) Draft autofill writes stop + 2:1 exit');

/* MES, default config (8 ticks, 2:1): distance 2 points.
 * Largo -> stop 4998, exit 5004. Corto -> stop 5002, exit 4996. */
const largo = Store.draftAutofill({
  account: 'Sim', instrument: 'MES', entryPrice: 5000, direction: 'Largo',
  touched: { stop: false, exitPrice: false }
});
check('Largo draft is valid', largo.valid);
eq('Largo draft stop = entry - 8 ticks', largo.stop.value, 4998);
eq('Largo draft exit (2:1) = entry + 16 ticks', largo.exit.value, 5004);
eq('Largo stop is written (untouched)', largo.stop.write, true);
eq('Largo exit is written (untouched)', largo.exit.write, true);
eq('Largo draft uses the default 8 stop ticks', largo.stopTicks, 8);
eq('Largo draft uses the default 2:1 target', largo.targetR, 2);

const corto = Store.draftAutofill({
  account: 'Sim', instrument: 'MES', entryPrice: 5000, direction: 'Corto',
  touched: { stop: false, exitPrice: false }
});
check('Corto draft is valid', corto.valid);
eq('Corto draft stop = entry + 8 ticks', corto.stop.value, 5002);
eq('Corto draft exit (2:1) = entry - 16 ticks', corto.exit.value, 4996);
eq('Corto stop is written (untouched)', corto.stop.write, true);
eq('Corto exit is written (untouched)', corto.exit.write, true);

/* A missing entry price / direction never produces a draft. */
eq('missing entry -> invalid draft',
  Store.draftAutofill({ account: 'Sim', instrument: 'MES', direction: 'Largo', touched: {} }).valid, false);
eq('missing direction -> invalid draft',
  Store.draftAutofill({ account: 'Sim', instrument: 'MES', entryPrice: 5000, touched: {} }).valid, false);
eq('unknown instrument -> invalid draft',
  Store.draftAutofill({ account: 'Sim', instrument: 'NOPE', entryPrice: 5000, direction: 'Largo', touched: {} }).valid, false);

/* ------------------------------------------------------------------ */
/* (c) a user-touched field is never overwritten                       */
/* ------------------------------------------------------------------ */

console.log('\n(c) Touched fields are never overwritten');

const stopTouched = Store.draftAutofill({
  account: 'Sim', instrument: 'MES', entryPrice: 5000, direction: 'Largo',
  touched: { stop: true, exitPrice: false }
});
eq('touched stop -> write false', stopTouched.stop.write, false);
eq('touched stop -> draft value still computed (caller keeps user value)', stopTouched.stop.value, 4998);
eq('untouched exit -> write true', stopTouched.exit.write, true);

const bothTouched = Store.draftAutofill({
  account: 'Sim', instrument: 'MES', entryPrice: 5000, direction: 'Largo',
  touched: { stop: true, exitPrice: true }
});
eq('both touched -> stop not written', bothTouched.stop.write, false);
eq('both touched -> exit not written', bothTouched.exit.write, false);

/* `touched` is read-only input: the helper never mutates the caller's object. */
const flags = { stop: true, exitPrice: false };
Store.draftAutofill({ account: 'Sim', instrument: 'MES', entryPrice: 5000, direction: 'Largo', touched: flags });
eq('caller touched flags unchanged', flags.stop, true);
eq('caller touched flags unchanged (exit)', flags.exitPrice, false);

/* ------------------------------------------------------------------ */
/* (d) per-instrument config changes the suggested stop                */
/* ------------------------------------------------------------------ */

console.log('\n(d) Per-instrument config changes the suggested stop');

/* Baseline: no config -> default 8 ticks -> stop 4998. */
const beforeCfg = Store.resolveInstrumentConfig('Sim', 'MES');
eq('MES default stop ticks', beforeCfg.stopTicks, DEFAULT_STOP_TICKS);
eq('MES default target R', beforeCfg.targetR, DEFAULT_TARGET_R);
eq('MES default alt target R', beforeCfg.targetRAlt, DEFAULT_TARGET_R_ALT);
eq('MES default stop points (8 x 0.25)', beforeCfg.stopPoints, 2);

/* Configure MES (Sim) to 20 ticks and 3:1 -> stop 4995, exit 5015. */
Store.setInstrumentConfig('Sim', 'MES', { stopTicks: 20, targetR: 3, targetRAlt: 4 });
const afterCfg = Store.resolveInstrumentConfig('Sim', 'MES');
eq('configured stop ticks = 20', afterCfg.stopTicks, 20);
eq('configured target R = 3', afterCfg.targetR, 3);
eq('configured alt target R = 4', afterCfg.targetRAlt, 4);
eq('configured stop points (20 x 0.25)', afterCfg.stopPoints, 5);
eq('configured exit points (20 x 3 x 0.25)', afterCfg.targetPoints, 15);

const draftCfg = Store.draftAutofill({
  account: 'Sim', instrument: 'MES', entryPrice: 5000, direction: 'Largo',
  touched: { stop: false, exitPrice: false }
});
eq('draft stop follows the configured 20 ticks', draftCfg.stop.value, 4995);
eq('draft exit follows the configured 3:1', draftCfg.exit.value, 5015);
check('config changed the suggested stop', draftCfg.stop.value !== largo.stop.value);

/* The config is per account: Real keeps the defaults. */
eq('Real MES keeps the default stop ticks', Store.resolveInstrumentConfig('Real', 'MES').stopTicks, DEFAULT_STOP_TICKS);

/* computeRisk honours the configured target multiples. */
const riskCfg = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, instrument: 'MES', stopTicks: 20,
  targetR: 3, targetRAlt: 4
});
eq('computeRisk ticksTP2 = 20 x 3', riskCfg.ticksTP2, 60);
eq('computeRisk ticksTP3 = 20 x 4', riskCfg.ticksTP3, 80);
eq('computeRisk reports targetR', riskCfg.targetR, 3);

/* ------------------------------------------------------------------ */
/* (e) default fallback when an instrument has no config               */
/* ------------------------------------------------------------------ */

console.log('\n(e) Default fallback without an explicit config');

const fallback = Store.resolveInstrumentConfig('Fondeo', 'FDAX');
eq('FDAX fallback stop ticks', fallback.stopTicks, DEFAULT_STOP_TICKS);
eq('FDAX fallback target R', fallback.targetR, DEFAULT_TARGET_R);
eq('FDAX fallback alt target R', fallback.targetRAlt, DEFAULT_TARGET_R_ALT);
eq('FDAX fallback hasConfig false', fallback.hasConfig, false);
close('FDAX fallback stop points (8 x 0.5)', fallback.stopPoints, 4, 1e-9);
check('unknown instrument -> invalid', Store.resolveInstrumentConfig('Sim', 'NOPE').valid === false);

/* normalizeInstrumentConfig repairs junk input to the defaults. */
const repaired = Store.normalizeInstrumentConfig({ stopTicks: -3, targetR: 0, targetRAlt: 'x' });
eq('junk stopTicks -> default', repaired.stopTicks, DEFAULT_STOP_TICKS);
eq('junk targetR -> default', repaired.targetR, DEFAULT_TARGET_R);
eq('junk targetRAlt -> default', repaired.targetRAlt, DEFAULT_TARGET_R_ALT);

/* getInstrumentConfig covers every account + instrument with resolved values. */
const all = Store.getInstrumentConfig();
eq('getInstrumentConfig has every account', Object.keys(all).length, 3);
eq('getInstrumentConfig has every instrument', Object.keys(all.Sim).length, Object.keys(INSTRUMENTS).length);
eq('getInstrumentConfig Sim MES reflects the config', all.Sim.MES.stopTicks, 20);

/* ------------------------------------------------------------------ */
/* Structural checks (index.html / app.js)                             */
/* ------------------------------------------------------------------ */

console.log('\nStructural: layout, draft badges, config card');

const calcIdx = htmlSrc.indexOf('<h2>Calculadora de riesgo</h2>');
const formIdx = htmlSrc.indexOf('id="tradeForm"');
check('calculator markup exists', calcIdx !== -1);
check('trade form markup exists', formIdx !== -1);
check('calculator comes BEFORE the trade form (Change 1)', calcIdx !== -1 && formIdx !== -1 && calcIdx < formIdx);
check('desktop 2-column .risk-layout preserved', htmlSrc.indexOf('class="risk-layout"') !== -1 &&
  htmlSrc.indexOf('class="risk-main"') !== -1 && htmlSrc.indexOf('class="risk-preview"') !== -1);

check('form exposes #stopDraftBadge', htmlSrc.indexOf('id="stopDraftBadge"') !== -1);
check('form exposes #exitPriceDraftBadge', htmlSrc.indexOf('id="exitPriceDraftBadge"') !== -1);
check('Ajustes exposes #instrumentConfigBody', htmlSrc.indexOf('id="instrumentConfigBody"') !== -1);
check('Ajustes exposes #instrumentConfigAccount', htmlSrc.indexOf('id="instrumentConfigAccount"') !== -1);
check('Ajustes exposes #btnSaveInstrumentConfig', htmlSrc.indexOf('id="btnSaveInstrumentConfig"') !== -1);

check('UI applies the draft decision (applyDraftAutofill)', appSrc.indexOf('applyDraftAutofill') !== -1);
check('UI gates the stop write on draft.stop.write', appSrc.indexOf('draft.stop.write') !== -1);
check('UI gates the exit write on draft.exit.write', appSrc.indexOf('draft.exit.write') !== -1);
check('UI delegates the decision to Store.draftAutofill', appSrc.indexOf('Store.draftAutofill') !== -1);
check('UI tracks touched stop', appSrc.indexOf('touchedFields.stop') !== -1);
check('UI tracks touched exit', appSrc.indexOf('touchedFields.exitPrice') !== -1);
check('UI marks the stop input on user input', appSrc.indexOf('markStopTouched') !== -1);
check('UI marks the exit input on user input', appSrc.indexOf('markExitTouched') !== -1);
check('UI reads the per-instrument config', appSrc.indexOf('resolveInstrumentConfig') !== -1);
check('advisory suggestion derives from the resolved stop ticks',
  appSrc.indexOf('renderPriceSuggestions(stopTicks)') !== -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Instrument config + draft result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
