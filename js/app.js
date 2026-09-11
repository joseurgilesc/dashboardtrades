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
    editingId: null,
    sortKey: 'entryDate',
    sortDir: 'asc',
    search: '',
    filters: {
      account: '',
      instrument: '',
      strategy: '',
      emotion: '',
      dateFrom: '',
      dateTo: ''
    },
    chartsDirty: true
  };

  /* Auth/session state (module scope, outside the UI `state` object). */
  let currentUid = null;
  let currentUser = null;
  let authMode = 'signin';

  /* True once the user edits the contracts field by hand, so the risk
   * calculator stops prefilling it for the current trade. Reset on reset. */
  let contractsTouched = false;

  /* Top-level regions hidden until authentication resolves. */
  const APP_REGIONS = ['.tabs', '#filtersBar', '.app-main', '.app-footer'];

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

  function nowTime() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
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

  function initSelects() {
    fillSelect($('account'), ACCOUNTS);
    fillSelect($('instrument'), Object.keys(INSTRUMENTS));
    fillStrategySelect($('strategy'));
    fillSelect($('direction'), DIRECTIONS);
    fillSelect($('exitType'), EXIT_TYPES);
    fillSelect($('emotion'), EMOTIONS);

    fillSelect($('filterAccount'), ACCOUNTS, 'Todas las cuentas');
    fillSelect($('filterInstrument'), Object.keys(INSTRUMENTS), 'Todos los instrumentos');
    fillStrategySelect($('filterStrategy'), 'Todas las estrategias');
    fillSelect($('filterEmotion'), EMOTIONS, 'Todas las emociones');
  }

  /* ------------------------------------------------------------------ */
  /* Filtering / sorting                                                 */
  /* ------------------------------------------------------------------ */

  function getFilteredTrades() {
    const f = state.filters;
    return Store.getTrades().filter(function (t) {
      if (f.account && t.account !== f.account) return false;
      if (f.instrument && t.instrument !== f.instrument) return false;
      if (f.strategy && t.strategy !== f.strategy) return false;
      if (f.emotion && t.emotion !== f.emotion) return false;
      if (f.dateFrom && t.entryDate < f.dateFrom) return false;
      if (f.dateTo && t.entryDate > f.dateTo) return false;
      return true;
    });
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
    const initial = Store.getBalances();
    const balances = Store.getAccountBalances();
    ACCOUNTS.forEach(function (account) {
      const chip = $('chip' + account);
      if (chip) {
        const value = balances[account] || 0;
        chip.textContent = formatMoney(value);
        chip.className = 'chip-value ' + signClass(value - (initial[account] || 0));
      }
      const sub = $('chipSub' + account);
      if (sub) sub.textContent = 'Inicial ' + formatMoney(initial[account] || 0);
    });
    const total = Store.getTotalBalance();
    const totalEl = $('chipTotal');
    if (totalEl) totalEl.textContent = formatMoney(total);
    const totalSub = $('chipSubTotal');
    if (totalSub) {
      const initialTotal = ACCOUNTS.reduce(function (sum, account) {
        return sum + (initial[account] || 0);
      }, 0);
      totalSub.textContent = 'Inicial ' + formatMoney(initialTotal);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Table                                                               */
  /* ------------------------------------------------------------------ */

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

    const rows = sortTrades(trades.filter(matchesSearch));

    if (rows.length === 0) {
      body.innerHTML = '<tr><td class="table-empty" colspan="' +
        (TABLE_COLUMNS.length + 1) + '">No hay trades que coincidan con los filtros.</td></tr>';
    } else {
      body.innerHTML = rows.map(function (t) {
        return '<tr>' +
          '<td>' + escapeHtml(t.tradeNumber) + '</td>' +
          '<td><span class="cell-main">' + escapeHtml(t.entryDate) + '</span> <span class="muted">' + escapeHtml(t.entryTime) + '</span></td>' +
          '<td>' + escapeHtml(t.account) + '</td>' +
          '<td>' + escapeHtml(t.instrument) + missingStopBadge(t) + '</td>' +
          '<td>' + escapeHtml(t.direction) + '</td>' +
          '<td class="num">' + escapeHtml(t.contracts) + '</td>' +
          '<td class="num">' + escapeHtml(t.entryPrice) + '</td>' +
          '<td class="num">' + escapeHtml(t.exitPrice) + '</td>' +
          '<td>' + escapeHtml(t.exitType) + '</td>' +
          '<td>' + escapeHtml(t.emotion) + '</td>' +
          '<td class="num ' + signClass(t.points) + '">' + formatNumber(t.points) + '</td>' +
          '<td class="num ' + signClass(t.net) + '">' + formatMoney(t.net) + '</td>' +
          '<td class="num ' + signClass(t.cumulative) + '">' + formatMoney(t.cumulative) + '</td>' +
          '<td class="col-actions">' +
            '<button type="button" class="btn-icon" data-action="edit" data-id="' + escapeHtml(t.id) + '">Editar</button>' +
            '<button type="button" class="btn-icon danger" data-action="delete" data-id="' + escapeHtml(t.id) + '">Eliminar</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    const summary = $('tableSummary');
    if (summary) {
      summary.textContent = rows.length + (rows.length === 1 ? ' trade' : ' trades');
    }
    renderDisciplineSummary(trades);
    renderTableHeaders();
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

  function renderKpis(trades) {
    const k = Store.getKpis(trades);
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
    updateDuplicateButton();
    const filtered = getFilteredTrades();
    renderTable(filtered);
    renderKpis(filtered);
    renderChartsIfVisible(filtered);
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

  function readForm() {
    return {
      id: state.editingId || undefined,
      tradeNumber: parseInt($('tradeNumber').value, 10),
      account: $('account').value,
      instrument: $('instrument').value,
      contracts: parseFloat($('contracts').value),
      strategy: $('strategy').value,
      direction: $('direction').value,
      entryDate: $('entryDate').value,
      entryTime: $('entryTime').value,
      entryPrice: parseFloat($('entryPrice').value),
      exitDate: $('exitDate').value,
      exitTime: $('exitTime').value,
      exitPrice: parseFloat($('exitPrice').value),
      stop: parseFloat($('stop').value),
      target: parseFloat($('target').value),
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

  /** Renders the per-instrument reference panel (hidden until toggled). */
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
      { label: 'Exchange', value: spec.exchange },
      { label: 'Horario', value: spec.hours },
      { label: 'Valor del punto', value: formatNumber(spec.pointValue, 2) },
      { label: 'Tick', value: String(spec.tick) },
      { label: 'Comisión (ida y vuelta)', value: formatMoney(spec.commission) },
      { label: 'Tamaño', value: sizeLabel(spec.size) }
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

  /**
   * Renders the BPT risk calculator for the form's selected account and
   * instrument. Uses the account's current balance (capital), its configured
   * DAILY risk percentage and its daily trade limit (the per-trade divisor).
   *
   *   tickValue    = tick * pointValue            (from the instrument)
   *   P_m          = stopTicks * tickValue
   *   dailyBudget  = dailyRiskPct% * capital
   *   perTradeRisk = (dailyRiskPct / tradesPerDay)% * capital
   *   contracts    = floor(perTradeRisk / P_m)
   *
   * Commission is shown separately and is never folded into P_m. R/R (warned
   * below the minimum) and the non-linear recovery are kept from the previous
   * panel. When even one contract exceeds the per-trade budget a viability
   * warning is shown. A recorded stop price yields the stop in ticks
   * (|entry - stop| / tick) and takes precedence over the tick input; a
   * recorded planned risk / target feed the R/R.
   */
  function renderRiskPanel() {
    const accountEl = $('account');
    if (!accountEl) return;

    const account = accountEl.value || ACCOUNTS[0];
    const instrument = $('instrument') ? $('instrument').value : '';
    const stopEl = $('riskStopTicks');
    const targetEl = $('riskTarget');
    const formStopEl = $('stop');
    const formTargetEl = $('target');
    const formPlannedRiskEl = $('plannedRisk');
    const entryPriceEl = $('entryPrice');

    const spec = instrumentMeta(instrument);
    const tick = spec ? Number(spec.tick) : NaN;
    const tickValue = (spec && Number.isFinite(tick)) ? tick * Number(spec.pointValue) : NaN;

    const manualStopTicks = stopEl ? parseFloat(stopEl.value) : NaN;
    const manualTarget = targetEl ? parseFloat(targetEl.value) : NaN;
    const formStop = formStopEl ? parseFloat(formStopEl.value) : NaN;
    const formTarget = formTargetEl ? parseFloat(formTargetEl.value) : NaN;
    const formPlannedRisk = formPlannedRiskEl ? parseFloat(formPlannedRiskEl.value) : NaN;
    const entryPrice = entryPriceEl ? parseFloat(entryPriceEl.value) : NaN;

    /* A recorded stop price yields the stop in ticks and takes precedence
     * over the calculator's own tick input. */
    const derivedStopPoints = (Number.isFinite(formStop) && Number.isFinite(entryPrice) && formStop !== entryPrice)
      ? Math.abs(entryPrice - formStop)
      : NaN;
    const derivedStopTicks = (Number.isFinite(derivedStopPoints) && tick > 0)
      ? Number((derivedStopPoints / tick).toFixed(4))
      : NaN;
    const stopTicks = derivedStopTicks > 0 ? derivedStopTicks : manualStopTicks;

    const balance = Store.getAccountBalances()[account];
    const settings = Store.getRiskSettings()[account] || {};
    const riskPct = Number.isFinite(settings.riskPct) ? settings.riskPct : DEFAULT_RISK_PCT;
    const tradesPerDay = Number.isFinite(settings.dailyTradeLimit)
      ? settings.dailyTradeLimit
      : DEFAULT_DAILY_TRADE_LIMIT;
    const minRR = Store.getMinRR();

    const hint = $('riskAccountHint');
    if (hint) {
      hint.textContent = account + ' · riesgo diario ' + formatNumber(riskPct, 1) + ' % · ' +
        tradesPerDay + ' op/día · saldo ' + formatMoney(balance);
    }

    setRiskItem('riskCapital', formatMoney(balance));
    setRiskItem('riskDailyPct', formatNumber(riskPct, 1) + ' %');
    setRiskItem('riskTradesPerDay', String(tradesPerDay));

    const risk = Store.computeRisk({
      balance: balance,
      riskPct: riskPct,
      tradesPerDay: tradesPerDay,
      instrument: instrument,
      stopTicks: stopTicks
    });

    const warnEl = $('riskViabilityWarning');
    const resultIds = ['riskBudget', 'riskTickValue', 'riskPerContract', 'riskPerTrade',
      'riskContracts', 'riskCommission', 'riskTotal', 'riskRR', 'riskRecovery'];

    if (!risk.valid) {
      resultIds.forEach(function (id) { setRiskItem(id, '—'); });
      if (warnEl) { warnEl.hidden = true; warnEl.textContent = ''; }
      return;
    }

    /* Default the contracts field to the calculator's suggestion while the
     * user has not edited it by hand. A zero suggestion is left blank. */
    const contractsEl = $('contracts');
    if (contractsEl && !contractsTouched && risk.contracts > 0) {
      contractsEl.value = String(risk.contracts);
    }

    const totalRisk = risk.pm * risk.contracts;
    setRiskItem('riskBudget', formatMoney(risk.dailyBudget));
    setRiskItem('riskTickValue', formatMoney(risk.tickValue));
    setRiskItem('riskPerContract', formatMoney(risk.pm));
    setRiskItem('riskPerTrade', formatMoney(risk.perTradeRisk));
    setRiskItem('riskContracts', String(risk.contracts));
    setRiskItem('riskCommission', formatMoney(risk.commission));
    setRiskItem('riskTotal', formatMoney(totalRisk));

    /* A recorded planned risk / target takes precedence over the computed
     * position risk and the calculator's own target input. */
    const plannedRisk = (Number.isFinite(formPlannedRisk) && formPlannedRisk > 0)
      ? formPlannedRisk
      : totalRisk;
    const rewardTarget = (Number.isFinite(formTarget) && formTarget > 0) ? formTarget : manualTarget;
    const rr = Store.computeRR({ plannedRisk: plannedRisk, target: rewardTarget, minRR: minRR });
    if (rr.valid) {
      setRiskItem('riskRR', formatNumber(rr.ratio, 2) + ' : 1', rr.warned ? 'warn' : '');
    } else {
      setRiskItem('riskRR', '—');
    }

    const lossPct = (risk.contracts > 0 && balance > 0) ? totalRisk / balance : NaN;
    const recovery = Number.isFinite(lossPct) ? Store.recoveryPct(lossPct) : NaN;
    if (recovery === Infinity) {
      setRiskItem('riskRecovery', '∞');
    } else if (Number.isFinite(recovery)) {
      setRiskItem('riskRecovery', formatNumber(recovery * 100, 1) + ' %');
    } else {
      setRiskItem('riskRecovery', '—');
    }

    if (warnEl) {
      if (risk.contracts === 0) {
        warnEl.textContent = 'Con un riesgo diario del ' + formatNumber(riskPct, 1) + ' % repartido en ' +
          tradesPerDay + ' operaciones (' + formatMoney(risk.perTradeRisk) + ' por operación), un solo contrato de ' +
          instrument + ' arriesga ' + formatMoney(risk.pm) +
          '. El instrumento no es viable para esta cuenta con el riesgo configurado.';
        warnEl.hidden = false;
      } else {
        warnEl.hidden = true;
        warnEl.textContent = '';
      }
    }
  }

  /**
   * Warn-only discipline banners for the entry form's selected account: the
   * daily trade limit and the intraday drawdown / losing-streak thresholds.
   * These are guidance only: submit is never disabled or blocked.
   */
  function renderEntryWarnings() {
    const accountEl = $('account');
    const account = accountEl && accountEl.value ? accountEl.value : ACCOUNTS[0];

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
  /* Daily scaling plan (Dashboard)                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Fills the scaling-plan inputs from the entry form's selected account:
   * its current balance and configured risk percentage. The R/B and day
   * count fall back to the defaults from instruments.js. The user can
   * override every value before pressing "Calcular".
   */
  function loadScalingDefaults() {
    const capitalEl = $('scalingCapital');
    if (!capitalEl) return;

    const accountEl = $('account');
    const account = (accountEl && accountEl.value) ? accountEl.value : ACCOUNTS[0];
    const balance = Store.getAccountBalances()[account];
    const settings = Store.getRiskSettings()[account] || {};

    capitalEl.value = String(Number.isFinite(balance) ? Math.round(balance * 100) / 100 : 0);
    const riskEl = $('scalingRiskPct');
    if (riskEl) {
      riskEl.value = String(Number.isFinite(settings.riskPct) ? settings.riskPct : DEFAULT_RISK_PCT);
    }
    const rrEl = $('scalingRR');
    if (rrEl) rrEl.value = String(DEFAULT_SCALING_RR);
    const daysEl = $('scalingDays');
    if (daysEl) daysEl.value = String(DEFAULT_SCALING_DAYS);
    const hint = $('scalingHint');
    if (hint) hint.textContent = 'Cuenta de referencia: ' + account;
  }

  /**
   * Renders the proportional daily scaling table for the panel inputs. Shows
   * the compounded capital day by day plus a summary of the final capital,
   * total gain and growth. Invalid input hides the table and shows a warning;
   * it never blocks anything.
   */
  function renderScalingPlan() {
    const body = $('scalingBody');
    if (!body) return;

    const capitalEl = $('scalingCapital');
    const riskEl = $('scalingRiskPct');
    const rrEl = $('scalingRR');
    const daysEl = $('scalingDays');
    const warnEl = $('scalingWarning');
    const wrapEl = $('scalingTableWrap');
    const summaryEl = $('scalingSummary');

    const plan = Store.dailyScalingPlan({
      capital: capitalEl ? parseFloat(capitalEl.value) : NaN,
      riskPct: riskEl ? parseFloat(riskEl.value) : NaN,
      rr: rrEl ? parseFloat(rrEl.value) : NaN,
      days: daysEl ? parseInt(daysEl.value, 10) : NaN
    });

    if (!plan.valid) {
      body.innerHTML = '';
      if (wrapEl) wrapEl.hidden = true;
      if (summaryEl) { summaryEl.textContent = ''; summaryEl.className = 'table-discipline'; }
      if (warnEl) {
        warnEl.textContent = plan.reason === 'riskPct'
          ? 'El % de riesgo diario debe ser un número mayor que 0.'
          : 'El capital inicial debe ser un número no negativo.';
        warnEl.hidden = false;
      }
      return;
    }

    if (warnEl) { warnEl.hidden = true; warnEl.textContent = ''; }

    body.innerHTML = plan.rows.map(function (row) {
      return '<tr>' +
        '<td>' + escapeHtml(row.day) + '</td>' +
        '<td class="num">' + formatMoney(row.startCapital) + '</td>' +
        '<td class="num">' + formatMoney(row.risk) + '</td>' +
        '<td class="num pos">' + formatMoney(row.gain) + '</td>' +
        '<td class="num">' + formatMoney(row.endCapital) + '</td>' +
      '</tr>';
    }).join('');
    if (wrapEl) wrapEl.hidden = false;

    if (summaryEl) {
      const totalGain = plan.finalCapital - plan.rows[0].startCapital;
      const growth = plan.rows[0].startCapital > 0 ? (totalGain / plan.rows[0].startCapital) * 100 : 0;
      summaryEl.textContent = 'Capital final tras ' + plan.days + ' días: ' + formatMoney(plan.finalCapital) +
        ' (' + (totalGain >= 0 ? '+' : '') + formatMoney(totalGain) + ' · ' +
        formatNumber(growth, 1) + ' %)' +
        (plan.clampedDays ? ' · limitado a ' + plan.days + ' días.' : '');
      summaryEl.className = 'table-discipline';
    }
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
    if ($('account')) $('account').value = last.account;
    if ($('instrument')) $('instrument').value = last.instrument;
    if ($('strategy')) $('strategy').value = last.strategy;
    if ($('direction')) $('direction').value = last.direction;
    if ($('emotion')) $('emotion').value = last.emotion;
  }

  function resetForm() {
    state.editingId = null;
    const form = $('tradeForm');
    if (form) form.reset();
    $('tradeNumber').value = String(Store.nextTradeNumber());
    /* Primary selects come from the last-used entry preferences. */
    applyLastEntry();
    $('exitType').value = EXIT_TYPES[0];
    /* Contracts start empty and are prefilled by the risk calculator until
     * the user edits the field by hand. */
    contractsTouched = false;
    $('contracts').value = '';
    $('entryDate').value = todayISO();
    $('exitDate').value = todayISO();
    /* Both times default to the current moment; the exit time is re-read on
     * every reset so a save never leaves a stale time behind. */
    const now = nowTime();
    $('entryTime').value = now;
    $('exitTime').value = now;
    /* Stop, target and planned risk are optional and start empty. */
    $('stop').value = '';
    $('target').value = '';
    $('plannedRisk').value = '';
    /* Optional fields live behind the "Más opciones" disclosure. */
    const advanced = $('advancedOptions');
    if (advanced) advanced.open = false;
    $('formTitle').textContent = 'Nuevo trade';
    $('btnSave').textContent = 'Guardar trade';
    $('btnCancel').hidden = true;
    showFormErrors([]);
    updatePreview();
  }

  function handleSubmit(event) {
    event.preventDefault();
    const errors = validateForm();
    if (errors.length) {
      showFormErrors(errors);
      return;
    }
    showFormErrors([]);

    const trade = readForm();
    delete trade.id;

    if (state.editingId) {
      if (!Number.isFinite(trade.tradeNumber) || trade.tradeNumber <= 0) delete trade.tradeNumber;
      Store.updateTrade(state.editingId, trade);
      setStatus('Trade actualizado correctamente.', 'ok');
    } else {
      trade.tradeNumber = Number.isFinite(trade.tradeNumber) && trade.tradeNumber > 0
        ? trade.tradeNumber
        : Store.nextTradeNumber();
      Store.addTrade(trade);
      setStatus('Trade guardado correctamente.', 'ok');
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
    $('account').value = trade.account;
    $('instrument').value = trade.instrument;
    $('contracts').value = trade.contracts;
    ensureStrategyOption($('strategy'), trade.strategy);
    $('strategy').value = trade.strategy;
    $('direction').value = trade.direction;
    $('entryDate').value = trade.entryDate;
    $('entryTime').value = trade.entryTime;
    $('entryPrice').value = trade.entryPrice;
    $('exitDate').value = trade.exitDate;
    $('exitTime').value = trade.exitTime;
    $('exitPrice').value = trade.exitPrice;
    $('stop').value = trade.stop > 0 ? trade.stop : '';
    $('target').value = trade.target > 0 ? trade.target : '';
    $('plannedRisk').value = trade.plannedRisk > 0 ? trade.plannedRisk : '';
    $('exitType').value = trade.exitType;
    $('emotion').value = trade.emotion;
    $('notes').value = trade.notes;
    $('formTitle').textContent = 'Editar trade #' + trade.tradeNumber;
    $('btnSave').textContent = 'Guardar cambios';
    $('btnCancel').hidden = false;
    /* Editing owns the contracts value; the calculator must not overwrite it. */
    contractsTouched = true;
    /* Reveal the optional fields when the trade actually uses them. */
    const advanced = $('advancedOptions');
    if (advanced) advanced.open = trade.target > 0 || trade.plannedRisk > 0 || !!trade.notes;
    showFormErrors([]);
    updatePreview();
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
    $('account').value = last.account;
    $('instrument').value = last.instrument;
    $('contracts').value = last.contracts > 0 ? String(last.contracts) : '';
    ensureStrategyOption($('strategy'), last.strategy);
    $('strategy').value = last.strategy;
    $('direction').value = last.direction;
    $('emotion').value = last.emotion;
    $('stop').value = last.stop > 0 ? last.stop : '';
    $('target').value = last.target > 0 ? last.target : '';
    $('plannedRisk').value = '';
    $('notes').value = '';
    /* No exit data is copied: entry/exit default to the current moment. */
    $('entryPrice').value = '';
    $('exitPrice').value = '';
    $('exitType').value = EXIT_TYPES[0];
    $('entryDate').value = todayISO();
    $('exitDate').value = todayISO();
    const now = nowTime();
    $('entryTime').value = now;
    $('exitTime').value = now;
    /* The copied contracts value belongs to the user now. */
    contractsTouched = true;
    const advanced = $('advancedOptions');
    if (advanced) advanced.open = last.target > 0;
    $('formTitle').textContent = 'Nuevo trade (duplicado)';
    $('btnSave').textContent = 'Guardar trade';
    $('btnCancel').hidden = false;
    showFormErrors([]);
    updatePreview();
    switchTab('registro');
    const form = $('tradeForm');
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleDelete(id) {
    const trade = Store.getTrades().find(function (t) { return t.id === id; });
    const label = trade ? '#' + trade.tradeNumber : '';
    if (!window.confirm('¿Eliminar el trade ' + label + '? Esta acción no se puede deshacer.')) return;
    Store.deleteTrade(id);
    if (state.editingId === id) resetForm();
    setStatus('Trade eliminado.', 'ok');
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

    const filtersBar = $('filtersBar');
    if (filtersBar) filtersBar.hidden = tab === 'ajustes';

    if (tab === 'dashboard') {
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
    loadRiskSettingsIntoForm();
    renderRiskPanel();

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
    loadBalancesIntoForm();
    loadRiskSettingsIntoForm();
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

    $('btnCancel').addEventListener('click', function () {
      resetForm();
    });

    /* Mark the contracts field as user-owned as soon as it is edited, so the
     * risk calculator stops prefilling it. Registered before the live-update
     * loop below so the flag is set before the panel re-renders. */
    const contractsField = $('contracts');
    if (contractsField) {
      const markContractsTouched = function () { contractsTouched = true; };
      contractsField.addEventListener('input', markContractsTouched);
      contractsField.addEventListener('change', markContractsTouched);
    }

    ['account', 'instrument', 'contracts', 'direction', 'entryPrice', 'exitPrice',
      'stop', 'target', 'plannedRisk',
      'entryDate', 'entryTime', 'exitDate', 'exitTime',
      'riskStopTicks', 'riskTarget'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('input', updatePreview);
      if (el) el.addEventListener('change', updatePreview);
    });

    $('tradesBody').addEventListener('click', function (event) {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = button.getAttribute('data-id');
      if (button.getAttribute('data-action') === 'edit') handleEdit(id);
      else if (button.getAttribute('data-action') === 'delete') handleDelete(id);
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

    ['filterAccount', 'filterInstrument', 'filterStrategy', 'filterEmotion',
      'filterDateFrom', 'filterDateTo'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('change', function () {
        readFilters();
        refreshTableAndKpis();
      });
    });

    $('btnClearFilters').addEventListener('click', clearFilters);

    document.querySelectorAll('.tab-button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    $('btnSaveBalances').addEventListener('click', handleSaveBalances);
    const saveRiskButton = $('btnSaveRiskSettings');
    if (saveRiskButton) saveRiskButton.addEventListener('click', handleSaveRiskSettings);
    const scalingButton = $('btnScalingCalc');
    if (scalingButton) scalingButton.addEventListener('click', renderScalingPlan);
    const duplicateButton = $('btnDuplicateLast');
    if (duplicateButton) duplicateButton.addEventListener('click', duplicateLastTrade);
    $('btnSeed').addEventListener('click', handleSeed);
    $('btnExportJSON').addEventListener('click', handleExportJSON);
    $('btnExportCSV').addEventListener('click', handleExportCSV);
    $('btnImportJSON').addEventListener('click', function () { $('importJSONFile').click(); });
    $('importJSONFile').addEventListener('change', handleImportJSONFile);
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
    if (emailEl) emailEl.textContent = user.email || '';

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
      resetForm();
      const gate = $('authGate');
      if (gate) gate.hidden = true;
      const userBox = $('userBox');
      if (userBox) userBox.hidden = false;
      setAppVisible(true);
      switchTab('registro');
      renderAll();
      loadScalingDefaults();
      renderScalingPlan();
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
    wireEvents();
    wireAuthEvents();
    buildDangerZone();
    buildVerificationActions();
    setAuthMode('signin');
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
