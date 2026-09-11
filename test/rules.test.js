/* test/rules.test.js
 * Firestore Security Rules tests for the trading journal.
 *
 * These tests run against the Firestore emulator with the real
 * `firestore.rules` file, using `@firebase/rules-unit-testing`. They prove the
 * rules the app depends on:
 *   - an allowlisted owner can read and write their own documents;
 *   - cross-user access is denied;
 *   - unauthenticated access is denied;
 *   - a verified account that is NOT on the allowlist is denied;
 *   - an allowlisted email whose account is not email-verified is denied;
 *   - the `allowlist/{email}` document is `get`-only for its own email and
 *     cannot be listed or read by anyone else.
 *
 * HOW TO RUN (does NOT add a build step to the app):
 *   1. Install the dev-only tooling once:  `npm install`
 *   2. Run the emulator + tests:           `npm run test:rules`
 *   3. Remove the tooling afterwards:      delete `node_modules/` (and, if
 *      desired, `package.json`, `package-lock.json`, `firebase.json`).
 *
 * The app itself never imports anything from this file or from `node_modules`;
 * the pinned `12.18.0` compat scripts in `index.html` are the only Firebase the
 * app loads. `npm run test:rules` starts a throwaway emulator project
 * (`demo-trading-journal`), so no real Firebase project is touched.
 *
 * Requirements: Node >= 20 and a Java runtime (the Firestore emulator needs
 * Java). This script is a plain Node program, not a Mocha/Jest suite, so there
 * is no test framework to install.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');
const {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc
} = require('firebase/firestore');

const PROJECT_ID = process.env.RULES_TEST_PROJECT_ID || 'demo-trading-journal';
const RULES_FILE = path.join(__dirname, '..', 'firestore.rules');

const ALICE = { uid: 'alice-uid', email: 'alice@example.com' };
const BOB = { uid: 'bob-uid', email: 'bob@example.com' };
/* Verified email that is deliberately absent from the allowlist. */
const CAROL = { uid: 'carol-uid', email: 'carol@example.com' };

let testEnv = null;
let passed = 0;
const failures = [];

function emulatorTarget() {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const parts = host.split(':');
  return { host: parts[0] || '127.0.0.1', port: Number(parts[1]) || 8080 };
}

function tradeDoc(uid, tradeId) {
  return 'users/' + uid + '/trades/' + tradeId;
}

function balancesDoc(uid) {
  return 'users/' + uid + '/meta/balances';
}

function allowlistDoc(email) {
  return 'allowlist/' + email;
}

/* Builds an authenticated context whose ID token carries the email and
 * verification claim the rules read (`request.auth.token.*`). */
function authContext(user, emailVerified) {
  return testEnv.authenticatedContext(user.uid, {
    email: user.email,
    email_verified: emailVerified !== false
  });
}

/* Clears all documents and re-seeds the allowlist through a rules-bypassing
 * context, so every test starts from the same known state. */
async function reset() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, allowlistDoc(ALICE.email)), { invited: true });
    await setDoc(doc(db, allowlistDoc(BOB.email)), { invited: true });
  });
}

