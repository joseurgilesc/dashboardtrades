/* Phase 1 financial/persistence invariants. Run: node test/phase1-safety.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/instruments.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(root, 'js/store.js'), 'utf8') +
  '\n;globalThis.Store = Store;';
let pendingResolve;
const writes = [];
const adapter = {
  fetchAll: () => Promise.resolve({ trades: [], balances: { Sim: 1000, Real: 5000, Fondeo: 50000 }, settings: {} }),
  subscribe: () => () => {},
  setTrade: (uid, trade) => { writes.push({uid,trade}); return new Promise(resolve => { pendingResolve = resolve; }); },
  deleteTrade: () => Promise.resolve(),
  setBalances: () => Promise.resolve(),
  setSettings: () => Promise.resolve()
};
const context = vm.createContext({ console, FirebaseService: { adapter } });
vm.runInContext(src, context, { filename: 'phase1-store.js' });
const Store = context.Store;
function assert(ok, message) { if (!ok) throw new Error(message); }
function risk(opts) { return Store.computeRisk(Object.assign({ instrument: 'MES', riskPct: 2, tradesPerDay: 3, stopTicks: 8 }, opts)); }
async function main() {
  assert(risk({ balance: 1000, capital: 1000 }).contracts === 0, 'small account must not exceed risk budget');
  assert(risk({ balance: 1000, capital: 1000, stopTicks: 1 }).contracts === 1, 'affordable small account max one contract');
  assert(risk({ balance: 1000, capital: 1000, stopTicks: 1, available: 0 }).contracts === 0, 'no contract when available exhausted');
  Store.setBalances({ Sim: 1000 });
  Store.setSettings({ adjustments: [
    {account:'Sim',date:'2026-09-01',type:'deposit',amount:150},
    {account:'Sim',date:'2026-09-05',type:'withdrawal',amount:50},
    {account:'Sim',date:'2026-09-11',type:'deposit',amount:100}
  ]});
  assert(Store.startOfDayBalance('Sim', null, '2026-09-11') === 1100, 'start-of-day balance includes older capital movements');
  await Store.attach('test-uid');
  Store.addTrade({ account:'Sim', instrument:'MES', contracts:1, entryDate:'2026-11-18', entryPrice:100, exitPrice:101, direction:'Largo' });
  assert(writes.length === 1, 'trade write queued');
  assert(Store.getSyncStatus().pending === 1, 'pending write visible');
  assert(Store.getSyncStatus().confirmed === false, 'pending is not confirmed');
  pendingResolve();
  assert(await Store.getLastWritePromise() === true, 'write acknowledged');
  assert(Store.getSyncStatus().pending === 0 && Store.getSyncStatus().confirmed, 'confirmed status after acknowledgement');
  console.log('PASS phase1: sizing, capital movements and Firestore write status');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
