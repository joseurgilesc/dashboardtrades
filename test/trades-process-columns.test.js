/* test/trades-process-columns.test.js
 * VM harness for the PR 3 trades-list process columns (user request #5):
 *   - structural: the four new column headers exist in js/app.js's TABLE_COLUMNS;
 *   - structural: the row renderer/enrichment wire the store helpers;
 *   - behavior: the REAL store helpers produce the per-trade values;
 *   - behavior: withProcessColumns() + tradeRowHtml() render ✓/— and numeric cells.
 *
 * No browser, no Firebase, no build step.
 * Run: node test/trades-process-columns.test.js
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
  check(name, actual === expected, 'expected ' + expected + ', got ' + actual);
}

const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const instrumentsSrc = fs.readFileSync(path.join(ROOT, 'js', 'instruments.js'), 'utf8');

/* ------------------------------------------------------------------ */
/* [1] Structural: TABLE_COLUMNS headers                               */
/* ------------------------------------------------------------------ */

console.log('\n[1] Structural (TABLE_COLUMNS headers)');

const columnsMatch = /const TABLE_COLUMNS = \[([\s\S]*?)\];/.exec(appSrc);
const columnsSrc = columnsMatch ? columnsMatch[1] : '';

function hasColumn(key, label) {
  return columnsSrc.indexOf("key: '" + key + "'") !== -1 &&
    columnsSrc.indexOf("label: '" + label + "'") !== -1;
}

check('Plan column (key + label)', hasColumn('plan', 'Plan'));
check('Ejecución column (key + label)', hasColumn('execution', 'Ejecución'));
check('R real column (key + label)', hasColumn('rReal', 'R real'));
check('Riesgo column (key + label)', hasColumn('risk', 'Riesgo'));

/* ------------------------------------------------------------------ */
/* [2] Structural: row renderer wires the store helpers                */
/* ------------------------------------------------------------------ */

console.log('\n[2] Structural (store-helper wiring)');

check('Plan wired to Store.isPlanRegistered', appSrc.indexOf('Store.isPlanRegistered') !== -1);
check('Ejecución wired to Store.executionQualityScore', appSrc.indexOf('Store.executionQualityScore') !== -1);
check('R real wired to Store.realizedRResult', appSrc.indexOf('Store.realizedRResult') !== -1);
check('Riesgo wired to Store.riskRespectedList', appSrc.indexOf('Store.riskRespectedList') !== -1);

/* ------------------------------------------------------------------ */
/* [3] Behavior: the real store helpers                                */
/* ------------------------------------------------------------------ */

console.log('\n[3] Behavior (store helpers)');

const storeCtx = vm.createContext({ console: console });
vm.runInContext(
  instrumentsSrc + '\n' + storeSrc + '\n;globalThis.Store = Store;',
  storeCtx,
  { filename: 'store-bundle.js' }
);
const Store = storeCtx.Store;

let idSeq = 0;
function trade(over) {
  idSeq += 1;
  return Object.assign({
    id: 'p' + idSeq,
    tradeNumber: idSeq,
    account: 'Sim',
    instrument: 'NQ',
    contracts: 1,
    strategy: '',
    direction: 'Largo',
    entryDate: '2026-01-05',
    entryTime: '09:30',
    entryPrice: 100,
    exitDate: '2026-01-05',
    exitTime: '09:35',
    exitPrice: 100,
    stop: 0,
    target: 0,
    plannedRisk: 0,
    exitType: '',
    emotion: '',
    notes: '',
    respectedEntry: false,
    respectedStop: false,
    respectedSize: false,
    planDeviation: ''
  }, over || {});
}

eq('isPlanRegistered true', Store.isPlanRegistered(trade({ plannedRisk: 20, stop: 99, target: 60 })), true);
eq('isPlanRegistered false', Store.isPlanRegistered(trade({ plannedRisk: 0, stop: 0, target: 0 })), false);

eq('executionQualityScore all respected -> 3',
  Store.executionQualityScore(trade({ respectedEntry: true, respectedStop: true, respectedSize: true, planDeviation: '' })), 3);
eq('executionQualityScore deviation subtracts 1',
  Store.executionQualityScore(trade({ respectedEntry: true, respectedStop: false, respectedSize: true, planDeviation: 'Salir antes' })), 1);

const realized = trade({ entryPrice: 100, exitPrice: 102, stop: 99, contracts: 1 });
check('realizedRResult finite for a recorded stop', Number.isFinite(Store.realizedRResult(realized)));
check('realizedRResult equals net / tradeRiskUsd',
  Math.abs(Store.realizedRResult(realized) - (Store.computeTrade(realized).net / Store.tradeRiskUsd(realized))) < 1e-9);
