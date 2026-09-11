/* store.js
 * Persistence, calculations and import/export for the trading journal.
 * Exposes the global `Store`. Plain script (no modules).
 *
 * Persistence key: "bpt.journal.v1"
 * Persisted shape: { version: 1, trades: [], balances: {Sim,Real,Fondeo}, settings: {} }
 * Auto-saves on every mutation.
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
  /* Persistence                                                         */
  /* ------------------------------------------------------------------ */

  function canPersist() {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch (err) {
      return false;
    }
  }

  function load() {
    if (!canPersist()) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      state = normalize(JSON.parse(raw));
    } catch (err) {
      /* Corrupted payload: keep defaults, do not crash. */
      state = emptyState();
    }
  }

  function save() {
    if (!canPersist()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* Quota or private mode: ignore, the app keeps working in memory. */
    }
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
  /* Public mutations (each one auto-saves)                              */
  /* ------------------------------------------------------------------ */

  function setBalances(obj) {
    if (!obj || typeof obj !== 'object') return getBalances();
    ACCOUNT_LIST.forEach(function (account) {
      if (obj[account] !== undefined) {
        state.balances[account] = numOr(obj[account], state.balances[account]);
      }
    });
    save();
    return getBalances();
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
    save();
    return Object.assign({}, record);
  }

  function updateTrade(id, patch) {
    const index = state.trades.findIndex(function (t) { return t.id === id; });
    if (index === -1) return null;
    const merged = Object.assign({}, state.trades[index], patch || {});
    state.trades[index] = sanitizeTrade(merged);
    save();
    return Object.assign({}, state.trades[index]);
  }

  function deleteTrade(id) {
    const before = state.trades.length;
    state.trades = state.trades.filter(function (t) { return t.id !== id; });
    save();
    return state.trades.length < before;
  }

  function clearAll() {
    state = emptyState();
    save();
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
    if (Array.isArray(parsed)) {
      state.trades = parsed.map(sanitizeTrade).filter(Boolean);
    } else {
      state = normalize(parsed);
    }
    save();
    return true;
  }

  const CSV_HEADERS = [
    'tradeNumber', 'account', 'instrument', 'contracts', 'strategy', 'direction',
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
      { tradeNumber: 1, account: 'Sim', instrument: 'NQ', contracts: 2, strategy: 'E1', direction: 'Largo',
        entryDate: '2024-01-08', entryTime: '09:35', entryPrice: 16850.25, exitDate: '2024-01-08', exitTime: '09:58', exitPrice: 16895.50,
        exitType: 'Profit', emotion: 'Confianza', notes: 'Ruptura de rango en apertura.' },
      { tradeNumber: 2, account: 'Real', instrument: 'ES', contracts: 1, strategy: 'E2', direction: 'Corto',
        entryDate: '2024-01-10', entryTime: '10:05', entryPrice: 4790.00, exitDate: '2024-01-10', exitTime: '10:31', exitPrice: 4798.25,
        exitType: 'Stop', emotion: 'Miedo', notes: 'Entrada contra la tendencia.' },
      { tradeNumber: 3, account: 'Sim', instrument: 'MNQ', contracts: 5, strategy: 'E3', direction: 'Largo',
        entryDate: '2024-01-12', entryTime: '11:15', entryPrice: 16750.00, exitDate: '2024-01-12', exitTime: '11:42', exitPrice: 16788.00,
        exitType: 'Trailing stop', emotion: 'Control', notes: 'Gestión con trailing tras impulso.' },
      { tradeNumber: 4, account: 'Fondeo', instrument: 'MES', contracts: 10, strategy: 'E1', direction: 'Corto',
        entryDate: '2024-02-02', entryTime: '09:40', entryPrice: 4955.25, exitDate: '2024-02-02', exitTime: '09:55', exitPrice: 4948.75,
        exitType: 'Profit', emotion: 'Confianza', notes: 'Reversión en resistencia.' },
      { tradeNumber: 5, account: 'Real', instrument: 'CL', contracts: 1, strategy: 'E4', direction: 'Largo',
        entryDate: '2024-02-14', entryTime: '12:20', entryPrice: 78.45, exitDate: '2024-02-14', exitTime: '12:50', exitPrice: 77.90,
        exitType: 'Stop', emotion: 'Frustración', notes: 'Falso quiebre del soporte.' },
      { tradeNumber: 6, account: 'Fondeo', instrument: 'FDAX', contracts: 2, strategy: 'E5', direction: 'Corto',
        entryDate: '2024-03-05', entryTime: '08:10', entryPrice: 17850.00, exitDate: '2024-03-05', exitTime: '08:47', exitPrice: 17805.00,
        exitType: 'Profit', emotion: 'Codicia', notes: 'Apertura europea con gap.' },
      { tradeNumber: 7, account: 'Sim', instrument: 'MYM', contracts: 8, strategy: 'E2', direction: 'Largo',
        entryDate: '2024-03-18', entryTime: '13:05', entryPrice: 38950.00, exitDate: '2024-03-18', exitTime: '13:20', exitPrice: 38942.00,
        exitType: 'Break Even', emotion: 'Duda', notes: 'Salida sin convicción.' },
      { tradeNumber: 8, account: 'Real', instrument: '6E', contracts: 1, strategy: 'E1', direction: 'Corto',
        entryDate: '2024-04-09', entryTime: '09:30', entryPrice: 1.0865, exitDate: '2024-04-09', exitTime: '09:52', exitPrice: 1.0842,
        exitType: 'Cierre manual', emotion: 'Impaciencia', notes: 'Cierre anticipado por noticia.' }
    ];

    state.trades = samples.map(function (s) {
      return sanitizeTrade(Object.assign({ id: uid() }, s));
    });
    save();
    return getTrades();
  }

  /* ------------------------------------------------------------------ */
  /* Initialization                                                      */
  /* ------------------------------------------------------------------ */

  load();

  return {
    STORAGE_KEY: STORAGE_KEY,
    canPersist: canPersist,

    getTrades: getTrades,
    getBalances: getBalances,
    getSettings: getSettings,
    setBalances: setBalances,
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

    importJSON: importJSON,
    exportJSON: exportJSON,
    exportCSV: exportCSV,
    parseCSV: parseCSV,
    seedSample: seedSample
  };
})();
