/* test/calculator-tab.test.js
 * VM harness for the Calculadora tab split and the per-trade plan detail row.
 *
 * Loads the REAL js/instruments.js + js/store.js + js/app.js + index.html, then
 * extracts the REAL `tradePlanSvg`, `entryOnlyPlanSvg`, `riskPreviewSvg`,
 * `decimalsForTick`, `escapeHtml` and `formatTicks` functions from js/app.js
 * (brace-matched, not re-implemented) and runs `tradePlanSvg` against a saved
 * trade. Structural checks read index.html / app.js directly. No browser, no
 * Firebase, no build step.
 *
 * Proves:
 *   [1] the Calculadora top-level tab is gone and the Registro sub-toggle
 *       (#registroSubTab) exists;
 *   [2] switchTab's tab list is reverted to registro/dashboard/ajustes;
 *   [3] the calculator card (riskInstrument/riskPreview/instrumentInfo) lives
 *       inside #tab-registro, which sits before #tradeForm in DOM order;
 *   [4] #riskInstrument still precedes #tradeForm (sync structural invariant);
 *   [5] the detail-row wiring (tradePlanDetailRowHtml + toggleTradePlan + Plan
 *       button + toggle-plan delegation) is present;
 *   [6] tradePlanSvg degrades: no-entry -> empty, entry-only -> single level +
 *       note, stop-no-exit -> entry+stop no target + note, full plan -> target.
 *
 * Run: node test/calculator-tab.test.js
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

/* ------------------------------------------------------------------ */
/* Extract the real functions from app.js (brace matching)             */
/* ------------------------------------------------------------------ */

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

const extracted = [
  extractFunction(appSrc, 'function tradePlanSvg(trade)'),
  extractFunction(appSrc, 'function entryOnlyPlanSvg(plan, instrument)'),
  extractFunction(appSrc, 'function riskPreviewSvg(geometry, ctx)'),
  extractFunction(appSrc, 'function decimalsForTick(tick)'),
  extractFunction(appSrc, 'function escapeHtml(value)'),
  extractFunction(appSrc, 'function formatTicks(value)')
].join('\n');

/* ------------------------------------------------------------------ */
/* Real Store (instruments + store) in its own context                 */
/* ------------------------------------------------------------------ */

const storeContext = vm.createContext({ console: console });
vm.runInContext(
  instrumentsSrc + '\n' + storeSrc +
  '\n;globalThis.Store = Store; globalThis.INSTRUMENTS = INSTRUMENTS;',
  storeContext,
  { filename: 'store-bundle.js' }
);
const Store = storeContext.Store;

/* ------------------------------------------------------------------ */
/* Extracted plan functions in a bare context (Store + primitives)     */
/* ------------------------------------------------------------------ */

const uiContext = vm.createContext({
  console: console,
  Store: Store,
  Number: Number,
  Math: Math,
  String: String
});
vm.runInContext(extracted, uiContext, { filename: 'app-plan-functions.js' });

/* ------------------------------------------------------------------ */
/* [1] Calculadora top-level tab is gone; Registro sub-toggle exists   */
/* ------------------------------------------------------------------ */

console.log('\n[1] Calculadora top-level tab is gone; Registro sub-toggle exists');

check('no data-tab="calculadora" nav button remains', htmlSrc.indexOf('data-tab="calculadora"') === -1);
check('no #tab-calculadora section remains', htmlSrc.indexOf('id="tab-calculadora"') === -1);
check('the #registroSubTab sub-toggle exists', htmlSrc.indexOf('id="registroSubTab"') !== -1);
check('the sub-toggle exposes data-sub="formulario" and data-sub="calculadora"',
  htmlSrc.indexOf('data-sub="formulario"') !== -1 &&
  htmlSrc.indexOf('data-sub="calculadora"') !== -1);

/* ------------------------------------------------------------------ */
/* [2] switchTab list reverts to the three top-level tabs              */
/* ------------------------------------------------------------------ */

console.log('\n[2] switchTab toggles only the three top-level tabs');

const switchTabSrc = extractFunction(appSrc, 'function switchTab(tab)');
check('switchTab list drops "calculadora"',
  switchTabSrc.indexOf("'calculadora'") === -1);
check('switchTab list keeps registro/dashboard/ajustes',
  switchTabSrc.indexOf("'registro'") !== -1 &&
  switchTabSrc.indexOf("'dashboard'") !== -1 &&
  switchTabSrc.indexOf("'ajustes'") !== -1);
