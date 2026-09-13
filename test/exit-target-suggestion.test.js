/* test/exit-target-suggestion.test.js
 * VM harness for the exit/target price suggestion derived from the R/B range.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure `Store.suggestStopTarget` helper. No browser, no Firebase,
 * no build step.
 *
 * Proves:
 *   [1] Largo/Corto: the suggested stop sits below/above the entry and
 *       target2/target3 are the 2:1 and 3:1 exit prices, snapped to the grid
 *   [2] target2/target3 equal ticks x 2 and ticks x 3 on-grid, and match the
 *       calculator's ticksTP2/ticksTP3 distances
 *   [3] Fractional instruments (6E) and half-point instruments (FDAX) snap
 *   [4] No suggestion without an entry price / ticks / instrument / direction
 *   [5] Backward compatibility: `targetPrice` is the 2:1 target alias
 *   [6] Structural: the form exposes both suggestion slots and the UI renders
 *       the R/B range from the resolved stop ticks
 *
 * Run: node test/exit-target-suggestion.test.js
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

/* Distance in ticks between two prices, on the instrument's grid. */
function ticksBetween(entry, price, tick) {
  return (price - entry) / tick;
}

/* ------------------------------------------------------------------ */
/* [1] Largo / Corto stop and target prices                            */
/* ------------------------------------------------------------------ */

console.log('\n[1] Largo/Corto stop and R/B target prices');

/* MES tick 0.25, entry 5000, stop 8 ticks -> distance 2 points.
 * target2 = entry + 2x distance = +4, target3 = +6. */
const largo = Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Largo', ticks: 8 });
check('Largo suggestion is valid', largo.valid);
eq('Largo: stop below entry (5000 - 2)', largo.stopPrice, 4998);
eq('Largo: target2 = entry + 2 ticks x 8 (5000 + 4)', largo.target2, 5004);
eq('Largo: target3 = entry + 3 ticks x 8 (5000 + 6)', largo.target3, 5006);
check('Largo: stop < entry < target2 < target3',
  largo.stopPrice < 5000 && 5000 < largo.target2 && largo.target2 < largo.target3);

const corto = Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Corto', ticks: 8 });
check('Corto suggestion is valid', corto.valid);
eq('Corto: stop above entry (5000 + 2)', corto.stopPrice, 5002);
eq('Corto: target2 = entry - 2 ticks x 8 (5000 - 4)', corto.target2, 4996);
eq('Corto: target3 = entry - 3 ticks x 8 (5000 - 6)', corto.target3, 4994);
check('Corto: target3 < target2 < entry < stop',
  corto.target3 < corto.target2 && corto.target2 < 5000 && 5000 < corto.stopPrice);

/* ------------------------------------------------------------------ */
/* [2] target2/target3 = ticks x 2 / x 3 and match the calculator      */
/* ------------------------------------------------------------------ */

console.log('\n[2] target2/target3 match ticks x 2 / x 3');

const tickMES = INSTRUMENTS.MES.tick;
close('Largo target2 is 16 ticks away', ticksBetween(5000, largo.target2, tickMES), 16, 1e-9);
close('Largo target3 is 24 ticks away', ticksBetween(5000, largo.target3, tickMES), 24, 1e-9);
close('Corto target2 is -16 ticks away', ticksBetween(5000, corto.target2, tickMES), -16, 1e-9);
close('Corto target3 is -24 ticks away', ticksBetween(5000, corto.target3, tickMES), -24, 1e-9);

/* The calculator builds ticksTP2/ticksTP3 from the same stop distance. */
const risk = Store.computeRisk({
  balance: 100000, capital: 100000, riskPct: 2, tradesPerDay: 3,
  instrument: 'MES', stopTicks: 8
});
check('calculator is valid', risk.valid);
eq('calculator ticksSL = 8', risk.ticksSL, 8);
eq('calculator ticksTP2 = 16', risk.ticksTP2, 16);
eq('calculator ticksTP3 = 24', risk.ticksTP3, 24);
eq('suggestion stop ticks mirror ticksSL', largo.ticks, risk.ticksSL);
eq('suggestion target2 price = entry + ticksTP2 x tick', largo.target2, 5000 + risk.ticksTP2 * tickMES);
eq('suggestion target3 price = entry + ticksTP3 x tick', largo.target3, 5000 + risk.ticksTP3 * tickMES);

/* ------------------------------------------------------------------ */
/* [3] Tick-grid snapping on fractional / half-point instruments       */
/* ------------------------------------------------------------------ */

console.log('\n[3] Tick-grid snapping');

