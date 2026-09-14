/* test/ninjatrader-import.test.js
 * VM harness for the NinjaTrader "Grid" CSV import in js/store.js.
 *
 * Loads the REAL js/instruments.js + js/store.js into one vm context and
 * parses the user's actual export format (semicolons, decimal commas, $).
 * The fixture CSV is embedded as a string literal — no fs, no build step.
 *
 * Run: node test/ninjatrader-import.test.js
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

/* ------------------------------------------------------------------ */
/* Fixture: the user's real NinjaTrader "Grid" export (3 trades).      */
/* BOM + CRLF on purpose: the parser must tolerate both.               */
/* ------------------------------------------------------------------ */

const NINJA_CSV = '\uFEFF' +
  'Trade number;Instrument;Account;Strategy;Market pos.;Qty;Entry price;Exit price;Entry time;Exit time;Entry name;Exit name;Profit;Cum. net profit;Commission;Clearing Fee;Exchange Fee;IP Fee;NFA Fee;MAE;MFE;ETD;Bars;\r\n' +
  '1;MES DEC26;DEMO9181517;;Short;1;7713,25;7712,00;14/9/2026 11:56:24;14/9/2026 12:12:14;;;$4,95;$4,95;$0,18;$0,38;$0,70;$0,00;$0,04;$6,25;$6,25;$1,30;0;\r\n' +
  '2;MES DEC26;DEMO9181517;;Long;1;7712,50;7706,25;14/9/2026 12:38:09;14/9/2026 13:03:42;;;$-32,55;$-27,60;$0,18;$0,38;$0,70;$0,00;$0,04;$31,25;$31,25;$63,80;0;\r\n' +
  '3;NQ SEP26;DEMO9181517;;Short;1;29214,25;29223,50;14/9/2026 14:38:56;14/9/2026 14:46:02;;;$-189,36;$-216,96;$1,18;$0,38;$2,76;$0,00;$0,04;$185,00;$185,00;$374,36;0;\r\n';

/* Expected Profit per row (already net in the export). */
const EXPECTED_NET = [4.95, -32.55, -189.36];
const EXPECTED_FEES = [1.3, 1.3, 4.36];

/* ------------------------------------------------------------------ */
/* [1] Parse: mapping and numbers                                      */
/* ------------------------------------------------------------------ */

console.log('\n[1] parseNinjaTraderCSV mapping');

const parsed = Store.parseNinjaTraderCSV(NINJA_CSV, 'Sim');
eq('BOM + CRLF fixture parses 3 trades', parsed.trades.length, 3);
eq('no rows skipped on the valid fixture', parsed.skipped, 0);

const t1 = parsed.trades[0];
const t2 = parsed.trades[1];
const t3 = parsed.trades[2];

/* Directions map Long/Short -> Largo/Corto. */
eq('Short maps to Corto', t1.direction, 'Corto');
eq('Long maps to Largo', t2.direction, 'Largo');
eq('row 3 is Short -> Corto', t3.direction, 'Corto');

/* Decimal commas parse into real prices. */
eq('entry price 7713,25 parsed', t1.entryPrice, 7713.25);
eq('exit price 7712,00 parsed', t1.exitPrice, 7712);
eq('NQ entry 29214,25 parsed', t3.entryPrice, 29214.25);

/* DD/MM/YYYY HH:MM:SS -> ISO date + zero-padded time. */
eq('row 1 entryDate 14/9/2026 -> 2026-09-14', t1.entryDate, '2026-09-14');
eq('row 1 entryTime 11:56:24 kept', t1.entryTime, '11:56:24');
eq('row 1 exitDate -> 2026-09-14', t1.exitDate, '2026-09-14');
eq('row 1 exitTime 12:12:14 kept', t1.exitTime, '12:12:14');
eq('row 2 entryDate -> 2026-09-14', t2.entryDate, '2026-09-14');

/* Expiry tokens are dropped: MES DEC26 -> MES, NQ SEP26 -> NQ. */
eq('MES DEC26 normalized to MES', t1.instrument, 'MES');
eq('NQ SEP26 normalized to NQ', t3.instrument, 'NQ');

/* Qty -> contracts; account is the caller's. */
eq('Qty 1 -> contracts 1', t1.contracts, 1);
eq('account is the passed account', t1.account, 'Sim');

/* Per-contract commission = total broker fees / qty (max 4 decimals). */
close('row 1 fees 1.30 / 1 -> 1.30', t1.commission, EXPECTED_FEES[0], 1e-9);
close('row 2 fees 1.30 / 1 -> 1.30', t2.commission, EXPECTED_FEES[1], 1e-9);
close('row 3 fees 4.36 / 1 -> 4.36', t3.commission, EXPECTED_FEES[2], 1e-9);

/* Fields the import never sets. */
eq('no tradeNumber (addTrade assigns it)', t1.tradeNumber, 0);
eq('strategy empty', t1.strategy, '');
eq('exitType empty', t1.exitType, '');
eq('emotion empty', t1.emotion, '');
eq('notes empty', t1.notes, '');
eq('stop zero', t1.stop, 0);
eq('target zero', t1.target, 0);
eq('plannedRisk zero', t1.plannedRisk, 0);

