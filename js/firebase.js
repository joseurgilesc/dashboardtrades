/* firebase.js
 * Firebase SDK bootstrap for the trading journal.
 * Exposes the global `FirebaseService`. Plain script (no modules, no build step).
 *
 * SDK: Firebase compat 12.18.0, loaded as classic <script> tags in index.html.
 * The modular API (initializeFirestore / persistentLocalCache) is NOT available
 * in the compat build, so the offline cache uses the compat equivalent:
 *   firebase.firestore().enablePersistence({ synchronizeTabs: true })
 *
 * Ordering contract: `enablePersistence()` MUST be called before any other
 * Firestore call (no collection()/doc()/onSnapshot() before it). `init()`
 * enforces that order and is the only place the SDK is bootstrapped.
 *
 * Scope of this file: SDK init + offline cache, email/password + Google auth,
 * email verification (send on sign-up, resend, re-check), allowlist gating,
 * the `users/{uid}` Firestore adapter, localStorage migration, and account
 * deletion.
 */

const FirebaseService = (function () {
  'use strict';

  /* Firebase web config. These are PUBLIC client identifiers, not secrets:
   * access control lives in Firebase Auth + Firestore Security Rules. The
   * project is `tradingdashboard-7425a`. */
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBIEh70D_j-3fidpZOD79Iy5EeaImyR_34',
    authDomain: 'tradingdashboard-7425a.firebaseapp.com',
    projectId: 'tradingdashboard-7425a',
    storageBucket: 'tradingdashboard-7425a.firebasestorage.app',
    messagingSenderId: '470193009482',
    appId: '1:470193009482:web:dce4f399c70fac88ff47b3'
  };

  let initPromise = null;
  let app = null;
  let db = null;
  let persistenceEnabled = false;
  let persistenceError = null;

  function hasSdk() {
    return typeof firebase !== 'undefined'
      && firebase !== null
      && typeof firebase.initializeApp === 'function';
  }

  function getApp() {
    return app;
  }

  function getDb() {
    return db;
  }

  function getAuth() {
    if (!hasSdk()) return null;
    return firebase.auth();
  }

  function isPersistenceEnabled() {
    return persistenceEnabled;
  }

  function getPersistenceError() {
    return persistenceError;
  }

  /**
   * Bootstraps Firebase once and enables the offline cache before any other
   * Firestore call. Resolves `true` when persistence is active, `false` when
   * the SDK is missing or the browser cannot provide IndexedDB persistence.
   * Never rejects: a persistence failure degrades to online-only instead of
   * breaking the app.
   */
  function init() {
    if (initPromise) return initPromise;

    initPromise = new Promise(function (resolve) {
      if (!hasSdk()) {
        persistenceError = 'firebase-sdk-missing';
        resolve(false);
        return;
      }

      try {
        app = (typeof firebase.apps !== 'undefined' && firebase.apps.length)
          ? firebase.app()
          : firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();
      } catch (err) {
        persistenceError = err && err.code ? err.code : String(err);
        resolve(false);
        return;
      }

      /* Offline cache MUST be enabled before any other Firestore call. */
      db.enablePersistence({ synchronizeTabs: true })
        .then(function () {
          persistenceEnabled = true;
          resolve(true);
        })
        .catch(function (err) {
          /* `failed-precondition` (multi-tab) or `unimplemented` (no IndexedDB):
           * continue online-only instead of failing the boot. */
          persistenceError = err && err.code ? err.code : String(err);
          resolve(false);
        });
    });

    return initPromise;
  }

  /* ------------------------------------------------------------------ */
  /* Authentication                                                      */
  /* ------------------------------------------------------------------ */

  function ensureAuth() {
    if (!hasSdk()) throw new Error('firebase-sdk-missing');
    return firebase.auth();
  }

  function getCurrentUser() {
    if (!hasSdk()) return null;
    return firebase.auth().currentUser;
  }

  function signInWithEmail(email, password) {
    return ensureAuth().signInWithEmailAndPassword(email, password);
  }

  /**
   * Creates an email/password account and sends the verification email.
   * Resolves `{ user, verificationSent }`. Sending the verification email is
   * best-effort: a failure never fails sign-up, because the user can retry it
   * with `resendVerification()`. Rejects only when account creation itself
   * fails. Security Rules require `email_verified == true`, so an account
   * that never verifies stays locked out of its own data.
   */
  function signUpWithEmail(email, password) {
    return ensureAuth().createUserWithEmailAndPassword(email, password).then(function (credential) {
      const user = credential && credential.user ? credential.user : null;
      if (!user || typeof user.sendEmailVerification !== 'function') {
        return { user: user, verificationSent: false };
      }
      return user.sendEmailVerification().then(function () {
        return { user: user, verificationSent: true };
      }, function () {
        return { user: user, verificationSent: false };
      });
    });
  }

  /* Popup errors that mean "the popup flow cannot run here" and therefore
   * justify the redirect fallback. A user closing the popup is NOT one of
   * them: that is a deliberate action and surfaces as an actionable error. */
  const POPUP_FALLBACK_CODES = {
    'auth/popup-blocked': true,
    'auth/operation-not-supported-in-this-environment': true,
    'auth/web-storage-unsupported': true
  };

  /**
   * Google sign-in. Tries the popup flow first; when the browser blocks or
   * cannot run it, falls back to the full-page redirect flow. A failure of
   * both flows rejects, so the caller can show an actionable error and the
   * user is never left partially authenticated.
   */
  function signInWithGoogle() {
    const auth = ensureAuth();
    const provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider).catch(function (err) {
      const code = err && err.code ? err.code : '';
      if (POPUP_FALLBACK_CODES[code]) {
        return auth.signInWithRedirect(provider);
      }
      throw err;
    });
  }

  /** Completes a pending redirect sign-in, if any. Resolves the user or null. */
  function completeGoogleRedirect() {
    if (!hasSdk()) return Promise.resolve(null);
    return firebase.auth().getRedirectResult().then(function (result) {
      return result && result.user ? result.user : null;
    });
  }

  function logout() {
    return ensureAuth().signOut();
  }

  /* ------------------------------------------------------------------ */
  /* Email verification                                                  */
  /* ------------------------------------------------------------------ */

  /* Error with an SDK-like `code`, so callers can map it without string
   * matching. Used for the guard failures below, which have no SDK code. */
  function authCodeError(code) {
    const err = new Error(code);
    err.code = code;
    return err;
  }

  /**
   * Resends the verification email for the signed-in user. Guarded: it only
   * runs when a user is signed in AND their email is still unverified.
   * Rejects with `not-authenticated` or `already-verified` otherwise, so the
   * UI never sends a pointless email.
   */
  function resendVerification() {
    const user = getCurrentUser();
    if (!user) return Promise.reject(authCodeError('not-authenticated'));
    if (user.emailVerified === true) return Promise.reject(authCodeError('already-verified'));
    if (typeof user.sendEmailVerification !== 'function') {
      return Promise.reject(authCodeError('firebase-sdk-missing'));
    }
    return user.sendEmailVerification();
  }

  /**
   * Reloads the signed-in user so `emailVerified` reflects the latest state
   * after the user clicks the email link. Resolves `{ user, reloaded }`:
   * `reloaded` is false when there is no session or the reload failed
   * (offline), in which case the cached user is returned. Never rejects, so
   * the caller can re-run `checkAccess()` without a failure path.
   */
  function reloadCurrentUser() {
    const user = getCurrentUser();
    if (!user) return Promise.resolve({ user: null, reloaded: false });
    return user.reload().then(function () {
      return { user: firebase.auth().currentUser || user, reloaded: true };
    }, function () {
      return { user: user, reloaded: false };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Allowlist gating                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Resolves whether `user` may access the journal. The authoritative check
   * is the Firestore Security Rules; this client pre-check is UX only. It
   * mirrors the rules: a verified email AND an `allowlist/{email}` document.
   * Never rejects: every failure resolves to `{ allowed: false, reason }`.
   */
  function checkAccess(user) {
    if (!user) return Promise.resolve({ allowed: false, reason: 'signed-out', email: '' });
    const email = user.email || '';
    if (!email) return Promise.resolve({ allowed: false, reason: 'no-email', email: '' });
    if (user.emailVerified !== true) {
      return Promise.resolve({ allowed: false, reason: 'email-unverified', email: email });
    }
    if (!db) return Promise.resolve({ allowed: false, reason: 'db-unavailable', email: email });
    return db.collection('allowlist').doc(email).get()
      .then(function (doc) {
        return (doc && doc.exists)
          ? { allowed: true, reason: 'allowlisted', email: email }
          : { allowed: false, reason: 'not-allowlisted', email: email };
      })
      .catch(function (err) {
        return {
          allowed: false,
          reason: 'allowlist-error',
          email: email,
          error: err && err.code ? err.code : String(err)
        };
      });
  }

  /* Carries a denial across the sign-out it triggers, so the resulting
   * signed-out event still explains why access was refused. */
  let pendingDenial = null;

  /**
   * Wraps the SDK auth listener and gates every authenticated user on the
   * allowlist. `handler(user, access)` receives `access.allowed === true`
   * only for allowlisted users. A non-allowlisted account is signed out and
   * reported as a signed-out event carrying the denial reason; an unverified
   * email keeps its session (Rules still deny all data) so the UI can resend
   * the verification email and re-check after the user clicks the link.
   */
  function onAuthStateChanged(handler) {
    if (!hasSdk()) return function () {};
    return firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        if (pendingDenial) {
          const denial = pendingDenial;
          pendingDenial = null;
          handler(null, denial);
          return;
        }
        handler(null, { allowed: false, reason: 'signed-out', email: '' });
        return;
      }
      checkAccess(user).then(function (access) {
        if (access.allowed) {
          handler(user, access);
          return;
        }
        /* Keep the session for an unverified email: the user must be able to
         * resend the verification email and re-check after clicking the link.
         * Security Rules still deny every read/write until email_verified is
         * true, so no user data is reachable while unverified. */
        if (access.reason === 'email-unverified') {
          handler(user, access);
          return;
        }
        /* Deny access: end the session so no user-scoped reads can run. */
        pendingDenial = access;
        logout().catch(function () {
          /* If sign-out fails, still surface the denial so the UI is not stuck. */
          const denial = pendingDenial;
          pendingDenial = null;
          if (denial) handler(null, denial);
        });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Firestore adapter (users/{uid}/trades + users/{uid}/meta/*)         */
  /* ------------------------------------------------------------------ */

  function userDoc(uid) {
    return db.collection('users').doc(uid);
  }

  function tradesCollection(uid) {
    return userDoc(uid).collection('trades');
  }

  function metaDoc(uid, name) {
    return userDoc(uid).collection('meta').doc(name);
  }

  /* The trade id lives in the document id, not in the document body. */
  function tradeData(trade) {
    const data = Object.assign({}, trade);
    delete data.id;
    return data;
  }

  function snapToTrades(snapshot) {
    const trades = [];
    snapshot.forEach(function (doc) {
      trades.push(Object.assign({ id: doc.id }, doc.data()));
    });
    return trades;
  }

  const adapter = {
    /** One-shot read of trades + meta/balances + meta/settings. */
    fetchAll: function (uid) {
      if (!db) return Promise.reject(new Error('firestore-unavailable'));
      return Promise.all([
        tradesCollection(uid).get(),
        metaDoc(uid, 'balances').get(),
        metaDoc(uid, 'settings').get()
      ]).then(function (results) {
        return {
          trades: snapToTrades(results[0]),
          balances: results[1].exists ? results[1].data() : null,
          settings: results[2].exists ? results[2].data() : null
        };
      });
    },

    /**
     * Live subscription to the user's trades and meta documents. Returns an
     * unsubscribe function; handler callbacks are optional.
     */
    subscribe: function (uid, handlers) {
      handlers = handlers || {};
      if (!db) return function () {};
      const unsubscribes = [
        tradesCollection(uid).onSnapshot(function (snapshot) {
          if (handlers.onTrades) handlers.onTrades(snapToTrades(snapshot));
        }, handlers.onError),
        metaDoc(uid, 'balances').onSnapshot(function (doc) {
          if (handlers.onBalances) handlers.onBalances(doc.exists ? doc.data() : null);
        }, handlers.onError),
        metaDoc(uid, 'settings').onSnapshot(function (doc) {
          if (handlers.onSettings) handlers.onSettings(doc.exists ? doc.data() : null);
        }, handlers.onError)
      ];
      return function () {
        unsubscribes.forEach(function (off) { if (typeof off === 'function') off(); });
      };
    },

    setTrade: function (uid, trade) {
      if (!db) return Promise.reject(new Error('firestore-unavailable'));
      return tradesCollection(uid).doc(trade.id).set(tradeData(trade));
    },

    deleteTrade: function (uid, tradeId) {
      if (!db) return Promise.reject(new Error('firestore-unavailable'));
      return tradesCollection(uid).doc(tradeId).delete();
    },

    setBalances: function (uid, balances) {
      if (!db) return Promise.reject(new Error('firestore-unavailable'));
      return metaDoc(uid, 'balances').set(Object.assign({}, balances));
    },

    setSettings: function (uid, settings) {
      if (!db) return Promise.reject(new Error('firestore-unavailable'));
      return metaDoc(uid, 'settings').set(Object.assign({}, settings));
    }
  };

  /* ------------------------------------------------------------------ */
  /* localStorage migration (bpt.journal.v1 -> users/{uid})              */
  /* ------------------------------------------------------------------ */

  /* The legacy key is a one-time migration source, never the source of
   * truth. Migration runs once per browser: only when the account has no
   * trades yet and the local key exists. */
  const MIGRATION_KEY = 'bpt.journal.v1';
  const BATCH_LIMIT = 500;

  function localStore() {
    try {
      return (typeof localStorage !== 'undefined' && localStorage !== null) ? localStorage : null;
    } catch (err) {
      return null;
    }
  }

  function readLocalJournal() {
    const ls = localStore();
    if (!ls) return null;
    let raw = null;
    try {
      raw = ls.getItem(MIGRATION_KEY);
    } catch (err) {
      return null;
    }
    if (!raw) return null;
    if (typeof Store === 'undefined' || typeof Store.normalize !== 'function') return null;
    try {
      return Store.normalize(JSON.parse(raw));
    } catch (err) {
      /* Corrupt local data must never block login. */
      return null;
    }
  }

  function removeLocalJournal() {
    const ls = localStore();
    if (!ls) return;
    try {
      ls.removeItem(MIGRATION_KEY);
    } catch (err) {
      /* Ignore: a failed removal only means migration may retry later. */
    }
  }

  function writeTradesInChunks(uid, trades) {
    let index = 0;
    function nextChunk() {
      if (index >= trades.length) return Promise.resolve();
      const batch = db.batch();
      const chunk = trades.slice(index, index + BATCH_LIMIT);
      chunk.forEach(function (trade) {
        batch.set(tradesCollection(uid).doc(trade.id), tradeData(trade));
      });
      index += BATCH_LIMIT;
      return batch.commit().then(nextChunk);
    }
    return nextChunk();
  }

  /**
   * Migrates `bpt.journal.v1` into `users/{uid}` the first time the account
   * is used: only when the account has no trades AND a local key exists.
   * Writes trades in `writeBatch` chunks of at most 500, writes
   * `meta/balances` and `meta/settings`, stamps `migratedAt` on the user
   * document, and only then removes the local key so a failure keeps the
   * source for a retry. Resolves `true` when a migration happened, `false`
   * otherwise. Rejects only on Firestore errors; the caller decides whether
   * to surface them, because a migration failure must not block login.
   */
  function migrateLocalData(uid) {
    if (!db || !uid) return Promise.resolve(false);
    const data = readLocalJournal();
    if (!data) return Promise.resolve(false);

    return tradesCollection(uid).limit(1).get().then(function (snapshot) {
      if (!snapshot.empty) return false;

      return writeTradesInChunks(uid, data.trades || []).then(function () {
        const batch = db.batch();
        batch.set(metaDoc(uid, 'balances'), Object.assign({}, data.balances));
        batch.set(metaDoc(uid, 'settings'), Object.assign({}, data.settings));
        batch.set(userDoc(uid), {
          migratedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return batch.commit();
      }).then(function () {
        removeLocalJournal();
        return true;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Account deletion                                                    */
  /* ------------------------------------------------------------------ */

  function deleteQueryInChunks(query) {
    return query.limit(BATCH_LIMIT).get().then(function (snapshot) {
      if (snapshot.empty) return undefined;
      const batch = db.batch();
      snapshot.docs.forEach(function (doc) { batch.delete(doc.ref); });
      return batch.commit().then(function () {
        /* A full page means more documents may remain. */
        return snapshot.size < BATCH_LIMIT ? undefined : deleteQueryInChunks(query);
      });
    });
  }

  /**
   * Removes every document owned by `uid`: trades (chunked), the meta
   * documents, and the user document itself. Security Rules require the
   * session to still be authenticated, so this runs BEFORE `user.delete()`.
   */
  function purgeUserData(uid) {
    if (!db) return Promise.reject(new Error('firestore-unavailable'));
    return deleteQueryInChunks(tradesCollection(uid)).then(function () {
      const batch = db.batch();
      batch.delete(metaDoc(uid, 'balances'));
      batch.delete(metaDoc(uid, 'settings'));
      return batch.commit();
    }).then(function () {
      return userDoc(uid).delete();
    });
  }

  /**
   * Re-authenticates the current user for a sensitive operation. Uses the
   * email/password credential when supplied; otherwise falls back to the
   * Google popup. Rejects with the SDK error when neither path succeeds.
   */
  function reauthenticate(user, credentials) {
    credentials = credentials || {};
    if (credentials.password && user.email) {
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, credentials.password);
      return user.reauthenticateWithCredential(credential);
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    return user.reauthenticateWithPopup(provider);
  }

  /**
   * Deletes the account and all of its stored data. Purges the user's
   * documents, then deletes the auth account; if the SDK demands a recent
   * login, it re-authenticates once and retries, then ends the session.
   * The caller owns the explicit user confirmation.
   */
  function deleteAccount(user, credentials) {
    const uid = user && user.uid;
    if (!uid) return Promise.reject(new Error('not-authenticated'));
    return purgeUserData(uid)
      .then(function () {
        return user.delete();
      })
      .catch(function (err) {
        if (err && err.code === 'auth/requires-recent-login') {
          return reauthenticate(user, credentials).then(function () {
            return user.delete();
          });
        }
        throw err;
      })
      .then(function () {
        /* The account is gone; make sure the session is closed too. */
        if (!hasSdk()) return null;
        return firebase.auth().signOut().catch(function () { return null; });
      });
  }

  return {
    init: init,
    getApp: getApp,
    getDb: getDb,
    getAuth: getAuth,
    isPersistenceEnabled: isPersistenceEnabled,
    getPersistenceError: getPersistenceError,

    signInWithEmail: signInWithEmail,
    signUpWithEmail: signUpWithEmail,
    signInWithGoogle: signInWithGoogle,
    completeGoogleRedirect: completeGoogleRedirect,
    logout: logout,
    resendVerification: resendVerification,
    reloadCurrentUser: reloadCurrentUser,
    onAuthStateChanged: onAuthStateChanged,
    checkAccess: checkAccess,
    getCurrentUser: getCurrentUser,

    adapter: adapter,

    migrateLocalData: migrateLocalData,
    deleteAccount: deleteAccount
  };
})();
