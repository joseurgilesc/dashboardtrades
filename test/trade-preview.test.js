/* test/trade-preview.test.js
 * VM harness for the pure trade-preview geometry in js/store.js.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises `Store.tradePreviewGeometry`. No browser, no Firebase, no build.
 *
 * Proves:
 *   [1] Largo: stop < entry < targets, and the y order matches (stopY > entryY > targetY)
 *   [2] Corto: inverted prices and inverted y order
 *   [3] ticksTP defaults to [2x, 3x] of the stop distance
 *   [4] Tick distances match the calculator's ticksTP2 / ticksTP3
 *   [5] Missing entry -> placeholder state (valid false, reason 'entry')
 *   [6] Invalid stop ticks / tick size / direction report their reason
 *
 * Run: node test/trade-preview.test.js
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
/* [1] Largo                                                           */
/* ------------------------------------------------------------------ */

console.log('\n[1] Largo geometry');

/* MES tick 0.25, entry 5000, stop 8 ticks -> 2 points. */
const long = Store.tradePreviewGeometry({
  entry: 5000,
  stopTicks: 8,
  tick: INSTRUMENTS.MES.tick,
  direction: 'Largo',
  ticksTP: [16, 24]
});

check('long is valid', long.valid);
eq('long stop = entry - 8 ticks', long.stop, 4998);
eq('long TP2 = entry + 16 ticks', long.targets[0], 5004);
eq('long TP3 = entry + 24 ticks', long.targets[1], 5006);
check('long prices: stop < entry < TP2 < TP3',
  long.stop < long.entry && long.entry < long.targets[0] && long.targets[0] < long.targets[1]);

/* y grows downward (0 = top / highest price). */
check('long y: stopY > entryY > TP2Y > TP3Y',
  long.stopY > long.entryY && long.entryY > long.targetYs[0] && long.targetYs[0] > long.targetYs[1]);
check('long y values are normalised in [0, 1]',
  long.stopY >= 0 && long.stopY <= 1 && long.entryY >= 0 && long.entryY <= 1 &&
  long.targetYs.every(function (y) { return y >= 0 && y <= 1; }));
eq('long min price is the stop', long.min, 4998);
eq('long max price is TP3', long.max, 5006);

/* The tick distance of every level, read back from the prices. */
close('long stop is 8 ticks away', (long.entry - long.stop) / long.tick, 8, 1e-9);
close('long TP2 is 16 ticks away', (long.targets[0] - long.entry) / long.tick, 16, 1e-9);
close('long TP3 is 24 ticks away', (long.targets[1] - long.entry) / long.tick, 24, 1e-9);

/* ------------------------------------------------------------------ */
/* [2] Corto                                                           */
/* ------------------------------------------------------------------ */

console.log('\n[2] Corto geometry (inverted)');

const short = Store.tradePreviewGeometry({
  entry: 5000,
  stopTicks: 8,
  tick: INSTRUMENTS.MES.tick,
  direction: 'Corto',
  ticksTP: [16, 24]
});

check('short is valid', short.valid);
eq('short stop = entry + 8 ticks', short.stop, 5002);
eq('short TP2 = entry - 16 ticks', short.targets[0], 4996);
eq('short TP3 = entry - 24 ticks', short.targets[1], 4994);
check('short prices: stop > entry > TP2 > TP3',
  short.stop > short.entry && short.entry > short.targets[0] && short.targets[0] > short.targets[1]);

/* For a short the stop is the highest price, so it sits at the TOP (smallest y). */
check('short y: stopY < entryY < TP2Y < TP3Y',
  short.stopY < short.entryY && short.entryY < short.targetYs[0] && short.targetYs[0] < short.targetYs[1]);

/* ------------------------------------------------------------------ */
/* [3] Default ticksTP = [2x, 3x]                                      */
/* ------------------------------------------------------------------ */

console.log('\n[3] ticksTP defaults to [2x, 3x]');

const def = Store.tradePreviewGeometry({
  entry: 5000,
  stopTicks: 8,
  tick: INSTRUMENTS.MES.tick,
  direction: 'Largo'
});
check('default is valid', def.valid);
eq('default TP2 = 2 x stopTicks', def.ticksTP[0], 16);
eq('default TP3 = 3 x stopTicks', def.ticksTP[1], 24);
eq('default TP2 price', def.targets[0], 5004);
eq('default TP3 price', def.targets[1], 5006);

