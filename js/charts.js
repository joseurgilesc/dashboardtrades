/* charts.js
 * Dashboard charts built on the vendored Chart.js 4 UMD global (`Chart`).
 * Exposes the global `DashboardCharts`. Plain script (no modules).
 * Every chart instance is destroyed before being recreated.
 */

const DashboardCharts = (function () {
  'use strict';

  /* Terminal palette: neutral greys carry the structure, color is signal.
   * Auxiliary series use accent/cyan/purple/amber; pos/neg are reserved for
   * profit and loss. */
  const PALETTE = [
    '#2DD4BF', '#22D3EE', '#A78BFA', '#FBBF24', '#22C55E', '#EF4444'
  ];
  const POSITIVE = '#22C55E';
  const NEGATIVE = '#EF4444';
  const ACCENT = '#2DD4BF';
  const GRID_COLOR = '#2A3F5C';
  const TEXT_COLOR = '#98A7BA';
  const PANEL_COLOR = '#16263C';
  const TOOLTIP_BG = '#16263C';
  const TOOLTIP_BORDER = '#2A3F5C';
  const FONT_STACK = "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif";

  const DAY_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  /* Live Chart instances, keyed by canvas id, so they can be destroyed. */
  const instances = {};

  function hasChartJs() {
    return typeof Chart !== 'undefined';
  }

  function money(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function groupNet(list, keyFn) {
    const map = new Map();
    list.forEach(function (trade) {
      const key = keyFn(trade);
      if (key === null || key === undefined || key === '') return;
      map.set(key, (map.get(key) || 0) + trade.net);
    });
    return map;
  }

  /** Returns labels ordered by `order`, keeping only keys present in `map`. */
  function orderedEntries(map, order) {
    const labels = [];
    const values = [];
    order.forEach(function (key) {
      if (map.has(key)) {
        labels.push(key);
        values.push(map.get(key));
      }
    });
    return { labels: labels, values: values };
  }

  function signColors(values) {
    return values.map(function (v) { return v >= 0 ? POSITIVE : NEGATIVE; });
  }

  /** Resolves a stored strategy id to its display label, with raw fallback. */
  function resolveStrategyLabel(id) {
    if (typeof Store !== 'undefined' && Store.strategyLabel) return Store.strategyLabel(id);
    return id;
  }

  /* ------------------------------------------------------------------ */
  /* Empty-state handling                                                */
  /* ------------------------------------------------------------------ */

  /* Muted line-chart glyph; matches the empty state used by the table. */
  const EMPTY_ICON =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-6"/></svg>';

  function setEmpty(canvas, isEmpty, message) {
    const parent = canvas.parentElement;
    if (!parent) return;
    let note = parent.querySelector('.chart-empty');
    if (isEmpty) {
      canvas.style.display = 'none';
      if (!note) {
        note = document.createElement('p');
        note.className = 'chart-empty';
        parent.appendChild(note);
      }
      /* Icon + message, built as nodes so the message is never HTML. */
      note.innerHTML = '';
      const icon = document.createElement('span');
      icon.className = 'empty-state-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = EMPTY_ICON;
      const text = document.createElement('span');
      text.className = 'empty-state-text';
      text.textContent = message || 'Sin datos';
      note.appendChild(icon);
      note.appendChild(text);
      note.hidden = false;
    } else {
      canvas.style.display = '';
      if (note) note.hidden = true;
    }
  }

  function destroy(id) {
    if (instances[id]) {
      instances[id].destroy();
      delete instances[id];
    }
  }

  function create(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    destroy(id);
    instances[id] = new Chart(canvas.getContext('2d'), config);
  }

  function emptyGuard(id, isEmpty) {
    const canvas = document.getElementById(id);
    if (!canvas) return true;
    if (isEmpty) {
      destroy(id);
      setEmpty(canvas, true, 'Sin datos');
      return true;
    }
    setEmpty(canvas, false);
    return false;
  }

  function applyChartDefaults() {
    if (!hasChartJs()) return;
    Chart.defaults.color = TEXT_COLOR;
    Chart.defaults.borderColor = GRID_COLOR;
    Chart.defaults.font.family = FONT_STACK;
    Chart.defaults.font.size = 11;
    /* Dark tooltip surface so it matches the panel language. */
    const tooltip = Chart.defaults.plugins && Chart.defaults.plugins.tooltip;
    if (tooltip) {
      tooltip.backgroundColor = TOOLTIP_BG;
      tooltip.borderColor = TOOLTIP_BORDER;
      tooltip.borderWidth = 1;
      tooltip.titleColor = '#F2F6FA';
      tooltip.bodyColor = '#98A7BA';
    }
  }

  /**
   * Resolves the numeric value of a tooltip context.
   * `ctx.raw` is the original data value and is correct for vertical bars,
   * horizontal bars, lines and doughnuts (unlike parsed.x/parsed.y, which
   * swap meaning when indexAxis is 'y').
   */
  function contextValue(ctx) {
    if (typeof ctx.raw === 'number') return ctx.raw;
    if (typeof ctx.parsed === 'number') return ctx.parsed;
    if (ctx.parsed && typeof ctx.parsed.y === 'number') return ctx.parsed.y;
    if (ctx.parsed && typeof ctx.parsed.x === 'number') return ctx.parsed.x;
    return 0;
  }

  function moneyTooltip() {
    return {
      callbacks: {
        label: function (ctx) {
          return (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + money(contextValue(ctx));
        }
      }
    };
  }

  function moneyScale() {
    return {
      ticks: {
        color: TEXT_COLOR,
        callback: function (value) { return money(value); }
      },
      grid: { color: GRID_COLOR }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Chart renderers                                                     */
  /* ------------------------------------------------------------------ */

  function renderEquity(list) {
    const id = 'chartEquity';
    if (emptyGuard(id, list.length === 0)) return;
    const labels = list.map(function (t) { return t.entryDate; });
    const data = list.map(function (t) { return t.cumulative; });
    create(id, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Equity acumulada',
          data: data,
          borderColor: ACCENT,
          backgroundColor: 'rgba(59, 130, 246, 0.14)',
          fill: true,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: moneyTooltip()
        },
        scales: {
          x: { grid: { color: GRID_COLOR }, ticks: { color: TEXT_COLOR, maxRotation: 45, autoSkip: true } },
          y: moneyScale()
        }
      }
    });
  }

  function renderBarByGroup(id, list, keyFn, order, label, horizontal, labelFn) {
    const map = groupNet(list, keyFn);
    const entries = orderedEntries(map, order);
    if (emptyGuard(id, entries.labels.length === 0)) return;
    /* `order`/grouping stay keyed by the stored value; `labelFn` only maps the
     * rendered axis labels (e.g. strategy id -> display name). */
    const labels = labelFn ? entries.labels.map(labelFn) : entries.labels;
    create(id, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: entries.values,
          backgroundColor: signColors(entries.values),
          borderColor: signColors(entries.values),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: moneyTooltip()
        },
        scales: horizontal
          ? { x: moneyScale(), y: { grid: { display: false }, ticks: { color: TEXT_COLOR } } }
          : { x: { grid: { display: false }, ticks: { color: TEXT_COLOR } }, y: moneyScale() }
      }
    });
  }

  function renderDoughnut(id, labels, values, colors) {
    if (emptyGuard(id, labels.length === 0)) return;
    create(id, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: PANEL_COLOR,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: TEXT_COLOR, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ': ' + money(contextValue(ctx));
              }
            }
          }
        }
      }
    });
  }

  function renderByExitType(list) {
    const map = groupNet(list, function (t) { return t.exitType; });
    const entries = orderedEntries(map, (typeof EXIT_TYPES !== 'undefined') ? EXIT_TYPES : []);
    const colors = entries.labels.map(function (_, i) { return PALETTE[i % PALETTE.length]; });
    renderDoughnut('chartExitType', entries.labels, entries.values, colors);
  }

  function renderWinLoss(list) {
    let wins = 0;
    let losses = 0;
    list.forEach(function (t) { if (t.net > 0) wins += 1; else losses += 1; });
    const labels = [];
    const values = [];
    const colors = [];
    if (wins > 0) { labels.push('Ganadoras'); values.push(wins); colors.push(POSITIVE); }
    if (losses > 0) { labels.push('Perdedoras'); values.push(losses); colors.push(NEGATIVE); }
    renderDoughnut('chartWinLoss', labels, values, colors);
  }

  function renderByDayOfWeek(list) {
    const map = groupNet(list, function (t) { return t.dayOfWeekName; });
    const entries = orderedEntries(map, DAY_ORDER);
    if (emptyGuard('chartDayOfWeek', entries.labels.length === 0)) return;
    create('chartDayOfWeek', {
      type: 'bar',
      data: {
        labels: entries.labels,
        datasets: [{
          label: 'Neto',
          data: entries.values,
          backgroundColor: signColors(entries.values),
          borderColor: signColors(entries.values),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: moneyTooltip() },
        scales: {
          x: { grid: { display: false }, ticks: { color: TEXT_COLOR } },
          y: moneyScale()
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  function render(trades) {
    if (!hasChartJs()) return;
    applyChartDefaults();

    const list = (typeof Store !== 'undefined')
      ? Store.computeAll(trades || [])
      : (trades || []);

    renderEquity(list);

    renderBarByGroup(
      'chartInstrument', list,
      function (t) { return t.instrument; },
      (typeof INSTRUMENTS !== 'undefined') ? Object.keys(INSTRUMENTS) : [],
      'Neto', false
    );

    renderBarByGroup(
      'chartStrategy', list,
      function (t) { return t.strategy; },
      (typeof STRATEGY_IDS !== 'undefined') ? STRATEGY_IDS : [],
      'Neto', false,
      resolveStrategyLabel
    );

    renderBarByGroup(
      'chartEmotion', list,
      function (t) { return t.emotion; },
      (typeof EMOTIONS !== 'undefined') ? EMOTIONS : [],
      'Neto', true
    );

    renderByExitType(list);
    renderWinLoss(list);
    renderByDayOfWeek(list);
  }

  function destroyAll() {
    Object.keys(instances).forEach(function (id) { destroy(id); });
  }

  return {
    render: render,
    destroyAll: destroyAll
  };
})();
