/* test/trade-plan-chart.test.js
 * VM harness for the pure price-to-ticks adapter in js/store.js.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises `Store.tradePlanTicks`. No browser, no Firebase, no build.
 *
 * Proves:
 *   [1] Largo derives stop/target tick distances from prices
 *   [2] Corto derives the SAME absolute distances (sign is applied later)
 *   [3] A non-integer tick size (FDAX 0.5) scales the count correctly
 *   [4] Direction, entry, and tick pass through unchanged
 *   [5] Missing entry -> valid:false
 *   [6] Missing stop -> stopTicks NaN (no throw, no fabrication)
 *   [7] Missing exit -> targetTicks NaN
 *   [8] Missing/zero tick -> both distances NaN
 *
 * Run: node test/trade-plan-chart.test.js
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

function nan(name, value) {
  check(name, Number.isNaN(value), 'expected NaN, got ' + value);
}

/* ------------------------------------------------------------------ */
/* [1] Largo                                                           */
/* ------------------------------------------------------------------ */

console.log('\n[1] Largo distances');

/* ES tick 0.25, entry 4800, stop 4798 (2 pts), exit 4804 (4 pts). */
const long = Store.tradePlanTicks({
  entryPrice: 4800,
  stop: 4798,
  exitPrice: 4804,
  instrument: 'ES',
  direction: 'Largo'
});

check('long is valid', long.valid);
eq('long entry passes through', long.entry, 4800);
eq('long direction passes through', long.direction, 'Largo');
eq('long tick is ES tick', long.tick, INSTRUMENTS.ES.tick);
close('long stopTicks = 8', long.stopTicks, 8, 1e-9);
close('long targetTicks = 16', long.targetTicks, 16, 1e-9);

/* ------------------------------------------------------------------ */
/* [2] Corto distances are absolute                                    */
/* ------------------------------------------------------------------ */

console.log('\n[2] Corto distances (absolute)');

/* ES entry 4800, stop 4802 (above), exit 4796 (below). */
const short = Store.tradePlanTicks({
  entryPrice: 4800,
  stop: 4802,
  exitPrice: 4796,
  instrument: 'ES',
  direction: 'Corto'
});

check('short is valid', short.valid);
eq('short direction passes through', short.direction, 'Corto');
close('short stopTicks = 8', short.stopTicks, 8, 1e-9);
close('short targetTicks = 16', short.targetTicks, 16, 1e-9);

/* The adapter must NOT apply the direction sign: Largo and Corto return the
 * same positive counts for mirrored distances. */
check('Largo and Corto produce identical absolute tick counts',
  long.stopTicks === short.stopTicks && long.targetTicks === short.targetTicks);

/* ------------------------------------------------------------------ */
/* [3] Non-integer tick size (FDAX 0.5)                                */
/* ------------------------------------------------------------------ */

console.log('\n[3] Non-integer tick size (FDAX 0.5)');

const fdax = Store.tradePlanTicks({
  entryPrice: 19000,
  stop: 18996,
  exitPrice: 19004,
  instrument: 'FDAX',
  direction: 'Largo'
});

check('fdax is valid', fdax.valid);
eq('fdax tick is FDAX tick', fdax.tick, 0.5);
close('fdax stopTicks = 8', fdax.stopTicks, 8, 1e-9);
close('fdax targetTicks = 8', fdax.targetTicks, 8, 1e-9);

/* ------------------------------------------------------------------ */
/* [4] Passthrough                                                     */
/* ------------------------------------------------------------------ */

console.log('\n[4] Passthrough');

const passthrough = Store.tradePlanTicks({
  entryPrice: 100,
  stop: 99,
  exitPrice: 101,
  instrument: 'YM',  /* tick 1 */
  direction: ''
});

check('empty direction passes through as empty string', passthrough.direction === '');
close('YM tick 1: stopTicks = 1', passthrough.stopTicks, 1, 1e-9);

/* ------------------------------------------------------------------ */
/* [5] Missing entry -> valid:false                                    */
/* ------------------------------------------------------------------ */

console.log('\n[5] Missing entry');

const noEntry = Store.tradePlanTicks({
  stop: 4798,
  exitPrice: 4804,
  instrument: 'ES',
  direction: 'Largo'
});
eq('missing entry -> valid false', noEntry.valid, false);
nan('missing entry -> entry NaN', noEntry.entry);

/* A zero entry is also unusable. */
eq('zero entry -> valid false',
  Store.tradePlanTicks({ entryPrice: 0, stop: 4798, instrument: 'ES' }).valid, false);

/* ------------------------------------------------------------------ */
/* [6] Missing stop -> stopTicks NaN                                   */
/* ------------------------------------------------------------------ */

console.log('\n[6] Missing stop');

const noStop = Store.tradePlanTicks({
  entryPrice: 4800,
  exitPrice: 4804,
  instrument: 'ES',
  direction: 'Largo'
});
check('entry present -> still valid', noStop.valid);
nan('missing stop -> stopTicks NaN', noStop.stopTicks);
close('missing stop -> targetTicks still 16', noStop.targetTicks, 16, 1e-9);

/* ------------------------------------------------------------------ */
/* [7] Missing exit -> targetTicks NaN                                 */
/* ------------------------------------------------------------------ */

console.log('\n[7] Missing exit');

const noExit = Store.tradePlanTicks({
  entryPrice: 4800,
  stop: 4798,
  instrument: 'ES',
  direction: 'Largo'
});
check('entry present -> still valid', noExit.valid);
close('missing exit -> stopTicks still 8', noExit.stopTicks, 8, 1e-9);
nan('missing exit -> targetTicks NaN', noExit.targetTicks);

/* ------------------------------------------------------------------ */
/* [8] Missing/zero tick -> both distances NaN                         */
/* ------------------------------------------------------------------ */

console.log('\n[8] Missing/zero tick');

const unknownTick = Store.tradePlanTicks({
  entryPrice: 4800,
  stop: 4798,
  exitPrice: 4804,
  instrument: 'UNKNOWN',
  direction: 'Largo'
});
nan('unknown instrument -> tick NaN', unknownTick.tick);
nan('unknown instrument -> stopTicks NaN', unknownTick.stopTicks);
nan('unknown instrument -> targetTicks NaN', unknownTick.targetTicks);

/* Inject a synthetic zero-tick instrument to prove tick <= 0 degrades. The
 * adapter reads the live catalog, so mutating the shared INSTRUMENTS object
 * (same object the vm's lexical binding points to) is honest here. */
INSTRUMENTS.ZERO_TICK = { tick: 0 };
const zeroTick = Store.tradePlanTicks({
  entryPrice: 4800,
  stop: 4798,
  exitPrice: 4804,
  instrument: 'ZERO_TICK',
  direction: 'Largo'
});
eq('zero tick -> tick is 0', zeroTick.tick, 0);
nan('zero tick -> stopTicks NaN', zeroTick.stopTicks);
nan('zero tick -> targetTicks NaN', zeroTick.targetTicks);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Trade plan chart result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
