/* test/ratio-target-preview.test.js
 * VM harness for Change 1 (R/B ratio selector) and Change 2 (deterministic
 * candlestick preview).
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * exercises the pure helpers, then extracts the REAL ratio-label / selector
 * helpers from js/app.js (brace-matched, not re-implemented). No browser, no
 * Firebase, no build step.
 *
 * Proves:
 *   (a) each of the 5 ratios yields the correct target price for Largo/Corto
 *   (b) changing the ratio moves the target, the exit suggestion and the draft
 *   (c) the candle geometry is deterministic and respects direction
 *   (d) the R/B label reflects the selected ratio
 *   (e) no USD "Objetivo" input remains in the markup
 *
 * Run: node test/ratio-target-preview.test.js
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
  '\n;globalThis.RATIO_OPTIONS = RATIO_OPTIONS; globalThis.DEFAULT_RATIO = DEFAULT_RATIO;',
  context,
  { filename: 'store-bundle.js' }
);
const Store = context.Store;
const INSTRUMENTS = context.INSTRUMENTS;
const RATIO_OPTIONS = context.RATIO_OPTIONS;
const DEFAULT_RATIO = context.DEFAULT_RATIO;

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
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function close(name, actual, expected, tol) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= (tol || 1e-9);
  check(name, ok, 'expected ~' + expected + ', got ' + actual);
}

/* Extracts a function body from app.js by signature (brace matching). */
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

/* ------------------------------------------------------------------ */
/* (a) Each ratio yields the correct target price                      */
/* ------------------------------------------------------------------ */

console.log('\n(a) Ratio -> target price (Largo / Corto)');

check('ratio options are exactly 1:2, 1:2.5, 1:3, 1:3.5, 1:4',
  JSON.stringify(RATIO_OPTIONS) === JSON.stringify([2, 2.5, 3, 3.5, 4]),
  JSON.stringify(RATIO_OPTIONS));
eq('the default ratio is 1:2', DEFAULT_RATIO, 2);
eq('Store.getRatioOptions mirrors the catalog',
  JSON.stringify(Store.getRatioOptions()), JSON.stringify(RATIO_OPTIONS));

const TICK = INSTRUMENTS.MES.tick; /* 0.25 */
const STOP_TICKS = 8;
const ENTRY = 5000;

RATIO_OPTIONS.forEach(function (ratio) {
  const largo = Store.ratioTarget({
    instrument: 'MES', entryPrice: ENTRY, direction: 'Largo', ticks: STOP_TICKS, ratio: ratio
  });
  const corto = Store.ratioTarget({
    instrument: 'MES', entryPrice: ENTRY, direction: 'Corto', ticks: STOP_TICKS, ratio: ratio
  });
  check('Largo 1:' + ratio + ' is valid', largo.valid);
  close('Largo 1:' + ratio + ' target = entry + ratio x stopTicks x tick',
    largo.targetPrice, ENTRY + ratio * STOP_TICKS * TICK, 1e-9);
  check('Corto 1:' + ratio + ' is valid', corto.valid);
  close('Corto 1:' + ratio + ' target = entry - ratio x stopTicks x tick',
    corto.targetPrice, ENTRY - ratio * STOP_TICKS * TICK, 1e-9);
  /* The stop distance is untouched by the ratio (only the target changes). */
  close('Largo 1:' + ratio + ' keeps the stop at entry - stopTicks x tick',
    largo.stopPrice, ENTRY - STOP_TICKS * TICK, 1e-9);
});

/* The formula also holds on a fractional-tick instrument. */
const fx = Store.ratioTarget({
  instrument: '6E', entryPrice: 1.0865, direction: 'Largo', ticks: 10, ratio: 3
});
check('6E 1:3 is valid', fx.valid);
close('6E 1:3 target = entry + 3 x 10 x 0.0001', fx.targetPrice, 1.0865 + 3 * 10 * 0.0001, 1e-9);

/* ------------------------------------------------------------------ */
/* (b) Changing the ratio moves the target / suggestion / draft        */
/* ------------------------------------------------------------------ */

console.log('\n(b) Changing the ratio moves the target, suggestion and draft');

const targetAt2 = Store.ratioTarget({ instrument: 'MES', entryPrice: ENTRY, direction: 'Largo', ticks: STOP_TICKS, ratio: 2 });
const targetAt3 = Store.ratioTarget({ instrument: 'MES', entryPrice: ENTRY, direction: 'Largo', ticks: STOP_TICKS, ratio: 3 });
check('the target price moves with the ratio', targetAt2.targetPrice !== targetAt3.targetPrice);
eq('1:2 target is entry + 2R', targetAt2.targetPrice, 5004);
eq('1:3 target is entry + 3R', targetAt3.targetPrice, 5006);