check('app.js defines switchRegistroSub', appSrc.indexOf('function switchRegistroSub(sub)') !== -1);

/* ------------------------------------------------------------------ */
/* [3] The calculator card lives inside #tab-registro (before the form) */
/* ------------------------------------------------------------------ */

console.log('\n[3] Calculator card is inside #tab-registro');

const regTabIdx = htmlSrc.indexOf('id="tab-registro"');
const riskIdx = htmlSrc.indexOf('id="riskInstrument"');
const previewIdx = htmlSrc.indexOf('id="riskPreview"');
const infoIdx = htmlSrc.indexOf('id="instrumentInfo"');
const formIdx = htmlSrc.indexOf('id="tradeForm"');
const calcCardIdx = htmlSrc.indexOf('id="calculatorCard"');

check('#calculatorCard lives inside #tab-registro',
  calcCardIdx !== -1 && regTabIdx !== -1 && regTabIdx < calcCardIdx);
check('#riskInstrument is inside #tab-registro',
  riskIdx !== -1 && regTabIdx !== -1 && regTabIdx < riskIdx);
check('#riskPreview is inside #tab-registro',
  previewIdx !== -1 && regTabIdx !== -1 && regTabIdx < previewIdx);
check('#instrumentInfo is inside #tab-registro',
  infoIdx !== -1 && regTabIdx !== -1 && regTabIdx < infoIdx);

/* Registro keeps its content: the form and trades list stay after Registro. */
check('#tradeForm remains in Registro (after #tab-registro)',
  formIdx !== -1 && regTabIdx !== -1 && regTabIdx < formIdx);
check('the daily goal card remains in Registro',
  htmlSrc.indexOf('id="dailyGoalCard"') !== -1 && regTabIdx < htmlSrc.indexOf('id="dailyGoalCard"'));

/* ------------------------------------------------------------------ */
/* [4] #riskInstrument still precedes #tradeForm                       */
/* ------------------------------------------------------------------ */

console.log('\n[4] Cross-view sync structural invariant');

check('#riskInstrument precedes #tradeForm in DOM',
  riskIdx !== -1 && formIdx !== -1 && riskIdx < formIdx);

/* ------------------------------------------------------------------ */
/* [5] Detail-row wiring                                               */
/* ------------------------------------------------------------------ */

console.log('\n[5] Detail-row wiring (buildTradeRows / tradeRowHtml / delegation)');

check('app.js defines tradePlanDetailRowHtml', appSrc.indexOf('tradePlanDetailRowHtml') !== -1);
check('app.js defines tradePlanSvg', appSrc.indexOf('function tradePlanSvg(trade)') !== -1);
check('app.js defines toggleTradePlan', appSrc.indexOf('function toggleTradePlan(id)') !== -1);
check('buildTradeRows pushes the detail row', extractFunction(appSrc, 'function buildTradeRows(rows)').indexOf('tradePlanDetailRowHtml(t)') !== -1);
check('each row exposes a Plan toggle button', appSrc.indexOf('data-action="toggle-plan"') !== -1);
check('the tradesBody delegation handles toggle-plan', appSrc.indexOf("'toggle-plan'") !== -1);
check('toggle-plan calls toggleTradePlan(id)', appSrc.indexOf('toggleTradePlan(id)') !== -1);
check('detail rows are hidden by default',
  extractFunction(appSrc, 'function tradePlanDetailRowHtml(t)').indexOf(' hidden') !== -1);

/* ------------------------------------------------------------------ */
/* [6] tradePlanSvg degradation                                       */
/* ------------------------------------------------------------------ */

console.log('\n[6] tradePlanSvg degradation (entry-only / stop-no-exit / no-entry)');

/* ES tick 0.25. */
const full = uiContext.tradePlanSvg({
  entryPrice: 4800, stop: 4798, exitPrice: 4804, instrument: 'ES', direction: 'Largo'
});
check('full plan produces an SVG', full.svg.length > 0);
check('full plan shows a target level', full.svg.indexOf('Target (Limit)') !== -1);
eq('full plan needs no note', full.note, '');