check('realizedRResult NaN when empty', Number.isNaN(Store.realizedRResult(trade({ stop: 0, plannedRisk: 0, target: 0 }))));

const opts = { limit: 1, riskPct: 2, minRR: 2, initialBalance: 100000 };
const riskList = Store.riskRespectedList([
  trade({ stop: 99, entryPrice: 100, contracts: 1, respectedStop: true }),
  trade({ stop: 0, plannedRisk: 5000, respectedStop: true })
], 'Sim', opts);
eq('riskRespectedList returns one entry per trade', riskList.length, 2);
check('within-cap trade respected (stop + risk)',
  riskList[0].respected === true && riskList[0].trade.respectedStop === true);
check('over-cap trade not respected',
  riskList[1].respected === false);

/* ------------------------------------------------------------------ */
/* [4] Behavior: enrichment + cell rendering                           */
/* ------------------------------------------------------------------ */

console.log('\n[4] Behavior (withProcessColumns + tradeRowHtml)');

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

const withProcessColumnsSrc = extractFunction(appSrc, 'function withProcessColumns(');
const respectedStopRiskMapSrc = extractFunction(appSrc, 'function respectedStopRiskMap(');

const mockStore = {
  getTrades: function () { return []; },
  riskRespectedList: function () { return []; },
  isPlanRegistered: function (t) { return t.plannedRisk > 0 && t.stop > 0 && t.target > 0; },
  executionQualityScore: function () { return 2; },
  realizedRResult: function (t) { return t._rReal; }
};

const enrichCtx = vm.createContext({
  console: console,
  Store: mockStore,
  ACCOUNTS: ['Sim', 'Real', 'Fondeo']
});
vm.runInContext(
  respectedStopRiskMapSrc + '\n' + withProcessColumnsSrc,
  enrichCtx,
  { filename: 'process-columns.js' }
);

const enriched = enrichCtx.withProcessColumns([
  { id: 'x1', plannedRisk: 20, stop: 99, target: 60, _rReal: 1.5 }
]);
eq('enriches plan from isPlanRegistered', enriched[0].plan, true);
eq('enriches execution from executionQualityScore', enriched[0].execution, 2);
eq('enriches rReal from realizedRResult', enriched[0].rReal, 1.5);
eq('enriches risk boolean', enriched[0].risk, false);

const tradeRowHtmlSrc = extractFunction(appSrc, 'function tradeRowHtml(');

function escapeHtmlMock(v) { return String(v === null || v === undefined ? '' : v); }
function missingStopBadgeMock() { return ''; }
function directionCellHtmlMock(d) { return d; }
function emotionDotHtmlMock() { return ''; }
function signClassMock(v) { return v > 0 ? 'pos' : (v < 0 ? 'neg' : ''); }
function signedNumberMock(v) { return String(v); }
function signedMoneyMock(v) { return String(v); }
function formatNumberMock(v, d) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(d === undefined ? 2 : d);
}

const rowCtx = vm.createContext({
  escapeHtml: escapeHtmlMock,
  missingStopBadge: missingStopBadgeMock,
  directionCellHtml: directionCellHtmlMock,
  emotionDotHtml: emotionDotHtmlMock,
  signClass: signClassMock,
  signedNumber: signedNumberMock,
  signedMoney: signedMoneyMock,
  formatNumber: formatNumberMock,
  state: { editingId: null }
});
vm.runInContext(tradeRowHtmlSrc, rowCtx, { filename: 'trade-row-html.js' });

function baseRow(over) {
  return Object.assign({
    id: 't1', entryDate: '2026-01-05', entryTime: '09:30', tradeNumber: 1, account: 'Sim',
    instrument: 'NQ', direction: 'Largo', contracts: 1, entryPrice: 100, exitPrice: 102,
    exitType: 'Profit', emotion: 'Confianza', points: 2, net: 35.82, cumulative: 35.82
  }, over || {});
}

const rowTrue = rowCtx.tradeRowHtml(baseRow({ plan: true, execution: 3, rReal: 1.79, risk: true }));
check('true row renders two checkmarks (Plan + Riesgo)', (rowTrue.match(/✓/g) || []).length === 2);
check('true row renders execution score', rowTrue.indexOf('>3</td>') !== -1);
check('true row renders R real value', rowTrue.indexOf('1.79') !== -1);

const rowFalse = rowCtx.tradeRowHtml(baseRow({ plan: false, execution: -1, rReal: NaN, risk: false }));
check('false row renders three dashes (Plan + R real + Riesgo)', (rowFalse.match(/—/g) || []).length === 3);
check('false row renders negative execution score', rowFalse.indexOf('>-1</td>') !== -1);

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Trades process columns result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
