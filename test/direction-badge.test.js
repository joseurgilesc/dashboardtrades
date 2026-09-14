/* test/direction-badge.test.js
 * VM harness for the direction pill rendered by js/app.js `tradeRowHtml`.
 *
 * Extracts the real functions from app.js with the same `extractFunction`
 * helper used by test/bpt-badges.test.js and renders against a fake DOM.
 * No browser, no Firebase, no build step.
 *
 * Run: node test/direction-badge.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

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

/* ------------------------------------------------------------------ */
/* Extract the real row-building functions from app.js                 */
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

const uiCode = [
  extractFunction(appSrc, 'function directionCellHtml(direction)'),
  extractFunction(appSrc, 'function emotionColor(emotion)'),
  extractFunction(appSrc, 'function emotionDotHtml(emotion)'),
  extractFunction(appSrc, 'function signClass(value)'),
  extractFunction(appSrc, 'function missingStopBadge(trade)'),
  extractFunction(appSrc, 'function tradeRowHtml(t)')
].join('\n');

const uiContext = vm.createContext({
  console: console,
  /* The fake DOM element the row is rendered against. */
  $: function () { return null; },
  state: { editingId: null },
  escapeHtml: function (v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  formatNumber: function (v, d) { return Number(v).toFixed(d === undefined ? 2 : d); },
  formatMoney: function (v) { return Number(v).toFixed(2); },
  /* Only the emotion dot needs the token map. */
  EMOTION_COLORS: { Confianza: 'var(--pos)', Miedo: 'var(--neg)', Duda: 'var(--text-faint)' }
});
vm.runInContext(uiCode, uiContext, { filename: 'app-row-render.js' });

/* A complete trade so `tradeRowHtml` can render every column. */
function rowTrade(direction) {
  return {
    id: 't1',
    tradeNumber: 1,
    entryDate: '2026-09-14',
    entryTime: '11:56:24',
    account: 'Sim',
    instrument: 'MES',
    direction: direction,
    contracts: 1,
    entryPrice: 7713.25,
    exitPrice: 7712,
    exitType: 'Profit',
    emotion: 'Confianza',
    stop: 10,
    points: 1.25,
    net: 4.95,
    cumulative: 4.95
  };
}

/* ------------------------------------------------------------------ */
/* [1] Largo renders the green long pill                               */
/* ------------------------------------------------------------------ */

console.log('\n[1] Largo direction pill');

const longHtml = uiContext.tradeRowHtml(rowTrade('Largo'));
check('Largo emits dir-pill dir-long', longHtml.indexOf('dir-pill dir-long') !== -1, longHtml);
check('Largo shows the ▲ arrow', longHtml.indexOf('▲ Largo') !== -1, longHtml);
check('Largo carries the title attribute', longHtml.indexOf('title="Largo"') !== -1, longHtml);
check('Largo never uses the short pill', longHtml.indexOf('dir-short') === -1);

/* ------------------------------------------------------------------ */
/* [2] Corto renders the red short pill                                */
/* ------------------------------------------------------------------ */

console.log('\n[2] Corto direction pill');

const shortHtml = uiContext.tradeRowHtml(rowTrade('Corto'));
check('Corto emits dir-pill dir-short', shortHtml.indexOf('dir-pill dir-short') !== -1, shortHtml);
check('Corto shows the ▼ arrow', shortHtml.indexOf('▼ Corto') !== -1, shortHtml);
check('Corto carries the title attribute', shortHtml.indexOf('title="Corto"') !== -1, shortHtml);
check('Corto never uses the long pill', shortHtml.indexOf('dir-long') === -1);

/* ------------------------------------------------------------------ */
/* [3] Unknown values fall back to plain escaped text                  */
/* ------------------------------------------------------------------ */

console.log('\n[3] Unknown direction fallback');

const unknownHtml = uiContext.tradeRowHtml(rowTrade('Lateral'));
check('unknown direction has no pill class', unknownHtml.indexOf('dir-pill') === -1, unknownHtml);
check('unknown direction renders as plain text', unknownHtml.indexOf('>Lateral<') !== -1, unknownHtml);

/* The raw direction still reaches the row, so sorting by the raw value is
 * unaffected (sorting reads `trade.direction`, not the rendered HTML). */
eq('raw direction untouched in the trade object', rowTrade('Largo').direction, 'Largo');

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Direction badge test result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}