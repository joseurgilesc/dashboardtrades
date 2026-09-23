/* test/stop-per-operation.test.js
 * VM harness for the per-operation vs whole-day stop distinction.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context for the
 * pure math, then extracts the REAL `renderRiskPanel` (and its collaborators)
 * from js/app.js to prove the UI renders the SAME numbers against a tiny fake
 * DOM. No browser, no Firebase, no build step.
 *
 * Proves:
 *   [1] the per-operation stop ticks equal `maxTicksForOneContract`, derived
 *       from the per-trade budget (dailyBudget / tradesPerDay);
 *   [2] the whole-day stop total equals that SAME source scaled by
 *       `tradesPerDay` (perOpTicks * tradesPerDay);
 *   [3] both the per-operation and the day figures CHANGE with trades/day;
 *   [4] the rendered UI shows both rows and keeps them distinct (labels +
 *       values);
 *   [5] structural: the stop field is labelled "por operación" and the SVG
 *       favicon is referenced with a RELATIVE path.
 *
 * Run: node test/stop-per-operation.test.js
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
const faviconSrc = fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8');

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
const INSTRUMENTS = storeContext.INSTRUMENTS;

function tickValue(id) {
  const spec = INSTRUMENTS[id];
  return spec.tick * spec.pointValue;
}

/* Per-operation ticks: the budget-derived max stop one contract can afford.
 * `budgetStopTicks` is the SAME resolver the AUTO stop default uses. */
function perOpTicks(instrument, balance, riskPct, tradesPerDay) {
  return Store.budgetStopTicks({
    instrument: instrument, balance: balance, riskPct: riskPct, tradesPerDay: tradesPerDay
  });
}

/* Whole-day total: the SAME per-operation source scaled by trades/day. */
function dayTicks(instrument, balance, riskPct, tradesPerDay) {
  return perOpTicks(instrument, balance, riskPct, tradesPerDay) * tradesPerDay;
}

/* ------------------------------------------------------------------ */
/* [1] Per-operation ticks == maxTicksForOneContract                   */
/* ------------------------------------------------------------------ */

console.log('\n[1] Per-operation ticks equal maxTicksForOneContract');

const BAL = 100000;
const RISK = 2;
const MES_TV = tickValue('MES');

const perOp3 = perOpTicks('MES', BAL, RISK, 3);
const risk3 = Store.computeRisk({
  balance: BAL, capital: BAL, riskPct: RISK, tradesPerDay: 3,
  instrument: 'MES', stopTicks: perOp3
});

console.log('  dailyBudget      = $' + risk3.dailyBudget.toFixed(2));
console.log('  perTradeBudget   = $' + risk3.perTradeBudget.toFixed(2) + ' (dailyBudget / 3)');
console.log('  MES tickValue    = $' + MES_TV.toFixed(2));
console.log('  per-op ticks     = ' + perOp3 + '  (floor(' + risk3.perTradeBudget.toFixed(2) + ' / ' + MES_TV + '))');
console.log('  day total (3 op) = ' + dayTicks('MES', BAL, RISK, 3) + ' ticks');

eq('dailyBudget = (riskPct/100) x balance = 2000', risk3.dailyBudget, 2000);
close('perTradeBudget = dailyBudget / tradesPerDay', risk3.perTradeBudget, 2000 / 3, 1e-9);
eq('per-operation ticks == maxTicksForOneContract', perOp3, risk3.maxTicksForOneContract);
eq('per-operation ticks == floor(perTradeBudget / tickValue)',
  perOp3, Math.floor(risk3.perTradeBudget / MES_TV));
eq('per-operation ticks for MES 100k/2%/3 = 533', perOp3, 533);

/* ------------------------------------------------------------------ */
/* [2] Day total == the same source scaled by tradesPerDay             */
/* ------------------------------------------------------------------ */

console.log('\n[2] Day total = per-operation ticks x tradesPerDay');

eq('day total for 3 op = 533 x 3 = 1599', dayTicks('MES', BAL, RISK, 3), 1599);
eq('day total derives from the SAME source',
  dayTicks('MES', BAL, RISK, 3), perOp3 * 3);
eq('the USD daily risk budget is the same dailyBudget',
  risk3.dailyBudget, (RISK / 100) * BAL);

/* The per-operation and day rows can never be confused: 533 vs 1599. */
check('per-operation and day totals are different numbers', perOp3 !== dayTicks('MES', BAL, RISK, 3));

/* ------------------------------------------------------------------ */
/* [3] Both figures change with trades/day                             */
/* ------------------------------------------------------------------ */

console.log('\n[3] Both figures change with trades/day');

const perOp1 = perOpTicks('MES', BAL, RISK, 1);
const day1 = dayTicks('MES', BAL, RISK, 1);
const perOp6 = perOpTicks('MES', BAL, RISK, 6);
const day6 = dayTicks('MES', BAL, RISK, 6);

