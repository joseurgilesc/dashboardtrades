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
  const SMALL_ACCOUNT_LIMIT = (typeof SMALL_ACCOUNT_MAX !== 'undefined') ? SMALL_ACCOUNT_MAX : 5000;

  /* Per-instrument target defaults, in TICKS (from instruments.js). The stop
   * distance is AUTO by default (budget-derived, see `budgetStopTicks`);
   * `FALLBACK_STOP_TICKS_DEFAULT` is used only when the budget cannot be
   * computed (missing balance/instrument). */
  const FALLBACK_STOP_TICKS_DEFAULT = (typeof FALLBACK_STOP_TICKS !== 'undefined') ? FALLBACK_STOP_TICKS : 1;
  const TARGET_R_DEFAULT = (typeof DEFAULT_TARGET_R !== 'undefined') ? DEFAULT_TARGET_R : 2;
  const TARGET_R_ALT_DEFAULT = (typeof DEFAULT_TARGET_R_ALT !== 'undefined') ? DEFAULT_TARGET_R_ALT : 3;

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

  /* Money is tracked to the cent; rounding keeps sums of floating-point
   * `net` values from leaking sub-cent noise into the contract floor. */
  function roundMoney(value) {
    return Math.round(value * 100) / 100;
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

  /**
   * Returns a copy of the most recently saved trade, or null when the journal
   * is empty. "Most recent" is the highest tradeNumber, with later array
   * positions winning ties.
   */
  function getLastTrade() {
    let best = null;
    state.trades.forEach(function (trade) {
      if (!best || intOr(trade.tradeNumber, 0) >= intOr(best.tradeNumber, 0)) best = trade;
    });
    return best ? Object.assign({}, best) : null;
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
  /* Last-used entry preferences (pure)                                  */
  /* ------------------------------------------------------------------ */

  /* The primary form selections remembered across sessions. */
  const LAST_ENTRY_FIELDS = ['account', 'instrument', 'strategy', 'direction', 'emotion'];

  /* Preferred fallback per remembered field when nothing valid is stored.
   * Instrument defaults to MES and emotion to Confianza (see instruments.js);
   * every other field keeps the first catalog value. */
  const LAST_ENTRY_DEFAULTS = {
    instrument: (typeof DEFAULT_INSTRUMENT !== 'undefined') ? DEFAULT_INSTRUMENT : '',
    emotion: (typeof DEFAULT_EMOTION !== 'undefined') ? DEFAULT_EMOTION : ''
  };

  function listOrDefault(value, fallback) {
    return (Array.isArray(value) && value.length) ? value : fallback;
  }

  /** Allowed catalog values for each remembered field (first value = default). */
  function allowedLastEntryValues() {
    const instruments = (typeof INSTRUMENTS !== 'undefined' && INSTRUMENTS)
      ? Object.keys(INSTRUMENTS)
      : [];
    const strategies = STRATEGY_LIST.map(function (strategy) { return strategy.id; });
    const directions = listOrDefault(
      (typeof DIRECTIONS !== 'undefined') ? DIRECTIONS : null,
      ['Largo', 'Corto']
    );
    const emotions = listOrDefault(
      (typeof EMOTIONS !== 'undefined') ? EMOTIONS : null,
      []
    );
    return {
      account: ACCOUNT_LIST,
      instrument: instruments,
      strategy: strategies,
      direction: directions,
      emotion: emotions
    };
  }

  /**
   * Normalizes a raw last-entry object: every field MUST be one of its
   * catalog values, otherwise it falls back to the first catalog value so a
   * stale or unknown stored selection never reaches a select.
   */
  function sanitizeLastEntry(raw) {
    const source = (raw && typeof raw === 'object') ? raw : {};
    const allowed = allowedLastEntryValues();
    const out = {};
    LAST_ENTRY_FIELDS.forEach(function (field) {
      const list = allowed[field] || [];
      const key = strOr(source[field], '');
      const preferred = LAST_ENTRY_DEFAULTS[field];
      const fallback = (preferred && list.indexOf(preferred) !== -1) ? preferred : (list[0] || '');
      out[field] = (list.length && list.indexOf(key) !== -1) ? key : fallback;
    });
    return out;
  }

  /** Returns the normalized last-used entry selections (always complete). */
  function getLastEntry() {
    const settings = (state.settings && typeof state.settings === 'object') ? state.settings : {};
    return sanitizeLastEntry(settings.lastEntry);
  }

  /**
   * Merges valid last-used entry selections into `settings.lastEntry` and
   * persists them. Invalid or unknown values are ignored (the previous valid
   * value is kept), so a caller can never persist junk.
   */
  function saveLastEntry(patch) {
    const incoming = (patch && typeof patch === 'object') ? patch : {};
    const allowed = allowedLastEntryValues();
    const next = getLastEntry();
    LAST_ENTRY_FIELDS.forEach(function (field) {
      if (incoming[field] === undefined || incoming[field] === null) return;
      const list = allowed[field] || [];
      const key = strOr(incoming[field], '');
      if (list.indexOf(key) !== -1) next[field] = key;
    });
    setSettings({ lastEntry: next });
    return next;
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
   * Normalizes an instrument id against the catalog (pure). Returns the id
   * when it is a known instrument, otherwise `fallback` when that is known,
   * and '' when neither is. The UI uses this so the calculator selector and
   * the trade form can only ever hold the same valid instrument, while an
   * unknown legacy id being edited is preserved ('' is returned) rather than
   * silently retargeted.
   */
  function normalizeInstrument(value, fallback) {
    const instruments = (typeof INSTRUMENTS !== 'undefined' && INSTRUMENTS) ? INSTRUMENTS : {};
    const keys = Object.keys(instruments);
    const key = strOr(value, '');
    if (key && keys.indexOf(key) !== -1) return key;
    const fb = strOr(fallback, '');
    if (fb && keys.indexOf(fb) !== -1) return fb;
    return '';
  }

  /**
   * Resolves the micro equivalent of a full-size instrument (pure), using the
   * `MICRO_PAIRS` catalog. Returns the micro symbol, or null when the id is
   * empty/unknown, already micro, or has no mapped equivalent.
   */
  function microEquivalent(id) {
    const key = strOr(id, '');
    if (!key) return null;
    const spec = instrumentSpec(key);
    if (!spec || spec.size !== 'full') return null;
    const pairs = (typeof MICRO_PAIRS !== 'undefined' && MICRO_PAIRS) ? MICRO_PAIRS : null;
    if (!pairs) return null;
    return pairs[key] || null;
  }

  /* ------------------------------------------------------------------ */
  /* Per-instrument stop/target config (pure)                            */
  /* ------------------------------------------------------------------ */

  /**
   * Converts a distance in TICKS to its points equivalent for an instrument
   * (`ticks × tick`). Returns NaN when the instrument or its tick is unknown.
   */
  function ticksToPoints(ticks, instrument) {
    const spec = instrumentSpec(instrument);
    const tick = spec ? numOr(spec.tick, NaN) : NaN;
    const n = numOr(ticks, NaN);
    if (!Number.isFinite(n) || !Number.isFinite(tick) || tick <= 0) return NaN;
    return n * tick;
  }

  /**
   * Converts a distance in POINTS to ticks for an instrument (`points / tick`).
   * A tick means a different number of points per instrument, so this is the
   * canonical bridge between the two units. Returns NaN on unknown input.
   */
  function pointsToTicks(points, instrument) {
    const spec = instrumentSpec(instrument);
    const tick = spec ? numOr(spec.tick, NaN) : NaN;
    const n = numOr(points, NaN);
    if (!Number.isFinite(n) || !Number.isFinite(tick) || tick <= 0) return NaN;
    return n / tick;
  }

  /**
   * Normalizes a raw per-instrument config to `{ stopTicks, stopTicksAuto,
   * targetR, targetRAlt }`. A missing, non-numeric or non-positive
   * `stopTicks` means AUTO: `stopTicks` is null and the effective distance is
   * derived from the budget by `resolveInstrumentConfig`. A positive value is
   * a fixed distance and wins over the derived one. Ticks are authoritative;
   * the target multiples are the R/B ratios (2 and 3 by default) the exit
   * distances are built from.
   */
  function normalizeInstrumentConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const stop = numOr(src.stopTicks, NaN);
    const targetR = numOr(src.targetR, NaN);
    const targetRAlt = numOr(src.targetRAlt, NaN);
    const hasFixedStop = Number.isFinite(stop) && stop > 0;
    return {
      stopTicks: hasFixedStop ? stop : null,
      stopTicksAuto: !hasFixedStop,
      targetR: (Number.isFinite(targetR) && targetR > 0) ? targetR : TARGET_R_DEFAULT,
      targetRAlt: (Number.isFinite(targetRAlt) && targetRAlt > 0) ? targetRAlt : TARGET_R_ALT_DEFAULT
    };
  }

  /**
   * Account-level fallback inputs for the budget-derived stop (reads state):
   * the start-of-day balance plus the persisted risk % and daily trade limit.
   * Used by `resolveInstrumentConfig` when the caller does not pass live
   * calculator inputs.
   */
  function accountBudgetDefaults(account) {
    const key = strOr(account, '');
    const settings = getRiskSettings()[key] || {};
    return {
      balance: startOfDayBalance(key),
      riskPct: Number.isFinite(settings.riskPct) ? settings.riskPct : RISK_PCT_DEFAULT,
      tradesPerDay: Number.isFinite(settings.dailyTradeLimit) ? settings.dailyTradeLimit : DAILY_LIMIT_DEFAULT
    };
  }

  /**
   * Reads the raw per-account/per-instrument config map from settings. Missing
   * or legacy shapes collapse to `{}`, so old saved data keeps working.
   */
  function instrumentConfigMap() {
    const settings = (state.settings && typeof state.settings === 'object') ? state.settings : {};
    const map = settings.instrumentConfig;
    return (map && typeof map === 'object') ? map : {};
  }

  /**
   * Resolves the effective config for one account + instrument, merging the
   * explicit saved values with the defaults. When the instrument has no fixed
   * stop (AUTO), the stop distance is derived from the per-trade budget via
   * `budgetStopTicks`, using the optional `budgetOpts` (`{ balance, riskPct,
   * tradesPerDay, available }`) or the account's persisted settings and
   * start-of-day balance. A fixed configured stop always wins.
   *
   * The points equivalents are derived from the instrument's tick so the UI can
   * show "40 ticks · 10.00 pts".
   * Returns `{ valid, reason, account, instrument, tick, stopTicks,
   * stopTicksAuto, fixedStopTicks, targetR, targetRAlt, stopPoints,
   * targetPoints, targetAltPoints, hasConfig }`.
   */
  function resolveInstrumentConfig(account, instrument, budgetOpts) {
    const accountKey = strOr(account, '');
    const instrumentKey = strOr(instrument, '');
    const spec = instrumentSpec(instrumentKey);
    const tick = spec ? numOr(spec.tick, 0) : 0;
    const result = {
      valid: false,
      reason: '',
      account: accountKey,
      instrument: instrumentKey,
      tick: tick,
      stopTicks: 0,
      stopTicksAuto: true,
      fixedStopTicks: null,
      targetR: TARGET_R_DEFAULT,
      targetRAlt: TARGET_R_ALT_DEFAULT,
      stopPoints: NaN,
      targetPoints: NaN,
      targetAltPoints: NaN,
      hasConfig: false
    };
    if (!spec) { result.reason = 'instrument'; return result; }

    const byAccount = instrumentConfigMap()[accountKey];
    const raw = (byAccount && typeof byAccount === 'object') ? byAccount[instrumentKey] : null;
    const normalized = normalizeInstrumentConfig(raw);

    /* AUTO: derive the stop from the budget. Live calculator inputs override
     * the account-level defaults. A zero derived value (no budget) falls back
     * to the honest one-tick minimum. */
    let stopTicks = normalized.stopTicks;
    if (normalized.stopTicksAuto) {
      const inputs = Object.assign({}, accountBudgetDefaults(accountKey), budgetOpts || {});
      inputs.account = accountKey;
      inputs.instrument = instrumentKey;
      const derived = budgetStopTicks(inputs);
      stopTicks = derived > 0 ? derived : FALLBACK_STOP_TICKS_DEFAULT;
    }

    result.valid = true;
    result.stopTicks = stopTicks;
    result.stopTicksAuto = normalized.stopTicksAuto;
    result.fixedStopTicks = normalized.stopTicks;
    result.targetR = normalized.targetR;
    result.targetRAlt = normalized.targetRAlt;
    result.stopPoints = ticksToPoints(stopTicks, instrumentKey);
    result.targetPoints = ticksToPoints(stopTicks * normalized.targetR, instrumentKey);
    result.targetAltPoints = ticksToPoints(stopTicks * normalized.targetRAlt, instrumentKey);
    result.hasConfig = !!(raw && typeof raw === 'object');
    return result;
  }

  /**
   * Returns every account's resolved per-instrument config as
   * `{ Sim: { MES: {...}, ... }, ... }`, with the defaults already applied.
   * Used by the Ajustes form so an instrument with no saved config still shows
   * sensible values.
   */
  function getInstrumentConfig() {
    const instruments = (typeof INSTRUMENTS !== 'undefined' && INSTRUMENTS) ? INSTRUMENTS : {};
    const out = {};
    ACCOUNT_LIST.forEach(function (account) {
      out[account] = {};
      Object.keys(instruments).forEach(function (id) {
        out[account][id] = resolveInstrumentConfig(account, id);
      });
    });
    return out;
  }

  /**
   * Persists a partial config for one account + instrument (ticks + target R
   * multiples), merged over whatever was saved before. A `stopTicks` of null
   * (or a non-positive value) means AUTO, clearing any fixed stop so the
   * budget-derived value applies. Unknown instruments are ignored so a caller
   * can never persist junk. Returns the resolved config.
   */
  function setInstrumentConfig(account, instrument, patch) {
    const accountKey = strOr(account, '');
    const instrumentKey = strOr(instrument, '');
    if (!accountKey || !instrumentSpec(instrumentKey)) {
      return resolveInstrumentConfig(accountKey, instrumentKey);
    }
    const map = clone(instrumentConfigMap());
    if (!map[accountKey] || typeof map[accountKey] !== 'object') map[accountKey] = {};
    const current = normalizeInstrumentConfig(map[accountKey][instrumentKey]);
    const incoming = (patch && typeof patch === 'object') ? patch : {};
    const next = normalizeInstrumentConfig({
      stopTicks: (incoming.stopTicks !== undefined) ? incoming.stopTicks : current.stopTicks,
      targetR: (incoming.targetR !== undefined) ? incoming.targetR : current.targetR,
      targetRAlt: (incoming.targetRAlt !== undefined) ? incoming.targetRAlt : current.targetRAlt
    });
    map[accountKey][instrumentKey] = next;
    setSettings({ instrumentConfig: map });
    return resolveInstrumentConfig(accountKey, instrumentKey);
  }


  /**
   * Resolves a stop expressed in ticks from either an explicit `stopTicks`
   * input or the legacy `stopDistance` (points), converted via the
   * instrument's tick size. Returns NaN when neither yields a usable value.
   */
  function resolveStopTicks(opts, spec) {
    const explicit = numOr(opts.stopTicks, NaN);
    if (Number.isFinite(explicit)) return explicit;
    const legacyPoints = numOr(opts.stopDistance, NaN);
    const tick = spec ? numOr(spec.tick, 0) : 0;
    if (Number.isFinite(legacyPoints) && tick > 0) return legacyPoints / tick;
    return NaN;
  }

  /**
   * Trades-per-day divisor. A missing/non-numeric value falls back to the
   * per-account default (3); a numeric value below 1 (including 0) is guarded
   * to 1 so the divisor can never be zero.
   */
  function resolveTradesPerDay(value) {
    const n = numOr(value, NaN);
    if (!Number.isFinite(n)) return DAILY_LIMIT_DEFAULT;
    if (n < 1) return 1;
    return n;
  }

  /**
   * Effective per-trade risk budget (pure), shared by `computeRisk` and the
   * budget-derived stop resolver so the two can never drift:
   *
   *   dailyBudget     = (riskPct / 100) * balance
   *   perTradeBudget  = dailyBudget / tradesPerDay   (tradesPerDay >= 1)
   *   available       = remaining daily budget, or dailyBudget when omitted
   *   effectiveBudget = max(0, min(perTradeBudget, available))
   *
   * Returns `{ dailyBudget, perTradeBudget, perTradeRisk, perTradeRiskPct,
   * tradesPerDay, available, hasAvailable, effectiveBudget }`.
   */
  function riskBudget(opts, spec) {
    const options = opts || {};
    const balance = numOr(options.balance, NaN);
    const riskPct = numOr(options.riskPct, NaN);
    const tradesPerDay = resolveTradesPerDay(options.tradesPerDay);
    const dailyBudget = (riskPct / 100) * balance;
    const perTradeBudget = dailyBudget / tradesPerDay;
    const perTradeRiskPct = riskPct / tradesPerDay;
    const perTradeRisk = (perTradeRiskPct / 100) * balance;
    const availableRaw = numOr(options.available, NaN);
    const hasAvailable = Number.isFinite(availableRaw);
    const available = hasAvailable ? availableRaw : dailyBudget;
    const effectiveBudget = Math.max(0, Math.min(perTradeBudget, available));
    return {
      dailyBudget: dailyBudget,
      perTradeBudget: perTradeBudget,
      perTradeRisk: perTradeRisk,
      perTradeRiskPct: perTradeRiskPct,
      tradesPerDay: tradesPerDay,
      available: available,
      hasAvailable: hasAvailable,
      effectiveBudget: effectiveBudget
    };
  }

  /**
   * Budget-derived stop distance in TICKS (pure): the maximum stop exactly one
   * contract can afford within the effective per-trade budget.
   *
   *   maxTicks = floor(effectiveBudget / tickValue)
   *
   * `effectiveBudget` is the same `min(perTradeBudget, available)` the
   * calculator sizes contracts from (see `riskBudget`), so the default stop and
   * the sizing can never disagree. Returns 0 when the instrument, balance or
   * `riskPct` is missing/invalid or the budget cannot cover a single tick;
   * callers fall back to the one-tick minimum in that case.
   */
  function budgetStopTicks(inputs) {
    const opts = inputs || {};
    const spec = instrumentSpec(opts.instrument);
    if (!spec) return 0;
    const balance = numOr(opts.balance, NaN);
    const riskPct = numOr(opts.riskPct, NaN);
    if (!Number.isFinite(balance) || !Number.isFinite(riskPct) || riskPct <= 0) return 0;
    const tick = numOr(spec.tick, 0);
    const tickValue = tick * numOr(spec.pointValue, 0);
    if (!(tickValue > 0)) return 0;
    const budget = riskBudget(opts, spec);
    return maxTicksForOneContract({
      effectiveRisk: budget.effectiveBudget,
      tickValue: tickValue
    });
  }

  /**
   * Pure seeding decision for the calculator's stop-ticks input. Returns the
   * value the UI may write, or null when the field must NOT be seeded:
   *   - `touched === true` -> null (a user-typed stop is FINAL);
   *   - a non-positive/non-numeric resolved value -> null;
   *   - otherwise the resolved ticks.
   * The UI calls this on every render so the budget-derived default adapts to
   * instrument/capital/risk/trades changes while never overwriting a
   * user-owned value.
   */
  function resolveStopTicksSeed(touched, resolvedTicks) {
    if (touched === true) return null;
    const n = numOr(resolvedTicks, NaN);
    return (Number.isFinite(n) && n > 0) ? n : null;
  }

  /**
   * Pure BPT/Francisca Serrano risk calculation (works in ticks, commission
   * kept separate).
   *
   *   tickValue       = tick * pointValue
   *   P_m             = stopTicks * tickValue
   *   dailyBudget     = (riskPct / 100) * balance
   *   perTradeBudget  = dailyBudget / tradesPerDay   (tradesPerDay >= 1)
   *   available       = remaining daily budget (dailyBudget - dayLoss)
   *   effectiveBudget = min(perTradeBudget, available)
   *   contracts       = floor(effectiveBudget / P_m)
   *   maxTicksOneContract = floor(effectiveBudget / tickValue)
   *   ticksTP2        = stopTicks * 2
   *   ticksTP3        = stopTicks * 3
   *   lossPct         = (P_m * contracts) / capital
   *   recoveryPct     = lossPct / (1 - lossPct)
   *
   * Sizing and the suggested stop distance both read the EFFECTIVE PER-TRADE
   * budget (`min(perTradeBudget, available)`), not the whole daily budget.
   * `perTradeBudget` divides the daily budget by the trades-per-day divisor,
   * so planning more trades for the day shrinks both the contract count and
   * the stop distance one contract can afford. The day's REALIZED LOSSES
   * consume the daily budget, so `available` is passed in from
   * `dailyRiskUsage` (daily budget minus the sum of |net| of today's losers
   * for the account) and caps the per-trade budget when smaller.
   *
   * Circuit breakers (Block 4):
   *   - Daily drawdown: `dayLoss / capital >= 5%`  -> blocked, 0 contracts.
   *   - Losing streak: `losingStreak >= 3`         -> blocked, 0 contracts.
   *   - Small account: `capital <= 5000`           -> forced to 1 contract.
   * When blocked, `contracts` is 0 and `blockReasons` names the tripped
   * breaker(s); the UI must show the red alert and never compute silently.
   *
   * Returns `{ valid, reason, dailyBudget, budget, dailyRiskPct, tradesPerDay,
   * perTradeBudget, effectiveBudget, perTradeRisk, perTradeRiskPct,
   * perTradeCap, effectiveRisk, maxTicksForOneContract, usedToday, available,
   * presupuesto, exhausted, tickValue, stopTicks, ticksSL, ticksTP, ticksTP2,
   * ticksTP3, pm, riskPerContract, totalRisk, lossPct, recoveryPct, commission,
   * contracts, viable, minBalanceForOneContract, size, capital, dayLoss,
   * drawdownPct, losingStreak, smallAccount, blocked, blockReasons }`.
   * `budget`/`riskPerContract` stay backward-compatible aliases for
   * `dailyBudget`/`pm`; `perTradeCap`/`perTradeRisk` mirror `perTradeBudget`
   * and `effectiveRisk` mirrors `effectiveBudget`, kept for callers that still
   * read the older names. `effectiveBudget` is clamped to 0 (a budget can
   * never be negative) while `available` keeps the raw, possibly negative,
   * remaining amount so `exhausted` stays meaningful.
   * `valid` is false (and `contracts` 0) when an input is missing/non-numeric
   * or `stopTicks <= 0`; `reason` names the first failing input.
   */
  function computeRisk(inputs) {
    const opts = inputs || {};
    const balance = numOr(opts.balance, NaN);
    const riskPct = numOr(opts.riskPct, NaN);
    const spec = instrumentSpec(opts.instrument);

    const tick = spec ? numOr(spec.tick, 0) : 0;
    const pointValue = spec ? numOr(spec.pointValue, 0) : 0;
    const tickValue = tick * pointValue;
    const stopTicks = resolveStopTicks(opts, spec);
    /* Target R multiples come from the per-instrument config (2:1 / 3:1 by
     * default), so a caller can shape the exit distances without changing the
     * stop. Non-positive/missing values fall back to the BPT defaults. */
    const targetRRaw = numOr(opts.targetR, NaN);
    const targetRAltRaw = numOr(opts.targetRAlt, NaN);
    const targetR = (Number.isFinite(targetRRaw) && targetRRaw > 0) ? targetRRaw : TARGET_R_DEFAULT;
    const targetRAlt = (Number.isFinite(targetRAltRaw) && targetRAltRaw > 0) ? targetRAltRaw : TARGET_R_ALT_DEFAULT;

    const result = {
      valid: false,
      reason: '',
      dailyBudget: 0,
      budget: 0,
      dailyRiskPct: 0,
      tradesPerDay: DAILY_LIMIT_DEFAULT,
      perTradeBudget: 0,
      effectiveBudget: 0,
      perTradeRisk: 0,
      perTradeRiskPct: 0,
      perTradeCap: 0,
      effectiveRisk: 0,
      maxTicksForOneContract: 0,
      usedToday: 0,
      available: 0,
      presupuesto: 0,
      exhausted: false,
      tickValue: tickValue,
      stopTicks: 0,
      ticksSL: 0,
      ticksTP: 0,
      ticksTP2: 0,
      ticksTP3: 0,
      targetR: targetR,
      targetRAlt: targetRAlt,
      pm: 0,
      riskPerContract: 0,
      totalRisk: 0,
      lossPct: 0,
      recoveryPct: 0,
      commission: spec ? numOr(spec.commission, 0) : 0,
      contracts: 0,
      viable: false,
      minBalanceForOneContract: null,
      size: spec ? spec.size : null,
      capital: 0,
      dayLoss: 0,
      drawdownPct: 0,
      losingStreak: 0,
      smallAccount: false,
      blocked: false,
      blockReasons: []
    };

    if (!spec) { result.reason = 'instrument'; return result; }
    if (!Number.isFinite(balance)) { result.reason = 'balance'; return result; }
    if (!Number.isFinite(riskPct) || riskPct <= 0) { result.reason = 'riskPct'; return result; }
    if (!Number.isFinite(stopTicks) || stopTicks <= 0) { result.reason = 'stopTicks'; return result; }
    if (!(tickValue > 0)) { result.reason = 'tickValue'; return result; }

    const capitalRaw = numOr(opts.capital, NaN);
    const capital = Number.isFinite(capitalRaw) ? capitalRaw : balance;
    /* Budget math lives in `riskBudget` so the calculator's sizing and the
     * budget-derived default stop can never drift. */
    const budget = riskBudget(opts, spec);
    const tradesPerDay = budget.tradesPerDay;
    const dailyBudget = budget.dailyBudget;
    const perTradeBudget = budget.perTradeBudget;
    const perTradeRiskPct = budget.perTradeRiskPct;
    const perTradeRisk = budget.perTradeRisk;
    const available = budget.available;
    const effectiveBudget = budget.effectiveBudget;
    const pm = stopTicks * tickValue;
    const dayLoss = Math.max(0, numOr(opts.dayLoss, 0));
    const losingStreak = Math.max(0, intOr(opts.losingStreak, 0));
    const drawdownPct = capital > 0 ? (dayLoss / capital) * 100 : 0;
    const smallAccount = capital <= SMALL_ACCOUNT_LIMIT;

    const blockReasons = [];
    if (drawdownPct >= DD_WARN_PCT) blockReasons.push('drawdown');
    if (losingStreak >= STREAK_WARN_COUNT) blockReasons.push('streak');
    const blocked = blockReasons.length > 0;

    let contracts = 0;
    if (blocked) {
      contracts = 0;
    } else if (smallAccount) {
      /* Small-account filter: force exactly one contract (never more). */
      contracts = 1;
    } else if (pm > 0 && effectiveBudget > 0) {
      contracts = Math.floor(effectiveBudget / pm);
    }

    const totalRisk = pm * contracts;
    const lossPct = capital > 0 ? totalRisk / capital : 0;
    const recovery = recoveryPct(lossPct);

    result.valid = true;
    result.dailyBudget = dailyBudget;
    result.budget = dailyBudget;
    result.dailyRiskPct = riskPct;
    result.tradesPerDay = tradesPerDay;
    result.perTradeBudget = perTradeBudget;
    result.effectiveBudget = effectiveBudget;
    result.perTradeRisk = perTradeRisk;
    result.perTradeRiskPct = perTradeRiskPct;
    result.perTradeCap = perTradeRisk;
    result.effectiveRisk = effectiveBudget;
    result.maxTicksForOneContract = maxTicksForOneContract({
      effectiveRisk: effectiveBudget,
      tickValue: tickValue
    });
    result.usedToday = budget.hasAvailable ? Math.max(0, dailyBudget - budget.available) : 0;
    result.available = available;
    result.presupuesto = available;
    result.exhausted = available <= 0;
    result.stopTicks = stopTicks;
    result.ticksSL = stopTicks;
    result.ticksTP = stopTicks * targetR;
    result.ticksTP2 = stopTicks * targetR;
    result.ticksTP3 = stopTicks * targetRAlt;
    result.targetR = targetR;
    result.targetRAlt = targetRAlt;
    result.tickValue = tickValue;
    result.pm = pm;
    result.riskPerContract = pm;
    result.totalRisk = totalRisk;
    result.lossPct = lossPct;
    result.recoveryPct = recovery;
    result.contracts = contracts;
    result.viable = contracts >= 1;
    result.minBalanceForOneContract = perTradeRiskPct > 0 ? pm / (perTradeRiskPct / 100) : null;
    result.capital = capital;
    result.dayLoss = dayLoss;
    result.drawdownPct = drawdownPct;
    result.losingStreak = losingStreak;
    result.smallAccount = smallAccount;
    result.blocked = blocked;
    result.blockReasons = blockReasons;
    return result;
  }

  /**
   * Pure circuit-breaker context for one account (Block 4).
   *
   *   dayLoss       = sum of |net| of the account's TODAY losers (net < 0)
   *   drawdownPct   = dayLoss / capital * 100
   *   losingStreak  = trailing run of today's losing trades (net <= 0),
   *                   counted chronologically
   *   blocked       = drawdownPct >= 5% OR losingStreak >= 3
   *
   * `capital` is the capital base for the drawdown percentage (the UI passes
   * `startOfDayBalance`). `trades` defaults to the store's trades; "today" is
   * `entryDate === todayISO()` unless an explicit `today` is passed. Returns
   * `{ valid, reason, account, today, capital, dayLoss, drawdownPct,
   * losingStreak, blocked, blockReasons }`.
   */
  function riskGuard(inputs) {
    const opts = inputs || {};
    const account = strOr(opts.account, '');
    const capitalRaw = numOr(opts.capital, NaN);
    const capital = Number.isFinite(capitalRaw) ? capitalRaw : 0;
    const today = strOr(opts.today, '') || todayISO();
    const source = Array.isArray(opts.trades) ? opts.trades : state.trades;

    const result = {
      valid: false,
      reason: '',
      account: account,
      today: today,
      capital: capital,
      dayLoss: 0,
      drawdownPct: 0,
      losingStreak: 0,
      blocked: false,
      blockReasons: []
    };

    if (!account) { result.reason = 'account'; return result; }
    if (!Number.isFinite(capitalRaw)) { result.reason = 'capital'; return result; }

    const todayTrades = source.filter(function (t) {
      return t && t.account === account && t.entryDate === today;
    });

    let dayLoss = 0;
    todayTrades.forEach(function (t) {
      const net = computeTrade(t).net;
      if (net < 0) dayLoss += Math.abs(net);
    });
    dayLoss = roundMoney(dayLoss);

    const sorted = sortChronologically(todayTrades);
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (computeTrade(sorted[i]).net <= 0) streak += 1;
      else break;
    }

    const drawdownPct = capital > 0 ? (dayLoss / capital) * 100 : 0;
    const blockReasons = [];
    if (drawdownPct >= DD_WARN_PCT) blockReasons.push('drawdown');
    if (streak >= STREAK_WARN_COUNT) blockReasons.push('streak');

    result.valid = true;
    result.dayLoss = dayLoss;
    result.drawdownPct = drawdownPct;
    result.losingStreak = streak;
    result.blocked = blockReasons.length > 0;
    result.blockReasons = blockReasons;
    return result;
  }

  /**
   * Smallest account balance that affords exactly one contract under the BPT
   * method: `P_m / (perTradeRiskPct / 100)`. Returns null when the instrument,
   * `riskPct` or stop is invalid. Accepts `stopTicks` (or legacy
   * `stopDistance` in points) and the `tradesPerDay` divisor.
   */
  function minBalanceForOneContract(inputs) {
    const opts = inputs || {};
    const riskPct = numOr(opts.riskPct, NaN);
    const spec = instrumentSpec(opts.instrument);
    if (!spec) return null;
    if (!Number.isFinite(riskPct) || riskPct <= 0) return null;
    const tick = numOr(spec.tick, 0);
    const tickValue = tick * numOr(spec.pointValue, 0);
    if (!(tickValue > 0)) return null;
    const stopTicks = resolveStopTicks(opts, spec);
    if (!Number.isFinite(stopTicks) || stopTicks <= 0) return null;
    const perTradeRiskPct = riskPct / resolveTradesPerDay(opts.tradesPerDay);
    if (!(perTradeRiskPct > 0)) return null;
    const pm = stopTicks * tickValue;
    return pm / (perTradeRiskPct / 100);
  }

  /**
   * Maximum stop distance in ticks that still fits exactly ONE contract within
   * an effective per-trade risk budget (pure).
   *
   *   maxTicks = floor(effectiveRisk / tickValue)
   *
   * `effectiveRisk` is the same budget the calculator sizes contracts from
   * (`min(perTradeCap, available)`); `tickValue` is `tick * pointValue` for the
   * instrument. Returns 0 when either input is missing/non-positive or the
   * budget cannot cover even one tick (e.g. an exhausted budget), so callers
   * can hide the line instead of showing a meaningless zero.
   */
  function maxTicksForOneContract(inputs) {
    const opts = inputs || {};
    const effectiveRisk = numOr(opts.effectiveRisk, NaN);
    const tickValue = numOr(opts.tickValue, NaN);
    if (!Number.isFinite(effectiveRisk) || effectiveRisk <= 0) return 0;
    if (!Number.isFinite(tickValue) || tickValue <= 0) return 0;
    return Math.floor(effectiveRisk / tickValue);
  }

  /** Snaps a price to the nearest whole tick, killing floating-point noise. */
  function roundToTick(value, tick) {
    const steps = Math.round(value / tick);
    return Number((steps * tick).toFixed(10));
  }

  /**
   * Advisory stop/target price suggestions for the entry form (pure).
   *
   *   distance  = ticks × tick
   *   stopPrice = entry − distance   (Largo)  |  entry + distance   (Corto)
   *   target2   = entry + 2×distance (Largo)  |  entry − 2×distance (Corto)
   *   target3   = entry + 3×distance (Largo)  |  entry − 3×distance (Corto)
   *
   * `ticks` is the stop distance in ticks the R/B range is built from (the
   * calculator's `ticksSL`). `targetR` / `targetRAlt` are the R/B multiples
   * (defaulting to the BPT 2 and 3), so `target2 = entry ± targetR×distance`
   * and `target3 = entry ± targetRAlt×distance`. `target2`/`target3` are the
   * exit prices for the primary and alternative R/B targets, and every price is
   * snapped to the instrument's tick grid. `targetPrice` is kept as a
   * backward-compatible alias of `target2`.
   *
   * This helper NEVER touches a form input: callers render the values as
   * advisory text or feed them to `draftAutofill`. Returns `{ valid, reason,
   * ticks, stopPrice, targetPrice, target2, target3, targetR, targetRAlt }`;
   * `valid` is false when the instrument, entry price, ticks or direction is
   * missing/invalid.
   */
  function suggestStopTarget(inputs) {
    const opts = inputs || {};
    const spec = instrumentSpec(opts.instrument);
    const entryPrice = numOr(opts.entryPrice, NaN);
    const ticks = numOr(opts.ticks, NaN);
    const direction = strOr(opts.direction, '');
    const targetRRaw = numOr(opts.targetR, NaN);
    const targetRAltRaw = numOr(opts.targetRAlt, NaN);
    const targetR = (Number.isFinite(targetRRaw) && targetRRaw > 0) ? targetRRaw : TARGET_R_DEFAULT;
    const targetRAlt = (Number.isFinite(targetRAltRaw) && targetRAltRaw > 0) ? targetRAltRaw : TARGET_R_ALT_DEFAULT;
    const result = {
      valid: false,
      reason: '',
      ticks: 0,
      stopPrice: NaN,
      targetPrice: NaN,
      target2: NaN,
      target3: NaN,
      targetR: targetR,
      targetRAlt: targetRAlt
    };

    if (!spec) { result.reason = 'instrument'; return result; }
    if (!Number.isFinite(entryPrice)) { result.reason = 'entryPrice'; return result; }
    if (!Number.isFinite(ticks) || ticks <= 0) { result.reason = 'ticks'; return result; }
    if (direction !== 'Largo' && direction !== 'Corto') { result.reason = 'direction'; return result; }

    const tick = numOr(spec.tick, 0);
    if (!(tick > 0)) { result.reason = 'tick'; return result; }

    const sign = direction === 'Largo' ? 1 : -1;
    const target2 = roundToTick(entryPrice + sign * targetR * ticks * tick, tick);
    result.valid = true;
    result.ticks = ticks;
    result.stopPrice = roundToTick(entryPrice - sign * ticks * tick, tick);
    /* `targetPrice` remains the primary (2:1 by default) target for callers. */
    result.targetPrice = target2;
    result.target2 = target2;
    result.target3 = roundToTick(entryPrice + sign * targetRAlt * ticks * tick, tick);
    return result;
  }

  /**
   * Available risk/benefit ratio options (pure). Reads the catalog constant
   * when present and falls back to the canonical 1:2 … 1:4 list so the UI
   * always has a complete, ordered set even if the constant is missing.
   */
  function getRatioOptions() {
    return (typeof RATIO_OPTIONS !== 'undefined' && Array.isArray(RATIO_OPTIONS) && RATIO_OPTIONS.length)
      ? RATIO_OPTIONS.slice()
      : [2, 2.5, 3, 3.5, 4];
  }

  /**
   * Ratio-driven planning target (pure). The chosen risk/benefit ratio is the
   * reward multiple of the stop distance, so the target price is
   *
   *   targetPrice = entry ± stopTicks × ratio × tick   (Largo / Corto)
   *
   * Wraps `suggestStopTarget` with the ratio as both the primary and the
   * alternative R multiple, so the calculator, the exit suggestion, the draft
   * autofill and the preview all share one formula. Returns the same shape as
   * `suggestStopTarget` (`targetPrice` is the ratio target).
   */
  function ratioTarget(inputs) {
    const opts = inputs || {};
    return suggestStopTarget({
      instrument: opts.instrument,
      entryPrice: opts.entryPrice,
      direction: opts.direction,
      ticks: opts.ticks,
      targetR: opts.ratio,
      targetRAlt: opts.ratio
    });
  }

  /**
   * Pure DRAFT-autofill decision for the entry form's stop and exit fields.
   *
   * Given the calculator context (account, instrument, entry price, direction)
   * it resolves the per-instrument config, derives the suggested stop and the
   * primary R/B exit price, and returns whether each field may be written:
   *
   *   - a field is written ONLY when it is NOT touched (the user has not typed
   *     in it yet);
   *   - `touched` is supplied by the caller (UI state), never mutated here;
   *   - `stop.value` / `exit.value` are the draft prices, `write` says whether
   *     the caller must apply them. When `write` is false the caller keeps the
   *     user's value untouched.
   *
   * `stopTicks`, `targetR` and `targetRAlt` override the resolved config when
   * provided. Returns `{ valid, reason, stopTicks, targetR, targetRAlt, tick,
   * stop:{value,write}, exit:{value,write}, suggestion }`; `valid` is false
   * (nothing written) when instrument/entry/direction are missing.
   */
  function draftAutofill(inputs) {
    const opts = inputs || {};
    const touched = (opts.touched && typeof opts.touched === 'object') ? opts.touched : {};
    const account = strOr(opts.account, '');
    const instrument = strOr(opts.instrument, '');
    const config = resolveInstrumentConfig(account, instrument);

    const ticksRaw = numOr(opts.stopTicks, NaN);
    const ticks = (Number.isFinite(ticksRaw) && ticksRaw > 0) ? ticksRaw : config.stopTicks;
    const targetRRaw = numOr(opts.targetR, NaN);
    const targetR = (Number.isFinite(targetRRaw) && targetRRaw > 0) ? targetRRaw : config.targetR;
    const targetRAltRaw = numOr(opts.targetRAlt, NaN);
    const targetRAlt = (Number.isFinite(targetRAltRaw) && targetRAltRaw > 0) ? targetRAltRaw : config.targetRAlt;

    const suggestion = suggestStopTarget({
      instrument: instrument,
      entryPrice: opts.entryPrice,
      direction: opts.direction,
      ticks: ticks,
      targetR: targetR,
      targetRAlt: targetRAlt
    });

    const result = {
      valid: false,
      reason: suggestion.reason || '',
      stopTicks: ticks,
      targetR: targetR,
      targetRAlt: targetRAlt,
      tick: config.tick,
      stop: { value: NaN, write: false },
      exit: { value: NaN, write: false },
      suggestion: suggestion
    };
    if (!suggestion.valid) return result;

    result.valid = true;
    result.stop.value = suggestion.stopPrice;
    result.stop.write = touched.stop !== true;
    result.exit.value = suggestion.target2;
    result.exit.write = touched.exitPrice !== true;
    return result;
  }

  /**
   * Fixed, deterministic OHLC template for the mini candlestick preview.
   *
   * Each entry is expressed as a fraction of the PRIMARY target distance
   * (`p` = centre, positive = toward the target, negative = toward the stop)
   * plus a body half-height (`body`) and a wick half-height (`wick`). `up` is
   * the template's intended body direction; the rendered colour follows the
   * ACTUAL price movement, so a short reverses the colours.
   *
   * There is deliberately NO `Math.random()` here: the series is hardcoded so
   * the chart never flickers or jumps on re-render. The extreme progress is
   * kept within `[-0.22, 1.01]` so the candles always fit inside the level
   * range for every ratio in `RATIO_OPTIONS` (>= 2, whose stop sits at
   * `-1 / ratio >= -0.5`).
   */
  const PREVIEW_CANDLES = [
    { p: -0.12, body: 0.10, wick: 0.05, up: true },
    { p: -0.06, body: 0.12, wick: 0.05, up: false },
    { p: 0.00, body: 0.10, wick: 0.06, up: true },
    { p: 0.08, body: 0.14, wick: 0.05, up: true },
    { p: 0.04, body: 0.10, wick: 0.07, up: false },
    { p: 0.14, body: 0.12, wick: 0.05, up: true },
    { p: 0.22, body: 0.10, wick: 0.06, up: false },
    { p: 0.30, body: 0.14, wick: 0.05, up: true },
    { p: 0.38, body: 0.12, wick: 0.05, up: true },
    { p: 0.32, body: 0.10, wick: 0.07, up: false },
    { p: 0.46, body: 0.14, wick: 0.05, up: true },
    { p: 0.56, body: 0.12, wick: 0.06, up: true },
    { p: 0.64, body: 0.10, wick: 0.05, up: false },
    { p: 0.74, body: 0.14, wick: 0.05, up: true },
    { p: 0.84, body: 0.12, wick: 0.05, up: true },
    { p: 0.92, body: 0.10, wick: 0.04, up: false }
  ];

  /**
   * Pure geometry for the compact trade-preview chart (no DOM, no SVG).
   *
   * Prices are derived from the calculator's tick distances and the
   * instrument's tick SIZE (not the monetary tick value):
   *
   *   distance_i = ticks_i × tick
   *   stop       = entry − distanceStop   (Largo)  |  entry + distanceStop   (Corto)
   *   target_i   = entry + distance_i      (Largo)  |  entry − distance_i      (Corto)
   *
   * `ticksTP` is the array of take-profit distances in TICKS (e.g. the
   * calculator's `ticksTP2` / `ticksTP3`); it defaults to `[2×, 3×]` of the
   * stop distance so the chart is useful with a stop alone.
   *
   * Every level is also returned as a normalised y in `[0, 1]` where 0 is the
   * TOP of the chart (highest price) and 1 is the BOTTOM (lowest price), so a
   * renderer only has to scale to pixels. For a long, `stopY > entryY >
   * targetY`; for a short the order is inverted. An 12% pad is added to the
   * price range so the extreme lines never sit glued to the chart edges.
   *
   * `candles` is a deterministic mini candlestick series (see
   * `PREVIEW_CANDLES`) mapped onto the same price/y scale, with `x` normalised
   * in `[0, 1]` across the plot width and `oY`/`hY`/`lY`/`cY` normalised like
   * the levels. `up` reflects the actual price direction, so a short mirrors
   * the colours. The candle series is excluded from `min`/`max` (which stay
   * level-derived) and is clamped into the level range, so the axis is stable.
   *
   * Returns `{ valid, reason, entry, stop, targets, stopTicks, ticksTP, tick,
   * direction, min, max, entryY, stopY, targetYs, candles }`. `valid` is false
   * when the entry price, stop ticks, tick size or direction is
   * missing/invalid; `reason` names the first failing input (the UI turns it
   * into placeholder copy).
   */
  function tradePreviewGeometry(inputs) {
    const opts = inputs || {};
    const entry = numOr(opts.entry, NaN);
    const stopTicks = numOr(opts.stopTicks, NaN);
    const tick = numOr(opts.tick, NaN);
    const direction = strOr(opts.direction, '');
    const result = {
      valid: false,
      reason: '',
      entry: NaN,
      stop: NaN,
      targets: [],
      stopTicks: 0,
      ticksTP: [],
      tick: 0,
      direction: '',
      min: NaN,
      max: NaN,
      entryY: 0,
      stopY: 0,
      targetYs: [],
      candles: []
    };

    if (!Number.isFinite(entry)) { result.reason = 'entry'; return result; }
    if (!Number.isFinite(stopTicks) || stopTicks <= 0) { result.reason = 'stopTicks'; return result; }
    if (!Number.isFinite(tick) || tick <= 0) { result.reason = 'tick'; return result; }
    if (direction !== 'Largo' && direction !== 'Corto') { result.reason = 'direction'; return result; }

    const tpList = Array.isArray(opts.ticksTP)
      ? opts.ticksTP
      : [stopTicks * 2, stopTicks * 3];
    const tpTicks = [];
    tpList.forEach(function (value) {
      const t = numOr(value, NaN);
      if (Number.isFinite(t) && t > 0) tpTicks.push(t);
    });

    const sign = direction === 'Largo' ? 1 : -1;
    const stop = roundToTick(entry - sign * stopTicks * tick, tick);
    const targets = tpTicks.map(function (t) {
      return roundToTick(entry + sign * t * tick, tick);
    });

    const prices = [entry, stop].concat(targets);
    let min = Math.min.apply(null, prices);
    let max = Math.max.apply(null, prices);
    if (max === min) { max += tick; min -= tick; }
    const pad = (max - min) * 0.12;
    const lo = min - pad;
    const hi = max + pad;
    const yOf = function (price) { return (hi - price) / (hi - lo); };

    /* Candles are scaled to the primary target distance so the path visibly
     * walks from the entry toward the chosen R/B target. Prices are snapped to
     * the tick grid and clamped into the level range, keeping the y values in
     * [0, 1] for any ratio. */
    const targetTicks = tpTicks.length ? tpTicks[0] : stopTicks * 2;
    const candleScale = targetTicks * tick;
    const candleCount = PREVIEW_CANDLES.length;
    const priceOf = function (progress) {
      const raw = entry + sign * progress * candleScale;
      return roundToTick(Math.max(min, Math.min(max, raw)), tick);
    };
    const candles = PREVIEW_CANDLES.map(function (candle, index) {
      const half = candle.body / 2;
      const openProgress = candle.up ? candle.p - half : candle.p + half;
      const closeProgress = candle.up ? candle.p + half : candle.p - half;
      const open = priceOf(openProgress);
      const close = priceOf(closeProgress);
      /* The wick extends `wick` beyond each end of the body in PROGRESS space;
       * because the progress->price map is monotonic but flips for a short,
       * take the price extremes so `h`/`l` stay meaningful for both directions. */
      const wickEndA = priceOf(Math.max(openProgress, closeProgress) + candle.wick);
      const wickEndB = priceOf(Math.min(openProgress, closeProgress) - candle.wick);
      const high = Math.max(wickEndA, wickEndB);
      const low = Math.min(wickEndA, wickEndB);
      return {
        x: (index + 0.5) / candleCount,
        o: open,
        h: high,
        l: low,
        c: close,
        up: close > open,
        oY: yOf(open),
        hY: yOf(high),
        lY: yOf(low),
        cY: yOf(close)
      };
    });

    result.valid = true;
    result.entry = entry;
    result.stop = stop;
    result.targets = targets;
    result.stopTicks = stopTicks;
    result.ticksTP = tpTicks;
    result.tick = tick;
    result.direction = direction;
    result.min = min;
    result.max = max;
    result.entryY = yOf(entry);
    result.stopY = yOf(stop);
    result.targetYs = targets.map(yOf);
    result.candles = candles;
    return result;
  }

  /**
   * Remaining daily risk budget for one account (pure).
   *
   *   dailyBudget = (riskPct / 100) * balance
   *   used        = sum of |net| for that account's TODAY losers (net < 0)
   *   available   = dailyBudget - used
   *   exhausted   = available <= 0
   *
   * Only losing trades consume the budget; winners never reduce it. "Today"
   * is `entryDate === todayISO()` unless an explicit `today` is passed, and
   * trades are scoped to `account`. `trades` defaults to the store's trades,
   * so the helper stays pure but is directly usable from the UI.
   *
   * `balance` is the capital base for the budget; the UI passes the
   * start-of-day balance (`startOfDayBalance`) so today's realized losses are
   * not counted twice (once by shrinking the base and once by `used`). All
   * money fields are rounded to the cent.
   *
   * Returns `{ valid, reason, account, today, dailyBudget, used, available,
   * exhausted, trades }`. `valid` is false when `account` is empty or
   * `balance`/`riskPct` are missing/non-numeric; `reason` names the first
   * failing input. A negative `balance` is allowed (a drawdown can leave the
   * account below zero) and simply yields an exhausted budget. `trades` is the
   * number of losing trades counted.
   */
  function dailyRiskUsage(inputs) {
    const opts = inputs || {};
    const account = strOr(opts.account, '');
    const riskPct = numOr(opts.riskPct, NaN);
    const balance = numOr(opts.balance, NaN);
    const today = strOr(opts.today, '') || todayISO();
    const source = Array.isArray(opts.trades) ? opts.trades : state.trades;

    const result = {
      valid: false,
      reason: '',
      account: account,
      today: today,
      dailyBudget: 0,
      used: 0,
      available: 0,
      exhausted: false,
      trades: 0
    };

    if (!account) { result.reason = 'account'; return result; }
    if (!Number.isFinite(balance)) { result.reason = 'balance'; return result; }
    if (!Number.isFinite(riskPct) || riskPct < 0) { result.reason = 'riskPct'; return result; }

    let used = 0;
    let losers = 0;
    source.forEach(function (trade) {
      if (!trade || trade.account !== account) return;
      if (trade.entryDate !== today) return;
      const net = computeTrade(trade).net;
      if (net < 0) {
        used += Math.abs(net);
        losers += 1;
      }
    });

    const dailyBudget = roundMoney((riskPct / 100) * balance);
    /* Round `used` first so an exact exhaustion yields 0 (never -0) and the
     * displayed available matches the contract floor. */
    const usedRounded = roundMoney(used);
    const available = roundMoney(dailyBudget - usedRounded);
    result.valid = true;
    result.dailyBudget = dailyBudget;
    result.used = usedRounded;
    result.available = available;
    result.exhausted = available <= 0;
    result.trades = losers;
    return result;
  }

  /**
   * Start-of-day balance for an account (pure): the initial balance plus the
   * net of every trade dated before today. This is the capital base for the
   * daily risk budget, so today's realized losses are not counted twice (once
   * by shrinking the base and once by `dailyRiskUsage.used`). Accepts
   * `(trades, account)` or `(account)` like the other discipline helpers.
   */
  function startOfDayBalance(a, b) {
    const input = disciplineInput(a, b);
    const today = todayISO();
    let base = numOr(state.balances[input.account], 0);
    input.trades.forEach(function (trade) {
      if (trade.account !== input.account) return;
      if (trade.entryDate && trade.entryDate < today) base += computeTrade(trade).net;
    });
    return roundMoney(base);
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
  /* Discipline gamification (pure)                                      */
  /* ------------------------------------------------------------------ */
  /*
   * Rewards PROCESS ONLY. XP and achievements are derived exclusively from
   * recorded discipline signals (a recorded stop, planned risk/R/R, and
   * daily-limit compliance). Profit/loss, leverage and trade volume NEVER
   * award XP: more trades past the daily limit earn nothing.
   */

  const XP_TRADE = 2;             /* registering a trade (capped at the daily limit) */
  const XP_STOP = 5;              /* recording a stop */
  const XP_RR = 5;                /* meeting the configured minimum R/R */
  const XP_DISCIPLINED_DAY = 10;  /* closing a day without exceeding the limit */
  const XP_PER_LEVEL = 100;
  const WEEKLY_DISCIPLINE_GOAL_DEFAULT = 5;

  /* BPT badges (additive to the legacy ACHIEVEMENTS below). Two categories:
   *   BADGE_PROCESS -> earns a FIXED XP_BADGE per rung and feeds the ladder.
   *   BADGE_OUTCOME -> informational statistic, ZERO XP, never "achieved".
   * The fixed per-rung award means XP never scales with P&L or volume. */
  const XP_BADGE = 25;
  const BADGE_PROCESS = 'process';
  const BADGE_OUTCOME = 'outcome';

  /* Process achievements. Each is earned from recorded data; `target` is the
   * count required and is also the progress-bar denominator. */
  const ACHIEVEMENTS = [
    { id: 'first-stop', label: 'Primer stop registrado', description: 'Registra tu primer trade con stop.', target: 1 },
    { id: 'disciplined-day', label: 'Día bajo el límite', description: 'Cierra un día sin superar el límite de operaciones.', target: 1 },
    { id: 'risk-10', label: '10 trades dentro del riesgo', description: '10 trades que respetan el riesgo configurado por cuenta.', target: 10 },
    { id: 'rr-10', label: '10 trades con R/R ≥ mínimo', description: '10 trades que cumplen el R/R mínimo configurado.', target: 10 },
    { id: 'streak-5', label: 'Racha de 5 días', description: '5 días consecutivos sin superar el límite.', target: 5 },
    { id: 'streak-10', label: 'Racha de 10 días', description: '10 días consecutivos sin superar el límite.', target: 10 }
  ];

  /** Trades for one account (or every account when `account` is empty). */
  function tradesForAccount(trades, account) {
    const list = Array.isArray(trades) ? trades : state.trades;
    const key = strOr(account, '');
    return list.filter(function (t) {
      return t && !!t.entryDate && (!key || t.account === key);
    });
  }

  /**
   * Normalizes gamification options, deriving any missing value from the
   * account's persisted risk settings and initial balance. `opts` may carry
   * `{ limit, riskPct, minRR, initialBalance, today, weeklyGoal }`.
   */
  function gamifyOpts(account, opts) {
    const src = opts || {};
    const key = strOr(account, '');
    const settings = getRiskSettings()[key] || {};
    const limit = Number.isFinite(src.limit)
      ? src.limit
      : (Number.isFinite(settings.dailyTradeLimit) ? settings.dailyTradeLimit : DAILY_LIMIT_DEFAULT);
    const riskPct = Number.isFinite(src.riskPct)
      ? src.riskPct
      : (Number.isFinite(settings.riskPct) ? settings.riskPct : RISK_PCT_DEFAULT);
    const minRR = (Number.isFinite(src.minRR) && src.minRR > 0) ? src.minRR : getMinRR();
    const initialBalance = Number.isFinite(src.initialBalance)
      ? src.initialBalance
      : numOr(state.balances[key], 0);
    return {
      account: key,
      limit: limit,
      riskPct: riskPct,
      minRR: minRR,
      initialBalance: initialBalance
    };
  }

  /**
   * Groups one account's trades by entry day and classifies each day:
   * `{ date, count, limit, overTraded, disciplined }`, sorted by date
   * ascending. A day is disciplined when it has at least one trade and its
   * count does NOT exceed the limit (`overTraded = count > limit`).
   */
  function disciplineDays(trades, account, limit) {
    const cap = Number.isFinite(limit) ? limit : DAILY_LIMIT_DEFAULT;
    const byDate = {};
    tradesForAccount(trades, account).forEach(function (t) {
      byDate[t.entryDate] = (byDate[t.entryDate] || 0) + 1;
    });
    return Object.keys(byDate).sort().map(function (date) {
      const count = byDate[date];
      const overTraded = count > cap;
      return { date: date, count: count, limit: cap, overTraded: overTraded, disciplined: !overTraded };
    });
  }

  /**
   * Current and best discipline streak for one account, measured in trading
   * days. Only days with trades count, so non-trading calendar days never
   * break a streak. `current` is the run of disciplined trading days ending
   * at the most recent trading day (0 when that day over-traded); `best` is
   * the longest disciplined run in the account's history.
   */
  function disciplineStreak(trades, account, limit) {
    const days = disciplineDays(trades, account, limit);
    let best = 0;
    let run = 0;
    days.forEach(function (day) {
      if (day.disciplined) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    });
    let current = 0;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (!days[i].disciplined) break;
      current += 1;
    }
    return { current: current, best: best, days: days };
  }

  /**
   * Risk in USD actually taken by a trade: `|entry - stop| * contracts *
   * pointValue` when a stop is recorded, otherwise the recorded planned risk.
   * Returns NaN when neither yields a usable value.
   */
  function tradeRiskUsd(trade) {
    const stop = numOr(trade.stop, 0);
    const entry = numOr(trade.entryPrice, 0);
    const contracts = numOr(trade.contracts, 0);
    const spec = instrumentSpec(trade.instrument);
    const pointValue = spec ? numOr(spec.pointValue, 0) : 0;
    if (stop > 0 && entry > 0 && contracts > 0 && pointValue > 0 && stop !== entry) {
      return Math.abs(entry - stop) * contracts * pointValue;
    }
    const planned = numOr(trade.plannedRisk, 0);
    return planned > 0 ? planned : NaN;
  }

  /**
   * Counts trades that respected the account's risk budget at the moment they
   * were taken: each trade's risk (`tradeRiskUsd`) must be at most the
   * per-trade cap `(riskPct / 100) * runningBalance / tradesPerDay`, where the
   * running balance is the initial balance plus the net of every earlier
   * trade. Pure: reads only the passed trades and options.
   */
  function riskRespectedCount(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    const list = sortChronologically(tradesForAccount(trades, account));
    const perDay = resolveTradesPerDay(ctx.limit);
    let balance = ctx.initialBalance;
    let count = 0;
    list.forEach(function (t) {
      const cap = (ctx.riskPct / 100) * balance / perDay;
      const risk = tradeRiskUsd(t);
      if (Number.isFinite(risk) && risk > 0 && cap > 0 && risk <= cap + 1e-9) count += 1;
      balance += computeTrade(t).net;
    });
    return count;
  }

  /** Counts trades whose recorded planned risk / target meet the min R/R. */
  function rrMetCount(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    let count = 0;
    tradesForAccount(trades, account).forEach(function (t) {
      const rr = computeRR({ plannedRisk: t.plannedRisk, target: t.target, minRR: ctx.minRR });
      if (rr.valid && rr.meetsMinimum) count += 1;
    });
    return count;
  }

  /**
   * Process-only XP breakdown for one account. No term reads P&L, leverage or
   * contract count. Base journaling XP is capped at the daily limit so
   * over-trading earns nothing beyond the process bonuses.
   */
  function xpBreakdown(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    const list = sortChronologically(tradesForAccount(trades, account));
    const dayCounts = {};
    let base = 0;
    let stop = 0;
    let rr = 0;
    list.forEach(function (t) {
      const n = (dayCounts[t.entryDate] || 0) + 1;
      dayCounts[t.entryDate] = n;
      if (n <= ctx.limit) base += XP_TRADE;
      if (numOr(t.stop, 0) > 0) stop += XP_STOP;
      const res = computeRR({ plannedRisk: t.plannedRisk, target: t.target, minRR: ctx.minRR });
      if (res.valid && res.meetsMinimum) rr += XP_RR;
    });
    const days = disciplineDays(trades, account, ctx.limit);
    let dayBonus = 0;
    let disciplinedDays = 0;
    days.forEach(function (d) {
      if (d.disciplined) {
        dayBonus += XP_DISCIPLINED_DAY;
        disciplinedDays += 1;
      }
    });
    return {
      total: base + stop + rr + dayBonus,
      base: base,
      stop: stop,
      rr: rr,
      dayBonus: dayBonus,
      disciplinedDays: disciplinedDays,
      perTrade: { base: XP_TRADE, stop: XP_STOP, rr: XP_RR },
      perDay: XP_DISCIPLINED_DAY
    };
  }

  /**
   * Level from total XP: flat `XP_PER_LEVEL` per level, level 1 at 0 XP.
   * Returns `{ xp, level, perLevel, intoLevel, toNext, progressPct }`.
   */
  function levelInfo(xp) {
    const safe = Math.max(0, Math.floor(numOr(xp, 0)));
    const intoLevel = safe % XP_PER_LEVEL;
    return {
      xp: safe,
      level: Math.floor(safe / XP_PER_LEVEL) + 1,
      perLevel: XP_PER_LEVEL,
      intoLevel: intoLevel,
      toNext: XP_PER_LEVEL - intoLevel,
      progressPct: (intoLevel / XP_PER_LEVEL) * 100
    };
  }

  /**
   * Evaluates every process achievement for one account from recorded data.
   * Returns the definitions enriched with `{ value, raw, earned, progressPct }`.
   */
  function evaluateAchievements(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    const streak = disciplineStreak(trades, account, ctx.limit);
    const days = disciplineDays(trades, account, ctx.limit);
    const disciplinedDays = days.filter(function (d) { return d.disciplined; }).length;
    const metrics = {
      'first-stop': stopDiscipline(trades, account).withStop,
      'disciplined-day': disciplinedDays,
      'risk-10': riskRespectedCount(trades, account, ctx),
      'rr-10': rrMetCount(trades, account, ctx),
      'streak-5': streak.best,
      'streak-10': streak.best
    };
    return ACHIEVEMENTS.map(function (a) {
      const raw = metrics[a.id] || 0;
      return {
        id: a.id,
        label: a.label,
        description: a.description,
        target: a.target,
        value: Math.min(raw, a.target),
        raw: raw,
        earned: raw >= a.target,
        progressPct: Math.min(100, (raw / a.target) * 100)
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* BPT badges (pure)                                                   */
  /* ------------------------------------------------------------------ */
  /*
   * Two categories, enforced by the `category` field on every rung:
   *   - 'process': earns a fixed XP_BADGE per rung. Derived from recorded
   *     risk/process signals; the award never scales with P&L or volume.
   *   - 'outcome': informational statistics over realised P&L. ZERO XP and
   *     never marked as achieved; `qualifies` carries the fact instead.
   *
   * DEFERRED BPT badges (not implemented - missing data):
   *   - bpt-security-anchor: needs stop-modification history (no audit trail).
   *   - bpt-jornalero: needs a per-trade timezone (`entryTime` has no zone).
   *   - bpt-logbook: needs an emotion before/after each trade (one field only).
   *   - bpt-playing-house: needs a capital ledger (only initial balance exists).
   */

  /** Completed trades: entry AND exit recorded. */
  function completedTradeCount(trades, account) {
    return tradesForAccount(trades, account).filter(function (t) {
      return !!t.entryDate && !!t.exitDate;
    }).length;
  }

  /** One account's trades grouped by entry day, chronological within a day. */
  function tradesByDay(trades, account) {
    const byDay = {};
    sortChronologically(tradesForAccount(trades, account)).forEach(function (t) {
      if (!byDay[t.entryDate]) byDay[t.entryDate] = [];
      byDay[t.entryDate].push(t);
    });
    return byDay;
  }

  /**
   * Longest run of consecutive trades risking 0.5%-2% of the running balance
   * (initial balance plus the net of every earlier trade). The risk is
   * `tradeRiskUsd(t) / balanceBefore * 100`.
   */
  function capitalGuardianStreak(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    const list = sortChronologically(tradesForAccount(trades, account));
    let balance = ctx.initialBalance;
    let run = 0;
    let best = 0;
    list.forEach(function (t) {
      const risk = tradeRiskUsd(t);
      const pct = (Number.isFinite(risk) && balance > 0) ? (risk / balance) * 100 : NaN;
      if (Number.isFinite(pct) && pct >= 0.5 && pct <= 2) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
      balance += computeTrade(t).net;
    });
    return best;
  }

  /**
   * Days the session stopped inside the 3%-5% daily-loss band. Per day, in
   * entry order: the FIRST trade whose running loss reaches 3% of the
   * start-of-day balance must be the day's last trade, and the day's total
   * loss must not exceed 5%.
   */
  function mosquitoRepellentDays(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    const byDay = tradesByDay(trades, account);
    let balance = ctx.initialBalance;
    let clean = 0;
    Object.keys(byDay).sort().forEach(function (day) {
      const dayTrades = byDay[day];
      let dayLoss = 0;
      let stopIndex = -1;
      for (let i = 0; i < dayTrades.length; i += 1) {
        const net = computeTrade(dayTrades[i]).net;
        if (net < 0) dayLoss += Math.abs(net);
        if (balance > 0 && (dayLoss / balance) * 100 >= 3) { stopIndex = i; break; }
      }
      const lossPct = balance > 0 ? (dayLoss / balance) * 100 : 0;
      if (stopIndex === dayTrades.length - 1 && lossPct >= 3 && lossPct <= 5) clean += 1;
      dayTrades.forEach(function (t) { balance += computeTrade(t).net; });
    });
    return clean;
  }

  /** Days that ended on a run of 3+ consecutive losing trades (net <= 0). */
  function emergencyStopDays(trades, account) {
    const byDay = tradesByDay(trades, account);
    let count = 0;
    Object.keys(byDay).forEach(function (day) {
      const dayTrades = byDay[day];
      let streak = 0;
      for (let i = dayTrades.length - 1; i >= 0; i -= 1) {
        if (computeTrade(dayTrades[i]).net <= 0) streak += 1;
        else break;
      }
      if (streak >= 3) count += 1;
    });
    return count;
  }

  /** Days with at most 3 entries (a patient, low-frequency session). */
  function crocodileDays(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    return disciplineDays(trades, account, ctx.limit).filter(function (d) {
      return d.count <= 3;
    }).length;
  }

  /**
   * Highest doubling milestone reached by a trade of 2+ contracts, measured
   * on the running equity BEFORE that trade: 25/50/75/100 % of the gain that
   * doubles the initial capital (i.e. equity of 1.25x/1.5x/1.75x/2x). Returns
   * 0 when no milestone was reached.
   */
  function earnedStepLevel(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    if (!(ctx.initialBalance > 0)) return 0;
    const milestones = [25, 50, 75, 100];
    const list = sortChronologically(tradesForAccount(trades, account));
    let equity = ctx.initialBalance;
    let level = 0;
    list.forEach(function (t) {
      if (numOr(t.contracts, 0) >= 2) {
        milestones.forEach(function (m) {
          if (m > level && equity >= ctx.initialBalance * (1 + m / 100)) level = m;
        });
      }
      equity += computeTrade(t).net;
    });
    return level;
  }

  /**
   * Best win ratio (%) across every rolling block of at least 100 trades
   * (win = net > 0). Returns 0 when the account has fewer than 100 trades.
   */
  function bestRollingWinPct(trades, account) {
    const list = sortChronologically(tradesForAccount(trades, account));
    const n = list.length;
    if (n < 100) return 0;
    const nets = list.map(function (t) { return computeTrade(t).net; });
    let best = 0;
    for (let start = 0; start + 100 <= n; start += 1) {
      let wins = 0;
      for (let end = start; end < n; end += 1) {
        if (nets[end] > 0) wins += 1;
        const size = end - start + 1;
        if (size >= 100) {
          const pct = (wins / size) * 100;
          if (pct > best) best = pct;
        }
      }
    }
    return best;
  }

  /** First 700 trades (chronological): win ratio and the covered date span. */
  function hotBathStat(trades, account) {
    const list = sortChronologically(tradesForAccount(trades, account));
    const slice = list.slice(0, 700);
    let wins = 0;
    slice.forEach(function (t) { if (computeTrade(t).net > 0) wins += 1; });
    return {
      count: slice.length,
      winPct: slice.length > 0 ? (wins / slice.length) * 100 : 0,
      start: slice.length ? slice[0].entryDate : '',
      end: slice.length ? slice[slice.length - 1].entryDate : ''
    };
  }

  /** Win ratio of the first 700 trades, or 0 when fewer than 700 exist. */
  function hotBathWinPct(trades, account) {
    const stat = hotBathStat(trades, account);
    return stat.count >= 700 ? stat.winPct : 0;
  }

  /**
   * Realized R multiple of a closed trade. Long:
   * `(exit - entry) / (entry - stop)`; short the inverse. NaN when the stop
   * is missing or on the wrong side of the entry.
   */
  function realizedR(trade) {
    const entry = numOr(trade.entryPrice, 0);
    const exit = numOr(trade.exitPrice, 0);
    const stop = numOr(trade.stop, 0);
    if (!(stop > 0)) return NaN;
    if (trade.direction === 'Corto') {
      const risk = stop - entry;
      return risk > 0 ? (entry - exit) / risk : NaN;
    }
    const risk = entry - stop;
    return risk > 0 ? (exit - entry) / risk : NaN;
  }

  /** Winning trades whose realized R/R is at least 2. */
  function positiveMathCount(trades, account) {
    let count = 0;
    tradesForAccount(trades, account).forEach(function (t) {
      if (computeTrade(t).net <= 0) return;
      const r = realizedR(t);
      if (Number.isFinite(r) && r >= 2) count += 1;
    });
    return count;
  }

  /* Badge catalog. Each `ladder` entry becomes its own rung (own id, target
   * and label), so a lower rung never grants a higher one. `metric` returns
   * the raw value; `stat` (outcome badges) returns the informational figure. */
  const BADGES = [
    { id: 'bpt-700-trades', category: BADGE_PROCESS,
      label: 'Trades completados',
      description: 'Trades de la cuenta con entrada y salida registradas.',
      ladder: [50, 150, 300, 500, 700],
      rungLabel: function (n) { return n + ' trades completados'; },
      metric: completedTradeCount },
    { id: 'bpt-capital-guardian', category: BADGE_PROCESS,
      label: 'Guardia de capital',
      description: 'Trades consecutivos arriesgando entre 0,5 % y 2 % del saldo.',
      ladder: [5, 10, 20, 30],
      rungLabel: function (n) { return n + ' trades seguidos con riesgo 0,5 %-2 %'; },
      metric: capitalGuardianStreak },
    { id: 'bpt-mosquito-repellent', category: BADGE_PROCESS,
      label: 'Repelente de mosquitos',
      description: 'Días que cerraron con una pérdida diaria entre el 3 % y el 5 %.',
      ladder: [1, 3, 5, 10],
      rungLabel: function (n) { return n + (n === 1 ? ' día' : ' días') + ' con pérdida diaria 3 %-5 %'; },
      metric: mosquitoRepellentDays },
    { id: 'bpt-emergency-stop', category: BADGE_PROCESS,
      label: 'Parada de emergencia',
      description: 'Días que terminaron tras 3 pérdidas consecutivas.',
      ladder: [1, 3, 5, 10],
      rungLabel: function (n) { return n + (n === 1 ? ' día' : ' días') + ' con racha de 3 pérdidas'; },
      metric: emergencyStopDays },
    { id: 'bpt-crocodile', category: BADGE_PROCESS,
      label: 'Cocodrilo',
      description: 'Días con 3 entradas o menos (paciencia de cocodrilo).',
      ladder: [10, 25, 50, 100],
      rungLabel: function (n) { return n + ' días con 3 entradas o menos'; },
      metric: crocodileDays },
    { id: 'bpt-earned-step', category: BADGE_PROCESS,
      label: 'Escalón ganado',
      description: 'Trade de 2+ contratos con el capital en camino a doblarse.',
      ladder: [25, 50, 75, 100],
      rungLabel: function (n) { return n + ' % del doble de capital'; },
      metric: earnedStepLevel },
    { id: 'bpt-green-range', category: BADGE_OUTCOME,
      label: 'Rango verde',
      description: 'Ventana de 100+ trades con ≥70 % de aciertos.',
      ladder: [70],
      rungLabel: function () { return 'Mejor ventana (100+ trades)'; },
      metric: bestRollingWinPct,
      stat: function (trades, account) {
        return { label: 'Mejor ventana (100+ trades)', value: bestRollingWinPct(trades, account), unit: '%' };
      } },
    { id: 'bpt-hot-bath', category: BADGE_OUTCOME,
      label: 'Baño caliente',
      description: 'Los primeros 700 trades con ≥70 % de aciertos.',
      ladder: [70],
      rungLabel: function () { return 'Primeros 700 trades'; },
      metric: hotBathWinPct,
      stat: function (trades, account) {
        const s = hotBathStat(trades, account);
        return {
          label: 'Primeros 700 trades',
          value: s.winPct,
          unit: '%',
          count: s.count,
          span: (s.start && s.end) ? (s.start + ' → ' + s.end) : ''
        };
      } },
    { id: 'bpt-positive-math', category: BADGE_OUTCOME,
      label: 'Matemática positiva',
      description: 'Trades ganadores con R/R realizado ≥ 2.',
      ladder: [20],
      rungLabel: function () { return 'Ganadores con R/R ≥ 2'; },
      metric: positiveMathCount,
      stat: function (trades, account) {
        return { label: 'Ganadores con R/R ≥ 2', value: positiveMathCount(trades, account), unit: '' };
      } }
  ];

  /**
   * Evaluates the BPT badge ladder for one account. Returns one entry per
   * rung: `{ id, family, tier, category, label, description, target, value,
   * raw, earned, qualifies, xp, progressPct, stat }`.
   *
   * Process rungs set `earned` when `raw >= target` and award a fixed
   * `XP_BADGE`. Outcome rungs never set `earned` (they are statistics, not
   * achievements), carry the fact in `qualifies`, and award 0 XP.
   */
  function evaluateBadges(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    const out = [];
    BADGES.forEach(function (badge) {
      const raw = numOr(badge.metric(trades, account, ctx), 0);
      badge.ladder.forEach(function (threshold, i) {
        const outcome = badge.category === BADGE_OUTCOME;
        const reached = raw >= threshold;
        out.push({
          id: badge.id + '-t' + (i + 1),
          family: badge.id,
          tier: i + 1,
          category: badge.category,
          label: badge.rungLabel(threshold),
          description: badge.description,
          target: threshold,
          value: Math.min(raw, threshold),
          raw: raw,
          earned: outcome ? false : reached,
          qualifies: reached,
          xp: outcome ? 0 : XP_BADGE,
          progressPct: threshold > 0 ? Math.min(100, (raw / threshold) * 100) : 0,
          stat: badge.stat ? badge.stat(trades, account, ctx) : null
        });
      });
    });
    return out;
  }

  /** Local ISO date (YYYY-MM-DD) for a Date instance. */
  function isoDate(d) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  /** Monday..Sunday ISO bounds of the week containing `today`. */
  function weekBounds(today) {
    const parts = String(today || todayISO()).split('-').map(Number);
    const base = new Date(parts[0], parts[1] - 1, parts[2]);
    if (!Number.isFinite(base.getTime())) return null;
    const offset = (base.getDay() + 6) % 7; /* Monday = 0 */
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: isoDate(start), end: isoDate(end) };
  }

  function ratioItem(key, value, total) {
    return { key: key, value: value, total: total, ratio: total > 0 ? value / total : 0 };
  }

  /** Highest positive ratio among the week's habit metrics. */
  function pickBestHabit(recap) {
    const candidates = [
      ratioItem('discipline', recap.disciplinedDays, recap.daysWithTrades),
      ratioItem('stop', recap.withStop, recap.totalTrades),
      ratioItem('rr', recap.metRR, recap.rrEvaluable)
    ].filter(function (c) { return c.total > 0; });
    let best = null;
    candidates.forEach(function (c) { if (!best || c.ratio > best.ratio) best = c; });
    return best;
  }

  /** Most severe leak among the week's negative metrics (null when clean). */
  function pickWorstLeak(recap) {
    const candidates = [
      ratioItem('missingStop', recap.missingStop, recap.totalTrades),
      ratioItem('overtrading', recap.overTradedDays, recap.daysWithTrades),
      ratioItem('rrMissed', recap.rrEvaluable - recap.metRR, recap.rrEvaluable)
    ].filter(function (c) { return c.total > 0 && c.value > 0; });
    let worst = null;
    candidates.forEach(function (c) { if (!worst || c.ratio > worst.ratio) worst = c; });
    return worst;
  }

  /**
   * Weekly recap for one account (Monday..Sunday of `opts.today`). Returns the
   * raw counts plus a `bestHabit` and `worstLeak` descriptor `{ key, value,
   * total, ratio }` (or null). The UI maps `key` to Spanish copy.
   */
  function weeklyRecap(trades, account, opts) {
    const ctx = gamifyOpts(account, opts);
    const today = (opts && opts.today) ? opts.today : todayISO();
    const bounds = weekBounds(today);
    const result = {
      valid: false,
      account: ctx.account,
      weekStart: '',
      weekEnd: '',
      totalTrades: 0,
      daysWithTrades: 0,
      disciplinedDays: 0,
      overTradedDays: 0,
      withStop: 0,
      missingStop: 0,
      metRR: 0,
      rrEvaluable: 0,
      bestHabit: null,
      worstLeak: null
    };
    if (!bounds) return result;
    result.valid = true;
    result.weekStart = bounds.start;
    result.weekEnd = bounds.end;

    const list = tradesForAccount(trades, account).filter(function (t) {
      return t.entryDate >= bounds.start && t.entryDate <= bounds.end;
    });
    result.totalTrades = list.length;
    const days = disciplineDays(list, account, ctx.limit);
    result.daysWithTrades = days.length;
    result.disciplinedDays = days.filter(function (d) { return d.disciplined; }).length;
    result.overTradedDays = days.filter(function (d) { return d.overTraded; }).length;
    list.forEach(function (t) {
      if (numOr(t.stop, 0) > 0) result.withStop += 1;
      else result.missingStop += 1;
      const rr = computeRR({ plannedRisk: t.plannedRisk, target: t.target, minRR: ctx.minRR });
      if (rr.valid) {
        result.rrEvaluable += 1;
        if (rr.meetsMinimum) result.metRR += 1;
      }
    });
    result.bestHabit = pickBestHabit(result);
    result.worstLeak = pickWorstLeak(result);
    return result;
  }

  /** Configurable-goal progress (weekly discipline + R/R compliance). */
  function goalProgress(trades, account, opts, recap) {
    const ctx = gamifyOpts(account, opts);
    const week = recap || weeklyRecap(trades, account, opts);
    const weeklyGoal = (opts && Number.isFinite(opts.weeklyGoal))
      ? opts.weeklyGoal
      : getWeeklyDisciplineGoal();
    return {
      dailyLimit: { target: ctx.limit },
      minRR: { target: ctx.minRR },
      weeklyDiscipline: {
        value: week.disciplinedDays,
        target: weeklyGoal,
        pct: weeklyGoal > 0 ? Math.min(100, (week.disciplinedDays / weeklyGoal) * 100) : 0
      },
      rrCompliance: {
        value: week.metRR,
        total: week.rrEvaluable,
        pct: week.rrEvaluable > 0 ? (week.metRR / week.rrEvaluable) * 100 : 0
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Gamification persistence (settings.gamification, additive)          */
  /* ------------------------------------------------------------------ */

  /** Normalizes the persisted `settings.gamification` block. */
  function normalizeGamification(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const earned = {};
    if (src.achievements && typeof src.achievements === 'object') {
      Object.keys(src.achievements).forEach(function (id) {
        if (src.achievements[id]) earned[id] = true;
      });
    }
    return {
      xp: Math.max(0, intOr(src.xp, 0)),
      achievements: earned,
      bestStreak: Math.max(0, intOr(src.bestStreak, 0)),
      weeklyDisciplineGoal: Math.max(0, intOr(src.weeklyDisciplineGoal, WEEKLY_DISCIPLINE_GOAL_DEFAULT))
    };
  }

  function getGamification() {
    const raw = (state.settings && typeof state.settings === 'object') ? state.settings.gamification : undefined;
    return normalizeGamification(raw);
  }

  function getWeeklyDisciplineGoal() {
    return getGamification().weeklyDisciplineGoal;
  }

  /** Persists the weekly discipline goal (non-negative integer). */
  function setWeeklyDisciplineGoal(value) {
    const n = intOr(value, NaN);
    const next = getGamification();
    if (Number.isFinite(n) && n >= 0) next.weeklyDisciplineGoal = n;
    setSettings({ gamification: next });
    return next.weeklyDisciplineGoal;
  }

  /**
   * Recomputes gamification from the recorded data and persists the
   * high-water marks (max XP, earned achievement ids, best streak). Only
   * writes when something actually changed, so a snapshot-triggered re-render
   * cannot loop.
   */
  function syncGamification(account) {
    const next = normalizeGamification(getGamification());
    let changed = false;

    const computed = xpBreakdown(state.trades, account);
    /* Process badge XP is a fixed per-rung award; outcome badges never add XP. */
    let badgeXp = 0;
    evaluateBadges(state.trades, account).forEach(function (b) {
      if (b.category !== BADGE_PROCESS) return;
      if (b.earned) badgeXp += b.xp;
      if (b.earned && !next.achievements[b.id]) {
        next.achievements[b.id] = true;
        changed = true;
      }
    });
    const computedXp = computed.total + badgeXp;
    if (computedXp > next.xp) { next.xp = computedXp; changed = true; }

    const streak = disciplineStreak(state.trades, account);
    if (streak.best > next.bestStreak) { next.bestStreak = streak.best; changed = true; }

    evaluateAchievements(state.trades, account).forEach(function (a) {
      if (a.earned && !next.achievements[a.id]) {
        next.achievements[a.id] = true;
        changed = true;
      }
    });

    if (changed) setSettings({ gamification: next });
    return next;
  }

  /**
   * Aggregated, account-scoped gamification view for the UI: persisted
   * high-water marks merged with the current computed state. Persists any new
   * high-water mark as a side effect (see `syncGamification`).
   */
  function getDisciplineSummary(account) {
    const key = strOr(account, '');
    const ctx = gamifyOpts(key, null);
    const streak = disciplineStreak(state.trades, key, ctx.limit);
    const computed = xpBreakdown(state.trades, key);
    const stored = syncGamification(key);

    const processBadges = [];
    const outcomeBadges = [];
    let badgeXp = 0;
    evaluateBadges(state.trades, key).forEach(function (b) {
      if (b.category === BADGE_PROCESS) {
        /* A persisted rung stays earned (high-water) even if data changes. */
        if (stored.achievements[b.id]) b.earned = true;
        if (b.earned) badgeXp += b.xp;
        processBadges.push(b);
      } else {
        outcomeBadges.push(b);
      }
    });

    const xp = Math.max(computed.total + badgeXp, stored.xp);
    const achievements = evaluateAchievements(state.trades, key);
    achievements.forEach(function (a) {
      if (stored.achievements[a.id]) a.earned = true;
    });
    const recap = weeklyRecap(state.trades, key);
    const goals = goalProgress(state.trades, key, null, recap);
    return {
      account: key,
      xp: xp,
      computedXp: computed,
      badgeXp: badgeXp,
      level: levelInfo(xp),
      streak: {
        current: streak.current,
        best: Math.max(streak.best, stored.bestStreak)
      },
      days: streak.days,
      achievements: achievements,
      processBadges: processBadges,
      outcomeBadges: outcomeBadges,
      recap: recap,
      goals: goals,
      weeklyGoal: stored.weeklyDisciplineGoal
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
    getLastTrade: getLastTrade,
    getRiskSettings: getRiskSettings,
    getLastEntry: getLastEntry,
    saveLastEntry: saveLastEntry,
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
    riskGuard: riskGuard,
    minBalanceForOneContract: minBalanceForOneContract,
    maxTicksForOneContract: maxTicksForOneContract,
    budgetStopTicks: budgetStopTicks,
    resolveStopTicksSeed: resolveStopTicksSeed,
    suggestStopTarget: suggestStopTarget,
    ratioTarget: ratioTarget,
    getRatioOptions: getRatioOptions,
    draftAutofill: draftAutofill,
    tradePreviewGeometry: tradePreviewGeometry,
    microEquivalent: microEquivalent,
    normalizeInstrument: normalizeInstrument,
    ticksToPoints: ticksToPoints,
    pointsToTicks: pointsToTicks,
    normalizeInstrumentConfig: normalizeInstrumentConfig,
    getInstrumentConfig: getInstrumentConfig,
    resolveInstrumentConfig: resolveInstrumentConfig,
    setInstrumentConfig: setInstrumentConfig,
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
    dailyRiskUsage: dailyRiskUsage,
    startOfDayBalance: startOfDayBalance,
    SMALL_ACCOUNT_MAX: SMALL_ACCOUNT_LIMIT,

    /* Discipline gamification (pure except getDisciplineSummary/syncGamification). */
    disciplineDays: disciplineDays,
    disciplineStreak: disciplineStreak,
    tradeRiskUsd: tradeRiskUsd,
    riskRespectedCount: riskRespectedCount,
    rrMetCount: rrMetCount,
    xpBreakdown: xpBreakdown,
    levelInfo: levelInfo,
    evaluateAchievements: evaluateAchievements,
    evaluateBadges: evaluateBadges,
    weeklyRecap: weeklyRecap,
    weekBounds: weekBounds,
    goalProgress: goalProgress,
    normalizeGamification: normalizeGamification,
    getGamification: getGamification,
    getWeeklyDisciplineGoal: getWeeklyDisciplineGoal,
    setWeeklyDisciplineGoal: setWeeklyDisciplineGoal,
    syncGamification: syncGamification,
    getDisciplineSummary: getDisciplineSummary,
    ACHIEVEMENTS: ACHIEVEMENTS,
    BADGES: BADGES,
    XP_BADGE: XP_BADGE,

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
