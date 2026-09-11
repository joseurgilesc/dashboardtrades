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