console.log('  1 op/day -> per-op ' + perOp1 + ' ticks | day ' + day1 + ' ticks');
console.log('  3 op/day -> per-op ' + perOp3 + ' ticks | day ' + dayTicks('MES', BAL, RISK, 3) + ' ticks');
console.log('  6 op/day -> per-op ' + perOp6 + ' ticks | day ' + day6 + ' ticks');

eq('1 op/day -> per-op 1600 ticks', perOp1, 1600);
eq('6 op/day -> per-op 266 ticks', perOp6, 266);
check('per-operation ticks change with trades/day', perOp1 !== perOp3 && perOp3 !== perOp6);
check('day total changes with trades/day', day1 !== dayTicks('MES', BAL, RISK, 3) && dayTicks('MES', BAL, RISK, 3) !== day6);
check('day total still equals per-op x trades/day for every count',
  day1 === perOp1 * 1 && day6 === perOp6 * 6);

/* A different instrument changes both figures too (same budget source). */
const esPerOp = perOpTicks('ES', BAL, RISK, 3);
check('a different instrument changes the per-operation ticks', esPerOp !== perOp3);
eq('ES per-operation ticks = floor((2000/3) / 12.5) = 53', esPerOp, 53);
eq('ES day total = 53 x 3 = 159', dayTicks('ES', BAL, RISK, 3), 159);

/* ------------------------------------------------------------------ */
/* [4] The rendered UI shows both rows, distinct                       */
/* ------------------------------------------------------------------ */

console.log('\n[4] renderRiskPanel renders per-operation AND day rows');

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
  extractFunction(appSrc, 'function syncInstrument(value)'),
  extractFunction(appSrc, 'function clampDailyRiskPct(value)'),
  extractFunction(appSrc, 'function renderRiskPanel()'),
  extractFunction(appSrc, 'function activeAccount()')
].join('\n');