async function run(name, fn) {
  try {
    await reset();
    await fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (err) {
    failures.push(name);
    console.log('  FAIL  ' + name);
    console.log('        ' + (err && err.message ? err.message : String(err)));
  }
}

async function main() {
  const target = emulatorTarget();
  console.log('Rules test: project=' + PROJECT_ID + ' emulator=' + target.host + ':' + target.port);
  console.log('Rules file: ' + RULES_FILE);

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_FILE, 'utf8'),
      host: target.host,
      port: target.port
    }
  });

  /* -------- Owner access is allowed -------- */

  await run('allowlisted owner can create and read their own trade', async () => {
    const alice = authContext(ALICE);
    await assertSucceeds(setDoc(doc(alice.firestore(), tradeDoc(ALICE.uid, 't1')), { net: 10 }));
    await assertSucceeds(getDoc(doc(alice.firestore(), tradeDoc(ALICE.uid, 't1'))));
  });

  await run('allowlisted owner can write and read their own meta documents', async () => {
    const alice = authContext(ALICE);
    await assertSucceeds(setDoc(doc(alice.firestore(), balancesDoc(ALICE.uid)), { Sim: 1000, Real: 0, Fondeo: 0 }));
    await assertSucceeds(getDoc(doc(alice.firestore(), balancesDoc(ALICE.uid))));
  });

  await run('authenticated user can get the allowlist doc for their own email', async () => {
    const alice = authContext(ALICE);
    await assertSucceeds(getDoc(doc(alice.firestore(), allowlistDoc(ALICE.email))));
  });

  /* -------- Cross-user access is denied -------- */

  await run('cross-user read is denied', async () => {
    const alice = authContext(ALICE);
    await assertSucceeds(setDoc(doc(alice.firestore(), tradeDoc(ALICE.uid, 't1')), { net: 10 }));

    const bob = authContext(BOB);
    await assertFails(getDoc(doc(bob.firestore(), tradeDoc(ALICE.uid, 't1'))));
  });

  await run('cross-user write is denied', async () => {
    const bob = authContext(BOB);
    await assertFails(setDoc(doc(bob.firestore(), tradeDoc(ALICE.uid, 't1')), { net: 10 }));
  });

  await run('cross-user meta read is denied', async () => {
    const bob = authContext(BOB);
    await assertFails(getDoc(doc(bob.firestore(), balancesDoc(ALICE.uid))));
  });

  /* -------- Unauthenticated access is denied -------- */

  await run('unauthenticated read is denied', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), tradeDoc(ALICE.uid, 't1'))));
  });

  await run('unauthenticated write is denied', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(setDoc(doc(anon.firestore(), tradeDoc(ALICE.uid, 't1')), { net: 10 }));
  });

  await run('unauthenticated meta read is denied', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), balancesDoc(ALICE.uid))));
  });

  /* -------- Non-allowlisted access is denied -------- */

  await run('verified but non-allowlisted user cannot read their own trade', async () => {
    const carol = authContext(CAROL);
    await assertFails(getDoc(doc(carol.firestore(), tradeDoc(CAROL.uid, 't1'))));
  });

  await run('verified but non-allowlisted user cannot write their own trade', async () => {
    const carol = authContext(CAROL);
    await assertFails(setDoc(doc(carol.firestore(), tradeDoc(CAROL.uid, 't1')), { net: 10 }));
  });

  await run('verified but non-allowlisted user cannot read their own meta', async () => {
    const carol = authContext(CAROL);
    await assertFails(getDoc(doc(carol.firestore(), balancesDoc(CAROL.uid))));
  });

  /* -------- Email verification is required -------- */

  await run('allowlisted but unverified email is denied', async () => {
    const alice = authContext(ALICE, false);
    await assertFails(getDoc(doc(alice.firestore(), tradeDoc(ALICE.uid, 't1'))));
  });

  /* -------- Allowlist document is protected -------- */

  await run('a user cannot get another email\'s allowlist document', async () => {
    const carol = authContext(CAROL);
    await assertFails(getDoc(doc(carol.firestore(), allowlistDoc(ALICE.email))));
  });

  await run('the allowlist collection cannot be listed', async () => {
    const alice = authContext(ALICE);
    await assertFails(getDocs(collection(alice.firestore(), 'allowlist')));
  });
}

main()
  .then(async () => {
    if (testEnv) await testEnv.cleanup();
    console.log('');
    console.log('Rules test result: ' + passed + ' passed, ' + failures.length + ' failed');
    if (failures.length) {
      console.log('Failed: ' + failures.join(', '));
      process.exitCode = 1;
    }
  })
  .catch(async (err) => {
    if (testEnv) {
      try {
        await testEnv.cleanup();
      } catch (cleanupErr) {
        /* Cleanup is best-effort: the harness error below is what matters. */
      }
    }
    console.error('Rules test harness error: ' + (err && err.stack ? err.stack : err));
    process.exitCode = 1;
  });
