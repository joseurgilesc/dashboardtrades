/* test/process-dashboard-ui.test.js
 * UI-level VM harness for the PR 2 dashboard wiring:
 *   - structural: the Proceso/Resultados toggle, `data-view` tags, and the
 *     process-indicators + weekly-review readouts exist in index.html;
 *   - behavior: the REAL `renderDashboardView()` extracted from js/app.js
 *     toggles the `hidden` flag on `[data-view]` cards and the `active` flag
 *     on the toggle segments.
 *
 * No browser, no Firebase, no build step.
 * Run: node test/process-dashboard-ui.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

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
/* [1] Structural: index.html                                          */
/* ------------------------------------------------------------------ */

console.log('\n[1] Structural (index.html)');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function hasId(id) {
  return html.indexOf('id="' + id + '"') !== -1;
}

function tagOf(id) {
  const m = html.match(new RegExp('<[^>]+id="' + id + '"[^>]*>'));
  return m ? m[0] : '';
}

function dataViewOf(id) {
  const tag = tagOf(id);
  const m = tag.match(/data-view="([^"]+)"/);
  return m ? m[1] : null;
}

check('toggle container exists', hasId('dashboardViewToggle'));
check('toggle has a proceso segment', /<button[^>]*data-view="proceso"[^>]*>/.test(html));
check('toggle has a resultados segment', /<button[^>]*data-view="resultados"[^>]*>/.test(html));

/* Proceso cards (indicators + weekly review stay behind the toggle). */
eq('processIndicatorsCard is proceso', dataViewOf('processIndicatorsCard'), 'proceso');
eq('weeklyReviewCard is proceso', dataViewOf('weeklyReviewCard'), 'proceso');

/* Gamification cards are always visible (no data-view), not part of the toggle. */
eq('level-hero is always-visible', dataViewOf('level-hero'), null);
eq('disciplineCard is always-visible', dataViewOf('disciplineCard'), null);
eq('achievementsCard is always-visible', dataViewOf('achievementsCard'), null);
eq('weeklyRecapCard is always-visible', dataViewOf('weeklyRecapCard'), null);

/* Resultados cards. */
eq('outcomeCard is resultados', dataViewOf('outcomeCard'), 'resultados');
check('chart-hero is resultados',
  /class="[^"]*\bchart-hero\b[^"]*"[^>]*data-view="resultados"/.test(html));
check('kpi-grid is resultados',
  /class="[^"]*\bkpi-grid\b[^"]*"[^>]*data-view="resultados"/.test(html));
check('charts-grid is resultados',
  /class="[^"]*\bcharts-grid\b[^"]*"[^>]*data-view="resultados"/.test(html));

/* Process-indicator readouts. */
['procPlanRegistered', 'procRespected', 'procGoalCompliance',
  'procSessionsReviewed', 'procPatterns'].forEach(function (id) {
  check('process indicator id exists: ' + id, hasId(id));
});

/* Weekly-review controls. */
['weeklyReviewRange', 'btnReviewPrevWeek', 'btnReviewNextWeek', 'weeklyBest',
  'weeklyWorst', 'weeklyRepeat', 'weeklyDeviationTrigger', 'weeklyNextGoal',
  'btnSaveWeeklyReview'].forEach(function (id) {
  check('weekly-review id exists: ' + id, hasId(id));
});

/* ------------------------------------------------------------------ */
/* [2] Toggle behavior: the real renderDashboardView()                 */
/* ------------------------------------------------------------------ */

console.log('\n[2] Toggle behavior (renderDashboardView)');

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

const renderDashboardViewSrc = extractFunction(appSrc, 'function renderDashboardView()');

function makeCard(dataView) {
  return {
    hidden: false,
    dataView: dataView,
    getAttribute: function (name) { return name === 'data-view' ? this.dataView : null; }
  };
}

function makeButton(dataView) {
  const btn = {
    dataView: dataView,
    active: false,
    pressed: null,
    getAttribute: function (name) { return name === 'data-view' ? this.dataView : null; },
    classList: {
      toggle: function (name, on) { if (name === 'active') btn.active = !!on; }
    },
    setAttribute: function (name, value) { if (name === 'aria-pressed') btn.pressed = value; }
  };
  return btn;
}

const proBtn = makeButton('proceso');
const resBtn = makeButton('resultados');
const toggle = { querySelectorAll: function () { return [proBtn, resBtn]; } };

const levelHero = makeCard('proceso');
const kpiGrid = makeCard('resultados');
const procCard = makeCard('proceso');
const cards = [levelHero, kpiGrid, procCard];

const uiContext = vm.createContext({
  console: console,
  state: { dashboardView: 'resultados' },
  $: function (id) { return id === 'dashboardViewToggle' ? toggle : null; },
  document: { querySelectorAll: function () { return cards; } }
});

vm.runInContext(renderDashboardViewSrc, uiContext, { filename: 'render-dashboard-view.js' });

/* Default view = resultados. */
uiContext.renderDashboardView();
check('default hides proceso cards', levelHero.hidden === true && procCard.hidden === true);
check('default shows resultados cards', kpiGrid.hidden === false);
check('default marks resultados segment active', resBtn.active === true && proBtn.active === false);

/* Switch to proceso. */
uiContext.state.dashboardView = 'proceso';
uiContext.renderDashboardView();
check('proceso shows proceso cards', levelHero.hidden === false && procCard.hidden === false);
check('proceso hides resultados cards', kpiGrid.hidden === true);
check('proceso marks proceso segment active', proBtn.active === true && resBtn.active === false);
check('proceso sets aria-pressed', proBtn.pressed === 'true' && resBtn.pressed === 'false');

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Process dashboard UI result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