const elements = {};
function makeElement() {
  const el = {
    value: '',
    hidden: false,
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    addEventListener: function () {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    appendChild: function () {},
    removeChild: function () {},
    focus: function () {}
  };
  return el;
}
function $(id) {
  if (!elements[id]) elements[id] = makeElement();
  return elements[id];
}

const uiContext = vm.createContext({
  console: console,
  Store: Store,
  INSTRUMENTS: INSTRUMENTS,
  DEFAULT_INSTRUMENT: storeContext.DEFAULT_INSTRUMENT,
  ACCOUNTS: ['Sim', 'Real', 'Fondeo'],
  DEFAULT_RISK_PCT: 2,
  DEFAULT_DAILY_TRADE_LIMIT: 3,
  DAILY_DD_WARN_PCT: 5,
  STREAK_WARN: 3,
  state: { editingId: null },
  $: $
});

const stubs = [
  'var lastRiskAccount = null;',
  'var stopTicksTouched = false;',
  'var tradesPerDayTouched = false;',
  'var contractsTouched = false;',
  'var touchedFields = { stop: false, exitPrice: false };',
  'var riskItems = {};',
  'function instrumentMeta(id) { return INSTRUMENTS[id] || null; }',
  'function setRiskItem(id, text, cls) { riskItems[id] = { text: text, cls: cls || "" }; }',
  'function formatMoney(v) { return String(v); }',
  'function formatNumber(v, d) { return String(v); }',
  'function formatTicks(v) { return String(v) + " ticks"; }',
  'function renderRiskMarketTable() {}',
  'function renderPriceSuggestions() {}',
  'function renderRiskPreview() {}',
  'function riskBlockMessage() { return "blocked"; }',
  'function readRatio() { var el = $("riskRatio"); var n = el ? parseFloat(el.value) : NaN; return (isFinite(n) && n > 0) ? n : 2; }',
  'function ratioLabel(v) { return "1:" + v; }'
].join('\n');

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-stop-per-operation-functions.js' });

/* Seed the fake DOM. Default balance for Sim is 5000, so 2% -> $100/day. */
$('account').value = 'Sim';
$('instrument').value = 'MES';
$('riskInstrument').value = 'MES';
$('direction').value = 'Largo';
$('entryPrice').value = '5000';
$('riskRatio').value = '2';
$('riskDailyPctInput').value = '2';
$('riskTradesPerDayInput').value = '3';

uiContext.stopTicksTouched = false;
uiContext.renderRiskPanel();

function riskText(id) { return (uiContext.riskItems[id] || {}).text; }

console.log('  MES 5000/2%/3 -> per-op "' + riskText('riskMaxTicks') + '" | day "' + riskText('riskStopDaily') + '"');
eq('UI per-operation row = 26 ticks', riskText('riskMaxTicks'), '26 ticks');
eq('UI day row = 26 x 3 = 78 ticks (3 op)', riskText('riskStopDaily'), '78 ticks · 3 op');

/* Change trades/day: both rows move, still tied to the same source. */
$('riskTradesPerDayInput').value = '1';
uiContext.renderRiskPanel();
console.log('  MES 5000/2%/1 -> per-op "' + riskText('riskMaxTicks') + '" | day "' + riskText('riskStopDaily') + '"');
eq('UI per-operation row follows trades/day = 80 ticks', riskText('riskMaxTicks'), '80 ticks');
eq('UI day row follows trades/day = 80 x 1', riskText('riskStopDaily'), '80 ticks · 1 op');
check('both UI rows changed with trades/day',
  riskText('riskMaxTicks') === '80 ticks' && riskText('riskStopDaily') === '80 ticks · 1 op');

/* Invalid input still blanks the day row (no stale numbers). */
$('riskTradesPerDayInput').value = '3';
$('riskDailyPctInput').value = '2';
$('instrument').value = '';
$('riskInstrument').value = '';
uiContext.renderRiskPanel();
eq('missing instrument blanks the day row', riskText('riskStopDaily'), '—');

/* ------------------------------------------------------------------ */
/* [5] Structural: labels + relative favicon                           */
/* ------------------------------------------------------------------ */

console.log('\n[5] Structural: per-operation label + relative SVG favicon');

check('stop field is labelled "por operación"',
  htmlSrc.indexOf('Distancia del stop (ticks) — por operación') !== -1);
check('day row #riskStopDaily exists in the markup',
  htmlSrc.indexOf('id="riskStopDaily"') !== -1);
check('per-operation row #riskMaxTicks exists in the markup',
  htmlSrc.indexOf('id="riskMaxTicks"') !== -1);
check('day total is derived from maxTicksForOneContract x tradesPerDay in app.js',
  appSrc.indexOf('risk.maxTicksForOneContract * tradesPerDay') !== -1);
check('app.js writes the day row via setRiskItem',
  appSrc.indexOf("setRiskItem('riskStopDaily'") !== -1);
check('day row is reset with the other results when input is invalid',
  appSrc.indexOf("'riskStopDaily'") !== -1 &&
  extractFunction(appSrc, 'function renderRiskPanel()').indexOf('resultIds') !== -1);

/* Favicon: a real SVG, referenced by a RELATIVE path, no CDN. */
check('favicon.svg exists and starts with <svg',
  faviconSrc.trim().indexOf('<svg') === 0);
check('favicon.svg is closed', faviconSrc.indexOf('</svg>') !== -1);
check('favicon.svg has a 32x32 viewBox', faviconSrc.indexOf('viewBox="0 0 32 32"') !== -1);
check('index.html links the SVG favicon',
  htmlSrc.indexOf('<link rel="icon" type="image/svg+xml" href="favicon.svg">') !== -1);
check('index.html adds an alternate-icon fallback',
  htmlSrc.indexOf('<link rel="alternate icon" href="favicon.svg">') !== -1);
check('the favicon href is relative (no leading slash)',
  htmlSrc.indexOf('href="/favicon.svg"') === -1);
check('the favicon is not an external/CDN URL',
  htmlSrc.indexOf('rel="icon"') !== -1 &&
  htmlSrc.slice(htmlSrc.indexOf('rel="icon"'), htmlSrc.indexOf('rel="icon"') + 80).indexOf('http') === -1);

/* ------------------------------------------------------------------ */
/* [6] Gain term widens the stop only when available binds             */
/* ------------------------------------------------------------------ */

console.log('\n[6] Gain-adjusted available widens the stop (single source)');

/* budgetStopTicks reads the SAME available the calculator sizes from. */
eq('available 50 binds -> 40 ticks',
  Store.budgetStopTicks({ instrument: 'MES', balance: 10000, riskPct: 2, tradesPerDay: 1, available: 50 }), 40);
eq('available 100 binds -> 80 ticks',
  Store.budgetStopTicks({ instrument: 'MES', balance: 10000, riskPct: 2, tradesPerDay: 1, available: 100 }), 80);
eq('available 500 does not bind -> still 160 ticks',
  Store.budgetStopTicks({ instrument: 'MES', balance: 10000, riskPct: 2, tradesPerDay: 1, available: 500 }), 160);

/* Both consumers agree on the same available (no drift). */
const sharedAvailable = 120;
const sharedStop = Store.budgetStopTicks({ instrument: 'MES', balance: 10000, riskPct: 2, tradesPerDay: 1, available: sharedAvailable });
const sharedRisk = Store.computeRisk({ balance: 10000, capital: 10000, riskPct: 2, tradesPerDay: 1, instrument: 'MES', stopTicks: sharedStop, available: sharedAvailable });
check('budgetStopTicks and computeRisk read the same available',
  sharedStop === Math.floor(sharedAvailable / MES_TV) &&
  sharedRisk.effectiveBudget === sharedAvailable &&
  sharedRisk.maxTicksForOneContract === sharedStop);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Stop per-operation vs daily result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
