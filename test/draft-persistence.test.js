/* test/draft-persistence.test.js
 * VM harness for the draft autosave (js/app.js `persistDrafts` / `loadDrafts`).
 *
 * Extracts the REAL functions from js/app.js (brace-matched, not
 * re-implemented) and runs them against a fake `localStorage` plus a stubbed
 * `captureDraft`. No browser, no Firebase, no build step.
 *
 * Proves:
 *   [1] loadDrafts returns [null,null,null] on a missing key;
 *   [2] loadDrafts returns the parsed array on valid JSON;
 *   [3] loadDrafts is defensive: malformed JSON or a non-array payload fall
 *       back to [null,null,null];
 *   [4] persistDrafts snapshots the active tab into drafts[] and writes the
 *       whole array as JSON under `bpt.drafts.v1`;
 *   [5] persistDrafts never throws when localStorage.setItem fails (quota).
 *
 * Run: node test/draft-persistence.test.js
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
  check(name, actual === expected,
    'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function deepEq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
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
  extractFunction(appSrc, 'function persistDrafts()'),
  extractFunction(appSrc, 'function loadDrafts()')
].join('\n');

/* ------------------------------------------------------------------ */
/* Fake localStorage (in-memory, with an injectable quota failure)     */
/* ------------------------------------------------------------------ */

function makeStorage() {
  let map = {};
  let failSet = false;
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
    },
    setItem: function (k, v) {
      if (failSet) throw new Error('QuotaExceededError');
      map[k] = String(v);
    },
    removeItem: function (k) { delete map[k]; },
    /* Test hooks (not part of the localStorage contract). */
    _raw: function (k) { return map[k]; },
    _failSet: function () { failSet = true; },
    _unfailSet: function () { failSet = false; },
    _clear: function () { map = {}; }
  };
}

/* ------------------------------------------------------------------ */
/* VM context: the extracted functions + stubs                         */
/* ------------------------------------------------------------------ */

const storage = makeStorage();

const uiContext = vm.createContext({
  console: console,
  JSON: JSON,
  Array: Array,
  localStorage: storage
});

const stubs = [
  'var DRAFTS_KEY = "bpt.drafts.v1";',
  'var state = { activeTrade: 0 };',
  'var drafts = [null, null, null];',
  'var captured = null;',
  'function captureDraft() { return captured; }'
].join('\n');

vm.runInContext(extracted + '\n' + stubs, uiContext, { filename: 'app-draft-persistence.js' });

const KEY = 'bpt.drafts.v1';

/* ------------------------------------------------------------------ */
/* [1] loadDrafts on a missing key                                     */
/* ------------------------------------------------------------------ */

console.log('\n[1] loadDrafts on a missing key');

storage._clear();
deepEq('missing key -> [null,null,null]', uiContext.loadDrafts(), [null, null, null]);

/* ------------------------------------------------------------------ */
/* [2] loadDrafts on valid JSON                                        */
/* ------------------------------------------------------------------ */

console.log('\n[2] loadDrafts on valid JSON');

const saved = [
  { instrument: 'MES', contracts: '3' },
  null,
  { instrument: 'FDAX', contracts: '1' }
];
storage.setItem(KEY, JSON.stringify(saved));
deepEq('valid array -> parsed drafts', uiContext.loadDrafts(), saved);

/* ------------------------------------------------------------------ */
/* [3] loadDrafts is defensive on bad payloads                         */
/* ------------------------------------------------------------------ */

console.log('\n[3] loadDrafts defensive fallback');

storage.setItem(KEY, 'not json at all {{{');
deepEq('malformed JSON -> [null,null,null]', uiContext.loadDrafts(), [null, null, null]);

storage.setItem(KEY, '{"instrument":"MES"}');
deepEq('non-array payload -> [null,null,null]', uiContext.loadDrafts(), [null, null, null]);

storage.setItem(KEY, 'null');
deepEq('JSON null -> [null,null,null]', uiContext.loadDrafts(), [null, null, null]);

/* ------------------------------------------------------------------ */
/* [4] persistDrafts snapshots + writes the whole array                */
/* ------------------------------------------------------------------ */

console.log('\n[4] persistDrafts snapshots and writes');

storage._clear();
uiContext.captured = { instrument: 'MES', contracts: '7', stopTicks: '8' };
uiContext.state.activeTrade = 1;
uiContext.drafts = [null, { instrument: 'OLD' }, null];
uiContext.persistDrafts();

check('active tab slot is snapshotted', uiContext.drafts[1] !== null &&
  uiContext.drafts[1].instrument === 'MES');
check('untouched slots stay as they were',
  uiContext.drafts[0] === null && uiContext.drafts[2] === null);
eq('persisted under bpt.drafts.v1', storage._raw(KEY), JSON.stringify(uiContext.drafts));

/* ------------------------------------------------------------------ */
/* [5] persistDrafts never throws on a storage failure                 */
/* ------------------------------------------------------------------ */

console.log('\n[5] persistDrafts is best-effort');

storage._failSet();
let threw = false;
try {
  uiContext.persistDrafts();
} catch (err) {
  threw = true;
}
check('quota/parse error is swallowed', threw === false);
storage._unfailSet();

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('Draft persistence result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}
