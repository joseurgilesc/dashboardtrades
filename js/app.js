/* app.js
 * UI controller for the trading journal. Wires the DOM on DOMContentLoaded.
 * Plain script (no modules), no global exports.
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  const state = {
    activeTab: 'registro',
    activeTrade: 0,
    editingId: null,
    sortKey: 'entryDate',
    sortDir: 'asc',
    search: '',
    globalSearch: '',
    filters: {
      account: '',
      instrument: '',
      strategy: '',
      emotion: '',
      dateFrom: '',
      dateTo: ''
    },
    /* Global day selector: defaults to today; empty means "show every day". */
    globalDate: '',
    /* Dashboard date range (independent of the global day selector). */
    dashboardPeriod: 'all',
    dfFrom: '',
    dfTo: '',
    /* Filters bar disclosure, remembered for the browser session. */
    filtersOpen: false,
    chartsDirty: true
  };

  /* Auth/session state (module scope, outside the UI `state` object). */
  let currentUid = null;
  let currentUser = null;
  let authMode = 'signin';

  /* Three concurrent trade drafts; indices 0..2 map to the trade tabs. */
  let drafts = [null, null, null];

  /* Named XP levels so the gamification reads as a real progression. */
  const LEVEL_NAMES = ['Novato', 'Aprendiz', 'Intermedio', 'Avanzado', 'Experto', 'Trader', 'Profesional', 'Maestro'];

  /* True once the user edits the contracts field by hand, so the risk
   * calculator stops prefilling it for the current trade. Reset on reset. */
  let contractsTouched = false;

  /* Last account the risk panel seeded its % risk input for. Used so switching
   * account refreshes the default while hand-edits persist for that account. */
  let lastRiskAccount = null;

  /* True once the user edits the stop-ticks input by hand. A user-typed stop is
   * FINAL: the budget-derived default never re-seeds over it again, not even
   * when the instrument or the account changes. */
  let stopTicksTouched = false;

  /* True once the user edits the calculator's trades-per-day input by hand.
   * A user-typed value is FINAL: the account default never re-seeds over it
   * again, not even when the account changes. While the field is transiently
   * empty (backspacing to retype, or a mobile numeric keyboard) the calculator
   * keeps the user's in-progress edit and uses the account default for the
   * math WITHOUT writing it back to the DOM. */
  let tradesPerDayTouched = false;

  /* Draft/touched state for the autofilled form fields. A draft is written
   * ONLY while the field is untouched; the first `input` event flips it to
   * touched and the user's value becomes final. Programmatic `.value =` writes
   * never fire `input`, so a draft can never mark itself as touched. */
  const touchedFields = { stop: false, exitPrice: false };

  /* Legacy USD `target` of the trade being edited. The USD target input was
   * removed in favour of the R/B ratio selector, but saved trades may still
   * carry a numeric `target`; keeping it here lets an edit round-trip it
   * without a form field (migration-safe: it is never read as USD for
   * planning, only preserved on save). */
  let editingTarget = 0;

  /* Top-level regions hidden until authentication resolves. */
  const APP_REGIONS = ['.tabs', '#globalSearchBar', '#filtersToggle', '#filtersBar', '.app-main', '.app-footer'];

  const moneyFmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  /* ------------------------------------------------------------------ */
  /* Generic helpers                                                     */
  /* ------------------------------------------------------------------ */

  function $(id) {
    return document.getElementById(id);
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '∞';
    return moneyFmt.format(n);
  }

  function formatNumber(value, decimals) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(decimals === undefined ? 2 : decimals);
  }

  function signClass(value) {
    if (value > 0) return 'pos';
    if (value < 0) return 'neg';
    return '';
  }

  /* Gains/losses are never communicated by color alone: positive values get an
   * explicit "+" so the sign survives colorblindness and monochrome views. */
  function signedMoney(value) {
    const n = Number(value);
    return n > 0 ? '+' + formatMoney(n) : formatMoney(n);
  }

  function signedNumber(value, decimals) {
    const n = Number(value);
    return n > 0 ? '+' + formatNumber(n, decimals) : formatNumber(n, decimals);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayISO() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  /** Monday of the current week (local ISO date). */
  function weekStartISO() {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }

  /** First day of the current month (local ISO date). */
  function monthStartISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  function nowTime() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  /** Reads "HH:MM" from a time field's hidden input. */
  function readTimeSelect(prefix) {
    const el = $(prefix);
    return el ? el.value : '';
  }

  /** Writes "HH:MM" into a time field's input and syncs the flatpickr view. */
  function writeTimeSelect(prefix, value) {
    const parts = String(value || '').split(':');
    const norm = (parts[0] ? String(parts[0]).padStart(2, '0') : '00') + ':' +
      (parts[1] ? String(parts[1]).padStart(2, '0') : '00');
    const el = $(prefix);
    if (el) el.value = norm;
    const fp = el && el._flatpickr;
    if (fp && typeof fp.setDate === 'function') fp.setDate(norm, false);
  }

  /** Updates the visible time-field button from the hidden input. */
  function renderTimeDisplay(prefix) {
    const input = $(prefix);
    const display = $(prefix + 'Display');
    if (display) display.textContent = (input && input.value) ? input.value : '--:--';
  }

  /* --- Graphical clock picker (12h + AM/PM + minutes) --------------- */
  let clockTarget = null;
  let clockPhase = 'hour';
  let clockHour = null;
  let clockMin = null;
  let clockMeridiem = 'AM';

  function clockAngle(step, degrees) {
    return ((step * degrees - 90) * Math.PI) / 180;
  }

  function openClock(prefix) {
    clockTarget = prefix;
    const input = $(prefix);
    const parts = String((input && input.value) || '').split(':');
    let h = parts[0] ? parseInt(parts[0], 10) : new Date().getHours();
    if (h >= 12) { clockMeridiem = 'PM'; if (h > 12) h -= 12; }
    else { clockMeridiem = 'AM'; if (h === 0) h = 12; }
    clockHour = h;
    clockMin = parts[1] ? parseInt(parts[1], 10) : 0;
    clockPhase = 'hour';
    renderClock();
    const popup = $(prefix + 'Popup');
    if (popup) popup.hidden = false;
  }

  function closeClock() {
    if (clockTarget) {
      const popup = $(clockTarget + 'Popup');
      if (popup) popup.hidden = true;
    }
    clockTarget = null;
  }

  function clockCenterLabel() {
    if (clockPhase === 'minute') {
      return String(clockHour).padStart(2, '0') + ':--';
    }
    return clockMeridiem;
  }

  function renderClock() {
    if (!clockTarget) return;
    const popup = $(clockTarget + 'Popup');
    if (!popup) return;
    const hourHtml = [];
    for (let h = 1; h <= 12; h += 1) {
      const a = clockAngle(h, 30);
      const x = 92 + 46 * Math.cos(a);
      const y = 92 + 46 * Math.sin(a);
      hourHtml.push('<button type="button" class="clock-hour' + (clockPhase === 'hour' && clockHour === h ? ' active' : '') +
        '" data-clock-hour="' + h + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;">' + h + '</button>');
    }
    const minHtml = [];
    for (let m = 0; m < 60; m += 1) {
      const a = clockAngle(m, 6);
      const x = 92 + 74 * Math.cos(a);
      const y = 92 + 74 * Math.sin(a);
      const labeled = m % 5 === 0;
      minHtml.push('<button type="button" class="clock-minute' + (clockPhase === 'minute' && clockMin === m ? ' active' : '') +
        (labeled ? ' label' : '') + '" data-clock-minute="' + m + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;">' + (labeled ? m : '') + '</button>');
    }
    popup.innerHTML =
      '<div class="clock-head">' +
        '<span class="clock-phase">' + (clockPhase === 'hour' ? 'Elige la hora' : 'Elige los minutos') + '</span>' +
        '<div class="clock-meridiem">' +
          '<button type="button" class="clock-mer' + (clockMeridiem === 'AM' ? ' active' : '') + '" data-clock-mer="AM">AM</button>' +
          '<button type="button" class="clock-mer' + (clockMeridiem === 'PM' ? ' active' : '') + '" data-clock-mer="PM">PM</button>' +
        '</div>' +
      '</div>' +
      '<div class="clock-face" data-phase="' + clockPhase + '">' +
        '<span class="clock-center">' + clockCenterLabel() + '</span>' +
        hourHtml.join('') + minHtml.join('') +
      '</div>';
  }

  function selectClockHour(h) {
    clockHour = h;
    clockPhase = 'minute';
    renderClock();
  }

  function selectClockMinute(m) {
    clockMin = m;
    let h = clockHour;
    if (clockMeridiem === 'PM' && h !== 12) h += 12;
    if (clockMeridiem === 'AM' && h === 12) h = 0;
    const value = String(h).padStart(2, '0') + ':' + String(clockMin).padStart(2, '0');
    writeTimeSelect(clockTarget, value);
    closeClock();
  }

  function setClockMeridiem(m) {
    clockMeridiem = m;
    renderClock();
  }

  /** Shows the exit-date field only for swing mode; scalping/intradía share
   *  the entry date. */
  function applyTradeMode() {
    const mode = $('tradeMode');
    const swing = mode && mode.value === 'Swing';
    const exitDateField = $('exitDateField');
    if (exitDateField) exitDateField.hidden = !swing;
  }

  function parseLocalDateTime(date, time) {
    if (!date) return null;
    const d = String(date).split('-').map(Number);
    if (d.length !== 3 || d.some(function (p) { return !Number.isFinite(p); })) return null;
    const t = String(time || '00:00').split(':').map(Number);
    const dt = new Date(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  function setStatus(message, kind) {
    const el = $('appStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'app-status' + (kind ? ' ' + kind : '');
    el.hidden = !message;
    if (message) {
      window.clearTimeout(setStatus._timer);
      setStatus._timer = window.setTimeout(function () {
        el.hidden = true;
        el.textContent = '';
      }, 4000);
    }
  }

  /**
   * Non-blocking toast feedback. Toasts stack bottom-right, reuse the dark
   * panel tokens, and auto-dismiss. The colored left border carries the
   * signal (green ok / red error / amber warn).
   */
  function showToast(message, kind) {
    const container = $('toastContainer');
    if (!container || !message) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (kind ? ' ' + kind : '');
    toast.textContent = message;
    container.appendChild(toast);
    /* Next frame so the enter transition actually runs. */
    window.requestAnimationFrame(function () {
      toast.classList.add('toast-visible');
    });
    window.setTimeout(function () {
      toast.classList.remove('toast-visible');
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
    }, 2600);
  }

  /* ------------------------------------------------------------------ */
  /* Select population                                                   */
  /* ------------------------------------------------------------------ */

  function fillSelect(select, values, placeholder) {
    if (!select) return;
    select.innerHTML = '';
    if (placeholder !== undefined && placeholder !== null) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      select.appendChild(opt);
    }
    values.forEach(function (value) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    });
  }

  function strategyGroupLabel(group) {
    switch (group) {
      case 'scalping': return 'Scalping';
      case 'swing': return 'Swing';
      case 'legacy': return 'Legacy (sin clasificar)';
      default: return group;
    }
  }

  function strategyLabelOf(id) {
    return (typeof Store !== 'undefined' && Store.strategyLabel)
      ? Store.strategyLabel(id)
      : id;
  }

  /**
   * Populates a strategy `<select>` with grouped `<optgroup>`s in catalog
   * order (scalping, swing, legacy). `option.value` is the stable id; the
   * visible text is the resolved label, so legacy/unknown ids still render.
   */
  function fillStrategySelect(select, placeholder) {
    if (!select) return;
    select.innerHTML = '';
    if (placeholder !== undefined && placeholder !== null) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      select.appendChild(opt);
    }
    const strategies = (typeof Store !== 'undefined' && Store.getStrategies)
      ? Store.getStrategies()
      : [];
    const groups = (typeof STRATEGY_GROUPS !== 'undefined') ? STRATEGY_GROUPS : ['scalping', 'swing', 'legacy'];
    groups.forEach(function (group) {
      const members = strategies.filter(function (strategy) { return strategy.group === group; });
      if (!members.length) return;
      const optgroup = document.createElement('optgroup');
      optgroup.label = strategyGroupLabel(group);
      members.forEach(function (strategy) {
        const opt = document.createElement('option');
        opt.value = strategy.id;
        opt.textContent = strategyLabelOf(strategy.id);
        optgroup.appendChild(opt);
      });
      select.appendChild(optgroup);
    });
  }

  /** Keeps an unknown stored id selectable when editing a legacy trade. */
  function ensureStrategyOption(select, id) {
    if (!select || !id) return;
    const exists = Array.prototype.some.call(select.options, function (opt) { return opt.value === id; });
    if (exists) return;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = strategyLabelOf(id);
    select.appendChild(opt);
  }

  /** Spanish label for an R/B ratio value (2 -> "1:2", 2.5 -> "1:2.5"). */
  function ratioLabel(value) {
    return '1:' + value;
  }

  /**
   * Populates the calculator's R/B ratio selector from the shared catalog
   * (`Store.getRatioOptions`), preserving the catalog order and defaulting to
   * the first option (1:2). The option VALUE is the numeric reward multiple.
   */
  function fillRatioSelect(select) {
    if (!select) return;
    const options = (typeof Store !== 'undefined' && Store.getRatioOptions)
      ? Store.getRatioOptions()
      : [2, 2.5, 3, 3.5, 4];
    select.innerHTML = '';
    options.forEach(function (ratio) {
      const opt = document.createElement('option');
      opt.value = String(ratio);
      opt.textContent = ratioLabel(ratio);
      select.appendChild(opt);
    });
    select.value = String(options[0]);
  }

  /** Reads the selected R/B ratio (defaults to the first catalog option). */
  function readRatio() {
    const el = $('riskRatio');
    const n = el ? parseFloat(el.value) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    return (typeof DEFAULT_RATIO !== 'undefined' && DEFAULT_RATIO > 0) ? DEFAULT_RATIO : 2;
  }

  function initSelects() {
    fillSelect($('accountSelector'), ACCOUNTS);
    fillSelect($('instrument'), Object.keys(INSTRUMENTS));
    /* The calculator's selector is populated from the SAME catalog source as
     * the trade form's, so the instrument list is never hardcoded twice. */
    fillSelect($('riskInstrument'), Object.keys(INSTRUMENTS));
    fillRatioSelect($('riskRatio'));
    fillStrategySelect($('strategy'));
    fillSelect($('direction'), DIRECTIONS);
    fillSelect($('exitType'), EXIT_TYPES);
    fillSelect($('emotion'), EMOTIONS);
    fillSelect($('tradeMode'), ['Scalping', 'Intradía', 'Swing']);

    fillSelect($('filterAccount'), ACCOUNTS, 'Todas las cuentas');
    fillSelect($('filterInstrument'), Object.keys(INSTRUMENTS), 'Todos los instrumentos');
    fillStrategySelect($('filterStrategy'), 'Todas las estrategias');
    fillSelect($('filterEmotion'), EMOTIONS, 'Todas las emociones');

    fillSelect($('instrumentConfigAccount'), ACCOUNTS);
    fillSelect($('ninjaImportAccount'), ACCOUNTS);
  }

  /* ------------------------------------------------------------------ */
  /* Filtering / sorting                                                 */
  /* ------------------------------------------------------------------ */

  /** Filter-bar trades (account/instrument/strategy/emotion/date range), before
   *  the global day selector is applied. */
  function getFilterBarTrades() {
    const f = state.filters;
    const all = Store.getTrades();
    /* A global search ignores the filter bar and looks across every trade. */
    if (state.globalSearch) {
      return all.filter(matchesGlobalSearch);
    }
    return all.filter(function (t) {
      if (f.account && t.account !== f.account) return false;
      if (f.instrument && t.instrument !== f.instrument) return false;
      if (f.strategy && t.strategy !== f.strategy) return false;
      if (f.emotion && t.emotion !== f.emotion) return false;
      if (f.dateFrom && t.entryDate < f.dateFrom) return false;
      if (f.dateTo && t.entryDate > f.dateTo) return false;
      return true;
    });
  }

  /** Trades for the main table: filter bar + the global day selector. */
  function getFilteredTrades() {
    const base = getFilterBarTrades();
    if (!state.globalDate) return base;
    return base.filter(function (t) { return t.entryDate === state.globalDate; });
  }

  /** Dashboard-only date range, independent of the global day selector. */
  function getDashboardTrades() {
    const base = getFilterBarTrades();
    const period = state.dashboardPeriod;
    if (period === 'all') return base;
    const today = todayISO();
    if (period === 'today') {
      return base.filter(function (t) { return t.entryDate === today; });
    }
    if (period === 'week') {
      const start = weekStartISO();
      return base.filter(function (t) { return t.entryDate >= start && t.entryDate <= today; });
    }
    if (period === 'month') {
      const start = monthStartISO();
      return base.filter(function (t) { return t.entryDate >= start; });
    }
    if (period === 'custom') {
      return base.filter(function (t) {
        if (state.dfFrom && t.entryDate < state.dfFrom) return false;
        if (state.dfTo && t.entryDate > state.dfTo) return false;
        return true;
      });
    }
    return base;
  }

  /** Reflects the active dashboard range in the shortcut buttons. */
  function applyDashboardFilter() {
    const period = state.dashboardPeriod;
    Array.prototype.forEach.call(document.querySelectorAll('[data-df]'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-df') === period);
    });
    const customEl = $('dashboardCustom');
    if (customEl) customEl.hidden = period !== 'custom';
  }

  /** Full-text match across every trade, independent of the filter bar. */
  function matchesGlobalSearch(trade) {
    if (!state.globalSearch) return true;
    const haystack = [
      trade.tradeNumber, trade.account, trade.instrument, trade.direction,
      trade.strategy, strategyLabelOf(trade.strategy), trade.exitType,
      trade.emotion, trade.entryDate, trade.exitDate, trade.notes
    ].join(' ').toLowerCase();
    return haystack.indexOf(state.globalSearch) !== -1;
  }

  function matchesSearch(trade) {
    if (!state.search) return true;
    const haystack = [
      trade.tradeNumber, trade.account, trade.instrument, trade.direction,
      trade.strategy, strategyLabelOf(trade.strategy), trade.exitType,
      trade.emotion, trade.entryDate, trade.notes
    ].join(' ').toLowerCase();
    return haystack.indexOf(state.search) !== -1;
  }

  function sortValue(trade, key) {
    if (key === 'entryDate') {
      return (trade.entryDate || '') + ' ' + (trade.entryTime || '');
    }
    return trade[key];
  }

  function sortTrades(list) {
    const key = state.sortKey;
    const dir = state.sortDir === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      const sa = String(va === undefined || va === null ? '' : va);
      const sb = String(vb === undefined || vb === null ? '' : vb);
      return sa.localeCompare(sb, 'es') * dir;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Balances header                                                     */
  /* ------------------------------------------------------------------ */

  function renderBalances() {
    const account = activeAccount();
    const initial = Store.getBalances();
    const balances = Store.getAccountBalances();
    const value = balances[account] || 0;
    const balanceEl = $('chipBalance');
    if (balanceEl) {
      balanceEl.textContent = formatMoney(value);
      balanceEl.className = 'chip-value ' + signClass(value - (initial[account] || 0));
    }
    const subEl = $('chipSubBalance');
    if (subEl) subEl.textContent = 'Inicial ' + formatMoney(initial[account] || 0);
  }

  /* ------------------------------------------------------------------ */
  /* Table                                                               */
  /* ------------------------------------------------------------------ */

  /* Muted line-chart glyph for empty states. Inline SVG keeps the app
   * asset-free; `currentColor` inherits the muted token from CSS. */
  const EMPTY_STATE_ICON =
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-6"/></svg>';

  /**
   * Reusable empty-state block: muted icon, a title, optional supporting text
   * and an optional action button. `cta.action` is a `data-action` value wired
   * by the trades-body click delegation.
   */
  function emptyStateHtml(opts) {
    const options = opts || {};
    const parts = ['<div class="empty-state">'];
    parts.push('<span class="empty-state-icon" aria-hidden="true">' + EMPTY_STATE_ICON + '</span>');
    if (options.title) {
      parts.push('<span class="empty-state-title">' + escapeHtml(options.title) + '</span>');
    }
    if (options.text) {
      parts.push('<span class="empty-state-text">' + escapeHtml(options.text) + '</span>');
    }
    if (options.cta && options.cta.action && options.cta.label) {
      parts.push('<button type="button" class="btn btn-primary empty-state-cta" data-action="' +
        escapeHtml(options.cta.action) + '">' + escapeHtml(options.cta.label) + '</button>');
    }
    parts.push('</div>');
    return parts.join('');
  }

  /* Localised day label for the trades-table day separators. */
  const dayLabelFmt = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });

  function formatDayLabel(iso) {
    const parts = String(iso || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(function (p) { return !Number.isFinite(p); })) {
      return iso || '';
    }
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    if (!Number.isFinite(dt.getTime())) return iso || '';
    return dayLabelFmt.format(dt);
  }

  const TABLE_COLUMNS = [
    { key: 'tradeNumber', label: '#' },
    { key: 'entryDate', label: 'Fecha' },
    { key: 'account', label: 'Cuenta' },
    { key: 'instrument', label: 'Instrumento' },
    { key: 'direction', label: 'Dirección' },
    { key: 'contracts', label: 'Contratos' },
    { key: 'entryPrice', label: 'Entrada' },
    { key: 'exitPrice', label: 'Salida' },
    { key: 'exitType', label: 'Tipo de salida' },
    { key: 'emotion', label: 'Emoción' },
    { key: 'points', label: 'Puntos' },
    { key: 'net', label: 'Neto' },
    { key: 'cumulative', label: 'Acumulado' }
  ];

  function renderTableHeaders() {
    const head = $('tradesHead');
    if (!head) return;
    const cells = TABLE_COLUMNS.map(function (col) {
      const active = state.sortKey === col.key;
      const arrow = active ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      const aria = active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
      return '<th scope="col" data-sort="' + col.key + '" aria-sort="' + aria + '"' +
        (active ? ' class="sorted"' : '') + '>' + escapeHtml(col.label) + arrow + '</th>';
    });
    cells.push('<th scope="col" class="col-actions">Acciones</th>');
    head.innerHTML = '<tr>' + cells.join('') + '</tr>';
  }

  function renderTable(trades) {
    const body = $('tradesBody');
    if (!body) return;

    const totalTrades = Store.getTrades().length;
    /* Compute before sorting so the Neto/Puntos/Acumulado columns render real
     * values and sorting by result/net compares numbers, not `undefined`. */
    const rows = sortTrades(Store.computeAll((trades || []).filter(matchesSearch)));

    if (rows.length === 0) {
      const empty = totalTrades === 0
        ? emptyStateHtml({
            title: 'Aún no hay trades',
            text: 'Registra tu primera operación para ver métricas, curva de equity y análisis.',
            cta: { action: 'new-trade', label: 'Añade tu primer trade' }
          })
        : emptyStateHtml({
            title: 'Sin coincidencias',
            text: 'No hay trades que coincidan con los filtros o la búsqueda actual.',
            cta: { action: 'clear-filters', label: 'Limpiar filtros' }
          });
      body.innerHTML = '<tr><td class="table-empty" colspan="' +
        (TABLE_COLUMNS.length + 1) + '">' + empty + '</td></tr>';
    } else {
      body.innerHTML = buildTradeRows(rows);
    }

    const summary = $('tableSummary');
    if (summary) {
      summary.textContent = rows.length + (rows.length === 1 ? ' trade' : ' trades');
    }
    renderGlobalSearchHint();
    renderDisciplineSummary(trades);
    renderTableHeaders();
  }

  /** Tells the user that an active global search bypasses the filter bar. */
  function renderGlobalSearchHint() {
    const hint = $('globalSearchHint');
    if (!hint) return;
    if (state.globalSearch) {
      hint.textContent = 'Buscando en todos los trades (los filtros no se aplican).';
      hint.hidden = false;
    } else {
      hint.hidden = true;
      hint.textContent = '';
    }
  }

  /**
   * Builds the trade rows. When the table is sorted by entry date, a subtle
   * day separator is inserted before each new day; the row being edited is
   * flagged with `.editing`.
   */
  function buildTradeRows(rows) {
    const groupByDay = state.sortKey === 'entryDate';
    const dayCounts = {};
    if (groupByDay) {
      rows.forEach(function (t) {
        dayCounts[t.entryDate] = (dayCounts[t.entryDate] || 0) + 1;
      });
    }
    const html = [];
    let lastDay = null;
    rows.forEach(function (t) {
      if (groupByDay && t.entryDate !== lastDay) {
        const count = dayCounts[t.entryDate] || 0;
        html.push('<tr class="day-separator"><td colspan="' + (TABLE_COLUMNS.length + 1) + '">' +
          '<span class="day-label">' + escapeHtml(formatDayLabel(t.entryDate)) + '</span>' +
          '<span class="day-count">' + count + (count === 1 ? ' trade' : ' trades') + '</span>' +
          '</td></tr>');
        lastDay = t.entryDate;
      }
      html.push(tradeRowHtml(t));
    });
    return html.join('');
  }

  /** Direction pill with arrow + signal color; unknown values stay plain. */
  function directionCellHtml(direction) {
    if (direction === 'Largo') {
      return '<span class="dir-pill dir-long" title="Largo">▲ Largo</span>';
    }
    if (direction === 'Corto') {
      return '<span class="dir-pill dir-short" title="Corto">▼ Corto</span>';
    }
    return escapeHtml(direction);
  }

  function tradeRowHtml(t) {
    const editing = state.editingId && t.id === state.editingId;
    return '<tr' + (editing ? ' class="editing"' : '') + '>' +
      '<td>' + escapeHtml(t.tradeNumber) + '</td>' +
      '<td><span class="cell-main">' + escapeHtml(t.entryDate) + '</span> <span class="muted">' + escapeHtml(t.entryTime) + '</span></td>' +
      '<td>' + escapeHtml(t.account) + '</td>' +
      '<td>' + escapeHtml(t.instrument) + missingStopBadge(t) + '</td>' +
      '<td>' + directionCellHtml(t.direction) + '</td>' +
      '<td class="num">' + escapeHtml(t.contracts) + '</td>' +
      '<td class="num">' + escapeHtml(t.entryPrice) + '</td>' +
      '<td class="num">' + escapeHtml(t.exitPrice) + '</td>' +
      '<td>' + escapeHtml(t.exitType) + '</td>' +
      '<td><span class="emotion-cell">' + emotionDotHtml(t.emotion) + escapeHtml(t.emotion) + '</span></td>' +
      '<td class="num ' + signClass(t.points) + '">' + signedNumber(t.points) + '</td>' +
      '<td class="num ' + signClass(t.net) + '">' + signedMoney(t.net) + '</td>' +
      '<td class="num ' + signClass(t.cumulative) + '">' + signedMoney(t.cumulative) + '</td>' +
      '<td class="col-actions">' +
        '<button type="button" class="btn-icon" data-action="edit" data-id="' + escapeHtml(t.id) + '">Editar</button>' +
        '<button type="button" class="btn-icon danger" data-action="delete" data-id="' + escapeHtml(t.id) + '">Eliminar</button>' +
      '</td>' +
    '</tr>';
  }

  /** Amber "Sin stop" flag for a row whose normalized stop is not positive. */
  function missingStopBadge(trade) {
    return Number(trade.stop) > 0 ? '' : ' <span class="badge badge-warn">Sin stop</span>';
  }

  /**
   * Stop-discipline summary for the trades currently shown: missing stops,
   * Break-Even and Trailing-Stop usage (from exit type). Missing stops turn
   * the line amber; it never blocks anything.
   */
  function renderDisciplineSummary(trades) {
    const el = $('disciplineSummary');
    if (!el) return;
    const discipline = Store.stopDiscipline(trades || []);
    el.textContent = 'Sin stop: ' + discipline.missingStop + ' / ' + discipline.total +
      ' · Break Even: ' + discipline.breakEven + ' · Trailing stop: ' + discipline.trailing;
    el.className = 'table-discipline' + (discipline.missingStop > 0 ? ' warn' : '');
  }

  /* ------------------------------------------------------------------ */
  /* KPI cards                                                           */
  /* ------------------------------------------------------------------ */

  function setKpi(id, text, cls) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'kpi-value' + (cls ? ' ' + cls : '');
  }

  /* KPIs that get a "vs. previous half" delta, and how to format it. */
  const KPI_DELTAS = {
    kpiWinRate: { key: 'winRate', kind: 'pp' },
    kpiNetTotal: { key: 'netTotal', kind: 'money' },
    kpiProfitFactor: { key: 'profitFactor', kind: 'ratio' },
    kpiExpectancy: { key: 'expectancy', kind: 'money' }
  };

  /* KPIs whose context line carries a sparkline derived from real trades. */
  const KPI_SPARKS = {
    kpiNetTotal: { series: 'equity' },
    kpiWinRate: { series: 'winRate' }
  };

  const KPI_SPARK_MAX_POINTS = 40;

  /** Lazily creates the `.kpi-context` line inside a KPI card. */
  function ensureKpiContext(id) {
    const valueEl = $(id);
    if (!valueEl) return null;
    const card = valueEl.closest('.kpi-card');
    if (!card) return null;
    let ctx = card.querySelector('.kpi-context');
    if (!ctx) {
      ctx = document.createElement('span');
      ctx.className = 'kpi-context';
      card.appendChild(ctx);
    }
    return ctx;
  }

  /** Splits the chronological list into equal earlier/recent halves. */
  function splitHalves(list) {
    if (!list || list.length < 4) return null;
    const mid = Math.floor(list.length / 2);
    return { previous: list.slice(0, mid), recent: list.slice(mid) };
  }

  /** Evenly samples a series down to at most `maxPoints` values. */
  function sampleSeries(values, maxPoints) {
    if (!values || values.length <= maxPoints) return values || [];
    const step = (values.length - 1) / (maxPoints - 1);
    const out = [];
    for (let i = 0; i < maxPoints; i += 1) out.push(values[Math.round(i * step)]);
    return out;
  }

  /** Running win rate (%) over the chronological list. */
  function rollingWinRate(list) {
    let wins = 0;
    return list.map(function (t, index) {
      if (t.net > 0) wins += 1;
      return (wins / (index + 1)) * 100;
    });
  }

  /** Inline SVG sparkline. `cls` adds a color modifier (pos/neg/accent). */
  function sparklineSvg(values, cls) {
    const points = sampleSeries(values, KPI_SPARK_MAX_POINTS);
    if (points.length < 2) return '';
    const w = 100;
    const h = 26;
    const pad = 2;
    let min = Math.min.apply(null, points);
    let max = Math.max.apply(null, points);
    if (max === min) max = min + 1;
    const step = (w - pad * 2) / (points.length - 1);
    const path = points.map(function (value, index) {
      const x = pad + index * step;
      const y = h - pad - ((value - min) / (max - min)) * (h - pad * 2);
      return (index === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    return '<svg class="kpi-spark' + (cls ? ' ' + cls : '') + '" viewBox="0 0 ' + w + ' ' + h +
      '" preserveAspectRatio="none" aria-hidden="true"><path class="spark-line" d="' + path + '"/></svg>';
  }

  function formatDelta(value, kind) {
    if (!Number.isFinite(value)) return null;
    if (value === 0) return { text: '0', cls: '' };
    const sign = value > 0 ? '+' : '';
    if (kind === 'money') return { text: sign + formatMoney(value), cls: signClass(value) };
    if (kind === 'pp') return { text: sign + formatNumber(value, 1) + ' pp', cls: signClass(value) };
    return { text: sign + formatNumber(value, 2), cls: signClass(value) };
  }

  function sparkSeriesFor(id, list, recent) {
    const spec = KPI_SPARKS[id];
    if (!spec || list.length < 2) return '';
    if (spec.series === 'equity') {
      const values = list.map(function (t) { return t.cumulative; });
      const color = recent && recent.netTotal < 0 ? 'neg' : (recent && recent.netTotal > 0 ? 'pos' : '');
      return sparklineSvg(values, color);
    }
    return sparklineSvg(rollingWinRate(list), 'accent');
  }

  /**
   * Adds a delta hint (recent half vs. earlier half of the shown trades) and a
   * sparkline where a real series exists. Hidden entirely when there is not
   * enough history; never uses placeholder data.
   */
  function renderKpiContext(list) {
    const halves = splitHalves(list);
    const previous = halves ? Store.getKpis(halves.previous) : null;
    const recent = halves ? Store.getKpis(halves.recent) : null;

    Object.keys(KPI_DELTAS).forEach(function (id) {
      const el = ensureKpiContext(id);
      if (!el) return;
      const spec = KPI_DELTAS[id];
      let delta = null;
      if (previous && recent) {
        const a = previous[spec.key];
        const b = recent[spec.key];
        delta = (Number.isFinite(a) && Number.isFinite(b)) ? (b - a) : null;
      }
      const formatted = delta === null ? null : formatDelta(delta, spec.kind);
      const spark = KPI_SPARKS[id] ? sparkSeriesFor(id, list, recent) : '';
      el.innerHTML = (formatted
        ? '<span class="kpi-delta ' + formatted.cls + '">' + escapeHtml(formatted.text) +
          '</span><span class="kpi-delta-suffix">vs. anterior</span>'
        : '') + spark;
      if (formatted) {
        el.title = 'Comparado con la mitad anterior de los trades mostrados.';
      } else if (spark) {
        el.title = 'Evolución de los trades mostrados.';
      } else {
        el.removeAttribute('title');
      }
    });
  }

  function renderKpis(trades) {
    /* Compute once so KPIs and their context share the same chronological
     * series (and the sparkline is derived from real cumulative equity). */
    const list = Store.computeAll(trades || []);
    const k = Store.getKpis(list);
    setKpi('kpiTotalTrades', String(k.totalTrades));
    setKpi('kpiWinRate', formatNumber(k.winRate, 1) + ' %');
    setKpi('kpiNetTotal', formatMoney(k.netTotal), signClass(k.netTotal));
    setKpi('kpiProfitFactor', Number.isFinite(k.profitFactor) ? formatNumber(k.profitFactor, 2) : '∞');
    setKpi('kpiExpectancy', formatMoney(k.expectancy), signClass(k.expectancy));
    setKpi('kpiAvgWin', formatMoney(k.avgWin), 'pos');
    setKpi('kpiAvgLoss', formatMoney(k.avgLoss), 'neg');
    setKpi('kpiMaxDrawdown', formatMoney(k.maxDrawdown), k.maxDrawdown > 0 ? 'neg' : '');
    setKpi('kpiBestTrade', formatMoney(k.bestTrade), 'pos');
    setKpi('kpiWorstTrade', formatMoney(k.worstTrade), 'neg');
    renderKpiContext(list);
  }

  /* ------------------------------------------------------------------ */
  /* Charts                                                              */
  /* ------------------------------------------------------------------ */

  function isDashboardVisible() {
    return state.activeTab === 'dashboard';
  }

  function renderChartsIfVisible(trades) {
    if (!isDashboardVisible()) {
      state.chartsDirty = true;
      return;
    }
    DashboardCharts.render(trades);
    state.chartsDirty = false;
  }

  /* ------------------------------------------------------------------ */
  /* Orchestration                                                       */
  /* ------------------------------------------------------------------ */

  /** Disables the duplicate action while there is no saved trade to copy. */
  function updateDuplicateButton() {
    const button = $('btnDuplicateLast');
    if (button) button.disabled = Store.getTrades().length === 0;
  }

  function renderAll() {
    renderBalances();
    renderRiskPanel();
    renderEntryWarnings();
    renderInstrumentNote();
    updateDuplicateButton();
    const filtered = getFilteredTrades();
    const dashboardTrades = getDashboardTrades();
    renderTable(filtered);
    renderKpis(dashboardTrades);
    renderGamification();
    renderChartsIfVisible(dashboardTrades);
  }

  function refreshTableAndKpis() {
    const filtered = getFilteredTrades();
    renderTable(filtered);
    renderKpis(filtered);
    renderChartsIfVisible(filtered);
  }

  /* ------------------------------------------------------------------ */
  /* Form: preview, validation, save, edit, cancel                       */
  /* ------------------------------------------------------------------ */

  /**
   * Single source of truth for the instrument. `#instrument` (the trade form)
   * is canonical because the save path reads it; `#riskInstrument` (the
   * calculator selector) is a view over the SAME value. Both are written
   * together on every change, so the two views can never diverge. A known
   * instrument always wins; an unknown/empty value is preserved as-is so a
   * legacy trade being edited is never silently retargeted.
   */
  function syncInstrument(value) {
    const formEl = $('instrument');
    const calcEl = $('riskInstrument');
    const fallback = formEl ? formEl.value : '';
    const next = (typeof Store !== 'undefined' && Store.normalizeInstrument)
      ? Store.normalizeInstrument(value, fallback)
      : String(value === null || value === undefined ? '' : value);
    if (formEl) formEl.value = next;
    if (calcEl) calcEl.value = next;
    return next;
  }

  /**
   * Single source of truth for the contracts count. `#contracts` (the trade
   * form) is canonical because the save path (`readForm`) reads it;
   * `#riskContracts` (the calculator's manual override) is a view over the
   * SAME value. Both are written together on every change, so the two views
   * can never diverge and exactly one value reaches the save payload.
   *
   * The value only REPORTS risk: it is never fed back into the sizing chain
   * (stop distance, daily budget, per-trade cupo, max-ticks-one-contract).
   */
  function syncContracts(value) {
    const formEl = $('contracts');
    const calcEl = $('riskContracts');
    const next = (value === null || value === undefined) ? '' : String(value);
    if (formEl) formEl.value = next;
    if (calcEl) calcEl.value = next;
    return next;
  }

  /** The active account comes from the header selector (global, not per-trade). */
  function activeAccount() {
    const el = $('accountSelector');
    return (el && el.value) ? el.value : ACCOUNTS[0];
  }

  function readForm() {
    return {
      id: state.editingId || undefined,
      tradeNumber: parseInt($('tradeNumber').value, 10),
      account: activeAccount(),
      instrument: $('instrument').value,
      contracts: parseFloat($('contracts').value),
      strategy: $('strategy').value,
      direction: $('direction').value,
      entryDate: $('entryDate').value,
      entryTime: readTimeSelect('entryTime'),
      entryPrice: parseFloat($('entryPrice').value),
      exitDate: ($('tradeMode') && $('tradeMode').value === 'Swing') ? $('exitDate').value : $('entryDate').value,
      exitTime: readTimeSelect('exitTime'),
      exitPrice: parseFloat($('exitPrice').value),
      stop: parseFloat($('stop').value),
      /* The USD target input is gone; a saved trade's numeric `target` is
       * preserved on edit via `editingTarget`, never used for planning. */
      target: editingTarget,
      plannedRisk: parseFloat($('plannedRisk').value),
      exitType: $('exitType').value,
      emotion: $('emotion').value,
      notes: $('notes').value.trim()
    };
  }

  function instrumentMeta(id) {
    if (typeof INSTRUMENTS === 'undefined' || !INSTRUMENTS) return null;
    return INSTRUMENTS[id] || null;
  }

  function sizeLabel(size) {
    return size === 'micro' ? 'Micro' : 'Full';
  }

  /** Color token for an emotion, from the shared EMOTION_COLORS data map. */
  function emotionColor(emotion) {
    if (typeof EMOTION_COLORS !== 'undefined' && EMOTION_COLORS && EMOTION_COLORS[emotion]) {
      return EMOTION_COLORS[emotion];
    }
    return 'var(--text-faint)';
  }

  /** Small token-colored dot for an emotion (form + trades table). */
  function emotionDotHtml(emotion) {
    return '<span class="emotion-dot" style="background:' + escapeHtml(emotionColor(emotion)) + '"></span>';
  }

  /** Keeps the form's emotion dot in sync with the selected emotion. */
  function renderEmotionDot() {
    const dot = $('emotionDot');
    const select = $('emotion');
    if (!dot || !select) return;
    dot.style.background = emotionColor(select.value);
  }

  /**
   * Renders the per-instrument reference panel (hidden until toggled). The
   * panel now lives with the calculator's instrument selector (Block 1). It
   * reads the canonical `#instrument` value, which is the synced value shared
   * by both selectors, so it follows changes made from either one.
   */
  function renderInstrumentInfo() {
    const panel = $('instrumentInfo');
    if (!panel) return;
    const select = $('instrument');
    const id = select ? select.value : '';
    const spec = instrumentMeta(id);
    if (!spec) {
      panel.innerHTML = '<p class="instrument-info-note">Sin información para este instrumento.</p>';
      return;
    }
    const rows = [
      { label: 'Producto', value: spec.name },
      { label: 'Tipo', value: spec.type || '—' },
      { label: 'Volatilidad', value: spec.volatility || '—' },
      { label: 'Exchange', value: spec.exchange },
      { label: 'Horario', value: spec.hours },
      { label: 'Valor del punto', value: formatNumber(spec.pointValue, 2) },
      { label: 'Tick', value: String(spec.tick) },
      { label: 'Comisión (ida y vuelta)', value: formatMoney(spec.commission) },
      { label: 'Tamaño', value: sizeLabel(spec.size) },
      { label: 'Tip', value: spec.tip || '—' }
    ].map(function (row) {
      return '<div class="instrument-info-item">' +
        '<span class="instrument-info-label">' + escapeHtml(row.label) + '</span>' +
        '<span class="instrument-info-value">' + escapeHtml(row.value) + '</span>' +
        '</div>';
    }).join('');
    const note = spec.note
      ? '<p class="instrument-info-note">' + escapeHtml(spec.note) + '</p>'
      : '';
    panel.innerHTML =
      '<div class="instrument-info-head">' +
        '<span class="instrument-info-title">' + escapeHtml(id + ' · ' + spec.name) + '</span>' +
        '<span class="badge badge-' + (spec.size === 'micro' ? 'micro' : 'full') + '">' + sizeLabel(spec.size) + '</span>' +
      '</div>' +
      '<div class="instrument-info-grid">' + rows + '</div>' + note;
  }

  /** Small always-visible hint under the instrument selector: the full product
   *  name (plus type), so the abbreviation alone is never the only clue. */
  function renderInstrumentNote() {
    const noteEl = $('instrumentNote');
    if (!noteEl) return;
    const select = $('instrument');
    const id = select ? select.value : '';
    const spec = instrumentMeta(id);
    if (!spec) {
      noteEl.textContent = '';
      noteEl.hidden = true;
      return;
    }
    noteEl.textContent = spec.name + (spec.type ? ' · ' + spec.type : '');
    noteEl.hidden = false;
  }

  function toggleInstrumentInfo() {
    const panel = $('instrumentInfo');
    if (!panel) return;
    const show = panel.hidden;
    panel.hidden = !show;
    const button = $('btnInstrumentInfo');
    if (button) button.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) renderInstrumentInfo();
  }

  function updatePreview() {
    renderInstrumentInfo();
    renderRiskPanel();
    renderEntryWarnings();
    renderEmotionDot();
    const spec = INSTRUMENTS[$('instrument').value];
    const pointValueEl = $('previewPointValue');
    if (pointValueEl) pointValueEl.textContent = spec ? formatNumber(spec.pointValue, 2) : '—';

    const draft = readForm();
    const hasNumbers = Number.isFinite(draft.entryPrice) &&
      Number.isFinite(draft.exitPrice) &&
      Number.isFinite(draft.contracts) &&
      draft.instrument !== '';

    const pointsEl = $('previewPoints');
    const grossEl = $('previewGross');
    const commissionEl = $('previewCommission');
    const netEl = $('previewNet');

    if (!hasNumbers) {
      if (pointsEl) { pointsEl.textContent = '—'; pointsEl.className = 'preview-value'; }
      if (grossEl) { grossEl.textContent = '—'; grossEl.className = 'preview-value'; }
      if (commissionEl) { commissionEl.textContent = spec ? formatMoney(spec.commission * (Number.isFinite(draft.contracts) ? draft.contracts : 0)) : '—'; commissionEl.className = 'preview-value'; }
      if (netEl) { netEl.textContent = '—'; netEl.className = 'preview-value'; }
      return;
    }

    const computed = Store.computeTrade(draft);
    if (pointsEl) { pointsEl.textContent = formatNumber(computed.points); pointsEl.className = 'preview-value ' + signClass(computed.points); }
    if (grossEl) { grossEl.textContent = formatMoney(computed.gross); grossEl.className = 'preview-value ' + signClass(computed.gross); }
    if (commissionEl) { commissionEl.textContent = formatMoney(computed.commission); commissionEl.className = 'preview-value neg'; }
    if (netEl) { netEl.textContent = formatMoney(computed.net); netEl.className = 'preview-value ' + signClass(computed.net); }
  }

  /* ------------------------------------------------------------------ */
  /* Risk panel (Registro)                                               */
  /* ------------------------------------------------------------------ */

  function setRiskItem(id, text, cls) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'preview-value' + (cls ? ' ' + cls : '');
  }

  /** Clamps the daily risk % to the spec band [1, 3]; non-numeric -> default. */
  function clampDailyRiskPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_RISK_PCT;
    if (n < 1) return 1;
    if (n > 3) return 3;
    return n;
  }

  /** Value per tick for the lookup table: tick × pointValue, currency aware. */
  function formatTickValue(spec) {
    if (!spec) return '—';
    const value = Number(spec.tick) * Number(spec.pointValue);
    if (!Number.isFinite(value)) return '—';
    if (spec.currency === 'EUR') return formatNumber(value, 2) + ' €';
    return formatMoney(value);
  }

  /** Tick counts are usually whole but a derived stop can be fractional. */
  function formatTicks(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return (Math.round(n * 100) / 100) + ' ticks';
  }

  /** Spanish red-alert copy for the tripped circuit breakers (Block 4). */
  function riskBlockMessage(reasons) {
    const parts = [];
    if (reasons.indexOf('drawdown') !== -1) {
      parts.push('Drawdown diario ≥ 5 % del capital: límite de pérdida acumulada alcanzado.');
    }
    if (reasons.indexOf('streak') !== -1) {
      parts.push('Racha de 3 derrotas consecutivas hoy: cálculo detenido para proteger la cuenta.');
    }
    return parts.join(' ');
  }

  /**
   * Renders Block 2's market-parameter lookup table from instruments.js and
   * highlights the currently selected instrument. `valor_tick = tick ×
   * pointValue`. The selection is the shared one: the calculator selector in
   * Block 1 and the trade form's `#instrument` are always the same value.
   */
  function renderRiskMarketTable(capital, riskPct, tradesPerDay, account) {
    const body = $('riskMarketBody');
    if (!body || typeof INSTRUMENTS === 'undefined') return;
    const selected = ($('instrument') && $('instrument').value) || '';
    body.innerHTML = Object.keys(INSTRUMENTS).map(function (id) {
      const spec = INSTRUMENTS[id];
      /* A row is "viable" when the current budget affords at least one contract
       * at the instrument's resolved (AUTO or fixed) stop distance. */
      let fit = null;
      if (typeof Store !== 'undefined' && Store.resolveInstrumentConfig && Store.minBalanceForOneContract) {
        const cfg = Store.resolveInstrumentConfig(account, id, {
          balance: capital, riskPct: riskPct, tradesPerDay: tradesPerDay
        });
        const minBal = Store.minBalanceForOneContract({
          instrument: id, riskPct: riskPct, tradesPerDay: tradesPerDay,
          stopTicks: cfg && cfg.valid ? cfg.stopTicks : NaN
        });
        if (Number.isFinite(minBal)) {
          fit = { min: minBal, fits: Number.isFinite(capital) && capital >= minBal };
        }
      }
      const rowClass = (id === selected ? 'risk-row-active' : '') +
        (fit ? (fit.fits ? ' risk-row-viable' : ' risk-row-not-viable') : '');
      const badge = fit
        ? (fit.fits
            ? '<span class="risk-fit risk-fit-yes" title="Alcanza para 1 contrato">✓</span>'
            : '<span class="risk-fit risk-fit-no" title="Mínimo ' + escapeHtml(formatMoney(fit.min)) + '">✗</span>')
        : '';
      return '<tr' + (rowClass ? ' class="' + rowClass + '"' : '') + '>' +
        '<td><span class="cell-main">' + escapeHtml(id) + '</span> ' +
          '<span class="muted">' + escapeHtml(spec.name) + '</span>' + badge + '</td>' +
        '<td class="num">' + escapeHtml(formatTickValue(spec)) + '</td>' +
        '<td class="num">' + escapeHtml(String(spec.tick)) + '</td>' +
      '</tr>';
    }).join('');

    const hint = $('riskInstrumentHint');
    if (hint) {
      const spec = selected ? INSTRUMENTS[selected] : null;
      if (spec) {
        hint.textContent = 'Mostrando ' + selected + ' · ' + spec.name +
          '. Cambia el instrumento en la calculadora o en el formulario: ambos están sincronizados.';
        hint.hidden = false;
      } else {
        hint.hidden = true;
        hint.textContent = '';
      }
    }
  }

  /** Decimal places needed to render a price on the instrument's tick grid. */
  function decimalsForTick(tick) {
    const t = Number(tick);
    if (!Number.isFinite(t) || t <= 0) return 2;
    const text = String(t);
    const dot = text.indexOf('.');
    if (dot === -1) return 0;
    return Math.min(6, text.length - dot - 1);
  }

  /** Formats a suggested price snapped to the instrument's tick grid. */
  function formatPrice(value, tick) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(decimalsForTick(tick));
  }

  /**
   * Renders the advisory stop/exit price suggestions next to the form's stop
   * and exit inputs, then applies the DRAFT autofill. `ticks` is the
   * calculator's resolved stop distance (`ticksSL`) and the selected R/B ratio
   * is read from the calculator selector, so the suggested stop and the
   * ratio-driven exit price stay in sync with the calculator's preview and R/B
   * row. The advisory text is read-only; the draft writes #stop and #exitPrice
   * only while those fields are untouched (see applyDraftAutofill).
   */
  function renderPriceSuggestions(ticks) {
    const instrumentEl = $('instrument');
    const entryEl = $('entryPrice');
    const directionEl = $('direction');
    const instrument = instrumentEl ? instrumentEl.value : '';
    const spec = instrumentMeta(instrument);
    const tick = spec ? Number(spec.tick) : NaN;
    const account = activeAccount();
    /* The chosen R/B ratio is the single planning multiple: it drives the
     * suggested stop/target text, the draft autofill and the preview. */
    const ratio = readRatio();

    const suggestion = (typeof Store.suggestStopTarget === 'function')
      ? Store.suggestStopTarget({
          instrument: instrument,
          entryPrice: entryEl ? parseFloat(entryEl.value) : NaN,
          direction: directionEl ? directionEl.value : '',
          ticks: ticks,
          targetR: ratio,
          targetRAlt: ratio
        })
      : { valid: false };

    const stopEl = $('stopSuggestion');
    const exitEl = $('exitSuggestion');

    if (suggestion.valid) {
      /* The exit suggestion follows the SELECTED ratio (e.g. "R/B 1:3"), not a
       * hardcoded 2:1 / 3:1 range. */
      const rangeText = 'Salida sugerida — R/B ' + ratioLabel(ratio) + ': ' +
        formatPrice(suggestion.targetPrice, tick);
      if (stopEl) {
        stopEl.textContent = 'Stop sugerido: ' + formatPrice(suggestion.stopPrice, tick);
        stopEl.hidden = false;
      }
      if (exitEl) { exitEl.textContent = rangeText; exitEl.hidden = false; }
    } else {
      if (stopEl) { stopEl.hidden = true; stopEl.textContent = ''; }
      if (exitEl) { exitEl.hidden = true; exitEl.textContent = ''; }
    }

    /* DRAFT autofill: writes the suggested stop and the ratio-based exit into
     * the form inputs while they are untouched, marked as drafts. */
    applyDraftAutofill(account, instrument, ticks, tick, ratio);
  }

  /**
   * Writes (or clears) a draft value on an input and toggles its draft mark.
   * `value === null` keeps the current value and only refreshes the mark, so a
   * user-owned field is never rewritten.
   */
  function setDraftField(input, badge, value, isDraft) {
    if (input && value !== null) input.value = value;
    if (input) input.classList.toggle('is-draft', !!isDraft);
    if (badge) badge.hidden = !isDraft;
  }

  /**
   * Applies the DRAFT autofill to #stop and #exitPrice. The decision comes from
   * the pure `Store.draftAutofill`: a field is written ONLY while it is
   * untouched; once the user types, the draft mark clears and the value is
   * final. Recomputing therefore never clobbers a user-edited field.
   */
  function applyDraftAutofill(account, instrument, ticks, tick, ratio) {
    const stopEl = $('stop');
    const exitEl = $('exitPrice');
    const stopBadge = $('stopDraftBadge');
    const exitBadge = $('exitPriceDraftBadge');
    /* `ratio` is optional so the pure helper stays callable in isolation; it
     * falls back to the default 1:2 without touching app globals. */
    const safeRatio = (Number.isFinite(Number(ratio)) && Number(ratio) > 0) ? Number(ratio) : 2;

    const draft = (typeof Store.draftAutofill === 'function')
      ? Store.draftAutofill({
          account: account,
          instrument: instrument,
          entryPrice: $('entryPrice') ? parseFloat($('entryPrice').value) : NaN,
          direction: $('direction') ? $('direction').value : '',
          stopTicks: ticks,
          targetR: safeRatio,
          touched: touchedFields
        })
      : { valid: false };

    if (!draft.valid) {
      /* No plan yet: clear an untouched draft, never a user value. */
      setDraftField(stopEl, stopBadge, touchedFields.stop ? null : '', false);
      setDraftField(exitEl, exitBadge, touchedFields.exitPrice ? null : '', false);
      return;
    }

    setDraftField(stopEl, stopBadge,
      touchedFields.stop ? null : formatPrice(draft.stop.value, tick),
      !touchedFields.stop && draft.stop.write);
    setDraftField(exitEl, exitBadge,
      touchedFields.exitPrice ? null : formatPrice(draft.exit.value, tick),
      !touchedFields.exitPrice && draft.exit.write);
  }

  /* ------------------------------------------------------------------ */
  /* Risk preview (compact SVG plan)                                     */
  /* ------------------------------------------------------------------ */

  /** Spanish placeholder copy for a missing geometry input. */
  function previewPlaceholder(reason) {
    if (reason === 'stopTicks') return 'Indica la distancia del stop para ver el plan.';
    if (reason === 'direction') return 'Selecciona la dirección (Largo o Corto) para ver el plan.';
    if (reason === 'tick') return 'Selecciona un instrumento válido para ver el plan.';
    return 'Introduce el precio de entrada para ver el plan.';
  }

  /**
   * Builds the compact SVG plan from the pure geometry returned by
   * `Store.tradePreviewGeometry`. Labels use NinjaTrader terminology
   * (Entry (Market) / Stop Loss (Stop Market) / Target (Limit)) with the
   * Spanish label above each one. The price axis sits on the right and the
   * tick distances are labelled between the levels.
   */
  function riskPreviewSvg(geometry, ctx) {
    const W = 340;
    const H = 224;
    const top = 26;
    const bottom = H - 22;
    const span = bottom - top;
    const plotX1 = 124;
    const plotX2 = 266;
    const priceX = 270;
    const labelX = 118;
    const midX = (plotX1 + plotX2) / 2;
    const decimals = Number.isFinite(ctx.decimals) ? ctx.decimals : 2;

    const yOf = function (ny) { return top + ny * span; };
    const fmtPrice = function (price) { return Number(price).toFixed(decimals); };

    const entryY = yOf(geometry.entryY);
    const stopY = yOf(geometry.stopY);
    const targetYs = geometry.targetYs.map(yOf);
    const parts = [];

    parts.push('<svg class="risk-preview-svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'role="img" aria-label="' +
      escapeHtml('Vista previa del plan ' + ctx.direction + ' ' + ctx.instrument) + '">');
    parts.push('<text class="rp-dir" x="' + plotX1 + '" y="12">' +
      escapeHtml(ctx.direction + ' · ' + ctx.instrument) + '</text>');

    /* One horizontal level: line + Spanish/NinjaTrader label + axis price. */
    const level = function (y, o) {
      const dash = o.dash ? ' stroke-dasharray="4 4"' : '';
      const width = o.strong ? 2 : 1.5;
      return '<line x1="' + plotX1 + '" y1="' + y.toFixed(1) + '" x2="' + plotX2 +
        '" y2="' + y.toFixed(1) + '" stroke="' + o.color + '" stroke-width="' + width + '"' + dash + ' />' +
        '<text class="rp-label-es" x="' + labelX + '" y="' + (y - 2).toFixed(1) +
          '" text-anchor="end">' + escapeHtml(o.es) + '</text>' +
        '<text class="rp-label-nt" x="' + labelX + '" y="' + (y + 9).toFixed(1) +
          '" text-anchor="end">' + escapeHtml(o.nt) + '</text>' +
        '<text class="rp-price" x="' + priceX + '" y="' + (y + 3).toFixed(1) + '">' +
          escapeHtml(fmtPrice(o.price)) + '</text>';
    };

    /* Tick-distance caption centred between two levels. */
    const tickLabel = function (y1, y2, text, cls) {
      const mid = (y1 + y2) / 2;
      return '<text class="rp-ticks ' + cls + '" x="' + midX + '" y="' + (mid + 3).toFixed(1) +
        '" text-anchor="middle">' + escapeHtml(text) + '</text>';
    };

    /* Deterministic mini candlesticks (geometry from the Store). They sit
     * behind the level lines: body as a rect, wick as a 1px line. The colour
     * follows the candle's own price movement (positive/negative tokens). */
    const candles = geometry.candles || [];
    if (candles.length) {
      const plotW = plotX2 - plotX1;
      const candleW = Math.max(3, (plotW / candles.length) * 0.6);
      candles.forEach(function (candle) {
        const cx = plotX1 + candle.x * plotW;
        const color = candle.up ? 'var(--pos)' : 'var(--neg)';
        const openY = yOf(candle.oY);
        const closeY = yOf(candle.cY);
        const highY = yOf(candle.hY);
        const lowY = yOf(candle.lY);
        const bodyTop = Math.min(openY, closeY);
        const bodyH = Math.max(1, Math.abs(closeY - openY));
        parts.push('<line class="rp-wick" x1="' + cx.toFixed(1) + '" y1="' + highY.toFixed(1) +
          '" x2="' + cx.toFixed(1) + '" y2="' + lowY.toFixed(1) + '" stroke="' + color + '" />');
        parts.push('<rect class="rp-candle" x="' + (cx - candleW / 2).toFixed(1) + '" y="' +
          bodyTop.toFixed(1) + '" width="' + candleW.toFixed(1) + '" height="' +
          bodyH.toFixed(1) + '" fill="' + color + '" />');
      });
    }

    /* Secondary (dashed) target first, then the primary levels, so the entry
     * line always wins any overlap. */
    if (targetYs.length > 1) {
      parts.push(level(targetYs[1], {
        color: 'var(--pos)', dash: true, strong: false,
        es: 'Objetivo 3', nt: 'TP3 (Limit)', price: geometry.targets[1]
      }));
    }
    if (targetYs.length > 0) {
      parts.push(level(targetYs[0], {
        color: 'var(--pos)', dash: false, strong: true,
        es: 'Objetivo', nt: 'Target (Limit)', price: geometry.targets[0]
      }));
    }
    parts.push(level(entryY, {
      color: 'var(--text)', dash: false, strong: true,
      es: 'Entrada', nt: 'Entry (Market)', price: geometry.entry
    }));
    parts.push(level(stopY, {
      color: 'var(--neg)', dash: false, strong: true,
      es: 'Stop', nt: 'Stop Loss (Stop Market)', price: geometry.stop
    }));

    parts.push(tickLabel(stopY, entryY, formatTicks(geometry.stopTicks), 'rp-ticks-neg'));
    if (targetYs.length > 0) {
      parts.push(tickLabel(entryY, targetYs[0], formatTicks(geometry.ticksTP[0]), 'rp-ticks-pos'));
    }
    if (targetYs.length > 1) {
      parts.push(tickLabel(targetYs[0], targetYs[1],
        formatTicks(geometry.ticksTP[1] - geometry.ticksTP[0]), 'rp-ticks-pos'));
    }

    parts.push('</svg>');
    return parts.join('');
  }

  /**
   * Renders the live trade preview beside the calculator. Reads the same
   * values the calculator uses (entry price, stop ticks, tick size,
   * direction), so any calculator change re-renders it. Falls back to a
   * placeholder when there is not enough data (e.g. no entry price yet).
   */
  function renderRiskPreview(ctx) {
    const chart = $('riskPreviewChart');
    if (!chart) return;
    const emptyEl = $('riskPreviewEmpty');
    const rbEl = $('riskPreviewRB');

    const geometry = (typeof Store.tradePreviewGeometry === 'function')
      ? Store.tradePreviewGeometry({
          entry: ctx.entry,
          stopTicks: ctx.stopTicks,
          tick: ctx.tick,
          direction: ctx.direction,
          ticksTP: ctx.ticksTP
        })
      : { valid: false, reason: 'entry' };

    if (!geometry.valid) {
      chart.hidden = true;
      chart.innerHTML = '';
      if (emptyEl) {
        emptyEl.textContent = previewPlaceholder(geometry.reason);
        emptyEl.hidden = false;
      }
      if (rbEl) rbEl.textContent = 'R/B —';
      return;
    }

    chart.innerHTML = riskPreviewSvg(geometry, {
      instrument: ctx.instrument,
      direction: ctx.direction,
      decimals: decimalsForTick(ctx.tick)
    });
    chart.hidden = false;
    if (emptyEl) { emptyEl.hidden = true; emptyEl.textContent = ''; }

    if (rbEl) {
      /* The label always reflects the SELECTED ratio (e.g. "R/B 1:3"), never a
       * hardcoded 2:1 / 3:1 range. */
      let ratio = Number(ctx.ratio);
      if (!Number.isFinite(ratio) || ratio <= 0) {
        ratio = geometry.ticksTP.length ? geometry.ticksTP[0] / geometry.stopTicks : NaN;
      }
      rbEl.textContent = (Number.isFinite(ratio) && ratio > 0)
        ? 'R/B ' + ratioLabel(ratio)
        : 'R/B —';
    }
  }

  /**
   * Persists the calculator's trades-per-day value to the selected account's
   * `dailyTradeLimit` and mirrors it into the matching Ajustes field, so the
   * value survives a reload and stays consistent with Ajustes. Any positive
   * integer is accepted (floored). Empty/invalid input (a transient backspace)
   * is ignored so the last valid limit is preserved. The other accounts are
   * carried over untouched: `dailyTradeLimit` is a single top-level object, so
   * a partial patch would drop them.
   */
  function persistTradesPerDay(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return;
    const account = activeAccount();
    const current = Store.getRiskSettings();
    const limits = {};
    ACCOUNTS.forEach(function (name) {
      const stored = current[name] || {};
      limits[name] = Number.isFinite(stored.dailyTradeLimit)
        ? stored.dailyTradeLimit
        : DEFAULT_DAILY_TRADE_LIMIT;
    });
    limits[account] = n;
    Store.setSettings({ dailyTradeLimit: limits });
    const limitEl = $('dailyLimit' + account);
    if (limitEl) limitEl.value = String(n);
  }

  /**
   * Marks the trades-per-day input user-owned on the first input/change and
   * persists a valid value. The touched flag is set BEFORE the live-update
   * loop re-renders the panel, so `renderRiskPanel` can never re-seed over the
   * user's value on that same keystroke.
   */
  function onTradesPerDayChanged() {
    tradesPerDayTouched = true;
    const el = $('riskTradesPerDayInput');
    if (el) persistTradesPerDay(el.value);
  }

  /**
   * Renders the 4-block BPT/Francisca Serrano risk calculator for the form's
   * selected account and instrument.
   *
   *   tickValue   = tick * pointValue            (from the instrument)
   *   P_m         = stopTicks * tickValue
   *   dailyBudget = dailyRiskPct% * startOfDayBalance
   *   perTrade    = dailyBudget / tradesPerDay
   *   used        = sum of |net| of today's losers for the account
   *   disponible  = dailyBudget - used
   *   effective   = min(perTrade, disponible)
   *   contracts   = floor(effective / P_m)       (small account -> 1)
   *   maxTicks    = floor(effective / tickValue) (suggested stop distance)
   *   ticksTP2    = stopTicks * 2   /   ticksTP3 = stopTicks * 3
   *   recovery    = lossPct / (1 - lossPct)
   *
   * The instrument and the trades/day come from the form and Block 1
   * respectively. The suggested stop/target prices use `maxTicks`, so both
   * change with the instrument and the trades/day.
   *
   * Block 4 blocks the calculation (0 contracts + red alert) on a >= 5% daily
   * drawdown or >= 3 consecutive losses today, and forces 1 contract when the
   * capital is <= $5,000. Commission is shown separately and never folded into
   * P_m. A recorded stop price yields the stop in ticks (|entry - stop| / tick)
   * and takes precedence over the tick input; a recorded planned risk / target
   * feed the R/R.
   */
  function renderRiskPanel() {
    const account = activeAccount();
    /* One instrument, two views: keep the calculator's selector mirrored to
     * the canonical #instrument value on every render, so a programmatic
     * instrument change (reset, edit, duplicate, last-used) can never leave
     * the two selectors out of sync. */
    syncInstrument($('instrument') ? $('instrument').value : '');
    const formInstrumentEl = $('instrument');
    const instrument = formInstrumentEl ? formInstrumentEl.value : '';
    const formDirectionEl = $('direction');
    const direction = formDirectionEl ? formDirectionEl.value : '';

    const stopEl = $('riskStopTicks');
    const formStopEl = $('stop');
    const entryPriceEl = $('entryPrice');
    /* The selected R/B ratio is the planning multiple: it replaces the old USD
     * target for the calculator's target/exit/preview. */
    const ratio = readRatio();

    const spec = instrumentMeta(instrument);
    const tick = spec ? Number(spec.tick) : NaN;

    const accountChanged = lastRiskAccount !== account;

    /* Capital and "today" follow the global day selector so the calculator
     * reflects the day being viewed, not the wall clock. */
    const capital = Store.startOfDayBalance(account, null, state.globalDate);
    const settings = Store.getRiskSettings()[account] || {};
    const defaultPct = Number.isFinite(settings.riskPct) ? settings.riskPct : DEFAULT_RISK_PCT;

    /* Block 1 input: seed from the account's setting on account switch, then
     * honour (and clamp to 1–3 %) whatever the user typed. */
    const pctInput = $('riskDailyPctInput');
    if (pctInput && accountChanged) {
      pctInput.value = String(clampDailyRiskPct(defaultPct));
    }
    let riskPct = pctInput ? parseFloat(pctInput.value) : NaN;
    if (!Number.isFinite(riskPct)) riskPct = clampDailyRiskPct(defaultPct);
    riskPct = clampDailyRiskPct(riskPct);
    if (pctInput && pctInput.value !== String(riskPct)) pctInput.value = String(riskPct);

    /* Block 1 input: trades per day drives the per-trade budget (and therefore
     * the budget-derived stop). Seeded from the account's daily limit on an
     * account switch while the user has NOT edited it; once edited, the user's
     * value is FINAL and is never re-seeded (same rule as the stop input). A
     * transiently empty field keeps the in-progress edit: the math falls back
     * to the account default WITHOUT writing it back to the DOM, so backspacing
     * to retype (or a mobile numeric keyboard) cannot clobber the value. */
    const defaultTrades = Number.isFinite(settings.dailyTradeLimit)
      ? settings.dailyTradeLimit
      : DEFAULT_DAILY_TRADE_LIMIT;
    /* The calculator needs a divisor >= 1 even though Ajustes accepts a daily
     * limit of 0 (which only affects the discipline warning). */
    const tradesFallback = Math.max(1, defaultTrades);
    const tradesInput = $('riskTradesPerDayInput');
    if (tradesInput && accountChanged && !tradesPerDayTouched) {
      tradesInput.value = String(tradesFallback);
    }
    let tradesPerDay = tradesInput ? parseInt(tradesInput.value, 10) : NaN;
    if (!Number.isFinite(tradesPerDay) || tradesPerDay < 1) tradesPerDay = tradesFallback;
    lastRiskAccount = account;

    const minRR = Store.getMinRR();

    /* Remaining daily budget: the account's daily risk budget minus the sum of
     * its realized losses for today. */
    const usage = Store.dailyRiskUsage({ account: account, riskPct: riskPct, balance: capital, today: state.globalDate });
    /* Circuit-breaker context for Block 4. */
    const guard = Store.riskGuard({ account: account, capital: capital, today: state.globalDate });

    /* Per-instrument config: the resolved stop distance. The stop is AUTO by
     * default and derived from the SAME budget the calculator sizes contracts
     * from, so it adapts to instrument, capital, risk % and trades/day. A fixed
     * value saved in Ajustes wins. The planning target comes from the R/B ratio
     * selector, not from the per-instrument target multiples. */
    const cfg = (typeof Store.resolveInstrumentConfig === 'function')
      ? Store.resolveInstrumentConfig(account, instrument, {
          balance: capital,
          riskPct: riskPct,
          tradesPerDay: tradesPerDay,
          available: usage.valid ? usage.available : undefined
        })
      : { stopTicks: 1, stopTicksAuto: true, targetR: 2, targetRAlt: 3, valid: false };

    /* Seed the stop-ticks input from the resolved value whenever the inputs
     * that determine it change, but NEVER once the user has edited it: a
     * user-typed stop is final. The pure decision lives in the Store so it is
     * testable without a DOM. */
    const stopSeed = (typeof Store.resolveStopTicksSeed === 'function')
      ? Store.resolveStopTicksSeed(stopTicksTouched, cfg.stopTicks)
      : cfg.stopTicks;
    if (stopEl && stopSeed !== null) {
      stopEl.value = String(stopSeed);
    }

    const manualStopTicks = stopEl ? parseFloat(stopEl.value) : NaN;
    const formStop = formStopEl ? parseFloat(formStopEl.value) : NaN;
    const entryPrice = entryPriceEl ? parseFloat(entryPriceEl.value) : NaN;

    /* A recorded stop price yields the stop in ticks and takes precedence over
     * the calculator's own tick input. A DRAFT stop (written by the autofill
     * while the field is untouched) is NOT user input, so it must not feed the
     * calculator: only a touched stop does. */
    const derivedStopPoints = (touchedFields.stop && Number.isFinite(formStop) &&
      Number.isFinite(entryPrice) && formStop !== entryPrice)
      ? Math.abs(entryPrice - formStop)
      : NaN;
    const derivedStopTicks = (Number.isFinite(derivedStopPoints) && tick > 0)
      ? Number((derivedStopPoints / tick).toFixed(4))
      : NaN;
    const stopTicks = derivedStopTicks > 0
      ? derivedStopTicks
      : ((Number.isFinite(manualStopTicks) && manualStopTicks > 0) ? manualStopTicks : cfg.stopTicks);

    const hint = $('riskAccountHint');
    if (hint) {
      hint.textContent = account + ' · riesgo diario ' + formatNumber(riskPct, 1) + ' % · ' +
        tradesPerDay + ' op/día · capital inicio ' + formatMoney(capital);
    }

    /* Provenance of the stop distance: the user must never wonder where the
     * number came from. */
    const stopHintEl = $('riskStopHint');
    if (stopHintEl) {
      if (stopTicksTouched) {
        stopHintEl.textContent = 'Manual: valor introducido por ti.';
      } else if (cfg.stopTicksAuto) {
        stopHintEl.textContent = 'Auto: máx. que aguanta tu presupuesto (' +
          formatTicks(cfg.stopTicks) + ').';
      } else {
        stopHintEl.textContent = 'Fijo (Ajustes): ' + formatTicks(cfg.stopTicks) + '.';
      }
    }

    setRiskItem('riskCapital', formatMoney(capital));
    setRiskItem('riskDailyPct', formatNumber(riskPct, 1) + ' %');
    renderRiskMarketTable(capital, riskPct, tradesPerDay, account);

    const risk = Store.computeRisk({
      balance: capital,
      capital: capital,
      riskPct: riskPct,
      tradesPerDay: tradesPerDay,
      instrument: instrument,
      stopTicks: stopTicks,
      targetR: ratio,
      targetRAlt: ratio,
      available: usage.valid ? usage.available : undefined,
      dayLoss: guard.valid ? guard.dayLoss : 0,
      losingStreak: guard.valid ? guard.losingStreak : 0
    });

    /* Advisory stop/target price suggestions. They derive from the SAME
     * resolved stop distance (`ticksSL`) and the SELECTED R/B ratio the
     * calculator uses for its R/B row and preview, so the target prices always
     * match. They appear whenever entry price + stop ticks + instrument are
     * present, regardless of the sizing state, and are rendered as text only:
     * the form inputs are never overwritten. */
    renderPriceSuggestions(stopTicks);

    /* The visual plan reuses the same values as the calculator, so it stays in
     * sync with the entry price, instrument, direction, stop and trades/day. */
    renderRiskPreview({
      entry: entryPrice,
      stopTicks: stopTicks,
      tick: tick,
      direction: direction,
      instrument: instrument,
      ratio: ratio,
      /* A single ratio-driven target (the chosen R/B); no fixed TP3. */
      ticksTP: [stopTicks * ratio]
    });

    const warnEl = $('riskViabilityWarning');
    const suitabilityEl = $('riskSuitabilityHint');
    const blockEl = $('riskBlockAlert');
    const smallEl = $('riskSmallAccountHint');
    /* `riskBudget`/`riskUsedToday`/`riskAvailable` are realized-usage rows, not
     * calculator outputs, so they stay OUT of this reset list: invalid input
     * must never blank a recorded loss. */
    const resultIds = ['riskTickValue', 'riskPerContract', 'riskPerTradeBudget',
      'riskEffectiveBudget', 'riskMaxTicks', 'riskStopDaily',
      'riskTotal', 'riskTicksSL', 'riskTicksTP2', 'riskRRRange', 'riskRecovery',
      'riskRR', 'riskCommission', 'riskRealRisk', 'riskRealRiskPct'];

    /* Block 4 is always rendered, even when a required input is missing. */
    setRiskItem('riskDayLoss', formatMoney(guard.valid ? guard.dayLoss : 0),
      guard.valid && guard.dayLoss > 0 ? 'warn' : '');
    setRiskItem('riskDrawdown', guard.valid ? formatNumber(guard.drawdownPct, 1) + ' %' : '—',
      guard.valid && guard.drawdownPct >= DAILY_DD_WARN_PCT ? 'neg' : '');
    setRiskItem('riskStreak', guard.valid ? String(guard.losingStreak) : '—',
      guard.valid && guard.losingStreak >= STREAK_WARN ? 'warn' : '');

    const blocked = risk.valid && risk.blocked;
    setRiskItem('riskState',
      !risk.valid ? '—' : (blocked ? 'BLOQUEADO' : 'Operativo'),
      !risk.valid ? '' : (blocked ? 'neg' : 'pos'));

    if (blockEl) {
      if (blocked) {
        blockEl.textContent = riskBlockMessage(risk.blockReasons);
        blockEl.hidden = false;
      } else {
        blockEl.hidden = true;
        blockEl.textContent = '';
      }
    }

    if (smallEl) {
      if (risk.valid && risk.smallAccount && !blocked) {
        smallEl.textContent = 'Cuenta pequeña (capital ≤ ' + formatMoney(Store.SMALL_ACCOUNT_MAX) +
          '): el cálculo se limita a 1 contrato.';
        smallEl.hidden = false;
      } else {
        smallEl.hidden = true;
        smallEl.textContent = '';
      }
    }

    /* Realized usage is rendered before the validity gate so recording a losing
     * trade always moves "Usado hoy" and "Disponible", even if the calculator's
     * stop/size inputs are still incomplete. */
    setRiskItem('riskBudget', usage.valid ? formatMoney(usage.dailyBudget) : '—');
    setRiskItem('riskUsedToday', usage.valid ? formatMoney(usage.used) : '—',
      usage.valid && usage.used > 0 ? 'warn' : '');
    setRiskItem('riskAvailable', usage.valid ? formatMoney(usage.available) : '—',
      usage.valid && usage.exhausted ? 'warn' : '');

    if (!risk.valid) {
      resultIds.forEach(function (id) { setRiskItem(id, '—'); });
      if (warnEl) { warnEl.hidden = true; warnEl.textContent = ''; }
      if (suitabilityEl) { suitabilityEl.hidden = true; suitabilityEl.textContent = ''; }
      const invalidContractsWarnEl = $('riskContractsWarning');
      if (invalidContractsWarnEl) {
        invalidContractsWarnEl.hidden = true;
        invalidContractsWarnEl.textContent = '';
      }
      return;
    }

    /* Contracts: one canonical value (`#contracts`, read by the save path)
     * mirrored into the calculator's editable override (`#riskContracts`).
     * While the field is untouched the calculator prefills its suggestion;
     * once the user types, their value is FINAL and is only mirrored, never
     * recomputed. This NEVER feeds the sizing chain: the stop, the daily
     * budget, the per-trade cupo and the max-ticks stay budget-derived. */
    const contractsEl = $('contracts');
    const riskContractsEl = $('riskContracts');
    if (!contractsTouched) {
      /* Guarded so the render stays callable when the helper is not in scope
       * (e.g. an isolated harness that extracts this function alone). */
      if (typeof syncContracts === 'function') syncContracts(risk.contracts);
    } else if (contractsEl && riskContractsEl) {
      riskContractsEl.value = contractsEl.value;
    }

    /* Reported REAL risk for the contracts the user actually holds. It is a
     * pure report derived FROM the sizing chain, never an input to it. An
     * empty/non-numeric field reports zero (transient while retyping). */
    const contractsRaw = contractsEl ? parseFloat(contractsEl.value) : NaN;
    const reportedContracts = (Number.isFinite(contractsRaw) && contractsRaw >= 0)
      ? contractsRaw
      : 0;
    const realRisk = reportedContracts * stopTicks * risk.tickValue;
    const realRiskPct = capital > 0 ? (realRisk / capital) * 100 : 0;
    const exceedsCupo = realRisk > risk.perTradeBudget + 1e-9;
    setRiskItem('riskRealRisk', formatMoney(realRisk), exceedsCupo ? 'warn' : '');
    setRiskItem('riskRealRiskPct', formatNumber(realRiskPct, 2) + ' %',
      exceedsCupo ? 'warn' : '');

    /* Advisory only: never blocks or zeroes the calculation. The circuit
     * breakers in Block 4 are untouched. */
    const contractsWarnEl = $('riskContractsWarning');
    if (contractsWarnEl) {
      if (exceedsCupo) {
        contractsWarnEl.textContent = 'Riesgo real ' + formatMoney(realRisk) +
          ' supera el cupo por operación (' + formatMoney(risk.perTradeBudget) +
          '). Es solo un aviso: puedes seguir registrando.';
        contractsWarnEl.hidden = false;
      } else {
        contractsWarnEl.hidden = true;
        contractsWarnEl.textContent = '';
      }
    }

    setRiskItem('riskTickValue', formatMoney(risk.tickValue));
    setRiskItem('riskPerContract', formatMoney(risk.pm));
    setRiskItem('riskPerTradeBudget', formatMoney(risk.perTradeBudget));
    setRiskItem('riskEffectiveBudget', formatMoney(risk.effectiveBudget),
      risk.exhausted ? 'warn' : '');
    setRiskItem('riskMaxTicks', formatTicks(risk.maxTicksForOneContract),
      blocked ? 'neg' : '');
    /* Explicit per-operation vs whole-day comparison. The day figure is the
     * SAME per-operation source (`maxTicksForOneContract`, derived from the
     * per-trade budget) scaled by the trades/day divisor, so it can never
     * drift from the calculator's model. It is labelled with the operation
     * count so "por operación" and "total del día" cannot be confused. */
    setRiskItem('riskStopDaily',
      formatTicks(risk.maxTicksForOneContract * tradesPerDay) + ' · ' + tradesPerDay + ' op',
      blocked ? 'neg' : '');
    setRiskItem('riskTotal', formatMoney(risk.totalRisk));
    setRiskItem('riskTicksSL', formatTicks(risk.ticksSL));
    /* The take-profit distance and the R/B row both follow the SELECTED ratio. */
    setRiskItem('riskTicksTP2', formatTicks(risk.ticksTP2));
    setRiskItem('riskRRRange',
      ratioLabel(ratio) + ' (' + formatTicks(risk.ticksTP2) + ')');
    setRiskItem('riskCommission', formatMoney(risk.commission));

    /* The planned R/R is exactly the selected R/B ratio (the reward is the
     * ratio multiple of the planned risk). Warn below the configured minimum. */
    setRiskItem('riskRR', formatNumber(ratio, 2) + ' : 1', ratio < minRR ? 'warn' : '');

    if (risk.recoveryPct === Infinity) {
      setRiskItem('riskRecovery', '∞', 'warn');
    } else if (Number.isFinite(risk.recoveryPct)) {
      setRiskItem('riskRecovery', formatNumber(risk.recoveryPct * 100, 1) + ' %',
        risk.recoveryPct > 1 ? 'warn' : '');
    } else {
      setRiskItem('riskRecovery', '—');
    }

    if (warnEl) {
      if (blocked) {
        warnEl.hidden = true;
        warnEl.textContent = '';
      } else if (risk.exhausted) {
        warnEl.textContent = 'Sin presupuesto de riesgo disponible hoy: el presupuesto diario es ' +
          formatMoney(usage.valid ? usage.dailyBudget : risk.dailyBudget) +
          ' y las pérdidas de hoy suman ' + formatMoney(usage.valid ? usage.used : 0) +
          '. No se sugieren contratos.';
        warnEl.hidden = false;
      } else if (risk.contracts === 0) {
        warnEl.textContent = 'Con un riesgo diario del ' + formatNumber(riskPct, 1) +
          ' % y un presupuesto disponible de ' + formatMoney(risk.presupuesto) +
          ', un solo contrato de ' + instrument + ' arriesga ' + formatMoney(risk.pm) +
          '. El instrumento no es viable para esta cuenta con el riesgo configurado.';
        warnEl.hidden = false;
      } else {
        warnEl.hidden = true;
        warnEl.textContent = '';
      }
    }

    /* Size suitability hint: when a full-size instrument cannot be sized even
     * with one contract (and the day's budget is not simply exhausted), point
     * at its micro equivalent from MICRO_PAIRS. Advisory only: the selection
     * is never changed and the sizing math is untouched. */
    if (suitabilityEl) {
      const micro = risk.size === 'full' ? Store.microEquivalent(instrument) : null;
      if (micro && risk.contracts === 0 && !risk.exhausted && !blocked) {
        suitabilityEl.textContent = 'No viable con 1 contrato; prueba el micro equivalente: ' +
          micro + '.';
        suitabilityEl.hidden = false;
      } else {
        suitabilityEl.hidden = true;
        suitabilityEl.textContent = '';
      }
    }
  }

  /**
   * Warn-only discipline banners for the entry form's selected account: the
   * daily trade limit and the intraday drawdown / losing-streak thresholds.
   * These are guidance only: submit is never disabled or blocked.
   */
  function renderEntryWarnings() {
    const account = activeAccount();

    const limitEl = $('dailyLimitWarning');
    if (limitEl) {
      const limit = Store.dailyLimitStatus(account);
      if (limit.exceeded) {
        limitEl.textContent = 'Llevas ' + limit.count + ' de ' + limit.limit +
          ' operaciones hoy en ' + account + '. Es solo un aviso: puedes seguir registrando.';
        limitEl.hidden = false;
      } else {
        limitEl.hidden = true;
        limitEl.textContent = '';
      }
    }

    const disciplineEl = $('disciplineWarning');
    if (disciplineEl) {
      const messages = [];
      const drawdown = Store.intradayDrawdown(account);
      if (drawdown.warned) {
        messages.push('Drawdown intradía del ' + formatNumber(drawdown.pct, 1) + ' % en ' +
          account + ' (≥ ' + formatNumber(DAILY_DD_WARN_PCT, 1) + ' %).');
      }
      const streak = Store.losingStreak(account);
      if (streak.warned) {
        messages.push('Racha de ' + streak.count + ' pérdidas consecutivas en ' + account +
          ' (≥ ' + STREAK_WARN + ').');
      }
      if (messages.length) {
        disciplineEl.textContent = messages.join(' ');
        disciplineEl.hidden = false;
      } else {
        disciplineEl.hidden = true;
        disciplineEl.textContent = '';
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Discipline gamification (Dashboard)                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Renders the account-scoped discipline view: level + XP progress, current
   * and best streaks, configurable-goal progress bars, process achievements
   * and the weekly recap. All values come from the pure store helpers; XP is
   * process-only (see `Store.xpBreakdown`).
   */
  function renderGamification() {
    if (typeof Store.getDisciplineSummary !== 'function') return;
    const account = activeAccount();
    const summary = Store.getDisciplineSummary(account);

    const badge = $('levelBadge');
    if (badge) {
      const lvl = summary.level.level;
      const nameIdx = Math.min(Math.max(lvl, 1), LEVEL_NAMES.length) - 1;
      badge.textContent = 'Nivel ' + lvl + ' · ' + LEVEL_NAMES[nameIdx];
    }

    const fill = $('levelProgressFill');
    if (fill) fill.style.width = summary.level.progressPct.toFixed(1) + '%';
    const label = $('levelProgressLabel');
    if (label) {
      label.textContent = summary.level.intoLevel + ' / ' + summary.level.perLevel +
        ' XP · ' + summary.xp + ' XP totales';
    }

    const current = $('streakCurrent');
    if (current) current.textContent = pluralDays(summary.streak.current);
    const best = $('streakBest');
    if (best) best.textContent = pluralDays(summary.streak.best);

    renderGoals(summary);
    renderAchievements(summary);
    renderOutcomeBadges(summary);
    renderWeeklyRecap(summary);
  }

  function pluralDays(n) {
    return n + (n === 1 ? ' día' : ' días');
  }

  function goalBar(label, valueText, pct) {
    return '<div class="goal-row">' +
      '<div class="goal-head"><span class="goal-label">' + escapeHtml(label) + '</span>' +
      '<span class="goal-value">' + escapeHtml(valueText) + '</span></div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' +
        pct.toFixed(1) + '%"></div></div>' +
      '</div>';
  }

  function renderGoals(summary) {
    const el = $('goalsList');
    if (!el) return;
    const g = summary.goals;
    const parts = [
      '<div class="goal-row goal-row-plain">' +
        '<span class="goal-label">Límite de operaciones/día</span>' +
        '<span class="goal-value">' + escapeHtml(String(g.dailyLimit.target)) + ' op/día</span>' +
      '</div>',
      goalBar('Meta semanal de disciplina',
        g.weeklyDiscipline.value + ' / ' + g.weeklyDiscipline.target + ' días',
        g.weeklyDiscipline.pct),
      goalBar('R/R mínimo (' + formatNumber(g.minRR.target, 1) + ':1)',
        g.rrCompliance.value + ' / ' + g.rrCompliance.total + ' trades',
        g.rrCompliance.pct)
    ];
    el.innerHTML = parts.join('');
  }

  /** Fallback family names for summaries that do not carry a familyLabel. */
  function familyLabelFallback(family) {
    const labels = {
      'bpt-700-trades': 'Trades completados',
      'bpt-capital-guardian': 'Guardia de capital',
      'bpt-mosquito-repellent': 'Repelente de mosquitos',
      'bpt-emergency-stop': 'Parada de emergencia',
      'bpt-crocodile': 'Cocodrilo',
      'bpt-earned-step': 'Escalón ganado',
      'bpt-green-range': 'Rango verde',
      'bpt-hot-bath': 'Baño caliente',
      'bpt-positive-math': 'Matemática positiva',
      legacy: 'Fundamentos'
    };
    return labels[family] || family;
  }

  /** One process-achievement card (rung). `--family-color` tints the accents. */
  function achievementCardHtml(a) {
    const earned = !!a.earned;
    const stateText = earned ? '✓ Conseguido' : a.value + ' / ' + a.target;
    const xpTag = Number.isFinite(a.xp) && a.xp > 0
      ? '<span class="achievement-xp">+' + a.xp + ' XP</span>'
      : '';
    return '<div class="achievement' + (earned ? ' earned' : '') + '">' +
      '<div class="achievement-head">' +
        '<span class="achievement-label">' + escapeHtml(a.label) + '</span>' +
        '<span class="achievement-state">' + escapeHtml(stateText) + '</span>' +
      '</div>' +
      '<p class="achievement-desc">' + escapeHtml(a.description) + '</p>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' +
        a.progressPct.toFixed(1) + '%"></div></div>' +
      xpTag +
      '</div>';
  }

  /** One outcome card (informational statistic, never "earned"). */
  function outcomeCardHtml(a) {
    const stat = a.stat || {};
    const valueText = Number.isFinite(stat.value)
      ? (stat.unit === '%' ? formatNumber(stat.value, 1) + ' %' : String(stat.value))
      : '-';
    const span = stat.span
      ? '<span class="outcome-span">' + escapeHtml(stat.span) + '</span>'
      : '';
    return '<div class="achievement outcome">' +
      '<div class="achievement-head">' +
        '<span class="achievement-label">' + escapeHtml(a.label) + '</span>' +
        '<span class="outcome-tag">Estadística</span>' +
      '</div>' +
      '<p class="achievement-desc">' + escapeHtml(a.description) + '</p>' +
      '<div class="outcome-stat">' +
        '<span class="outcome-value">' + escapeHtml(valueText) + '</span>' +
        '<span class="outcome-label">' + escapeHtml(stat.label || '') + '</span>' +
      '</div>' + span +
      '<div class="progress-track outcome-track"><div class="progress-fill outcome-fill" style="width:' +
        a.progressPct.toFixed(1) + '%"></div></div>' +
      '</div>';
  }

  /**
   * Groups rungs into ordered family blocks. `meta` decides whether a rung
   * counts as achieved (`earned` for process, `qualifies` for outcome).
   */
  function badgeFamilyHtml(rungs, meta, cardHtml) {
    const groups = [];
    const seen = {};
    rungs.forEach(function (a) {
      if (!seen[a.family]) {
        seen[a.family] = {
          family: a.family,
          label: a.familyLabel || familyLabelFallback(a.family),
          color: a.color || 'accent',
          rungs: []
        };
        groups.push(seen[a.family]);
      }
      seen[a.family].rungs.push(a);
    });
    return groups.map(function (group) {
      const met = group.rungs.filter(function (a) {
        return meta.reached(a);
      }).length;
      return '<div class="badge-family" data-color="' + group.color + '">' +
        '<div class="badge-family-head">' +
          '<span class="badge-family-title">' + escapeHtml(group.label) + '</span>' +
          '<span class="badge-family-count">' + met + '/' + group.rungs.length + '</span>' +
        '</div>' +
        '<div class="badge-ladder">' +
          group.rungs.map(cardHtml).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  /**
   * Renders the PROCESO badges grouped by family: the BPT process ladders in
   * catalog order, then the legacy ACHIEVEMENTS as a "Fundamentos" group.
   * Process badges award XP and can be marked as achieved; outcome badges are
   * rendered separately by `renderOutcomeBadges`.
   */
  function renderAchievements(summary) {
    const el = $('achievementsList');
    if (!el) return;
    const bptRungs = summary.processBadges || [];
    const legacy = summary.achievements || [];
    const earned = function (a) { return !!a.earned; };

    const blocks = [];
    const bptHtml = badgeFamilyHtml(bptRungs, { reached: earned }, achievementCardHtml);
    if (bptHtml) blocks.push(bptHtml);
    if (legacy.length) {
      blocks.push(badgeFamilyHtml(legacy.map(function (a) {
        return Object.assign({}, a, { family: 'legacy', color: a.color || 'accent' });
      }), { reached: earned }, achievementCardHtml));
    }
    el.innerHTML = blocks.join('');

    const summaryEl = $('achievementsSummary');
    if (summaryEl) {
      const all = bptRungs.concat(legacy);
      const earnedCount = all.filter(earned).length;
      summaryEl.textContent = earnedCount + ' / ' + all.length + ' logros de proceso';
    }
  }

  /**
   * Renders the RESULTADO badges grouped by family as informational
   * statistics. They read realised P&L, award ZERO XP and are never styled as
   * achieved: the label is "Estadística" and the rung state is never
   * "Conseguido". `qualifies` is the per-rung fact the group count uses.
   */
  function renderOutcomeBadges(summary) {
    const el = $('outcomeList');
    if (!el) return;
    const list = summary.outcomeBadges || [];
    const qualifies = function (a) { return !!a.qualifies; };
    el.innerHTML = badgeFamilyHtml(list, { reached: qualifies }, outcomeCardHtml);

    const summaryEl = $('outcomeSummary');
    if (summaryEl) {
      const met = list.filter(qualifies).length;
      summaryEl.textContent = met + ' / ' + list.length + ' en rango';
    }
  }

  /** Maps a store recap descriptor to Spanish copy. */
  function recapText(item, kind) {
    if (!item) {
      return kind === 'best'
        ? 'Sin datos suficientes esta semana.'
        : 'Sin fugas destacadas esta semana.';
    }
    const value = item.value;
    const total = item.total;
    switch (item.key) {
      case 'discipline': return 'Respetaste el límite ' + value + '/' + total + ' días.';
      case 'stop': return value + '/' + total + ' trades con stop registrado.';
      case 'rr': return value + '/' + total + ' trades cumplieron el R/R mínimo.';
      case 'missingStop': return value + (value === 1 ? ' trade sin stop.' : ' trades sin stop.');
      case 'overtrading': return value + (value === 1 ? ' día por encima del límite.' : ' días por encima del límite.');
      case 'rrMissed': return value + (value === 1 ? ' trade por debajo del R/R mínimo.' : ' trades por debajo del R/R mínimo.');
      default: return '';
    }
  }

  function renderWeeklyRecap(summary) {
    const el = $('weeklyRecap');
    if (!el) return;
    const recap = summary.recap;
    const range = $('weeklyRange');
    if (range) range.textContent = recap.valid ? recap.weekStart + ' → ' + recap.weekEnd : '';
    if (!recap.valid || recap.totalTrades === 0) {
      el.innerHTML = '<p class="recap-empty">Aún no hay trades registrados esta semana.</p>';
      return;
    }
    el.innerHTML =
      '<div class="recap-item">' +
        '<span class="recap-label">Mejor hábito</span>' +
        '<span class="recap-value pos">' + escapeHtml(recapText(recap.bestHabit, 'best')) + '</span>' +
      '</div>' +
      '<div class="recap-item">' +
        '<span class="recap-label">Mayor fuga</span>' +
        '<span class="recap-value' + (recap.worstLeak ? ' warn' : '') + '">' +
          escapeHtml(recapText(recap.worstLeak, 'worst')) + '</span>' +
      '</div>';
  }

  function validateForm() {
    const errors = [];
    const form = readForm();

    if (!form.account) errors.push('La cuenta es obligatoria.');
    if (!form.instrument) errors.push('El instrumento es obligatorio.');
    if (!Number.isFinite(form.contracts) || form.contracts <= 0) errors.push('El número de contratos debe ser mayor que 0.');
    if (!form.strategy) errors.push('La estrategia es obligatoria.');
    if (!form.direction) errors.push('La dirección es obligatoria.');
    if (!form.entryDate) errors.push('La fecha de entrada es obligatoria.');
    if (!form.entryTime) errors.push('La hora de entrada es obligatoria.');
    if (!Number.isFinite(form.entryPrice)) errors.push('El precio de entrada debe ser un número válido.');
    if (!form.exitDate) errors.push('La fecha de salida es obligatoria.');
    if (!form.exitTime) errors.push('La hora de salida es obligatoria.');
    if (!Number.isFinite(form.exitPrice)) errors.push('El precio de salida debe ser un número válido.');
    if (!form.exitType) errors.push('El tipo de salida es obligatorio.');
    if (!form.emotion) errors.push('La emoción es obligatoria.');

    const entryDt = parseLocalDateTime(form.entryDate, form.entryTime);
    const exitDt = parseLocalDateTime(form.exitDate, form.exitTime);
    if (entryDt && exitDt && exitDt.getTime() < entryDt.getTime()) {
      errors.push('La fecha y hora de salida no puede ser anterior a la de entrada.');
    }

    return errors;
  }

  function showFormErrors(errors) {
    const box = $('formErrors');
    if (!box) return;
    if (!errors.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '<strong>Revisa el formulario:</strong><ul>' +
      errors.map(function (e) { return '<li>' + escapeHtml(e) + '</li>'; }).join('') +
      '</ul>';
    box.hidden = false;
  }

  /** Shows the validation errors in a modal popup. */
  function showErrorModal(errors) {
    const list = $('errorModalList');
    if (list) {
      list.innerHTML = errors.map(function (e) {
        return '<li>' + escapeHtml(e) + '</li>';
      }).join('');
    }
    const modal = $('errorModal');
    if (modal) modal.hidden = false;
  }

  function hideErrorModal() {
    const modal = $('errorModal');
    if (modal) modal.hidden = true;
  }

  /**
   * Prefills the primary entry selects from the last-used selections persisted
   * in settings. Called on reset so a new trade starts from the user's usual
   * setup; it never runs while the user is editing.
   */
  function applyLastEntry() {
    const last = (typeof Store !== 'undefined' && Store.getLastEntry)
      ? Store.getLastEntry()
      : null;
    if (!last) return;
    if ($('instrument')) $('instrument').value = last.instrument;
    if ($('strategy')) $('strategy').value = last.strategy;
    if ($('direction')) $('direction').value = last.direction;
    if ($('emotion')) $('emotion').value = last.emotion;
  }

  /**
   * Keeps the form's #tradeNumber in sync with the store while the form is in
   * "new trade" mode. The store derives the next number as max(existing) + 1,
   * so deleting the trailing trades frees their numbers and this makes the
   * freed number visible immediately (delete all -> 1). While an existing
   * trade is being edited the field belongs to that trade and is never touched.
   */
  function refreshNextTradeNumber() {
    if (state.editingId) return;
    const el = $('tradeNumber');
    if (el) el.value = String(Store.nextTradeNumber());
  }

  function resetForm() {
    state.editingId = null;
    const form = $('tradeForm');
    if (form) form.reset();
    refreshNextTradeNumber();
    /* Primary selects come from the last-used entry preferences. */
    applyLastEntry();
    $('exitType').value = EXIT_TYPES[0];
    /* Contracts default to a single contract and stay user-owned until edited:
     * the calculator no longer pre-fills its suggestion over the default. */
    contractsTouched = true;
    $('contracts').value = '1';
    $('entryDate').value = state.globalDate || todayISO();
    /* Both times default to the current moment; the exit time is re-read on
     * every reset so a save never leaves a stale time behind. */
    const now = nowTime();
    writeTimeSelect('entryTime', now);
    writeTimeSelect('exitTime', now);
    /* Stop and planned risk are optional and start empty. The legacy USD
     * target no longer has a field; a new trade starts without one. */
    $('stop').value = '';
    $('plannedRisk').value = '';
    editingTarget = 0;
    /* New trade: the stop and exit fields are draftable again, and any stale
     * draft mark from the previous trade is cleared. */
    touchedFields.stop = false;
    touchedFields.exitPrice = false;
    setDraftField($('stop'), $('stopDraftBadge'), null, false);
    setDraftField($('exitPrice'), $('exitPriceDraftBadge'), null, false);
    /* New trade: the calculator's trades-per-day input is draftable again and
     * re-seeds from the selected account's stored limit (the last value the
     * user committed, or the account default). */
    tradesPerDayTouched = false;
    const tradesSeedEl = $('riskTradesPerDayInput');
    if (tradesSeedEl) {
      const seedAccount = activeAccount();
      const seedStored = Store.getRiskSettings()[seedAccount] || {};
      const seedTrades = Number.isFinite(seedStored.dailyTradeLimit)
        ? seedStored.dailyTradeLimit
        : DEFAULT_DAILY_TRADE_LIMIT;
      tradesSeedEl.value = String(Math.max(1, seedTrades));
    }
    /* Optional fields live behind the "Más opciones" disclosure. */
    const advanced = $('advancedOptions');
    if (advanced) advanced.open = false;
    $('formTitle').textContent = 'Nuevo trade';
    $('btnSave').textContent = 'Guardar trade';
    $('btnCancel').hidden = true;
    showFormErrors([]);
    applyTradeMode();
    updatePreview();
  }

  /** Snapshots the active form + calculator state for a trade tab. */
  function captureDraft() {
    return {
      tradeNumber: $('tradeNumber').value,
      instrument: $('instrument').value,
      contracts: $('contracts').value,
      strategy: $('strategy').value,
      direction: $('direction').value,
      entryDate: $('entryDate').value,
      entryTime: readTimeSelect('entryTime'),
      entryPrice: $('entryPrice').value,
      exitTime: readTimeSelect('exitTime'),
      exitPrice: $('exitPrice').value,
      mode: $('tradeMode') ? $('tradeMode').value : 'Scalping',
      exitDate: $('exitDate') ? $('exitDate').value : '',
      stop: $('stop').value,
      plannedRisk: $('plannedRisk').value,
      exitType: $('exitType').value,
      emotion: $('emotion').value,
      notes: $('notes').value,
      stopTicks: $('riskStopTicks') ? $('riskStopTicks').value : '',
      ratio: $('riskRatio') ? $('riskRatio').value : ''
    };
  }

  /** Restores a draft into the form; a null draft resets to a fresh trade. */
  function restoreDraft(d) {
    if (!d) { resetForm(); return; }
    $('tradeNumber').value = d.tradeNumber;
    syncInstrument(d.instrument);
    $('contracts').value = d.contracts;
    $('strategy').value = d.strategy;
    $('direction').value = d.direction;
    $('entryDate').value = d.entryDate;
    writeTimeSelect('entryTime', d.entryTime);
    $('entryPrice').value = d.entryPrice;
    writeTimeSelect('exitTime', d.exitTime);
    $('exitPrice').value = d.exitPrice;
    if (d.mode !== undefined && $('tradeMode')) $('tradeMode').value = d.mode;
    if (d.exitDate !== undefined && $('exitDate')) $('exitDate').value = d.exitDate;
    $('stop').value = d.stop;
    $('plannedRisk').value = d.plannedRisk;
    $('exitType').value = d.exitType;
    $('emotion').value = d.emotion;
    $('notes').value = d.notes;
    if (d.stopTicks !== undefined && $('riskStopTicks')) $('riskStopTicks').value = d.stopTicks;
    if (d.ratio !== undefined && $('riskRatio')) $('riskRatio').value = d.ratio;
    /* Restored values are user-owned: the calculator must not re-seed them. */
    contractsTouched = true;
    stopTicksTouched = !!($('riskStopTicks') && $('riskStopTicks').value);
    applyTradeMode();
    renderEmotionDot();
  }

  /** Reflects the active trade tab in the tab buttons. */
  function updateTradeTabUI() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-trade-tab]'), function (btn) {
      const idx = Number(btn.getAttribute('data-trade-tab'));
      btn.classList.toggle('active', idx === state.activeTrade);
      btn.classList.toggle('filled', !!drafts[idx]);
      btn.setAttribute('aria-selected', idx === state.activeTrade ? 'true' : 'false');
    });
  }

  /** Switches to another trade draft: saves the current one, loads the target. */
  function switchTradeTab(index) {
    if (index === state.activeTrade) return;
    drafts[state.activeTrade] = captureDraft();
    state.activeTrade = index;
    state.editingId = null;
    const tradeCard = $('tradeCard');
    if (tradeCard) tradeCard.setAttribute('data-trade-tab', String(index));
    restoreDraft(drafts[index]);
    $('formTitle').textContent = 'Trade ' + (index + 1);
    $('btnSave').textContent = 'Guardar trade';
    $('btnCancel').hidden = true;
    updateTradeTabUI();
    renderAll();
  }

  function handleSubmit(event) {
    event.preventDefault();
    const errors = validateForm();
    if (errors.length) {
      showErrorModal(errors);
      return;
    }
    showFormErrors([]);

    const trade = readForm();
    delete trade.id;

    if (state.editingId) {
      if (!Number.isFinite(trade.tradeNumber) || trade.tradeNumber <= 0) delete trade.tradeNumber;
      Store.updateTrade(state.editingId, trade);
      showToast('Trade actualizado', 'ok');
    } else {
      trade.tradeNumber = Number.isFinite(trade.tradeNumber) && trade.tradeNumber > 0
        ? trade.tradeNumber
        : Store.nextTradeNumber();
      Store.addTrade(trade);
      showToast('Trade guardado', 'ok');
    }

    /* Remember the setup the user just used so the next new trade starts
     * from it. Invalid catalog values are ignored by the store. */
    Store.saveLastEntry({
      account: trade.account,
      instrument: trade.instrument,
      strategy: trade.strategy,
      direction: trade.direction,
      emotion: trade.emotion
    });

    resetForm();
    renderAll();
  }

  function handleEdit(id) {
    const trade = Store.getTrades().find(function (t) { return t.id === id; });
    if (!trade) return;
    state.editingId = id;
    $('tradeNumber').value = trade.tradeNumber;
    $('instrument').value = trade.instrument;
    $('contracts').value = trade.contracts;
    ensureStrategyOption($('strategy'), trade.strategy);
    $('strategy').value = trade.strategy;
    $('direction').value = trade.direction;
    $('entryDate').value = trade.entryDate;
    writeTimeSelect('entryTime', trade.entryTime);
    $('entryPrice').value = trade.entryPrice;
    writeTimeSelect('exitTime', trade.exitTime);
    $('exitPrice').value = trade.exitPrice;
    const swingEdit = trade.exitDate && trade.exitDate !== trade.entryDate;
    if ($('tradeMode')) $('tradeMode').value = swingEdit ? 'Swing' : 'Scalping';
    if ($('exitDate')) $('exitDate').value = swingEdit ? trade.exitDate : trade.entryDate;
    applyTradeMode();
    $('stop').value = trade.stop > 0 ? trade.stop : '';
    /* No USD target field anymore: preserve the saved value for the round-trip. */
    editingTarget = trade.target > 0 ? trade.target : 0;
    $('plannedRisk').value = trade.plannedRisk > 0 ? trade.plannedRisk : '';
    $('exitType').value = trade.exitType;
    $('emotion').value = trade.emotion;
    $('notes').value = trade.notes;
    $('formTitle').textContent = 'Editar trade #' + trade.tradeNumber;
    $('btnSave').textContent = 'Guardar cambios';
    $('btnCancel').hidden = false;
    /* Editing owns the contracts value; the calculator must not overwrite it. */
    contractsTouched = true;
    /* A saved stop/exit is a user value, never a draft: the calculator must not
     * overwrite either field while editing. */
    touchedFields.stop = true;
    touchedFields.exitPrice = true;
    setDraftField($('stop'), $('stopDraftBadge'), null, false);
    setDraftField($('exitPrice'), $('exitPriceDraftBadge'), null, false);
    /* Reveal the optional fields when the trade actually uses them. */
    const advanced = $('advancedOptions');
    if (advanced) advanced.open = trade.target > 0 || trade.plannedRisk > 0 || !!trade.notes;
    showFormErrors([]);
    updatePreview();
    /* Re-render so the edited row is highlighted in the table. */
    refreshTableAndKpis();
    switchTab('registro');
    const form = $('tradeForm');
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Loads the last saved trade's setup into the form as a NEW trade: the
   * setup fields (account, instrument, strategy, direction, emotion,
   * contracts, target/stop) are copied, while the id, trade number and exit
   * data are left empty so the user completes and saves a fresh record.
   */
  function duplicateLastTrade() {
    const last = (typeof Store !== 'undefined' && Store.getLastTrade)
      ? Store.getLastTrade()
      : null;
    if (!last) {
      setStatus('Todavía no hay trades para duplicar.', 'error');
      return;
    }

    state.editingId = null;
    /* New trade: no copied trade number, no copied id. */
    $('tradeNumber').value = '';
    $('instrument').value = last.instrument;
    $('contracts').value = last.contracts > 0 ? String(last.contracts) : '';
    ensureStrategyOption($('strategy'), last.strategy);
    $('strategy').value = last.strategy;
    $('direction').value = last.direction;
    $('emotion').value = last.emotion;
    $('stop').value = last.stop > 0 ? last.stop : '';
    /* A duplicated trade is new: it does not inherit the legacy USD target. */
    editingTarget = 0;
    $('plannedRisk').value = '';
    $('notes').value = '';
    /* No exit data is copied: entry/exit default to the current moment. */
    $('entryPrice').value = '';
    $('exitPrice').value = '';
    $('exitType').value = EXIT_TYPES[0];
    $('entryDate').value = state.globalDate || todayISO();
    if ($('tradeMode')) $('tradeMode').value = 'Scalping';
    if ($('exitDate')) $('exitDate').value = state.globalDate || todayISO();
    applyTradeMode();
    const now = nowTime();
    writeTimeSelect('entryTime', now);
    writeTimeSelect('exitTime', now);
    /* The copied contracts value belongs to the user now. */
    contractsTouched = true;
    /* The copied stop is user-owned (no draft); the cleared exit is draftable. */
    touchedFields.stop = true;
    touchedFields.exitPrice = false;
    setDraftField($('stop'), $('stopDraftBadge'), null, false);
    setDraftField($('exitPrice'), $('exitPriceDraftBadge'), null, false);
    const advanced = $('advancedOptions');
    if (advanced) advanced.open = last.target > 0;
    $('formTitle').textContent = 'Nuevo trade (duplicado)';
    $('btnSave').textContent = 'Guardar trade';
    $('btnCancel').hidden = false;
    showFormErrors([]);
    updatePreview();
    /* Duplicating starts a new trade: clear any edit highlight. */
    refreshTableAndKpis();
    switchTab('registro');
    const form = $('tradeForm');
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleDelete(id) {
    const trade = Store.getTrades().find(function (t) { return t.id === id; });
    const label = trade ? '#' + trade.tradeNumber : '';
    if (!window.confirm('¿Eliminar el trade ' + label + '? Esta acción no se puede deshacer.')) return;
    Store.deleteTrade(id);
    if (state.editingId === id) {
      /* The deleted trade was being edited: leave edit mode and reset. */
      resetForm();
    } else {
      /* New-trade mode: show the number the next trade will get. No-op while
       * editing a different trade, whose number must not be clobbered. */
      refreshNextTradeNumber();
    }
    showToast('Trade eliminado', 'ok');
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /* Filters                                                             */
  /* ------------------------------------------------------------------ */

  function readFilters() {
    state.filters.account = $('filterAccount').value;
    state.filters.instrument = $('filterInstrument').value;
    state.filters.strategy = $('filterStrategy').value;
    state.filters.emotion = $('filterEmotion').value;
    state.filters.dateFrom = $('filterDateFrom').value;
    state.filters.dateTo = $('filterDateTo').value;
  }

  function clearFilters() {
    $('filterAccount').value = '';
    $('filterInstrument').value = '';
    $('filterStrategy').value = '';
    $('filterEmotion').value = '';
    $('filterDateFrom').value = '';
    $('filterDateTo').value = '';
    readFilters();
    refreshTableAndKpis();
  }

  /* Filters disclosure state, remembered for the browser session. */
  const FILTERS_SESSION_KEY = 'bpt.filters.open';

  function readFiltersSession() {
    try {
      return window.sessionStorage.getItem(FILTERS_SESSION_KEY) === 'true';
    } catch (err) {
      return false;
    }
  }

  function persistFiltersSession(open) {
    try {
      window.sessionStorage.setItem(FILTERS_SESSION_KEY, open ? 'true' : 'false');
    } catch (err) {
      /* Private mode / disabled storage: the toggle still works in-memory. */
    }
  }

  /**
   * Applies the filters bar visibility from the session-remembered state and
   * the active tab. The bar is hidden on Ajustes and whenever the user left it
   * collapsed; the toggle button mirrors the state through `aria-expanded`.
   */
  function applyFiltersVisibility() {
    const onAjustes = state.activeTab === 'ajustes';
    const toggle = $('filtersToggle');
    const bar = $('filtersBar');
    const button = $('btnToggleFilters');
    if (toggle) toggle.hidden = onAjustes;
    if (bar) bar.hidden = onAjustes || !state.filtersOpen;
    if (button) button.setAttribute('aria-expanded', state.filtersOpen ? 'true' : 'false');
  }

  function toggleFilters() {
    state.filtersOpen = !state.filtersOpen;
    persistFiltersSession(state.filtersOpen);
    applyFiltersVisibility();
  }

  /* ------------------------------------------------------------------ */
  /* Tabs                                                                */
  /* ------------------------------------------------------------------ */

  function switchTab(tab) {
    state.activeTab = tab;

    document.querySelectorAll('.tab-button').forEach(function (btn) {
      const active = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    ['registro', 'dashboard', 'ajustes'].forEach(function (name) {
      const section = $('tab-' + name);
      if (section) section.hidden = name !== tab;
    });

    applyFiltersVisibility();

    if (tab === 'dashboard') {
      renderGamification();
      renderChartsIfVisible(getFilteredTrades());
    }
  }

  /* ------------------------------------------------------------------ */
  /* Settings / data management                                          */
  /* ------------------------------------------------------------------ */

  function loadBalancesIntoForm() {
    const balances = Store.getBalances();
    $('balanceSim').value = balances.Sim;
    $('balanceReal').value = balances.Real;
    $('balanceFondeo').value = balances.Fondeo;
  }

  function handleSaveBalances() {
    const sim = parseFloat($('balanceSim').value);
    const real = parseFloat($('balanceReal').value);
    const fondeo = parseFloat($('balanceFondeo').value);
    if (![sim, real, fondeo].every(Number.isFinite)) {
      setStatus('Los saldos iniciales deben ser números válidos.', 'error');
      return;
    }
    Store.setBalances({ Sim: sim, Real: real, Fondeo: fondeo });
    setStatus('Saldos iniciales guardados.', 'ok');
    renderAll();
  }

  /** Loads the persisted per-account risk settings into the Ajustes form. */
  function loadRiskSettingsIntoForm() {
    const settings = Store.getRiskSettings();
    ACCOUNTS.forEach(function (account) {
      const riskEl = $('riskPct' + account);
      const limitEl = $('dailyLimit' + account);
      if (riskEl) riskEl.value = String(settings[account].riskPct);
      if (limitEl) limitEl.value = String(settings[account].dailyTradeLimit);
    });
    const minRREl = $('minRR');
    if (minRREl) minRREl.value = String(Store.getMinRR());
    const weeklyEl = $('weeklyDisciplineGoal');
    if (weeklyEl && Store.getWeeklyDisciplineGoal) {
      weeklyEl.value = String(Store.getWeeklyDisciplineGoal());
    }
    const warnEl = $('riskSettingsWarning');
    if (warnEl) { warnEl.hidden = true; warnEl.textContent = ''; }
  }

  /**
   * Validates and persists the Ajustes risk settings. Risk percentages clamp
   * to [0.5, 3] (warning above the 2% recommendation), daily limits accept 0,
   * and empty/negative/non-numeric input keeps the stored value.
   */
  function handleSaveRiskSettings() {
    const current = Store.getRiskSettings();
    const risk = {};
    const limits = {};
    const warnings = [];
    const errors = [];

    ACCOUNTS.forEach(function (account) {
      const riskEl = $('riskPct' + account);
      const limitEl = $('dailyLimit' + account);
      const stored = current[account] || {};

      const rawRisk = riskEl ? riskEl.value.trim() : '';
      if (rawRisk === '') {
        risk[account] = stored.riskPct;
      } else {
        const clamped = Store.clampRiskPct(rawRisk);
        if (!clamped.valid) {
          risk[account] = stored.riskPct;
          errors.push('El riesgo de ' + account + ' debe ser un número no negativo; se mantiene ' + stored.riskPct + ' %.');
        } else {
          risk[account] = clamped.value;
          if (riskEl) riskEl.value = String(clamped.value);
          if (clamped.reason === 'hard-max') {
            warnings.push('El riesgo de ' + account + ' se limitó al 3 % máximo.');
          } else if (clamped.reason === 'above-recommended') {
            warnings.push('El riesgo de ' + account + ' supera el 2 % recomendado.');
          } else if (clamped.reason === 'below-min') {
            warnings.push('El riesgo de ' + account + ' se subió al 0,5 % mínimo.');
          }
        }
      }

      const rawLimit = limitEl ? limitEl.value.trim() : '';
      if (rawLimit === '') {
        limits[account] = stored.dailyTradeLimit;
      } else {
        const clampedLimit = Store.clampDailyLimit(rawLimit);
        if (!clampedLimit.valid) {
          limits[account] = stored.dailyTradeLimit;
          errors.push('El límite diario de ' + account + ' debe ser un número no negativo; se mantiene ' + stored.dailyTradeLimit + '.');
        } else {
          limits[account] = clampedLimit.value;
          if (limitEl) limitEl.value = String(clampedLimit.value);
        }
      }
    });

    let minRR = Store.getMinRR();
    const minRREl = $('minRR');
    if (minRREl) {
      const rawMinRR = minRREl.value.trim();
      if (rawMinRR !== '') {
        const parsed = parseFloat(rawMinRR);
        if (Number.isFinite(parsed) && parsed > 0) {
          minRR = parsed;
          minRREl.value = String(parsed);
        } else {
          errors.push('El R/R mínimo debe ser un número mayor que 0.');
        }
      }
    }

    Store.setSettings({ riskPct: risk, dailyTradeLimit: limits, minRR: minRR });
    const weeklyEl = $('weeklyDisciplineGoal');
    if (weeklyEl && Store.setWeeklyDisciplineGoal) {
      const rawWeekly = weeklyEl.value.trim();
      if (rawWeekly !== '') {
        const parsedWeekly = parseInt(rawWeekly, 10);
        if (Number.isFinite(parsedWeekly) && parsedWeekly >= 0) {
          Store.setWeeklyDisciplineGoal(parsedWeekly);
        } else {
          errors.push('La meta semanal debe ser un número no negativo.');
        }
      }
    }
    loadRiskSettingsIntoForm();
    /* Mirror the just-saved daily limit into the calculator's trades-per-day
     * input while the user has NOT edited it, so the two surfaces stay
     * consistent immediately (not only after a reload). A touched value is
     * final and is left alone. */
    if (!tradesPerDayTouched) {
      const activeAccount = activeAccount();
      const savedLimit = limits[activeAccount];
      const tradesMirrorEl = $('riskTradesPerDayInput');
      if (tradesMirrorEl && Number.isFinite(savedLimit)) {
        tradesMirrorEl.value = String(Math.max(1, savedLimit));
      }
    }
    renderRiskPanel();
    renderGamification();

    if (errors.length) {
      setStatus(errors.join(' '), 'error');
      return;
    }

    const warnEl = $('riskSettingsWarning');
    if (warnEl) {
      if (warnings.length) {
        warnEl.textContent = warnings.join(' ');
        warnEl.hidden = false;
      } else {
        warnEl.hidden = true;
        warnEl.textContent = '';
      }
    }
    setStatus('Ajustes de riesgo guardados.', 'ok');
  }

  /* ------------------------------------------------------------------ */
  /* Per-instrument stop/target ranges (Ajustes)                         */
  /* ------------------------------------------------------------------ */

  /** Formats a ticks→points distance on the instrument's price grid. */
  function formatPoints(value, tick) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return formatNumber(n, decimalsForTick(tick)) + ' pts';
  }

  /**
   * Renders the per-instrument range table for the selected account. Values
   * are stored in TICKS (authoritative); the points equivalent (`ticks × tick`)
   * is shown next to each value because a tick is not a fixed number of points
   * across instruments.
   */
  function renderInstrumentConfigTable() {
    const body = $('instrumentConfigBody');
    if (!body || typeof INSTRUMENTS === 'undefined') return;
    const accountEl = $('instrumentConfigAccount');
    const account = accountEl ? accountEl.value : ACCOUNTS[0];
    const accountConfig = Store.getInstrumentConfig()[account] || {};

    body.innerHTML = Object.keys(INSTRUMENTS).map(function (id) {
      const cfg = accountConfig[id] || {};
      const tick = Number(INSTRUMENTS[id].tick);
      const auto = cfg.stopTicksAuto === true;
      const stopPts = formatPoints(Number(cfg.stopPoints), tick);
      /* AUTO shows the budget-derived distance inline; a fixed value shows only
       * the points equivalent under its input. */
      const stopDisplay = auto
        ? 'Auto (' + cfg.stopTicks + ' ticks) · ' + stopPts
        : stopPts;
      const stopValue = auto ? '' : String(cfg.fixedStopTicks);
      const exitPts = formatPoints(Number(cfg.targetPoints), tick);
      const exitAltPts = formatPoints(Number(cfg.targetAltPoints), tick);
      return '<tr data-instrument="' + escapeHtml(id) + '" data-auto-ticks="' +
          escapeHtml(String(cfg.stopTicks)) + '">' +
        '<td><span class="cell-main">' + escapeHtml(id) + '</span> ' +
          '<span class="muted">' + escapeHtml(INSTRUMENTS[id].name) + '</span></td>' +
        '<td><input type="number" min="0" step="any" inputmode="decimal" ' +
          'id="cfgStop_' + account + '_' + id + '" value="' + escapeHtml(stopValue) + '" ' +
          'placeholder="Auto" aria-label="Stop en ticks (' + escapeHtml(id) + ')">' +
          '<span class="instrument-config-points">' + escapeHtml(stopDisplay) + '</span></td>' +
        '<td><input type="number" min="0" step="0.1" inputmode="decimal" ' +
          'id="cfgTargetR_' + account + '_' + id + '" value="' + escapeHtml(String(cfg.targetR)) + '"></td>' +
        '<td><input type="number" min="0" step="0.1" inputmode="decimal" ' +
          'id="cfgTargetRAlt_' + account + '_' + id + '" value="' + escapeHtml(String(cfg.targetRAlt)) + '"></td>' +
        '<td class="instrument-config-exits">' +
          escapeHtml(exitPts) + ' · ' + escapeHtml(exitAltPts) + '</td>' +
      '</tr>';
    }).join('');
  }

  /**
   * Recomputes the points equivalents of one table row from its live inputs,
   * so the display follows the ticks the user types (before saving).
   */
  function refreshInstrumentConfigRow(tr) {
    if (!tr) return;
    const spec = instrumentMeta(tr.getAttribute('data-instrument'));
    if (!spec) return;
    const tick = Number(spec.tick);
    const stopInput = tr.querySelector('input[id^="cfgStop_"]');
    const targetRInput = tr.querySelector('input[id^="cfgTargetR_"]');
    const targetRAltInput = tr.querySelector('input[id^="cfgTargetRAlt_"]');
    /* An empty stop input means AUTO: fall back to the budget-derived value the
     * row was rendered with, kept in `data-auto-ticks`. */
    const stopRaw = stopInput ? String(stopInput.value).trim() : '';
    const autoTicks = parseFloat(tr.getAttribute('data-auto-ticks'));
    const stopTicks = stopRaw === '' ? autoTicks : parseFloat(stopRaw);
    const targetR = targetRInput ? parseFloat(targetRInput.value) : NaN;
    const targetRAlt = targetRAltInput ? parseFloat(targetRAltInput.value) : NaN;
    const stopPtsEl = tr.querySelector('.instrument-config-points');
    const exitsEl = tr.querySelector('.instrument-config-exits');
    if (stopPtsEl) {
      const points = formatPoints(stopTicks * tick, tick);
      stopPtsEl.textContent = stopRaw === ''
        ? 'Auto (' + autoTicks + ' ticks) · ' + points
        : points;
    }
    if (exitsEl) {
      exitsEl.textContent = formatPoints(stopTicks * targetR * tick, tick) + ' · ' +
        formatPoints(stopTicks * targetRAlt * tick, tick);
    }
  }

  /** Loads the per-instrument config table for the selected account. */
  function loadInstrumentConfigIntoForm() {
    const accountEl = $('instrumentConfigAccount');
    if (accountEl && !accountEl.value) accountEl.value = ACCOUNTS[0];
    renderInstrumentConfigTable();
    const warnEl = $('instrumentConfigWarning');
    if (warnEl) { warnEl.hidden = true; warnEl.textContent = ''; }
  }

  /**
   * Validates and persists the visible account's per-instrument ranges. Values
   * are in ticks and must be positive; the target R multiples are the exit
   * ratios. Saved through `Store.setInstrumentConfig` so they travel with the
   * account's other settings.
   */
  function handleSaveInstrumentConfig() {
    const accountEl = $('instrumentConfigAccount');
    const account = accountEl ? accountEl.value : ACCOUNTS[0];
    const body = $('instrumentConfigBody');
    if (!body) return;

    const errors = [];
    const rows = body.querySelectorAll('tr[data-instrument]');
    Array.prototype.forEach.call(rows, function (tr) {
      const id = tr.getAttribute('data-instrument');
      const stopInput = tr.querySelector('input[id^="cfgStop_"]');
      const targetRInput = tr.querySelector('input[id^="cfgTargetR_"]');
      const targetRAltInput = tr.querySelector('input[id^="cfgTargetRAlt_"]');
      /* An empty stop input means AUTO (budget-derived), not an error. */
      const stopRaw = stopInput ? String(stopInput.value).trim() : '';
      const stopAuto = stopRaw === '';
      const stopTicks = stopAuto ? null : parseFloat(stopRaw);
      const targetR = targetRInput ? parseFloat(targetRInput.value) : NaN;
      const targetRAlt = targetRAltInput ? parseFloat(targetRAltInput.value) : NaN;
      const targetsValid = [targetR, targetRAlt].every(function (n) {
        return Number.isFinite(n) && n > 0;
      });
      const stopValid = stopAuto || (Number.isFinite(stopTicks) && stopTicks > 0);
      if (!targetsValid || !stopValid) {
        errors.push('Los rangos de ' + id + ' deben ser números mayores que 0 (deja el stop vacío para Auto).');
        return;
      }
      Store.setInstrumentConfig(account, id, {
        stopTicks: stopTicks,
        targetR: targetR,
        targetRAlt: targetRAlt
      });
    });

    const warnEl = $('instrumentConfigWarning');
    if (errors.length) {
      if (warnEl) { warnEl.textContent = errors.join(' '); warnEl.hidden = false; }
      setStatus(errors.join(' '), 'error');
      return;
    }
    if (warnEl) { warnEl.hidden = true; warnEl.textContent = ''; }
    renderInstrumentConfigTable();
    renderRiskPanel();
    setStatus('Rangos por instrumento guardados.', 'ok');
  }

  function handleSeed() {
    if (Store.getTrades().length > 0) {
      if (!window.confirm('Esto reemplazará los trades actuales por 8 trades de ejemplo. ¿Continuar?')) return;
    }
    Store.seedSample();
    resetForm();
    setStatus('Datos de ejemplo cargados.', 'ok');
    renderAll();
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function handleExportJSON() {
    download('trading-journal-backup-' + todayISO() + '.json', Store.exportJSON(), 'application/json;charset=utf-8');
    setStatus('Copia de seguridad JSON exportada.', 'ok');
  }

  function handleExportCSV() {
    download('trading-journal-' + todayISO() + '.csv', Store.exportCSV(Store.getTrades()), 'text/csv;charset=utf-8');
    setStatus('CSV exportado.', 'ok');
  }

  function handleImportNinjaFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    const accountEl = $('ninjaImportAccount');
    const account = accountEl && accountEl.value ? accountEl.value : ACCOUNTS[0];
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = Store.parseNinjaTraderCSV(String(reader.result), account);
        const result = Store.addNinjaTrades(parsed.trades);
        const omitted = parsed.skipped + result.skipped;
        if (result.added > 0) {
          setStatus('Importados ' + result.added + ' trades de NinjaTrader (' +
            omitted + ' omitidos: instrumento no configurado o fila inválida).', 'ok');
        } else {
          setStatus('No se importaron trades de NinjaTrader (' +
            omitted + ' omitidos: instrumento no configurado o fila inválida).', 'error');
        }
        resetForm();
        renderAll();
      } catch (err) {
        setStatus('No se pudo importar el archivo de NinjaTrader.', 'error');
      }
      input.value = '';
    };
    reader.onerror = function () {
      setStatus('No se pudo leer el archivo.', 'error');
      input.value = '';
    };
    reader.readAsText(file);
  }

  function handleImportJSONFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        Store.importJSON(String(reader.result));
        resetForm();
        loadBalancesIntoForm();
        loadRiskSettingsIntoForm();
        loadInstrumentConfigIntoForm();
        setStatus('Datos importados correctamente.', 'ok');
        renderAll();
      } catch (err) {
        setStatus('No se pudo importar el archivo: JSON no válido.', 'error');
      }
      input.value = '';
    };
    reader.onerror = function () {
      setStatus('No se pudo leer el archivo.', 'error');
      input.value = '';
    };
    reader.readAsText(file);
  }

  function handleClearAll() {
    if (!window.confirm('¿Borrar TODOS los trades y restablecer los saldos iniciales? Esta acción no se puede deshacer.')) return;
    Store.clearAll();
    resetForm();
    /* Deletion path: the store is empty, so the next new trade is #1. */
    refreshNextTradeNumber();
    loadBalancesIntoForm();
    loadRiskSettingsIntoForm();
    loadInstrumentConfigIntoForm();
    setStatus('Todos los datos fueron borrados.', 'ok');
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /* Account deletion                                                    */
  /* ------------------------------------------------------------------ */

  /* Non-sensitive, user-facing messages. Never echo raw Firebase errors. */
  function deleteAccountErrorMessage(err) {
    const code = err && err.code ? err.code : '';
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Contraseña incorrecta. Vuelve a intentarlo.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Se canceló la confirmación. La cuenta no fue eliminada.';
      case 'auth/popup-blocked':
        return 'El navegador bloqueó la ventana de confirmación.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Inténtalo de nuevo más tarde.';
      case 'auth/network-request-failed':
        return 'Sin conexión. Revisa tu red e inténtalo de nuevo.';
      case 'firestore-unavailable':
        return 'El servicio de datos no está disponible. Inténtalo más tarde.';
      default:
        return 'No se pudo eliminar la cuenta. Inténtalo de nuevo.';
    }
  }

  function handleDeleteAccount() {
    if (!currentUser) return;
    if (!window.confirm(
      '¿Eliminar tu cuenta y TODOS tus datos guardados? Esta acción no se puede deshacer.'
    )) return;

    const passwordEl = $('deletePassword');
    const button = $('btnDeleteAccount');
    if (button) button.disabled = true;
    setStatus('Eliminando tu cuenta…');

    FirebaseService.deleteAccount(currentUser, {
      password: passwordEl ? passwordEl.value : ''
    }).then(function () {
      if (passwordEl) passwordEl.value = '';
      setStatus('Tu cuenta y tus datos fueron eliminados.', 'ok');
    }).catch(function (err) {
      if (button) button.disabled = false;
      setStatus(deleteAccountErrorMessage(err), 'error');
    });
  }

  /**
   * Builds the "danger zone" card in the settings tab. Kept in JS so the
   * PR 3 slice touches only `firebase.js`/`app.js`; it reuses the existing
   * card, field and button styles.
   */
  function buildDangerZone() {
    const tab = $('tab-ajustes');
    if (!tab || $('btnDeleteAccount')) return;

    const card = document.createElement('div');
    card.className = 'card';

    const header = document.createElement('div');
    header.className = 'card-header';
    const heading = document.createElement('h2');
    heading.textContent = 'Zona de peligro';
    header.appendChild(heading);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Eliminar la cuenta borra todos tus trades y datos guardados. Esta acción no se puede deshacer.';

    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.setAttribute('for', 'deletePassword');
    label.textContent = 'Contraseña (solo si iniciaste sesión con correo)';
    const input = document.createElement('input');
    input.type = 'password';
    input.id = 'deletePassword';
    input.setAttribute('autocomplete', 'current-password');
    field.appendChild(label);
    field.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-danger';
    button.id = 'btnDeleteAccount';
    button.textContent = 'Eliminar mi cuenta';
    actions.appendChild(button);

    card.appendChild(header);
    card.appendChild(hint);
    card.appendChild(field);
    card.appendChild(actions);
    tab.appendChild(card);

    button.addEventListener('click', handleDeleteAccount);
  }

  /* ------------------------------------------------------------------ */
  /* Event wiring                                                        */
  /* ------------------------------------------------------------------ */

  function wireEvents() {
    $('tradeForm').addEventListener('submit', handleSubmit);

    const infoButton = $('btnInstrumentInfo');
    if (infoButton) infoButton.addEventListener('click', toggleInstrumentInfo);

    /* Trade tabs: three concurrent draft slots, each with its own calculator. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-trade-tab]'), function (btn) {
      btn.addEventListener('click', function () {
        switchTradeTab(Number(btn.getAttribute('data-trade-tab')));
      });
    });

    /* Global day selector: changing it re-filters the trades table, KPIs and
     * charts to that single day (empty = every day). */
    const globalDateField = $('globalDate');
    if (globalDateField) {
      globalDateField.addEventListener('change', function () {
        state.globalDate = globalDateField.value;
        renderAll();
      });
    }

    /* "Ahora" shortcuts: set a time field to the current clock time. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-now-target]'), function (btn) {
      btn.addEventListener('click', function () {
        writeTimeSelect(btn.getAttribute('data-now-target'), nowTime());
      });
    });

    /* Account selector (header): a global control, not per-trade. */
    const accountSelector = $('accountSelector');
    if (accountSelector) {
      accountSelector.addEventListener('change', function () {
        updatePreview();
        renderBalances();
        renderAll();
      });
    }

    /* Validation modal: close on button or backdrop click. */
    ['btnCloseErrorModal', 'btnErrorModalOk'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('click', hideErrorModal);
    });
    const errorModal = $('errorModal');
    if (errorModal) {
      errorModal.addEventListener('click', function (event) {
        if (event.target === errorModal) hideErrorModal();
      });
    }

    /* Trade mode: show/hide the exit-date field and refresh the preview. */
    const tradeModeEl = $('tradeMode');
    if (tradeModeEl) {
      tradeModeEl.addEventListener('change', function () {
        applyTradeMode();
        updatePreview();
      });
    }

    /* Dashboard date-range filter with shortcuts. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-df]'), function (btn) {
      btn.addEventListener('click', function () {
        state.dashboardPeriod = btn.getAttribute('data-df');
        applyDashboardFilter();
        renderAll();
      });
    });
    ['dfFrom', 'dfTo'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('change', function () {
        state[id] = el.value;
        renderAll();
      });
    });

    /* +/- steppers: increment/decrement a number input, clamped to min/max. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-step-up], [data-step-down]'), function (btn) {
      btn.addEventListener('click', function () {
        const targetId = btn.getAttribute('data-step-up') || btn.getAttribute('data-step-down');
        const el = $(targetId);
        if (!el) return;
        const dir = btn.hasAttribute('data-step-up') ? 1 : -1;
        const step = parseFloat(btn.getAttribute('data-step') || el.step || '1');
        const min = (el.min !== undefined && el.min !== '') ? parseFloat(el.min) : -Infinity;
        const max = (el.max !== undefined && el.max !== '') ? parseFloat(el.max) : Infinity;
        let v = parseFloat(el.value);
        if (!Number.isFinite(v)) v = 0;
        v = Math.min(max, Math.max(min, Math.round((v + dir * step) * 100) / 100));
        el.value = String(v);
        el.dispatchEvent(new Event('input'));
        el.dispatchEvent(new Event('change'));
      });
    });

    $('btnCancel').addEventListener('click', function () {
      resetForm();
      /* Drop the edit highlight from the table. */
      refreshTableAndKpis();
    });

    /* Both contracts views are the SAME value. Typing in EITHER one marks the
     * field user-owned and mirrors the value to the other, so the calculator
     * stops prefilling and the two can never diverge. Registered before the
     * live-update loop below so the flag is set before the panel re-renders on
     * the same keystroke. */
    const contractsField = $('contracts');
    if (contractsField) {
      const markContractsTouched = function () {
        contractsTouched = true;
        syncContracts(contractsField.value);
      };
      contractsField.addEventListener('input', markContractsTouched);
      contractsField.addEventListener('change', markContractsTouched);
    }
    /* The calculator's contracts input is the other view: on change it writes
     * the canonical #contracts FIRST, then the shared render pass mirrors it
     * back and updates the reported real risk. */
    const riskContractsField = $('riskContracts');
    if (riskContractsField) {
      const onRiskContracts = function () {
        contractsTouched = true;
        syncContracts(riskContractsField.value);
        updatePreview();
      };
      riskContractsField.addEventListener('input', onRiskContracts);
      riskContractsField.addEventListener('change', onRiskContracts);
    }

    /* Draft fields: the first user keystroke makes the value final and clears
     * the draft mark. Registered before the live-update loop below so the flag
     * is set before the panel re-renders. */
    const stopField = $('stop');
    if (stopField) {
      const markStopTouched = function () {
        touchedFields.stop = true;
        setDraftField(stopField, $('stopDraftBadge'), null, false);
      };
      stopField.addEventListener('input', markStopTouched);
      stopField.addEventListener('change', markStopTouched);
    }
    const exitField = $('exitPrice');
    if (exitField) {
      const markExitTouched = function () {
        touchedFields.exitPrice = true;
        setDraftField(exitField, $('exitPriceDraftBadge'), null, false);
      };
      exitField.addEventListener('input', markExitTouched);
      exitField.addEventListener('change', markExitTouched);
    }
    /* The calculator's stop-ticks input is user-owned once edited; the
     * per-instrument config stops re-seeding it until the instrument changes. */
    const riskStopField = $('riskStopTicks');
    if (riskStopField) {
      const markStopTicksTouched = function () { stopTicksTouched = true; };
      riskStopField.addEventListener('input', markStopTicksTouched);
      riskStopField.addEventListener('change', markStopTicksTouched);
    }

    /* The calculator's trades-per-day input is user-owned once edited: it is
     * never re-seeded while touched, and a valid positive integer is persisted
     * to the account's daily trade limit so it survives a reload and stays in
     * sync with Ajustes. Registered before the live-update loop below so the
     * flag is set before the panel re-renders on the same keystroke. */
    const riskTradesField = $('riskTradesPerDayInput');
    if (riskTradesField) {
      riskTradesField.addEventListener('input', onTradesPerDayChanged);
      riskTradesField.addEventListener('change', onTradesPerDayChanged);
    }

    /* The calculator's instrument selector is the other view of the same
     * value: on change it writes the canonical #instrument FIRST, then the
     * shared render pass re-renders every instrument-dependent region
     * (calculator values, NinjaTrader preview, R/B range, price/draft
     * suggestions, AUTO stop default and market table). */
    const riskInstrumentField = $('riskInstrument');
    if (riskInstrumentField) {
      const onRiskInstrument = function () {
        syncInstrument(riskInstrumentField.value);
        updatePreview();
        renderInstrumentNote();
      };
      riskInstrumentField.addEventListener('input', onRiskInstrument);
      riskInstrumentField.addEventListener('change', onRiskInstrument);
    }

    ['instrument', 'contracts', 'direction', 'emotion', 'entryPrice', 'exitPrice',
      'stop', 'plannedRisk',
      'entryDate',
      'riskStopTicks', 'riskRatio', 'riskDailyPctInput', 'riskTradesPerDayInput'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('input', updatePreview);
      if (el) el.addEventListener('change', updatePreview);
    });

    /* Instrument note (full product name) follows the canonical form selector. */
    const instrumentField = $('instrument');
    if (instrumentField) {
      instrumentField.addEventListener('input', renderInstrumentNote);
      instrumentField.addEventListener('change', renderInstrumentNote);
    }

    $('tradesBody').addEventListener('click', function (event) {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      /* Empty-state CTAs have no trade id. */
      if (action === 'new-trade') {
        switchTab('registro');
        const form = $('tradeForm');
        if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const firstField = $('tradeNumber');
        if (firstField && firstField.focus) firstField.focus();
        return;
      }
      if (action === 'clear-filters') {
        clearFilters();
        return;
      }
      const id = button.getAttribute('data-id');
      if (action === 'edit') handleEdit(id);
      else if (action === 'delete') handleDelete(id);
    });

    $('tradesHead').addEventListener('click', function (event) {
      const th = event.target.closest('th[data-sort]');
      if (!th) return;
      const key = th.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      refreshTableAndKpis();
    });

    $('tableSearch').addEventListener('input', function (event) {
      state.search = event.target.value.trim().toLowerCase();
      refreshTableAndKpis();
    });

    /* Global search: searches every trade, ignoring the filter bar. The `/`
     * shortcut focuses it from anywhere outside a form field; Escape clears
     * it while focused. */
    const globalSearchEl = $('globalSearch');
    if (globalSearchEl) {
      globalSearchEl.addEventListener('input', function (event) {
        state.globalSearch = event.target.value.trim().toLowerCase();
        refreshTableAndKpis();
      });
      document.addEventListener('keydown', function (event) {
        const target = event.target;
        const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
        const typing = tag === 'input' || tag === 'textarea' || tag === 'select' ||
          (target && target.isContentEditable);
        if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !typing) {
          event.preventDefault();
          globalSearchEl.focus();
          if (globalSearchEl.select) globalSearchEl.select();
        } else if (event.key === 'Escape' && document.activeElement === globalSearchEl && globalSearchEl.value) {
          globalSearchEl.value = '';
          state.globalSearch = '';
          refreshTableAndKpis();
        }
      });
    }

    /* The discipline panel is account-scoped: refresh it when the global
     * account selector changes while the dashboard is visible. */
    const accountSelect = $('accountSelector');
    if (accountSelect) {
      accountSelect.addEventListener('change', function () {
        if (isDashboardVisible()) renderGamification();
      });
    }

    ['filterAccount', 'filterInstrument', 'filterStrategy', 'filterEmotion',
      'filterDateFrom', 'filterDateTo'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('change', function () {
        readFilters();
        refreshTableAndKpis();
      });
    });

    $('btnClearFilters').addEventListener('click', clearFilters);

    const filtersButton = $('btnToggleFilters');
    if (filtersButton) filtersButton.addEventListener('click', toggleFilters);

    document.querySelectorAll('.tab-button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    $('btnSaveBalances').addEventListener('click', handleSaveBalances);
    const saveRiskButton = $('btnSaveRiskSettings');
    if (saveRiskButton) saveRiskButton.addEventListener('click', handleSaveRiskSettings);

    /* Per-instrument ranges: the account selector swaps the table, the save
     * button persists the visible account's ticks + target multiples. */
    const instrumentConfigAccount = $('instrumentConfigAccount');
    if (instrumentConfigAccount) {
      instrumentConfigAccount.addEventListener('change', function () {
        renderInstrumentConfigTable();
      });
    }
    const instrumentConfigBody = $('instrumentConfigBody');
    if (instrumentConfigBody) {
      instrumentConfigBody.addEventListener('input', function (event) {
        const row = event.target.closest('tr[data-instrument]');
        if (row) refreshInstrumentConfigRow(row);
      });
    }
    const saveInstrumentConfigButton = $('btnSaveInstrumentConfig');
    if (saveInstrumentConfigButton) {
      saveInstrumentConfigButton.addEventListener('click', handleSaveInstrumentConfig);
    }

    const duplicateButton = $('btnDuplicateLast');
    if (duplicateButton) duplicateButton.addEventListener('click', duplicateLastTrade);
    $('btnSeed').addEventListener('click', handleSeed);
    $('btnExportJSON').addEventListener('click', handleExportJSON);
    $('btnExportCSV').addEventListener('click', handleExportCSV);
    $('btnImportJSON').addEventListener('click', function () { $('importJSONFile').click(); });
    $('importJSONFile').addEventListener('change', handleImportJSONFile);
    const btnImportNinja = $('btnImportNinja');
    if (btnImportNinja) {
      btnImportNinja.addEventListener('click', function () { $('importNinjaFile').click(); });
    }
    const importNinjaFile = $('importNinjaFile');
    if (importNinjaFile) importNinjaFile.addEventListener('change', handleImportNinjaFile);
    $('btnClearAll').addEventListener('click', handleClearAll);
  }

  /* ------------------------------------------------------------------ */
  /* Auth gate                                                           */
  /* ------------------------------------------------------------------ */

  function setAppVisible(visible) {
    APP_REGIONS.forEach(function (selector) {
      const el = document.querySelector(selector);
      if (el) el.hidden = !visible;
    });
  }

  function showAuthError(message) {
    const el = $('authError');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function setAuthBusy(busy) {
    ['btnEmailAuth', 'btnGoogle', 'btnToggleAuthMode'].forEach(function (id) {
      const el = $(id);
      if (el) el.disabled = !!busy;
    });
  }

  function setAuthMode(mode) {
    authMode = mode === 'signup' ? 'signup' : 'signin';
    const title = $('authTitle');
    const submit = $('btnEmailAuth');
    const toggle = $('btnToggleAuthMode');
    if (title) title.textContent = authMode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión';
    if (submit) submit.textContent = authMode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión';
    if (toggle) toggle.textContent = authMode === 'signup' ? 'Ya tengo cuenta' : 'Crear cuenta';
    const password = $('authPassword');
    if (password) {
      password.setAttribute('autocomplete', authMode === 'signup' ? 'new-password' : 'current-password');
    }
  }

  /* Non-sensitive, user-facing messages. Never echo raw Firebase errors. */
  function authErrorMessage(err) {
    const code = err && err.code ? err.code : '';
    switch (code) {
      case 'auth/invalid-email':
        return 'El correo no es válido.';
      case 'auth/user-disabled':
        return 'Esta cuenta está deshabilitada.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Correo o contraseña incorrectos.';
      case 'auth/email-already-in-use':
        return 'Ese correo ya tiene una cuenta. Inicia sesión.';
      case 'auth/weak-password':
        return 'La contraseña debe tener al menos 6 caracteres.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Inténtalo de nuevo más tarde.';
      case 'auth/popup-blocked':
        return 'El navegador bloqueó la ventana emergente. Se intentará con redirección.';
      case 'auth/operation-not-supported-in-this-environment':
        return 'Este entorno no admite el inicio de sesión con Google.';
      case 'auth/network-request-failed':
        return 'Sin conexión. Revisa tu red e inténtalo de nuevo.';
      default:
        return 'No se pudo completar la autenticación. Inténtalo de nuevo.';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Email verification UI (sign-up / resend / re-check)                 */
  /* ------------------------------------------------------------------ */

  /* Non-sensitive messages for the verification actions. */
  function verificationErrorMessage(err) {
    const code = err && err.code ? err.code : '';
    switch (code) {
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Espera unos minutos antes de pedir otro correo.';
      case 'auth/network-request-failed':
        return 'Sin conexión. Revisa tu red e inténtalo de nuevo.';
      case 'not-authenticated':
        return 'Tu sesión expiró. Inicia sesión de nuevo.';
      case 'already-verified':
        return 'Tu correo ya está verificado. Vuelve a intentar el acceso.';
      default:
        return 'No se pudo completar la acción. Inténtalo de nuevo.';
    }
  }

  function showVerificationStatus(message, kind) {
    const el = $('verificationStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = kind === 'ok' ? 'auth-hint' : 'auth-error';
    el.hidden = !message;
  }

  function setVerificationVisible(visible) {
    const el = $('verificationActions');
    if (el) el.hidden = !visible;
  }

  function setVerificationBusy(busy) {
    ['btnResendVerification', 'btnRecheckVerification'].forEach(function (id) {
      const el = $(id);
      if (el) el.disabled = !!busy;
    });
  }

  function handleResendVerification() {
    setVerificationBusy(true);
    FirebaseService.resendVerification().then(function () {
      setVerificationBusy(false);
      showVerificationStatus('Te enviamos un nuevo correo de verificación. Revisa la bandeja de entrada y la carpeta de spam.', 'ok');
    }, function (err) {
      setVerificationBusy(false);
      showVerificationStatus(verificationErrorMessage(err), 'error');
    });
  }

  function handleRecheckVerification() {
    setVerificationBusy(true);
    FirebaseService.reloadCurrentUser().then(function (result) {
      if (!result.user) {
        setVerificationBusy(false);
        showVerificationStatus('Tu sesión expiró. Inicia sesión de nuevo.', 'error');
        return null;
      }
      return FirebaseService.checkAccess(result.user).then(function (access) {
        setVerificationBusy(false);
        if (access.allowed) {
          showVerificationStatus('');
          enterApp(result.user);
          return;
        }
        if (access.reason === 'email-unverified') {
          showVerificationStatus(result.reloaded
            ? 'Tu correo todavía no está verificado. Abre el enlace del correo y vuelve a intentarlo.'
            : 'No se pudo comprobar tu correo. Revisa tu conexión e inténtalo de nuevo.', 'error');
          return;
        }
        handleAuthState(result.user, access);
      });
    }).catch(function () {
      setVerificationBusy(false);
      showVerificationStatus('No se pudo completar la acción. Inténtalo de nuevo.', 'error');
    });
  }

  /**
   * Builds the verification panel inside the auth card. Kept in JS so the
   * task-3.4 slice touches only `firebase.js`/`app.js`; it reuses the
   * existing hint, button and error styles. The panel is revealed only when
   * access is denied with reason `email-unverified`.
   */
  function buildVerificationActions() {
    const card = document.querySelector('#authGate .auth-card');
    if (!card || $('verificationActions')) return;

    const panel = document.createElement('div');
    panel.className = 'verification-actions';
    panel.id = 'verificationActions';
    panel.hidden = true;

    const hint = document.createElement('p');
    hint.className = 'auth-hint';
    hint.textContent = 'Confirma tu correo para acceder. Revisa la bandeja de entrada y la carpeta de spam.';

    const actions = document.createElement('div');
    actions.className = 'form-actions';

    const resend = document.createElement('button');
    resend.type = 'button';
    resend.className = 'btn btn-ghost';
    resend.id = 'btnResendVerification';
    resend.textContent = 'Reenviar verificación';

    const recheck = document.createElement('button');
    recheck.type = 'button';
    recheck.className = 'btn';
    recheck.id = 'btnRecheckVerification';
    recheck.textContent = 'Ya verifiqué mi correo';

    actions.appendChild(resend);
    actions.appendChild(recheck);

    const status = document.createElement('p');
    status.className = 'auth-error';
    status.id = 'verificationStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;

    panel.appendChild(hint);
    panel.appendChild(actions);
    panel.appendChild(status);
    card.appendChild(panel);

    resend.addEventListener('click', handleResendVerification);
    recheck.addEventListener('click', handleRecheckVerification);
  }

  function handleAuthSubmit(event) {
    event.preventDefault();
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    if (!email || !password) {
      showAuthError('Introduce tu correo y tu contraseña.');
      return;
    }
    showAuthError('');
    setAuthBusy(true);
    const mode = authMode;
    const operation = mode === 'signup'
      ? FirebaseService.signUpWithEmail(email, password)
      : FirebaseService.signInWithEmail(email, password);
    operation.then(function (result) {
      setAuthBusy(false);
      if (mode !== 'signup') return;
      if (result && result.verificationSent) {
        showVerificationStatus('Te enviamos un correo de verificación. Ábrelo antes de acceder.', 'ok');
      } else {
        showVerificationStatus('Tu cuenta fue creada, pero no se pudo enviar el correo de verificación. Usa "Reenviar verificación".', 'error');
      }
    }, function (err) {
      setAuthBusy(false);
      showAuthError(authErrorMessage(err));
    });
  }

  function handleGoogle() {
    showAuthError('');
    setAuthBusy(true);
    FirebaseService.signInWithGoogle().then(function () {
      setAuthBusy(false);
    }, function (err) {
      setAuthBusy(false);
      showAuthError(authErrorMessage(err));
    });
  }

  function handleLogout() {
    FirebaseService.logout().catch(function () {
      setStatus('No se pudo cerrar la sesión. Inténtalo de nuevo.', 'error');
    });
  }

  function wireAuthEvents() {
    const form = $('authForm');
    if (form) form.addEventListener('submit', handleAuthSubmit);

    const google = $('btnGoogle');
    if (google) google.addEventListener('click', handleGoogle);

    const toggle = $('btnToggleAuthMode');
    if (toggle) toggle.addEventListener('click', function () {
      setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
    });

    const logout = $('btnLogout');
    if (logout) logout.addEventListener('click', handleLogout);
  }

  /* ------------------------------------------------------------------ */
  /* Session lifecycle                                                   */
  /* ------------------------------------------------------------------ */

  function enterApp(user) {
    if (currentUid === user.uid) return;
    currentUid = user.uid;
    currentUser = user;
    showAuthError('');
    setVerificationVisible(false);
    showVerificationStatus('');

    const emailEl = $('userEmail');
    if (emailEl) emailEl.textContent = user.displayName || user.email || '';
    const avatarEl = $('userAvatar');
    if (avatarEl) {
      if (user.photoURL) {
        avatarEl.src = user.photoURL;
        avatarEl.hidden = false;
      } else {
        avatarEl.hidden = true;
      }
    }

    /* Migrate the legacy localStorage journal on first login, then hydrate.
     * A migration failure is logged and never blocks login. */
    FirebaseService.migrateLocalData(user.uid).catch(function (err) {
      console.warn('[app] localStorage migration failed:', err && err.code ? err.code : err);
      return false;
    }).then(function () {
      if (currentUid !== user.uid) return null;
      return Store.attach(user.uid);
    }).then(function (attached) {
      if (currentUid !== user.uid || attached === null) return;
      loadBalancesIntoForm();
      loadRiskSettingsIntoForm();
      loadInstrumentConfigIntoForm();
      drafts = [null, null, null];
      state.activeTrade = 0;
      resetForm();
      const gate = $('authGate');
      if (gate) gate.hidden = true;
      const userBox = $('userBox');
      if (userBox) userBox.hidden = false;
      setAppVisible(true);
      switchTab('registro');
      renderAll();
    }).catch(function () {
      if (currentUid !== user.uid) return;
      showAuthError('No se pudieron cargar tus datos. Inténtalo de nuevo.');
      FirebaseService.logout().catch(function () {});
    });
  }

  function leaveApp() {
    currentUid = null;
    currentUser = null;
    Store.detach();
    setAppVisible(false);
    const userBox = $('userBox');
    if (userBox) userBox.hidden = true;
    const gate = $('authGate');
    if (gate) gate.hidden = false;
  }

  function handleAuthState(user, access) {
    if (user && access && access.allowed) {
      setVerificationVisible(false);
      showVerificationStatus('');
      enterApp(user);
      return;
    }

    leaveApp();
    const reason = access ? access.reason : '';
    const unverified = reason === 'email-unverified';
    setVerificationVisible(unverified);
    if (!unverified) showVerificationStatus('');
    if (reason === 'not-allowlisted') {
      showAuthError('Tu cuenta no está autorizada. Solicita acceso al administrador.');
    } else if (unverified) {
      showAuthError('Verifica tu correo electrónico antes de acceder.');
    } else if (reason === 'allowlist-error') {
      showAuthError('No se pudo verificar tu acceso. Inténtalo de nuevo.');
    } else if (reason === 'db-unavailable') {
      showAuthError('El servicio de datos no está disponible. Inténtalo más tarde.');
    } else {
      showAuthError('');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * One-time setup: DOM wiring and the auth listener. The app stays hidden
   * and no journal data is rendered until authentication state resolves.
   */
  function boot() {
    initSelects();
    /* Time fields use flatpickr (CDN); degrade gracefully without it. */
    if (typeof flatpickr === 'function') {
      const timeOpts = {
        enableTime: true,
        noCalendar: true,
        dateFormat: 'H:i',
        time_24hr: true,
        defaultHour: 9,
        defaultMinute: 30
      };
      flatpickr('#entryTime', timeOpts);
      flatpickr('#exitTime', timeOpts);
    }
    wireEvents();
    wireAuthEvents();
    buildDangerZone();
    buildVerificationActions();
    setAuthMode('signin');
    state.filtersOpen = readFiltersSession();
    applyFiltersVisibility();
    /* The global day selector starts on today; clearing it shows every day. */
    state.globalDate = todayISO();
    const globalDateEl = $('globalDate');
    if (globalDateEl) globalDateEl.value = state.globalDate;
    /* Hide the whole shell last so the pre-auth gate never leaks the toggle. */
    setAppVisible(false);
    showAuthError('');

    /* Re-render whenever the store's in-memory state changes. */
    Store.subscribe(function () { renderAll(); });

    FirebaseService.init().then(function () {
      if (!FirebaseService.getAuth()) {
        showAuthError('No se pudo cargar Firebase. Revisa tu conexión e inténtalo de nuevo.');
        return;
      }
      return FirebaseService.completeGoogleRedirect().catch(function () {});
    }).then(function () {
      if (!FirebaseService.getAuth()) return;
      FirebaseService.onAuthStateChanged(handleAuthState);
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
