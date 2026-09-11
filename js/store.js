/* store.js
 * Persistence, calculations and import/export for the trading journal.
 * Exposes the global `Store`. Plain script (no modules).
 *
 * Persistence: Firestore via the FirebaseService adapter, bound per user by
 * attach(uid). Reads and calculations stay synchronous against in-memory
 * state; mutations update state optimistically and persist asynchronously.
 * The legacy localStorage key "bpt.journal.v1" is retained only as a
 * one-time migration source (handled in a later phase).
 */

const Store = (function () {
  'use strict';

  const STORAGE_KEY = 'bpt.journal.v1';
  const SCHEMA_VERSION = 1;

  const BALANCES = (typeof DEFAULT_BALANCES !== 'undefined')
    ? DEFAULT_BALANCES
    : { Sim: 5000, Real: 5000, Fondeo: 50000 };

  const ACCOUNT_LIST = (typeof ACCOUNTS !== 'undefined') ? ACCOUNTS : ['Sim', 'Real', 'Fondeo'];

  const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  /* Strategy catalog (from instruments.js). */
  const STRATEGY_LIST = (typeof STRATEGIES !== 'undefined' && Array.isArray(STRATEGIES))
    ? STRATEGIES
    : [];
  const STRATEGY_GROUP_ORDER = (typeof STRATEGY_GROUPS !== 'undefined' && Array.isArray(STRATEGY_GROUPS))
    ? STRATEGY_GROUPS
    : ['scalping', 'swing', 'legacy'];
  const LEGACY_LABEL_SUFFIX = ' (sin clasificar)';

  /* Risk-settings defaults (from instruments.js). */
  const RISK_PCT_DEFAULT = (typeof DEFAULT_RISK_PCT !== 'undefined') ? DEFAULT_RISK_PCT : 2;
  const DAILY_LIMIT_DEFAULT = (typeof DEFAULT_DAILY_TRADE_LIMIT !== 'undefined')
    ? DEFAULT_DAILY_TRADE_LIMIT
    : 3;

  /* Risk-discipline bounds and warning thresholds (from instruments.js). */
  const RISK_MIN = (typeof RISK_PCT_MIN !== 'undefined') ? RISK_PCT_MIN : 0.5;
  const RISK_MAX = (typeof RISK_PCT_MAX !== 'undefined') ? RISK_PCT_MAX : 2;
  const RISK_HARD_MAX = (typeof RISK_PCT_HARD_MAX !== 'undefined') ? RISK_PCT_HARD_MAX : 3;
  const MIN_RR_DEFAULT = (typeof DEFAULT_MIN_RR !== 'undefined') ? DEFAULT_MIN_RR : 2;
  const DD_WARN_PCT = (typeof DAILY_DD_WARN_PCT !== 'undefined') ? DAILY_DD_WARN_PCT : 5;
  const STREAK_WARN_COUNT = (typeof STREAK_WARN !== 'undefined') ? STREAK_WARN : 3;

  /* ------------------------------------------------------------------ */
  /* In-memory state                                                     */
  /* ------------------------------------------------------------------ */

  let state = emptyState();

  function emptyState() {
    return {
      version: SCHEMA_VERSION,
      trades: [],
      balances: Object.assign({}, BALANCES),
      settings: {}
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* ------------------------------------------------------------------ */
  /* Small coercion helpers                                              */
  /* ------------------------------------------------------------------ */

  function numOr(value, fallback) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function intOr(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function strOr(value, fallback) {
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function uid() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (err) { /* fall through to manual id */ }
    return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ------------------------------------------------------------------ */
  /* Persistence (Firestore adapter)                                     */
  /* ------------------------------------------------------------------ */

  function canPersist() {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch (err) {
      return false;
    }
  }

  function firebaseAdapter() {
    return (typeof FirebaseService !== 'undefined' && FirebaseService.adapter)
      ? FirebaseService.adapter
      : null;
  }

  function reportPersistError(err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Store] Firestore write failed:', err && err.code ? err.code : err);
    }
  }

  function persistTrade(trade) {
    const adapter = firebaseAdapter();
    if (!attachedUid || !adapter) return;
    adapter.setTrade(attachedUid, trade).catch(reportPersistError);
  }

  function persistTradeDeletion(tradeId) {
    const adapter = firebaseAdapter();
    if (!attachedUid || !adapter) return;
    adapter.deleteTrade(attachedUid, tradeId).catch(reportPersistError);
  }

  function persistBalances() {
    const adapter = firebaseAdapter();
    if (!attachedUid || !adapter) return;
    adapter.setBalances(attachedUid, state.balances).catch(reportPersistError);
  }

  function persistSettings() {
    const adapter = firebaseAdapter();
    if (!attachedUid || !adapter) return;
    adapter.setSettings(attachedUid, state.settings).catch(reportPersistError);
  }

  /**
   * Writes the whole in-memory state and removes documents for trades that
   * existed before the state was replaced. Used by import/seed/clear.
   */
  function persistAll(previousIds) {
    const adapter = firebaseAdapter();
    if (!attachedUid || !adapter) return;
    const currentIds = {};
    state.trades.forEach(function (trade) {
      currentIds[trade.id] = true;
      adapter.setTrade(attachedUid, trade).catch(reportPersistError);
    });
    (previousIds || []).forEach(function (id) {
      if (!currentIds[id]) adapter.deleteTrade(attachedUid, id).catch(reportPersistError);
    });
    adapter.setBalances(attachedUid, state.balances).catch(reportPersistError);
    adapter.setSettings(attachedUid, state.settings).catch(reportPersistError);
  }

  /* ------------------------------------------------------------------ */
  /* Attachment + change subscription                                    */
  /* ------------------------------------------------------------------ */

  let attachedUid = null;
  let unsubscribeSnapshots = null;
  let subscribers = [];

  function notifySubscribers() {
    subscribers.slice().forEach(function (fn) {
      try {
        fn();
      } catch (err) {
        /* A broken subscriber must not stop the others. */
      }
    });
  }

  /** Registers a re-render callback; returns an unsubscribe function. */
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);
    return function () {
      subscribers = subscribers.filter(function (existing) { return existing !== fn; });
    };
  }

  function applyBalances(raw) {
    const base = Object.assign({}, BALANCES);
    if (raw && typeof raw === 'object') {
      ACCOUNT_LIST.forEach(function (account) {
        if (raw[account] !== undefined) base[account] = numOr(raw[account], base[account]);
      });
    }
    state.balances = base;
  }

  function applySettings(raw) {
    state.settings = (raw && typeof raw === 'object') ? raw : {};
  }

  /**
   * Binds the store to a user's Firestore documents: hydrates the in-memory
   * state, then keeps it in sync via snapshots. Read/compute methods stay
   * synchronous. Resolves `true` when attached; rejects if hydration fails.
   */
  function attach(uid) {
    detach();
    if (!uid) return Promise.resolve(false);
    const adapter = firebaseAdapter();
    if (!adapter) return Promise.resolve(false);
    attachedUid = uid;

    return adapter.fetchAll(uid).then(function (data) {
      if (attachedUid !== uid) return false;
      state.trades = (data.trades || []).map(sanitizeTrade).filter(Boolean);
      applyBalances(data.balances);
      applySettings(data.settings);

      unsubscribeSnapshots = adapter.subscribe(uid, {
        onTrades: function (trades) {
          if (attachedUid !== uid) return;
          state.trades = (trades || []).map(sanitizeTrade).filter(Boolean);
          notifySubscribers();
        },
        onBalances: function (raw) {
          if (attachedUid !== uid) return;
          applyBalances(raw);
          notifySubscribers();
        },
        onSettings: function (raw) {
          if (attachedUid !== uid) return;
          applySettings(raw);
          notifySubscribers();
        },
        onError: reportPersistError
      });

      notifySubscribers();
      return true;
    }).catch(function (err) {
      if (attachedUid === uid) attachedUid = null;
      throw err;
    });
  }

  /** Unbinds the user and clears in-memory data so nothing leaks across users. */
  function detach() {
    if (typeof unsubscribeSnapshots === 'function') {
      try {
        unsubscribeSnapshots();
      } catch (err) {
        /* Ignore: the listener may already be gone. */
      }
    }
    unsubscribeSnapshots = null;
    attachedUid = null;
    state = emptyState();
    notifySubscribers();
  }

  /* ------------------------------------------------------------------ */
  /* Normalization / validation of imported data                         */
  /* ------------------------------------------------------------------ */

  function normalize(payload) {
    const base = emptyState();
    if (!payload || typeof payload !== 'object') return base;

    if (Array.isArray(payload)) {
      base.trades = payload.map(sanitizeTrade).filter(Boolean);
      return base;
    }

    if (Array.isArray(payload.trades)) {
      base.trades = payload.trades.map(sanitizeTrade).filter(Boolean);
    }

    if (payload.balances && typeof payload.balances === 'object') {
      ACCOUNT_LIST.forEach(function (account) {
        if (payload.balances[account] !== undefined) {
          base.balances[account] = numOr(payload.balances[account], base.balances[account]);
        }
      });
    }

    if (payload.settings && typeof payload.settings === 'object') {
      base.settings = payload.settings;
    }

    return base;
  }

  function sanitizeTrade(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: raw.id ? String(raw.id) : uid(),
      tradeNumber: intOr(raw.tradeNumber, 0),
      account: strOr(raw.account, 'Sim'),
      instrument: strOr(raw.instrument, ''),
      contracts: numOr(raw.contracts, 0),
      strategy: strOr(raw.strategy, ''),
      direction: strOr(raw.direction, 'Largo'),
      entryDate: strOr(raw.entryDate, ''),
      entryTime: strOr(raw.entryTime, ''),
      entryPrice: numOr(raw.entryPrice, 0),
      exitDate: strOr(raw.exitDate, ''),
      exitTime: strOr(raw.exitTime, ''),
      exitPrice: numOr(raw.exitPrice, 0),
      stop: numOr(raw.stop, 0),
      target: numOr(raw.target, 0),
      plannedRisk: numOr(raw.plannedRisk, 0),
      exitType: strOr(raw.exitType, ''),
      emotion: strOr(raw.emotion, ''),
      notes: strOr(raw.notes, '')
    };
  }

  /* ------------------------------------------------------------------ */
  /* Date / time helpers                                                 */
  /* ------------------------------------------------------------------ */

  function parseDateTime(date, time) {
    if (!date) return null;
    const d = String(date).split('-').map(Number);
    if (d.length !== 3 || d.some(function (part) { return !Number.isFinite(part); })) return null;
    const t = String(time || '00:00').split(':').map(Number);
    const hh = Number.isFinite(t[0]) ? t[0] : 0;
    const mm = Number.isFinite(t[1]) ? t[1] : 0;
    const dt = new Date(d[0], d[1] - 1, d[2], hh, mm, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  function entryTimestamp(trade) {
    const dt = parseDateTime(trade.entryDate, trade.entryTime);
    return dt ? dt.getTime() : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Public read accessors                                               */
  /* ------------------------------------------------------------------ */

  function getTrades() {
    return state.trades.map(function (t) { return Object.assign({}, t); });
  }

  function getBalances() {
    return Object.assign({}, state.balances);
  }

  function getSettings() {
    return Object.assign({}, state.settings);
  }

  /* ------------------------------------------------------------------ */
  /* Strategy catalog helpers                                            */
  /* ------------------------------------------------------------------ */

  function findStrategy(id) {
    const key = strOr(id, '');
    if (!key) return null;
    for (let i = 0; i < STRATEGY_LIST.length; i += 1) {
      if (STRATEGY_LIST[i].id === key) return STRATEGY_LIST[i];
    }
    return null;
  }

  /**
   * Resolves any stored strategy value to a display label.
   * Named strategies -> catalog name; legacy E1..E5 -> "<id> (sin clasificar)";
   * anything unknown -> the raw id, so no value ever renders blank.
   */
  function strategyLabel(id) {
    const key = strOr(id, '');
    if (!key) return '';
    const found = findStrategy(key);
    if (!found) return key;
    if (found.group === 'legacy') return found.id + LEGACY_LABEL_SUFFIX;
    return found.name;
  }

  function strategyGroup(id) {
    const found = findStrategy(id);
    return found ? found.group : '';
  }

  /** Returns a copy of the catalog in display order (scalping, swing, legacy). */
  function getStrategies() {
    return STRATEGY_LIST.map(function (strategy) {
      return { id: strategy.id, name: strategy.name, group: strategy.group };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Per-account risk settings                                           */
  /* ------------------------------------------------------------------ */

  function normalizeRiskPct(value) {
    const n = numOr(value, NaN);
    if (!Number.isFinite(n) || n < 0) return RISK_PCT_DEFAULT;
    return n;
  }

  function normalizeDailyLimit(value) {
    const n = numOr(value, NaN);
    if (!Number.isFinite(n) || n < 0) return DAILY_LIMIT_DEFAULT;
    return n;
  }

  /**
   * Returns `{ Sim:{riskPct,dailyTradeLimit}, Real:{...}, Fondeo:{...} }`,
   * normalizing every value and falling back to the defaults (2 / 3) for
   * missing, non-numeric or negative input. A daily limit of 0 is valid.
   */
  function getRiskSettings() {
    const raw = (state.settings && typeof state.settings === 'object') ? state.settings : {};
    const riskMap = (raw.riskPct && typeof raw.riskPct === 'object') ? raw.riskPct : {};
    const limitMap = (raw.dailyTradeLimit && typeof raw.dailyTradeLimit === 'object') ? raw.dailyTradeLimit : {};
    const out = {};
    ACCOUNT_LIST.forEach(function (account) {
      out[account] = {
        riskPct: normalizeRiskPct(riskMap[account]),
        dailyTradeLimit: normalizeDailyLimit(limitMap[account])
      };
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Public mutations (each one auto-saves)                              */
  /* ------------------------------------------------------------------ */

  function setBalances(obj) {
    if (!obj || typeof obj !== 'object') return getBalances();
    ACCOUNT_LIST.forEach(function (account) {
      if (obj[account] !== undefined) {
        state.balances[account] = numOr(obj[account], state.balances[account]);
      }
    });
    persistBalances();
    return getBalances();
  }

  /**
   * Shallow-merges `patch` into the persisted settings and returns the merged
   * settings. Unrelated top-level keys are preserved.
   */
  function setSettings(patch) {
    if (!patch || typeof patch !== 'object') return getSettings();
    state.settings = Object.assign({}, state.settings, patch);
    persistSettings();
    return getSettings();
  }

  function nextTradeNumber() {
    let max = 0;
    state.trades.forEach(function (t) {
      const n = intOr(t.tradeNumber, 0);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function addTrade(trade) {
    const record = sanitizeTrade(trade);
    if (!record) return null;
    if (!record.id) record.id = uid();
    if (!record.tradeNumber || record.tradeNumber <= 0) record.tradeNumber = nextTradeNumber();
    state.trades.push(record);
    persistTrade(record);
    return Object.assign({}, record);
  }

  function updateTrade(id, patch) {
    const index = state.trades.findIndex(function (t) { return t.id === id; });
    if (index === -1) return null;
    const merged = Object.assign({}, state.trades[index], patch || {});
    state.trades[index] = sanitizeTrade(merged);
    persistTrade(state.trades[index]);
    return Object.assign({}, state.trades[index]);
  }

  function deleteTrade(id) {
    const before = state.trades.length;
    state.trades = state.trades.filter(function (t) { return t.id !== id; });
    if (state.trades.length < before) persistTradeDeletion(id);
    return state.trades.length < before;
  }

  function clearAll() {
    const previousIds = state.trades.map(function (t) { return t.id; });
    state = emptyState();
    persistAll(previousIds);
  }

  /* ------------------------------------------------------------------ */
  /* Trade calculations (must match the original Excel)                  */
  /* ------------------------------------------------------------------ */

  function computeTrade(trade) {
    const spec = (typeof INSTRUMENTS !== 'undefined' && INSTRUMENTS[trade.instrument])
      ? INSTRUMENTS[trade.instrument]
      : { pointValue: 0, commission: 0 };

    const contracts = numOr(trade.contracts, 0);
    const entryPrice = numOr(trade.entryPrice, 0);
    const exitPrice = numOr(trade.exitPrice, 0);

    const points = (trade.direction === 'Corto')
      ? (entryPrice - exitPrice)
      : (exitPrice - entryPrice);

    const pointValue = spec.pointValue;
    const gross = points * contracts * pointValue;
    const commission = spec.commission * contracts;
    const net = gross - commission;

    const entryDt = parseDateTime(trade.entryDate, trade.entryTime);
    const exitDt = parseDateTime(trade.exitDate, trade.exitTime);

    let durationMinutes = null;
    if (entryDt && exitDt) {
      durationMinutes = Math.round((exitDt.getTime() - entryDt.getTime()) / 60000);
    }

    const dayOfWeek = entryDt ? entryDt.getDay() : null;
    const month = entryDt ? entryDt.getMonth() + 1 : null;
    const year = entryDt ? entryDt.getFullYear() : null;

    return Object.assign({}, trade, {
      points: points,
      pointValue: pointValue,
      gross: gross,
      commission: commission,
      net: net,
      durationMinutes: durationMinutes,
      dayOfWeek: dayOfWeek,
      dayOfWeekName: dayOfWeek === null ? '' : DAY_NAMES_ES[dayOfWeek],
      month: month,
      year: year
    });
  }

  /**
   * Enriches every trade with computed fields and a running `cumulative`
   * sum of `net`, ordered by entry datetime ascending.
   */
  function computeAll(trades) {
    const list = (trades || []).map(computeTrade);
    list.sort(function (a, b) {
      const ta = entryTimestamp(a);
      const tb = entryTimestamp(b);
      if (ta !== tb) return ta - tb;
      return (a.tradeNumber || 0) - (b.tradeNumber || 0);
    });
    let cumulative = 0;
    list.forEach(function (t) {
      cumulative += t.net;
      t.cumulative = cumulative;
    });
    return list;
  }

  /* ------------------------------------------------------------------ */
  /* KPIs                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Win/Loss definition (matches the original dashboard):
   *   win  = net > 0
   *   loss = net <= 0
   */
  function getKpis(trades) {
    const list = computeAll(trades || []);
    const totalTrades = list.length;

    let wins = 0;
    let losses = 0;
    let netTotal = 0;
    let grossProfit = 0;   // sum of positive net results
    let grossLoss = 0;     // sum of negative net results (negative value)
    let totalCommission = 0;
    let durationSum = 0;
    let durationCount = 0;
    let bestTrade = 0;
    let worstTrade = 0;

    list.forEach(function (t) {
      netTotal += t.net;
      totalCommission += t.commission;
      if (t.durationMinutes !== null && t.durationMinutes !== undefined) {
        durationSum += t.durationMinutes;
        durationCount += 1;
      }
      if (t.net > 0) {
        wins += 1;
        grossProfit += t.net;
      } else {
        losses += 1;
        grossLoss += t.net;
      }
      if (totalTrades > 0) {
        if (t.net > bestTrade) bestTrade = t.net;
        if (t.net < worstTrade) worstTrade = t.net;
      }
    });

    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = grossLoss === 0
      ? (grossProfit > 0 ? Infinity : 0)
      : grossProfit / Math.abs(grossLoss);
    const expectancy = totalTrades > 0 ? netTotal / totalTrades : 0;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const avgDurationMinutes = durationCount > 0 ? durationSum / durationCount : 0;

    return {
      totalTrades: totalTrades,
      wins: wins,
      losses: losses,
      winRate: winRate,
      netTotal: netTotal,
      grossProfit: grossProfit,
      grossLoss: grossLoss,
      profitFactor: profitFactor,
      expectancy: expectancy,
      avgWin: avgWin,
      avgLoss: avgLoss,
      maxDrawdown: computeMaxDrawdown(list),
      bestTrade: bestTrade,
      worstTrade: worstTrade,
      avgDurationMinutes: avgDurationMinutes,
      totalCommission: totalCommission
    };
  }

  /** Peak-to-trough drawdown in dollars over the cumulative equity series. */
  function computeMaxDrawdown(list) {
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    list.forEach(function (t) {
      cumulative += t.net;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
    return maxDrawdown;
  }

  /** Equity curve points: one per trade, in chronological order. */
  function getEquitySeries(trades) {
    const list = computeAll(trades || []);
    return list.map(function (t) {
      return {
        id: t.id,
        date: t.entryDate,
        label: t.entryDate,
        cumulative: t.cumulative
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Current balances (initial balance + sum of net per account)         */
  /* ------------------------------------------------------------------ */

  function getAccountBalances() {
    const totals = {};
    ACCOUNT_LIST.forEach(function (account) {
      totals[account] = numOr(state.balances[account], 0);
    });
    state.trades.forEach(function (t) {
      const computed = computeTrade(t);
      if (totals[computed.account] !== undefined) {
        totals[computed.account] += computed.net;
      }
    });
    return totals;
  }

  function getTotalBalance() {
    const totals = getAccountBalances();
    return ACCOUNT_LIST.reduce(function (sum, account) {
      return sum + (totals[account] || 0);
    }, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Risk calculation (pure)                                             */
  /* ------------------------------------------------------------------ */

  function instrumentSpec(id) {
    if (typeof INSTRUMENTS === 'undefined' || !INSTRUMENTS) return null;
    const key = strOr(id, '');
    if (!key) return null;
    return INSTRUMENTS[key] || null;
  }

  /**
   * Pure risk calculation.
   *
   *   budget          = (riskPct / 100) * balance
   *   riskPerContract = stopDistance * pointValue + commission
   *   contracts       = floor(budget / riskPerContract)
   *
   * Returns `{ valid, reason, budget, riskPerContract, contracts, viable,
   * minBalanceForOneContract, size }`. `valid` is false (and `contracts` 0)
   * when an input is missing/non-numeric or `stopDistance <= 0`; `reason`
   * names the first failing input.
   */
  function computeRisk(inputs) {
    const opts = inputs || {};
    const balance = numOr(opts.balance, NaN);
    const riskPct = numOr(opts.riskPct, NaN);
    const stopDistance = numOr(opts.stopDistance, NaN);
    const spec = instrumentSpec(opts.instrument);

    const result = {
      valid: false,
      reason: '',
      budget: 0,
      riskPerContract: 0,
      contracts: 0,
      viable: false,
      minBalanceForOneContract: null,
      size: spec ? spec.size : null
    };

    if (!spec) { result.reason = 'instrument'; return result; }
    if (!Number.isFinite(balance)) { result.reason = 'balance'; return result; }
    if (!Number.isFinite(riskPct) || riskPct <= 0) { result.reason = 'riskPct'; return result; }
    if (!Number.isFinite(stopDistance) || stopDistance <= 0) { result.reason = 'stopDistance'; return result; }

    const budget = (riskPct / 100) * balance;
    const riskPerContract = stopDistance * spec.pointValue + spec.commission;
    const contracts = riskPerContract > 0 ? Math.floor(budget / riskPerContract) : 0;

    result.valid = true;
    result.budget = budget;
    result.riskPerContract = riskPerContract;
    result.contracts = contracts;
    result.viable = contracts >= 1;
    result.minBalanceForOneContract = riskPerContract / (riskPct / 100);
    return result;
  }

  /**
   * Smallest account balance that affords exactly one contract at `riskPct`.
   * Returns null when the instrument or `riskPct` is invalid (riskPct <= 0).
   */
  function minBalanceForOneContract(inputs) {
    const opts = inputs || {};
    const riskPct = numOr(opts.riskPct, NaN);
    const stopDistance = numOr(opts.stopDistance, NaN);
    const spec = instrumentSpec(opts.instrument);
    if (!spec) return null;
    if (!Number.isFinite(riskPct) || riskPct <= 0) return null;
    if (!Number.isFinite(stopDistance) || stopDistance <= 0) return null;
    const riskPerContract = stopDistance * spec.pointValue + spec.commission;
    return riskPerContract / (riskPct / 100);
  }

  /* ------------------------------------------------------------------ */
  /* Risk discipline (pure)                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Clamps a risk percentage to the recommended band [0.5, 3].
   * Returns `{ valid, value, clamped, warned, reason }`:
   *   - non-numeric or negative input -> valid false (value is the default).
   *   - above 3%  -> clamped to 3 and warned ("hard-max").
   *   - above 2%  -> kept but warned ("above-recommended").
   *   - below 0.5% -> clamped up to 0.5 ("below-min").
   */
  function clampRiskPct(value) {
    const n = numOr(value, NaN);
    const result = { valid: false, value: RISK_PCT_DEFAULT, clamped: false, warned: false, reason: '' };
    if (!Number.isFinite(n) || n < 0) {
      result.reason = 'invalid';
      return result;
    }
    let v = n;
    if (v > RISK_HARD_MAX) {
      v = RISK_HARD_MAX;
      result.clamped = true;
      result.warned = true;
      result.reason = 'hard-max';
    } else if (v > RISK_MAX) {
      result.warned = true;
      result.reason = 'above-recommended';
    } else if (v < RISK_MIN) {
      v = RISK_MIN;
      result.clamped = true;
      result.reason = 'below-min';
    }
    result.valid = true;
    result.value = v;
    return result;
  }

  /**
   * Normalizes a daily trade limit. Accepts 0 (allowed); rejects negative or
   * non-numeric input. Returns `{ valid, value, clamped }` (fractional input
   * is floored, so `clamped` reports whether the stored value changed).
   */
  function clampDailyLimit(value) {
    const n = numOr(value, NaN);
    if (!Number.isFinite(n) || n < 0) {
      return { valid: false, value: DAILY_LIMIT_DEFAULT, clamped: false };
    }
    const v = Math.floor(n);
    return { valid: true, value: v, clamped: v !== n };
  }

  /** Configured minimum R/R (default 2). Invalid values fall back to default. */
  function getMinRR() {
    const raw = (state.settings && typeof state.settings === 'object') ? state.settings.minRR : undefined;
    const n = numOr(raw, NaN);
    if (!Number.isFinite(n) || n <= 0) return MIN_RR_DEFAULT;
    return n;
  }

  /**
   * Pure risk/reward ratio: `target / plannedRisk`, warned below `minRR`
   * (explicit `minRR` wins; otherwise the configured minimum is used).
   * `valid` is false when `plannedRisk` is missing/<= 0 or `target` is
   * missing/negative.
   */
  function computeRR(inputs) {
    const opts = inputs || {};
    const plannedRisk = numOr(opts.plannedRisk, NaN);
    const target = numOr(opts.target, NaN);
    const minRRRaw = numOr(opts.minRR, NaN);
    const minRR = (Number.isFinite(minRRRaw) && minRRRaw > 0) ? minRRRaw : getMinRR();

    const result = { valid: false, reason: '', ratio: 0, minRR: minRR, meetsMinimum: false, warned: false };
    if (!Number.isFinite(plannedRisk) || plannedRisk <= 0) { result.reason = 'plannedRisk'; return result; }
    if (!Number.isFinite(target) || target < 0) { result.reason = 'target'; return result; }

    const ratio = target / plannedRisk;
    result.valid = true;
    result.ratio = ratio;
    result.meetsMinimum = ratio >= minRR;
    result.warned = ratio < minRR;
    return result;
  }

  /**
   * Non-linear recovery ratio for a drawdown fraction:
   *   recoveryPct = lossPct / (1 - lossPct)
   * Returns the ratio (0.5 -> 1, displayed as 100%). A full loss (>= 1)
   * cannot be recovered and returns Infinity.
   */
  function recoveryPct(lossPct) {
    const n = numOr(lossPct, NaN);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n >= 1) return Infinity;
    return n / (1 - n);
  }

  /** Sorts trades chronologically (entry datetime, then trade number). */
  function sortChronologically(list) {
    return list.slice().sort(function (a, b) {
      const ta = entryTimestamp(a);
      const tb = entryTimestamp(b);
      if (ta !== tb) return ta - tb;
      return (a.tradeNumber || 0) - (b.tradeNumber || 0);
    });
  }

  /**
   * Normalizes the flexible discipline-call shapes: `(trades, account)`,
   * `(account)` (uses the store's trades), or no args (all trades).
   */
  function disciplineInput(a, b) {
    if (Array.isArray(a)) return { trades: a, account: strOr(b, '') };
    return { trades: state.trades, account: strOr(a, '') };
  }

  /** Local ISO date (YYYY-MM-DD) used to scope the current trading day. */
  function todayISO() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  /**
   * Stop-discipline summary for a set of trades (optionally one account):
   * `{ total, withStop, missingStop, missing, breakEven, trailing }`.
   * A trade "has a stop" when its normalized `stop` is greater than 0;
   * Break-Even and Trailing-Stop usage come from `exitType`.
   */
  function stopDiscipline(a, b) {
    const input = disciplineInput(a, b);
    const list = input.account
      ? input.trades.filter(function (t) { return t.account === input.account; })
      : input.trades.slice();
    const result = { total: list.length, withStop: 0, missingStop: 0, missing: [], breakEven: 0, trailing: 0 };
    list.forEach(function (t) {
      const stop = numOr(t.stop, 0);
      if (stop > 0) {
        result.withStop += 1;
      } else {
        result.missingStop += 1;
        result.missing.push(t.id);
      }
      if (t.exitType === 'Break Even') result.breakEven += 1;
      if (t.exitType === 'Trailing stop') result.trailing += 1;
    });
    return result;
  }

  /**
   * Current-day peak-to-trough drawdown for an account, in dollars and as a
   * percentage of the start-of-day balance (initial balance plus net of all
   * earlier trades): `{ dollars, pct, warned, trades }`. Warns at/over
   * DAILY_DD_WARN_PCT.
   */
  function intradayDrawdown(a, b) {
    const input = disciplineInput(a, b);
    const today = todayISO();
    const list = sortChronologically(input.trades.filter(function (t) {
      return t.account === input.account && t.entryDate === today;
    }));

    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    list.forEach(function (t) {
      cumulative += computeTrade(t).net;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    let base = numOr(state.balances[input.account], 0);
    input.trades.forEach(function (t) {
      if (t.account === input.account && t.entryDate && t.entryDate < today) {
        base += computeTrade(t).net;
      }
    });

    const pct = base > 0 ? (maxDrawdown / base) * 100 : 0;
    return { dollars: maxDrawdown, pct: pct, warned: pct >= DD_WARN_PCT, trades: list.length };
  }

  /**
   * Consecutive losing trades at the end of the account's chronological
   * history (loss = net <= 0, matching the KPI definition):
   * `{ count, warned }`. Warns at/over STREAK_WARN.
   */
  function losingStreak(a, b) {
    const input = disciplineInput(a, b);
    const list = sortChronologically(input.trades.filter(function (t) {
      return t.account === input.account;
    }));
    let count = 0;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (computeTrade(list[i]).net <= 0) count += 1;
      else break;
    }
    return { count: count, warned: count >= STREAK_WARN_COUNT };
  }

  /**
   * Counts the selected account's trades whose `entryDate` is the current
   * local day. Accepts `(trades, account)` or `(account)` like the other
   * discipline helpers.
   */
  function countTradesToday(a, b) {
    const input = disciplineInput(a, b);
    const today = todayISO();
    return input.trades.filter(function (t) {
      return t.account === input.account && t.entryDate === today;
    }).length;
  }

  /**
   * Warn-only daily-limit status for an account: `{ account, count, limit,
   * exceeded }`. `exceeded` is true at or over the configured limit (per the
   * spec's "reached or exceeded", a limit of 0 therefore always warns). This
   * is guidance only and never blocks a save.
   */
  function dailyLimitStatus(account) {
    const key = strOr(account, '');
    const settings = getRiskSettings()[key] || {};
    const limit = Number.isFinite(settings.dailyTradeLimit)
      ? settings.dailyTradeLimit
      : DAILY_LIMIT_DEFAULT;
    const count = countTradesToday(key);
    return {
      account: key,
      count: count,
      limit: limit,
      exceeded: count >= limit
    };
  }

  /* ------------------------------------------------------------------ */
  /* Import / export                                                     */
  /* ------------------------------------------------------------------ */

  function exportJSON() {
    return JSON.stringify({
      version: SCHEMA_VERSION,
      trades: state.trades,
      balances: state.balances,
      settings: state.settings
    }, null, 2);
  }

  /**
   * Replaces the current state with the imported payload.
   * Accepts either a full state object or a bare array of trades.
   * Throws on invalid JSON so the caller can show a message.
   */
  function importJSON(text) {
    const parsed = JSON.parse(text);
    const previousIds = state.trades.map(function (t) { return t.id; });
    if (Array.isArray(parsed)) {
      state.trades = parsed.map(sanitizeTrade).filter(Boolean);
    } else {
      state = normalize(parsed);
    }
    persistAll(previousIds);
    return true;
  }

  const CSV_HEADERS = [
    'tradeNumber', 'account', 'instrument', 'contracts', 'strategy', 'strategyName', 'direction',
    'entryDate', 'entryTime', 'entryPrice', 'exitDate', 'exitTime', 'exitPrice',
    'exitType', 'emotion', 'notes', 'points', 'net', 'cumulative'
  ];

  function csvEscape(value) {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function exportCSV(trades) {
    const list = computeAll(trades || []);
    const lines = [CSV_HEADERS.join(',')];
    list.forEach(function (t) {
      const row = CSV_HEADERS.map(function (header) {
        /* `strategyName` is a read-only convenience column: the persisted
         * `strategy` stays the id, so import round-trips unchanged. */
        if (header === 'strategyName') return csvEscape(strategyLabel(t.strategy));
        return csvEscape(t[header]);
      });
      lines.push(row.join(','));
    });
    return lines.join('\r\n');
  }

  function parseCSVRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const src = String(text || '').replace(/^\uFEFF/, '');

    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = ''; rows.push(row); row = [];
      } else if (ch === '\r') {
        /* skip; handled by \n */
      } else {
        field += ch;
      }
    }
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  /** Parses a CSV produced by exportCSV and returns an array of trades. */
  function parseCSV(text) {
    const rows = parseCSVRows(text);
    if (!rows.length) return [];
    const headers = rows[0].map(function (h) { return h.trim(); });
    const out = [];
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.length === 1 && row[0] === '') continue;
      const obj = {};
      headers.forEach(function (header, idx) {
        obj[header] = row[idx] !== undefined ? row[idx] : '';
      });
      if (!obj.instrument && !obj.entryDate) continue;
      const trade = sanitizeTrade(obj);
      if (trade) out.push(trade);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Sample data (only inserted when explicitly requested)               */
  /* ------------------------------------------------------------------ */

  function seedSample() {
    const samples = [
      { tradeNumber: 1, account: 'Sim', instrument: 'NQ', contracts: 2, strategy: 'vela-a-vela', direction: 'Largo',
        entryDate: '2024-01-08', entryTime: '09:35', entryPrice: 16850.25, exitDate: '2024-01-08', exitTime: '09:58', exitPrice: 16895.50,
        exitType: 'Profit', emotion: 'Confianza', notes: 'Ruptura de rango en apertura.' },
      { tradeNumber: 2, account: 'Real', instrument: 'ES', contracts: 1, strategy: 'cruces-medias', direction: 'Corto',
        entryDate: '2024-01-10', entryTime: '10:05', entryPrice: 4790.00, exitDate: '2024-01-10', exitTime: '10:31', exitPrice: 4798.25,
        exitType: 'Stop', emotion: 'Miedo', notes: 'Entrada contra la tendencia.' },
      { tradeNumber: 3, account: 'Sim', instrument: 'MNQ', contracts: 5, strategy: 'doble-00', direction: 'Largo',
        entryDate: '2024-01-12', entryTime: '11:15', entryPrice: 16750.00, exitDate: '2024-01-12', exitTime: '11:42', exitPrice: 16788.00,
        exitType: 'Trailing stop', emotion: 'Control', notes: 'Gestión con trailing tras impulso.' },
      { tradeNumber: 4, account: 'Fondeo', instrument: 'MES', contracts: 10, strategy: 'box-breakout', direction: 'Corto',
        entryDate: '2024-02-02', entryTime: '09:40', entryPrice: 4955.25, exitDate: '2024-02-02', exitTime: '09:55', exitPrice: 4948.75,
        exitType: 'Profit', emotion: 'Confianza', notes: 'Reversión en resistencia.' },
      { tradeNumber: 5, account: 'Real', instrument: 'CL', contracts: 1, strategy: 'gaps', direction: 'Largo',
        entryDate: '2024-02-14', entryTime: '12:20', entryPrice: 78.45, exitDate: '2024-02-14', exitTime: '12:50', exitPrice: 77.90,
        exitType: 'Stop', emotion: 'Frustración', notes: 'Falso quiebre del soporte.' },
      { tradeNumber: 6, account: 'Fondeo', instrument: 'FDAX', contracts: 2, strategy: 'tres-impulsos', direction: 'Corto',
        entryDate: '2024-03-05', entryTime: '08:10', entryPrice: 17850.00, exitDate: '2024-03-05', exitTime: '08:47', exitPrice: 17805.00,
        exitType: 'Profit', emotion: 'Codicia', notes: 'Apertura europea con gap.' },
      { tradeNumber: 7, account: 'Sim', instrument: 'MYM', contracts: 8, strategy: 'weinstein', direction: 'Largo',
        entryDate: '2024-03-18', entryTime: '13:05', entryPrice: 38950.00, exitDate: '2024-03-18', exitTime: '13:20', exitPrice: 38942.00,
        exitType: 'Break Even', emotion: 'Duda', notes: 'Salida sin convicción.' },
      { tradeNumber: 8, account: 'Real', instrument: '6E', contracts: 1, strategy: 'figuras-chartistas', direction: 'Corto',
        entryDate: '2024-04-09', entryTime: '09:30', entryPrice: 1.0865, exitDate: '2024-04-09', exitTime: '09:52', exitPrice: 1.0842,
        exitType: 'Cierre manual', emotion: 'Impaciencia', notes: 'Cierre anticipado por noticia.' }
    ];

    const previousIds = state.trades.map(function (t) { return t.id; });
    state.trades = samples.map(function (s) {
      return sanitizeTrade(Object.assign({ id: uid() }, s));
    });
    persistAll(previousIds);
    return getTrades();
  }

  /* ------------------------------------------------------------------ */
  /* Initialization                                                      */
  /* ------------------------------------------------------------------ */

  /* No auto-load: state is hydrated per user by attach(uid) after auth. */

  return {
    STORAGE_KEY: STORAGE_KEY,
    canPersist: canPersist,

    attach: attach,
    detach: detach,
    subscribe: subscribe,

    getTrades: getTrades,
    getBalances: getBalances,
    getSettings: getSettings,
    getRiskSettings: getRiskSettings,
    strategyLabel: strategyLabel,
    strategyGroup: strategyGroup,
    getStrategies: getStrategies,
    setBalances: setBalances,
    setSettings: setSettings,
    nextTradeNumber: nextTradeNumber,
    addTrade: addTrade,
    updateTrade: updateTrade,
    deleteTrade: deleteTrade,
    clearAll: clearAll,

    computeTrade: computeTrade,
    computeAll: computeAll,
    getKpis: getKpis,
    getEquitySeries: getEquitySeries,
    getAccountBalances: getAccountBalances,
    getTotalBalance: getTotalBalance,
    computeRisk: computeRisk,
    minBalanceForOneContract: minBalanceForOneContract,
    clampRiskPct: clampRiskPct,
    clampDailyLimit: clampDailyLimit,
    getMinRR: getMinRR,
    computeRR: computeRR,
    recoveryPct: recoveryPct,
    stopDiscipline: stopDiscipline,
    intradayDrawdown: intradayDrawdown,
    losingStreak: losingStreak,
    countTradesToday: countTradesToday,
    dailyLimitStatus: dailyLimitStatus,

    importJSON: importJSON,
    exportJSON: exportJSON,
    exportCSV: exportCSV,
    parseCSV: parseCSV,
    seedSample: seedSample,

    /* Exposed so the Phase 3 localStorage migration can reuse the exact
     * normalization rules instead of duplicating them. */
    normalize: normalize
  };
})();
