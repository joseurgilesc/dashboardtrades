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

  function initSelects() {
    fillSelect($('account'), ACCOUNTS);
    fillSelect($('instrument'), Object.keys(INSTRUMENTS));
    fillSelect($('strategy'), STRATEGIES);
    fillSelect($('direction'), DIRECTIONS);
    fillSelect($('exitType'), EXIT_TYPES);
    fillSelect($('emotion'), EMOTIONS);

    fillSelect($('filterAccount'), ACCOUNTS, 'Todas las cuentas');
    fillSelect($('filterInstrument'), Object.keys(INSTRUMENTS), 'Todos los instrumentos');
    fillSelect($('filterStrategy'), STRATEGIES, 'Todas las estrategias');
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
      trade.strategy, trade.exitType, trade.emotion, trade.entryDate, trade.notes
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
    const balances = Store.getAccountBalances();
    ACCOUNTS.forEach(function (account) {
      const chip = $('chip' + account);
      if (!chip) return;
      const value = balances[account] || 0;
      chip.textContent = formatMoney(value);
      chip.className = 'chip-value ' + signClass(value - (Store.getBalances()[account] || 0));
    });
    const total = Store.getTotalBalance();
    const totalEl = $('chipTotal');
    if (totalEl) totalEl.textContent = formatMoney(total);
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
          '<td>' + escapeHtml(t.instrument) + '</td>' +
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
    renderTableHeaders();
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

  function renderAll() {
    renderBalances();
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
      exitType: $('exitType').value,
      emotion: $('emotion').value,
      notes: $('notes').value.trim()
    };
  }

  function updatePreview() {
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

  function resetForm() {
    state.editingId = null;
    const form = $('tradeForm');
    if (form) form.reset();
    $('tradeNumber').value = String(Store.nextTradeNumber());
    $('account').value = ACCOUNTS[0];
    $('instrument').value = Object.keys(INSTRUMENTS)[0];
    $('strategy').value = STRATEGIES[0];
    $('direction').value = DIRECTIONS[0];
    $('exitType').value = EXIT_TYPES[0];
    $('emotion').value = EMOTIONS[0];
    $('entryDate').value = todayISO();
    $('exitDate').value = todayISO();
    $('entryTime').value = '09:30';
    $('exitTime').value = '09:45';
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
    $('strategy').value = trade.strategy;
    $('direction').value = trade.direction;
    $('entryDate').value = trade.entryDate;
    $('entryTime').value = trade.entryTime;
    $('entryPrice').value = trade.entryPrice;
    $('exitDate').value = trade.exitDate;
    $('exitTime').value = trade.exitTime;
    $('exitPrice').value = trade.exitPrice;
    $('exitType').value = trade.exitType;
    $('emotion').value = trade.emotion;
    $('notes').value = trade.notes;
    $('formTitle').textContent = 'Editar trade #' + trade.tradeNumber;
    $('btnSave').textContent = 'Guardar cambios';
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
    setStatus('Todos los datos fueron borrados.', 'ok');
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /* Event wiring                                                        */
  /* ------------------------------------------------------------------ */

  function wireEvents() {
    $('tradeForm').addEventListener('submit', handleSubmit);

    $('btnCancel').addEventListener('click', function () {
      resetForm();
    });

    ['instrument', 'contracts', 'direction', 'entryPrice', 'exitPrice',
      'entryDate', 'entryTime', 'exitDate', 'exitTime'].forEach(function (id) {
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
    $('btnSeed').addEventListener('click', handleSeed);
    $('btnExportJSON').addEventListener('click', handleExportJSON);
    $('btnExportCSV').addEventListener('click', handleExportCSV);
    $('btnImportJSON').addEventListener('click', function () { $('importJSONFile').click(); });
    $('importJSONFile').addEventListener('change', handleImportJSONFile);
    $('btnClearAll').addEventListener('click', handleClearAll);
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    initSelects();
    wireEvents();
    loadBalancesIntoForm();
    resetForm();

    if (!Store.canPersist()) {
      setStatus('Aviso: el navegador no permite guardar datos. Los cambios no se conservarán al cerrar.', 'error');
    }

    switchTab('registro');
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
