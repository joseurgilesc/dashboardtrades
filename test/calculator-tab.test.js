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
 *   [1] the Calculadora nav button and #tab-calculadora section exist;
 *   [2] switchTab's tab list includes 'calculadora';
 *   [3] the calculator card (riskInstrument/riskPreview) lives inside
 *       #tab-calculadora, which sits BEFORE #tab-registro in DOM order;
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
/* [1] Nav button + #tab-calculadora exist                             */
/* ------------------------------------------------------------------ */

console.log('\n[1] Calculadora tab button and section');

check('nav exposes a data-tab="calculadora" button', htmlSrc.indexOf('data-tab="calculadora"') !== -1);
check('the Calculadora nav button is labelled "Calculadora"',
  /data-tab="calculadora"[^>]*>\s*Calculadora\s*</.test(htmlSrc));
check('a #tab-calculadora section exists', htmlSrc.indexOf('id="tab-calculadora"') !== -1);

/* ------------------------------------------------------------------ */
/* [2] switchTab list includes 'calculadora'                           */
/* ------------------------------------------------------------------ */

console.log('\n[2] switchTab toggles the Calculadora tab');

const switchTabSrc = extractFunction(appSrc, 'function switchTab(tab)');
check('switchTab list includes "calculadora"',
  switchTabSrc.indexOf("'calculadora'") !== -1);

/* ------------------------------------------------------------------ */
/* [3] The calculator card lives inside #tab-calculadora (before Registro) */
/* ------------------------------------------------------------------ */

console.log('\n[3] Calculator card is inside #tab-calculadora');

const calcTabIdx = htmlSrc.indexOf('id="tab-calculadora"');
const regTabIdx = htmlSrc.indexOf('id="tab-registro"');
const riskIdx = htmlSrc.indexOf('id="riskInstrument"');
const previewIdx = htmlSrc.indexOf('id="riskPreview"');
const infoIdx = htmlSrc.indexOf('id="instrumentInfo"');
const formIdx = htmlSrc.indexOf('id="tradeForm"');

check('#tab-calculadora sits BEFORE #tab-registro in DOM',
  calcTabIdx !== -1 && regTabIdx !== -1 && calcTabIdx < regTabIdx);
check('#riskInstrument is inside #tab-calculadora (after section, before Registro)',
  calcTabIdx !== -1 && riskIdx !== -1 && regTabIdx !== -1 && calcTabIdx < riskIdx && riskIdx < regTabIdx);
check('#riskPreview is inside #tab-calculadora',
  previewIdx !== -1 && calcTabIdx !== -1 && calcTabIdx < previewIdx && previewIdx < regTabIdx);
check('#instrumentInfo is inside #tab-calculadora',
  infoIdx !== -1 && calcTabIdx !== -1 && calcTabIdx < infoIdx && infoIdx < regTabIdx);

/* Registro keeps its content: the form and trades list stay after Registro. */
check('#tradeForm remains in Registro (after #tab-registro)',
  formIdx !== -1 && regTabIdx !== -1 && regTabIdx < formIdx);
check('the daily goal card remains in Registro',
  htmlSrc.indexOf('id="dailyGoalCard"') !== -1 && regTabIdx < htmlSrc.indexOf('id="dailyGoalCard"'));

/* ------------------------------------------------------------------ */
/* [4] #riskInstrument still precedes #tradeForm                       */
/* ------------------------------------------------------------------ */

console.log('\n[4] Cross-tab sync structural invariant');

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
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Calculator tab result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