const entryOnly = uiContext.tradePlanSvg({
  entryPrice: 4800, instrument: 'ES', direction: 'Largo'
});
check('entry-only produces a (minimal) SVG', entryOnly.svg.length > 0);
check('entry-only shows the entry level', entryOnly.svg.indexOf('Entry (Market)') !== -1);
check('entry-only never fabricates a stop', entryOnly.svg.indexOf('Stop Loss') === -1);
check('entry-only never fabricates a target', entryOnly.svg.indexOf('Target (Limit)') === -1);
check('entry-only emits a note', entryOnly.note.length > 0);

const stopNoExit = uiContext.tradePlanSvg({
  entryPrice: 4800, stop: 4798, instrument: 'ES', direction: 'Largo'
});
check('stop-no-exit produces an SVG', stopNoExit.svg.length > 0);
check('stop-no-exit shows entry + stop', stopNoExit.svg.indexOf('Entry (Market)') !== -1 && stopNoExit.svg.indexOf('Stop Loss (Stop Market)') !== -1);
check('stop-no-exit never fabricates a target', stopNoExit.svg.indexOf('Target (Limit)') === -1);
check('stop-no-exit emits a note', stopNoExit.note.length > 0);

const noEntry = uiContext.tradePlanSvg({
  stop: 4798, instrument: 'ES', direction: 'Largo'
});
eq('no-entry emits no SVG', noEntry.svg, '');
eq('no-entry emits no note', noEntry.note, '');

/* ------------------------------------------------------------------ */
/* [7] Readouts: ticks↔points line + stop reference                    */
/* ------------------------------------------------------------------ */

console.log('\n[7] Readouts (#instrumentTicksPoints + #riskStopReference)');

/* The math the two readouts display, from the REAL Store helpers. */
eq('ticksToPoints(1, ES) = 0.25 puntos', Store.ticksToPoints(1, 'ES'), 0.25);
eq('pointsToTicks(1, ES) = 4 ticks', Store.pointsToTicks(1, 'ES'), 4);
eq('ticksToPoints(1, YM) = 1 punto', Store.ticksToPoints(1, 'YM'), 1);
eq('pointsToTicks(1, YM) = 1 tick', Store.pointsToTicks(1, 'YM'), 1);
eq('stop reference: ticksToPoints(8, ES) = 2 puntos', Store.ticksToPoints(8, 'ES'), 2);
check('ticksToPoints(1, unknown) is NaN (never fabricates points)',
  Number.isNaN(Store.ticksToPoints(1, 'NOPE')));

/* #riskStopReference: a static row wired into renderRiskPanel + reset list. */
check('#riskStopReference exists in the markup',
  htmlSrc.indexOf('id="riskStopReference"') !== -1);
const stopRefIdx = htmlSrc.indexOf('id="riskStopReference"');
const rbGroupIdx = htmlSrc.indexOf('Objetivo y R/B');
check('#riskStopReference sits in the "Objetivo y R/B" result group',
  stopRefIdx !== -1 && rbGroupIdx !== -1 && stopRefIdx > rbGroupIdx);
const renderRiskSrc = extractFunction(appSrc, 'function renderRiskPanel()');
check('renderRiskPanel renders #riskStopReference from ticksSL + points',
  renderRiskSrc.indexOf("setRiskItem('riskStopReference'") !== -1 &&
  renderRiskSrc.indexOf('ticksToPoints(risk.ticksSL') !== -1);
check('#riskStopReference is in the result reset list (resets with the others)',
  renderRiskSrc.indexOf("'riskStopReference'") !== -1 &&
  renderRiskSrc.indexOf('resultIds') !== -1);

/* #instrumentTicksPoints: emitted by renderInstrumentInfo, hidden when invalid. */
const renderInfoSrc = extractFunction(appSrc, 'function renderInstrumentInfo()');
check('renderInstrumentInfo emits #instrumentTicksPoints',
  renderInfoSrc.indexOf('id="instrumentTicksPoints"') !== -1);
check('renderInstrumentInfo derives it from ticksToPoints/pointsToTicks(1, instrument)',
  renderInfoSrc.indexOf('ticksToPoints(1, id)') !== -1 &&
  renderInfoSrc.indexOf('pointsToTicks(1, id)') !== -1);
check('renderInstrumentInfo hides the line on an invalid tick (NaN guard)',
  renderInfoSrc.indexOf('Number.isFinite(pointsPerTick)') !== -1 &&
  renderInfoSrc.indexOf('Number.isFinite(ticksPerPoint)') !== -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Calculator tab result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