/* ------------------------------------------------------------------ */
/* [4] Tick distances match the calculator                             */
/* ------------------------------------------------------------------ */

console.log('\n[4] Matches the calculator ticksTP2 / ticksTP3');

const risk = Store.computeRisk({
  balance: 10000,
  capital: 10000,
  riskPct: 2,
  tradesPerDay: 3,
  instrument: 'MES',
  stopTicks: 8
});
check('calculator is valid', risk.valid);
eq('calculator ticksTP2', risk.ticksTP2, 16);
eq('calculator ticksTP3', risk.ticksTP3, 24);

const fromCalc = Store.tradePreviewGeometry({
  entry: 5000,
  stopTicks: risk.stopTicks,
  tick: INSTRUMENTS.MES.tick,
  direction: 'Largo',
  ticksTP: [risk.ticksTP2, risk.ticksTP3]
});
eq('preview ticksTP mirrors the calculator', fromCalc.ticksTP.join(','), '16,24');
eq('preview TP2 price matches the calculator distance', fromCalc.targets[0], 5004);
eq('preview TP3 price matches the calculator distance', fromCalc.targets[1], 5006);

/* Fractional instrument: 6E tick 0.0001, 10 ticks. */
const fx = Store.tradePreviewGeometry({
  entry: 1.0865,
  stopTicks: 10,
  tick: INSTRUMENTS['6E'].tick,
  direction: 'Largo'
});
check('6E preview is valid', fx.valid);
close('6E stop = entry - 10 ticks', fx.stop, 1.0855, 1e-9);
close('6E TP2 = entry + 20 ticks', fx.targets[0], 1.0885, 1e-9);

/* ------------------------------------------------------------------ */
/* [5] Placeholder state                                               */
/* ------------------------------------------------------------------ */

console.log('\n[5] Placeholder state');

const noEntry = Store.tradePreviewGeometry({
  stopTicks: 8,
  tick: INSTRUMENTS.MES.tick,
  direction: 'Largo'
});
eq('missing entry -> invalid', noEntry.valid, false);
eq('missing entry -> reason entry', noEntry.reason, 'entry');
eq('missing entry -> no targets', noEntry.targets.length, 0);
eq('missing entry -> entryY stays 0', noEntry.entryY, 0);

/* A NaN entry (empty number input) behaves the same. */
eq('NaN entry -> reason entry',
  Store.tradePreviewGeometry({ entry: NaN, stopTicks: 8, tick: 0.25, direction: 'Largo' }).reason, 'entry');

/* ------------------------------------------------------------------ */
/* [6] Invalid inputs report their reason                              */
/* ------------------------------------------------------------------ */

console.log('\n[6] Invalid inputs');

eq('missing stopTicks -> reason stopTicks',
  Store.tradePreviewGeometry({ entry: 5000, tick: 0.25, direction: 'Largo' }).reason, 'stopTicks');
eq('zero stopTicks -> reason stopTicks',
  Store.tradePreviewGeometry({ entry: 5000, stopTicks: 0, tick: 0.25, direction: 'Largo' }).reason, 'stopTicks');
eq('missing tick -> reason tick',
  Store.tradePreviewGeometry({ entry: 5000, stopTicks: 8, direction: 'Largo' }).reason, 'tick');
eq('missing direction -> reason direction',
  Store.tradePreviewGeometry({ entry: 5000, stopTicks: 8, tick: 0.25 }).reason, 'direction');
eq('unknown direction -> reason direction',
  Store.tradePreviewGeometry({ entry: 5000, stopTicks: 8, tick: 0.25, direction: 'X' }).reason, 'direction');

/* Non-positive TP distances are dropped, never rendered. */
const badTp = Store.tradePreviewGeometry({
  entry: 5000, stopTicks: 8, tick: 0.25, direction: 'Largo', ticksTP: [16, 0, -4]
});
check('non-positive ticksTP entries are dropped', badTp.valid && badTp.ticksTP.length === 1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Trade preview result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