const suggestion2 = Store.suggestStopTarget({
  instrument: 'MES', entryPrice: ENTRY, direction: 'Largo', ticks: STOP_TICKS, targetR: 2, targetRAlt: 2
});
const suggestion3 = Store.suggestStopTarget({
  instrument: 'MES', entryPrice: ENTRY, direction: 'Largo', ticks: STOP_TICKS, targetR: 3, targetRAlt: 3
});
eq('exit suggestion at 1:2', suggestion2.targetPrice, 5004);
eq('exit suggestion at 1:3', suggestion3.targetPrice, 5006);
check('the exit suggestion moves with the ratio',
  suggestion2.targetPrice !== suggestion3.targetPrice);

const draft2 = Store.draftAutofill({
  account: 'Sim', instrument: 'MES', entryPrice: ENTRY, direction: 'Largo',
  stopTicks: STOP_TICKS, targetR: 2, touched: { stop: false, exitPrice: false }
});
const draft3 = Store.draftAutofill({
  account: 'Sim', instrument: 'MES', entryPrice: ENTRY, direction: 'Largo',
  stopTicks: STOP_TICKS, targetR: 3, touched: { stop: false, exitPrice: false }
});
eq('draft exit at 1:2', draft2.exit.value, 5004);
eq('draft exit at 1:3', draft3.exit.value, 5006);
check('the draft exit moves with the ratio', draft2.exit.value !== draft3.exit.value);

/* ------------------------------------------------------------------ */
/* (c) Deterministic candle geometry that respects direction           */
/* ------------------------------------------------------------------ */

console.log('\n(c) Deterministic candles that respect direction');

const candleInput = {
  entry: ENTRY, stopTicks: STOP_TICKS, tick: TICK, direction: 'Largo', ticksTP: [STOP_TICKS * 3]
};
const long1 = Store.tradePreviewGeometry(candleInput);
const long2 = Store.tradePreviewGeometry(candleInput);
check('same input -> identical candle geometry',
  JSON.stringify(long1.candles) === JSON.stringify(long2.candles));
check('candles are generated', long1.valid && long1.candles.length > 0);
check('every candle price is finite',
  long1.candles.every(function (c) {
    return [c.o, c.h, c.l, c.c].every(Number.isFinite);
  }));
check('every candle y is normalised in [0, 1]',
  long1.candles.every(function (c) {
    return c.oY >= 0 && c.oY <= 1 && c.hY >= 0 && c.hY <= 1 &&
      c.lY >= 0 && c.lY <= 1 && c.cY >= 0 && c.cY <= 1;
  }));
check('every candle x is normalised in [0, 1]',
  long1.candles.every(function (c) { return c.x >= 0 && c.x <= 1; }));
function bodyInvariant(candles) {
  return candles.every(function (c) {
    return c.h >= Math.max(c.o, c.c) - 1e-9 && c.l <= Math.min(c.o, c.c) + 1e-9;
  });
}
check('Largo candle high >= body, low <= body', bodyInvariant(long1.candles));

const longFirst = long1.candles[0];
const longLast = long1.candles[long1.candles.length - 1];
check('Largo candles trend up toward the target', longLast.c > longFirst.c);

const shortGeo = Store.tradePreviewGeometry({
  entry: ENTRY, stopTicks: STOP_TICKS, tick: TICK, direction: 'Corto', ticksTP: [STOP_TICKS * 3]
});
const shortFirst = shortGeo.candles[0];
const shortLast = shortGeo.candles[shortGeo.candles.length - 1];
check('Corto candles trend down toward the target', shortLast.c < shortFirst.c);
check('Corto candle high >= body, low <= body', bodyInvariant(shortGeo.candles));
check('direction mirrors the candle colours',
  longFirst.up !== shortFirst.up);

/* A candle series is still produced without any take-profit distance. */
const noTp = Store.tradePreviewGeometry({
  entry: ENTRY, stopTicks: STOP_TICKS, tick: TICK, direction: 'Largo'
});
check('candles render with the default tick distances', noTp.valid && noTp.candles.length > 0);

/* ------------------------------------------------------------------ */
/* (d) The R/B label reflects the selected ratio                       */
/* ------------------------------------------------------------------ */

console.log('\n(d) The R/B label reflects the selected ratio');

const ratioLabelSrc = extractFunction(appSrc, 'function ratioLabel(value)');
const labelContext = vm.createContext({ console: console });
vm.runInContext(ratioLabelSrc + '\n;globalThis.ratioLabel = ratioLabel;', labelContext);
eq('ratioLabel(2) = "1:2"', labelContext.ratioLabel(2), '1:2');
eq('ratioLabel(2.5) = "1:2.5"', labelContext.ratioLabel(2.5), '1:2.5');
eq('ratioLabel(3) = "1:3"', labelContext.ratioLabel(3), '1:3');
eq('ratioLabel(4) = "1:4"', labelContext.ratioLabel(4), '1:4');