const fx = Store.suggestStopTarget({ instrument: '6E', entryPrice: 1.0865, direction: 'Largo', ticks: 10 });
check('6E suggestion is valid', fx.valid);
close('6E: stop = entry - 10 ticks', fx.stopPrice, 1.0855, 1e-9);
close('6E: target2 = entry + 20 ticks', fx.target2, 1.0885, 1e-9);
close('6E: target3 = entry + 30 ticks', fx.target3, 1.0895, 1e-9);

const fdax = Store.suggestStopTarget({ instrument: 'FDAX', entryPrice: 18000, direction: 'Corto', ticks: 5 });
check('FDAX suggestion is valid', fdax.valid);
eq('FDAX: stop = entry + 2.5', fdax.stopPrice, 18002.5);
eq('FDAX: target2 = entry - 5', fdax.target2, 17995);
eq('FDAX: target3 = entry - 7.5', fdax.target3, 17992.5);

/* An off-grid entry is snapped to the nearest tick for every level. */
const offGrid = Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000.13, direction: 'Largo', ticks: 3 });
check('off-grid suggestion is valid', offGrid.valid);
eq('off-grid stop snapped to the grid (5000.13 - 0.75 -> 4999.50)', offGrid.stopPrice, 4999.5);
eq('off-grid target2 snapped to the grid (5000.13 + 1.5 -> 5001.75)', offGrid.target2, 5001.75);
eq('off-grid target3 snapped to the grid (5000.13 + 2.25 -> 5002.50)', offGrid.target3, 5002.5);
check('snapped prices are whole ticks',
  Math.abs(offGrid.stopPrice / tickMES - Math.round(offGrid.stopPrice / tickMES)) < 1e-9 &&
  Math.abs(offGrid.target2 / tickMES - Math.round(offGrid.target2 / tickMES)) < 1e-9 &&
  Math.abs(offGrid.target3 / tickMES - Math.round(offGrid.target3 / tickMES)) < 1e-9);

/* ------------------------------------------------------------------ */
/* [4] No suggestion without enough data                               */
/* ------------------------------------------------------------------ */

console.log('\n[4] Missing data never produces a suggestion');

const noEntry = Store.suggestStopTarget({ instrument: 'MES', direction: 'Largo', ticks: 8 });
eq('missing entry -> invalid', noEntry.valid, false);
eq('missing entry -> reason entryPrice', noEntry.reason, 'entryPrice');
check('missing entry -> no target2/target3', Number.isNaN(noEntry.target2) && Number.isNaN(noEntry.target3));

const nanEntry = Store.suggestStopTarget({ instrument: 'MES', entryPrice: NaN, direction: 'Largo', ticks: 8 });
eq('NaN entry -> reason entryPrice', nanEntry.reason, 'entryPrice');

eq('ticks 0 -> invalid', Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Largo', ticks: 0 }).valid, false);
eq('missing ticks -> reason ticks', Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Largo' }).reason, 'ticks');
eq('unknown instrument -> reason instrument', Store.suggestStopTarget({ instrument: 'NOPE', entryPrice: 5000, direction: 'Largo', ticks: 8 }).reason, 'instrument');
eq('missing direction -> reason direction', Store.suggestStopTarget({ instrument: 'MES', entryPrice: 5000, direction: '', ticks: 8 }).reason, 'direction');

/* ------------------------------------------------------------------ */
/* [5] Backward compatibility                                          */
/* ------------------------------------------------------------------ */

console.log('\n[5] targetPrice stays the 2:1 alias');

eq('targetPrice === target2 (Largo)', largo.targetPrice, largo.target2);
eq('targetPrice === target2 (Corto)', corto.targetPrice, corto.target2);

/* ------------------------------------------------------------------ */
/* [6] Structural UI wiring                                            */
/* ------------------------------------------------------------------ */

console.log('\n[6] Structural UI wiring');

check('form exposes #exitSuggestion', htmlSrc.indexOf('id="exitSuggestion"') !== -1);
check('form keeps #targetSuggestion', htmlSrc.indexOf('id="targetSuggestion"') !== -1);
check('UI renders target2', appSrc.indexOf('suggestion.target2') !== -1);
check('UI renders target3', appSrc.indexOf('suggestion.target3') !== -1);
check('UI labels the R/B range (2:1)', appSrc.indexOf('R/B 2:1') !== -1);
check('UI labels the R/B range (3:1)', appSrc.indexOf('R/B 3:1') !== -1);
check('suggestion derives from the resolved stop ticks', appSrc.indexOf('renderPriceSuggestions(stopTicks)') !== -1);
check('suggestion is no longer gated on max ticks',
  appSrc.indexOf('maxTicksForOneContract : 0') === -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Exit/target suggestion result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