/* ------------------------------------------------------------------ */
/* [2] The recorded mapping reproduces the CSV Profit via computeTrade  */
/* ------------------------------------------------------------------ */

console.log('\n[2] computeTrade net === CSV Profit (2 decimals)');

function round2(v) {
  return Math.round(v * 100) / 100;
}

parsed.trades.forEach(function (t, i) {
  const net = Store.computeTrade(t).net;
  eq('row ' + (i + 1) + ' net ' + round2(net) + ' === Profit ' + EXPECTED_NET[i],
    round2(net), EXPECTED_NET[i]);
});

/* ------------------------------------------------------------------ */
/* [3] addNinjaTrades persists through the normal Store flow            */
/* ------------------------------------------------------------------ */

console.log('\n[3] addNinjaTrades');

const before = Store.getTrades().length;
const result = Store.addNinjaTrades(parsed.trades);
eq('added 3', result.added, 3);
eq('skipped 0', result.skipped, 0);
eq('store grew by 3', Store.getTrades().length, before + 3);

const saved = Store.getTrades().slice(-3);
eq('tradeNumbers assigned in order 1..3', saved[0].tradeNumber, 1);
eq('tradeNumber 2', saved[1].tradeNumber, 2);
eq('tradeNumber 3', saved[2].tradeNumber, 3);
eq('saved trades are account-scoped', saved.every(function (t) { return t.account === 'Sim'; }), true);
saved.forEach(function (t, i) {
  close('saved row ' + (i + 1) + ' commission', t.commission, EXPECTED_FEES[i], 1e-9);
  eq('saved row ' + (i + 1) + ' net === CSV Profit',
    round2(Store.computeTrade(t).net), EXPECTED_NET[i]);
});

/* ------------------------------------------------------------------ */
/* [4] Rejections                                                      */
/* ------------------------------------------------------------------ */

console.log('\n[4] Rejections');

/* No header -> everything skipped, every row reported. */
const noHeader = NINJA_CSV.replace(/^\uFEFFTrade number.*\r\n/, '')
  .replace(/^\uFEFF/, '');
const bare = Store.parseNinjaTraderCSV(noHeader, 'Sim');
eq('no header -> zero trades', bare.trades.length, 0);
eq('no header -> all 3 rows skipped', bare.skipped, 3);
eq('no header -> skippedRows holds the original rows', bare.skippedRows.length, 3);

/* Unknown instrument (GC is not in INSTRUMENTS) -> skipped, not imported.
 * Only the FIRST row is rewritten, so 2 trades stay valid. */
const gold = Store.parseNinjaTraderCSV(
  NINJA_CSV.replace('MES DEC26', 'GC DEC26'), 'Sim');
eq('gold fixture -> unknown instrument skipped', gold.skipped, 1);
eq('gold fixture -> 2 valid trades kept', gold.trades.length, 2);
check('skipped row is the GC one', gold.skippedRows[0].indexOf('GC DEC26') !== -1,
  gold.skippedRows[0]);

/* Qty 0 -> the row cannot be sized, so it is skipped. */
const zeroQty = Store.parseNinjaTraderCSV(NINJA_CSV.replace(';1;7713,25', ';0;7713,25'), 'Sim');
eq('qty 0 row skipped', zeroQty.skipped, 1);
eq('qty 0 fixture keeps 2 trades', zeroQty.trades.length, 2);

/* Unknown direction -> skipped. */
const badDir = Store.parseNinjaTraderCSV(NINJA_CSV.replace('Short', 'Sideways'), 'Sim');
eq('unknown direction skipped', badDir.skipped, 1);
eq('unknown direction keeps 2 trades', badDir.trades.length, 2);

/* Missing date -> skipped. */
const badDate = Store.parseNinjaTraderCSV(NINJA_CSV.replace('14/9/2026 11:56:24', '??/??/????'), 'Sim');
eq('unparsable date skipped', badDate.skipped, 1);
eq('unparsable date keeps 2 trades', badDate.trades.length, 2);

/* LF-only line endings and BOM are tolerated too. */
const lf = Store.parseNinjaTraderCSV(NINJA_CSV.split('\r\n').join('\n'), 'Sim');
eq('LF-only line endings parse 3 trades', lf.trades.length, 3);

/* ------------------------------------------------------------------ */
/* [5] Zero-padding of day/month/hour                                  */
/* ------------------------------------------------------------------ */

console.log('\n[5] Date/time zero-padding');

const padded = Store.parseNinjaTraderCSV(
  NINJA_CSV
    .replace('14/9/2026 11:56:24', '9/9/2026 9:6:4')
    .replace('14/9/2026 12:12:14', '9/9/2026 10:5:6'), 'Sim');
eq('day/month zero-padded', padded.trades[0].entryDate, '2026-09-09');
eq('entry hour/minute/second zero-padded', padded.trades[0].entryTime, '09:06:04');
eq('exit hour/minute/second zero-padded', padded.trades[0].exitTime, '10:05:06');

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('NinjaTrader import test result: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exitCode = 1;
}