check('the preview R/B label uses the selected ratio',
  appSrc.indexOf("'R/B ' + ratioLabel(ratio)") !== -1);
check('the preview no longer renders a 2:1 – 3:1 range',
  appSrc.indexOf("join(' – ')") === -1);
check('the exit suggestion labels the selected ratio',
  appSrc.indexOf("'Salida sugerida — R/B ' + ratioLabel(ratio)") !== -1);

/* The selector itself is populated with the 5 ordered, labelled options. */
const fillRatioSrc = extractFunction(appSrc, 'function fillRatioSelect(select)');
function fakeOption() { return { value: '', textContent: '' }; }
const fakeDocument = { createElement: function () { return fakeOption(); } };
const fakeSelect = {
  options: [],
  innerHTML: '',
  value: '',
  appendChild: function (opt) { this.options.push(opt); }
};
const fillContext = vm.createContext({ console: console, Store: Store, document: fakeDocument });
vm.runInContext(
  ratioLabelSrc + '\n' + fillRatioSrc +
  '\n;globalThis.fillRatioSelect = fillRatioSelect;',
  fillContext
);
fillContext.fillRatioSelect(fakeSelect);
eq('the selector has 5 options', fakeSelect.options.length, 5);
eq('the options are labelled 1:2 … 1:4',
  fakeSelect.options.map(function (o) { return o.textContent; }).join(','),
  '1:2,1:2.5,1:3,1:3.5,1:4');
eq('the selector defaults to 1:2', fakeSelect.value, '2');

/* ------------------------------------------------------------------ */
/* (e) No USD "Objetivo" input remains in the markup                   */
/* ------------------------------------------------------------------ */

console.log('\n(e) No USD Objetivo input remains');

check('the calculator exposes #riskRatio', htmlSrc.indexOf('id="riskRatio"') !== -1);
check('no "Objetivo (USD" label remains', htmlSrc.indexOf('Objetivo (USD') === -1);
check('no #riskTarget input remains', htmlSrc.indexOf('id="riskTarget"') === -1);
check('no #target input remains', htmlSrc.indexOf('id="target"') === -1);
check('no #targetSuggestion remains', htmlSrc.indexOf('id="targetSuggestion"') === -1);
check('no hardcoded 2:1 / 3:1 R/B copy remains in the UI',
  appSrc.indexOf('R/B 2:1') === -1 && appSrc.indexOf('R/B 3:1') === -1);

/* Structural wiring: the ratio reaches computeRisk, the draft and the preview. */
check('the calculator reads the ratio', appSrc.indexOf('const ratio = readRatio();') !== -1);
check('computeRisk receives the selected ratio',
  appSrc.indexOf('targetR: ratio') !== -1 && appSrc.indexOf('targetRAlt: ratio') !== -1);
check('the draft autofill receives the selected ratio',
  appSrc.indexOf('targetR: safeRatio') !== -1);
check('the preview receives the selected ratio', appSrc.indexOf('ratio: ratio') !== -1);
check('the preview plots a single ratio target', appSrc.indexOf('ticksTP: [stopTicks * ratio]') !== -1);

/* ------------------------------------------------------------------ */
/* (f) Migration safety: a legacy numeric USD target never crashes     */
/* ------------------------------------------------------------------ */

console.log('\n(f) Legacy numeric USD target is read defensively');

Store.clearAll();
Store.addTrade({
  tradeNumber: 1, account: 'Sim', instrument: 'MES', contracts: 1,
  strategy: 'vela-a-vela', direction: 'Largo',
  entryDate: '2026-01-05', entryTime: '09:30', entryPrice: 5000,
  exitDate: '2026-01-05', exitTime: '09:35', exitPrice: 5000,
  stop: 0, target: 500, plannedRisk: 0, exitType: 'Profit',
  emotion: 'Control', notes: ''
});
const savedLegacy = Store.getTrades()[0];
eq('the legacy numeric USD target is preserved', savedLegacy.target, 500);
check('computeAll tolerates the legacy target', Store.computeAll(Store.getTrades()).length === 1);
check('computeRR still reads the legacy target',
  Store.computeRR({ plannedRisk: 100, target: savedLegacy.target }).valid);
check('the R/B ratio does not depend on the legacy target',
  Store.ratioTarget({ instrument: 'MES', entryPrice: 5000, direction: 'Largo', ticks: 8, ratio: 3 }).targetPrice === 5006);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Ratio target + candlestick preview result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
