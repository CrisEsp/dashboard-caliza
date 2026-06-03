const SPREADSHEET_ID = CONFIG.SPREADSHEET_ID;
const REFRESH_INTERVAL = 15 * 60 * 1000;

const CAMERA_STREAMS = {
  sacos:   `http://${CONFIG.CAMERA_HOST}:8080/streams/sacos.m3u8`,
  pallets: `http://${CONFIG.CAMERA_HOST}:8080/streams/pallets.m3u8`,
};

const SHEETS = {
  sacosArmAnt: 'Sacos-Arm-Ant-Total',
  sacosSelvAnt: 'Sacos-Selv-Ant-Total',
  capas: 'Capas_Total_Arm',
};

const COLORS = {
  armaduro: '#3b82f6',
  armaduro_antihumedad: '#8b5cf6',
  selvalegre: '#22c55e',
  selvAnti: '#06b6d4',
  campeon: '#f59e0b',
  total: '#ef4444',
  pallet: '#f97316',
};

let charts = {};
let rangeMode = false;

function buildGvizUrl(sheet, query) {
  const base = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;
  const params = new URLSearchParams({
    tqx: 'out:csv',
    sheet: sheet,
    tq: query,
  });
  return `${base}?${params.toString()}`;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const row = parseRow(lines[i]);
      if (row[0] && row[0] !== 'periodo_inicio') {
        rows.push(row);
      }
    }
  }
  return { headers, rows };
}

function parseNumber(val) {
  if (val == null || val === '') return 0;
  return parseFloat(String(val).replace(',', '.')) || 0;
}

function formatNumber(num) {
  return new Intl.NumberFormat('es-PE').format(Math.round(num));
}

function formatTime(dateStr) {
  if (!dateStr) return '--';
  const parts = dateStr.split(' ');
  return parts.length > 1 ? parts[1].substring(0, 5) : dateStr;
}

async function fetchSheetData(sheet, query) {
  const url = buildGvizUrl(sheet, query);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return parseCSV(text);
}

async function loadAllData() {
  const [sacosLatest, sacosHistory, capasLatest, capasHistory, selvLatest] = await Promise.all([
    fetchSheetData(SHEETS.sacosArmAnt, 'SELECT * ORDER BY B DESC LIMIT 1'),
    fetchSheetData(SHEETS.sacosArmAnt, 'SELECT B,C,D,E,F,G,H,I ORDER BY B DESC LIMIT 100'),
    fetchSheetData(SHEETS.capas, "SELECT * WHERE A != 'periodo_inicio' ORDER BY B DESC LIMIT 1"),
    fetchSheetData(SHEETS.capas, "SELECT B,C,F,G,H,J WHERE A != 'periodo_inicio' ORDER BY B DESC LIMIT 100"),
    fetchSheetData(SHEETS.sacosSelvAnt, 'SELECT * ORDER BY B DESC LIMIT 1'),
  ]);

  return { sacosLatest, sacosHistory, capasLatest, capasHistory, selvLatest };
}

function updateKPIs(data) {
  const { sacosLatest, capasLatest, selvLatest } = data;

  if (sacosLatest.rows.length > 0) {
    const r = sacosLatest.rows[0];
    const total = parseNumber(r[7]);
    const tracker = parseNumber(r[6]);
    const armaduro = parseNumber(r[2]);
    const armaduro_antihumedad = parseNumber(r[3]);
    const selvalegre = parseNumber(r[4]);
    const campeon = parseNumber(r[5]);
    const durMin = parseNumber(r[8]);

    document.getElementById('totalSacos').textContent = formatNumber(total);
    document.getElementById('totalSacosTracker').textContent = `Tracker: ${formatNumber(tracker)}`;
    document.getElementById('totalArmaduro').textContent = formatNumber(armaduro);
    document.getElementById('armaduroAnti').textContent = `Armaduro Antihumedad: ${formatNumber(armaduro_antihumedad)}`;
    document.getElementById('totalSelvalegre').textContent = formatNumber(selvalegre);

    const hours = Math.floor(durMin / 60);
    const mins = Math.round(durMin % 60);
    document.getElementById('duracion').textContent = `${hours}h ${mins}m`;
    document.getElementById('periodoInfo').textContent = `Inicio: ${r[0] || '--'}`;

    const rate = durMin > 0 ? Math.round((total / durMin) * 60) : 0;
    document.getElementById('tasaProduccion').textContent = formatNumber(rate);
  }

  if (selvLatest.rows.length > 0) {
    const r = selvLatest.rows[0];
    const selvAnti = parseNumber(r[5]);
    document.getElementById('selvaAnti').textContent = `Selv-Anti: ${formatNumber(selvAnti)}`;
  }

  if (capasLatest.rows.length > 0) {
    const r = capasLatest.rows[0];
    const pallets = parseNumber(r[9]);
    const sacos = parseNumber(r[7]) || pallets * 5;
    document.getElementById('totalPallets').textContent = formatNumber(pallets);
    document.getElementById('palletsSacos').textContent = `Pallets: ${formatNumber(sacos)}`;
  }
}

function updateTable(data) {
  const { sacosHistory } = data;
  const tbody = document.getElementById('tableBody');
  const rows = sacosHistory.rows.slice(0, 100);

  document.getElementById('tableCount').textContent = `${rows.length} registros`;

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${formatTime(r[0])}</td>
      <td>${formatNumber(parseNumber(r[1]))}</td>
      <td>${formatNumber(parseNumber(r[2]))}</td>
      <td>${formatNumber(parseNumber(r[3]))}</td>
      <td>${formatNumber(parseNumber(r[4]))}</td>
      <td><strong>${formatNumber(parseNumber(r[6]))}</strong></td>
      <td>${formatNumber(parseNumber(r[5]))}</td>
      <td>${formatNumber(parseNumber(r[7]))}</td>
    </tr>
  `).join('');
}

function getChartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#9aa0b0', font: { family: 'Inter', size: 11 }, padding: 16 }
      },
      tooltip: {
        backgroundColor: '#1e2130',
        borderColor: '#2a2d3e',
        borderWidth: 1,
        titleColor: '#e8eaed',
        bodyColor: '#9aa0b0',
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont: { family: 'Inter' },
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y ?? ctx.parsed)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#6b7280', font: { family: 'Inter', size: 10 } },
        grid: { color: 'rgba(42,45,62,0.5)', drawBorder: false },
      },
      y: {
        ticks: {
          color: '#6b7280',
          font: { family: 'Inter', size: 10 },
          callback: (v) => formatNumber(v),
        },
        grid: { color: 'rgba(42,45,62,0.5)', drawBorder: false },
      },
    },
  };
}

function createAccumChart(data) {
  const rows = [...data.sacosHistory.rows].reverse();
  const labels = rows.map(r => formatTime(r[0]));
  const armaduro = [];
  const armaduro_antihumedad = [];
  const selvalegre = [];
  const campeon = [];
  const totals = [];

  rows.forEach(r => {
    armaduro.push(parseNumber(r[1]));
    armaduro_antihumedad.push(parseNumber(r[2]));
    selvalegre.push(parseNumber(r[3]));
    campeon.push(parseNumber(r[4]));
    totals.push(parseNumber(r[6]));
  });

  const ctx = document.getElementById('acumChart').getContext('2d');
  if (charts.acum) charts.acum.destroy();

  const defaults = getChartDefaults();
  charts.acum = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total',
          data: totals,
          borderColor: COLORS.total,
          backgroundColor: 'rgba(239,68,68,0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: 'Selvalegre',
          data: selvalegre,
          borderColor: COLORS.selvalegre,
          backgroundColor: 'rgba(111, 217, 84, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
        },
        {
          label: 'Armaduro',
          data: armaduro,
          borderColor: COLORS.armaduro,
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
        },
        {
          label: 'Armaduro Antihumedad',
          data: armaduro_antihumedad,
          borderColor: COLORS.armaduro_antihumedad,
          backgroundColor: 'rgba(139,92,246,0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
        },
      ],
    },
    options: {
      ...defaults,
      interaction: { mode: 'index', intersect: false },
    },
  });
}

function createPieChart(data) {
  if (!data.sacosLatest.rows.length) return;
  const r = data.sacosLatest.rows[0];
  const armaduro = parseNumber(r[2]);
  const armaduro_antihumedad = parseNumber(r[3]);
  const selvalegre = parseNumber(r[4]);
  const campeon = parseNumber(r[5]);

  const values = [armaduro, armaduro_antihumedad, selvalegre, campeon].filter(v => v > 0);
  const labels = [];
  const colors = [];
  if (armaduro > 0) { labels.push('Armaduro'); colors.push(COLORS.armaduro); }
  if (armaduro_antihumedad > 0) { labels.push('Armaduro Antihumedad'); colors.push(COLORS.armaduro_antihumedad); }
  if (selvalegre > 0) { labels.push('Selvalegre'); colors.push(COLORS.selvalegre); }
  if (campeon > 0) { labels.push('Campeón'); colors.push(COLORS.campeon); }

  const ctx = document.getElementById('pieChart').getContext('2d');
  if (charts.pie) charts.pie.destroy();

  charts.pie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: '#1e2130',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9aa0b0', font: { family: 'Inter', size: 11 }, padding: 12 },
        },
        tooltip: {
          backgroundColor: '#1e2130',
          borderColor: '#2a2d3e',
          borderWidth: 1,
          titleColor: '#e8eaed',
          bodyColor: '#9aa0b0',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return `${ctx.label}: ${formatNumber(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// function createBarChart(data) {
//   if (!data.sacosLatest.rows.length) return;
//   const r = data.sacosLatest.rows[0];
//   const items = [
//     { label: 'Armaduro', value: parseNumber(r[2]), color: COLORS.armaduro },
//     { label: 'Armaduro Antihumedad', value: parseNumber(r[3]), color: COLORS.armaduro_antihumedad },
//     { label: 'Selvalegre', value: parseNumber(r[4]), color: COLORS.selvalegre },
//     { label: 'Campeón', value: parseNumber(r[5]), color: COLORS.campeon },
//   ].filter(i => i.value > 0);
//   const ctx = document.getElementById('barChart').getContext('2d');
//   if (charts.bar) charts.bar.destroy();
//   const defaults = getChartDefaults();
//   charts.bar = new Chart(ctx, {
//     type: 'bar',
//     data: {
//       labels: items.map(i => i.label),
//       datasets: [{ label: 'Sacos', data: items.map(i => i.value),
//         backgroundColor: items.map(i => i.color + '80'),
//         borderColor: items.map(i => i.color),
//         borderWidth: 1, borderRadius: 6, barPercentage: 0.6 }],
//     },
//     options: { ...defaults, plugins: { ...defaults.plugins, legend: { display: false } } },
//   });
// }

function createBarChart(data) {
  const parseMs = s => s ? new Date(String(s).replace(' ', 'T')).getTime() : 0;

  // En modo en vivo filtra últimas 6h; en modo historial usa todos los datos del rango
  let sacosRows = [...data.sacosHistory.rows].reverse();
  if (!rangeMode) {
    const sixHoursAgo = Date.now() - 6 * 3600 * 1000;
    sacosRows = sacosRows.filter(r => parseMs(r[0]) >= sixHoursAgo);
  }

  // Capas: revertir a ASC
  const capasRows = [...data.capasHistory.rows].reverse();

  const labels = sacosRows.map(r => formatTime(r[0]));
  const sacosData = sacosRows.map(r => parseNumber(r[6])); // H = total sacos

  // Para cada timestamp de sacos, buscar el valor de pallets más cercano en capas
  const capasData = sacosRows.map(r => {
    const t = parseMs(r[0]);
    if (!capasRows.length) return 0;
    let best = capasRows[0];
    let minDiff = Math.abs(parseMs(capasRows[0][0]) - t);
    for (const cr of capasRows) {
      const diff = Math.abs(parseMs(cr[0]) - t);
      if (diff < minDiff) { minDiff = diff; best = cr; }
    }
    return parseNumber(best[5]); // J = total pallets acumulados
  });

  const ctx = document.getElementById('barChart').getContext('2d');
  if (charts.bar) charts.bar.destroy();

  const defaults = getChartDefaults();
  charts.bar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Sacos',
          data: sacosData,
          // backgroundColor: COLORS.total + '70',
          // borderColor: COLORS.total,
          backgroundColor: '#2fd726' + '70',
          borderColor: '#2fd726',
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.75,
        },
        {
          label: 'Total Pallets',
          data: capasData,
          // backgroundColor: COLORS.pallet + '70',
          // borderColor: COLORS.pallet,
          backgroundColor: '#ff6a00' + '70',
          borderColor: '#f36500',
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.75,
        },
      ],
    },
    options: {
      ...defaults,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ...defaults.plugins,
        legend: {
          labels: { color: '#9aa0b0', font: { family: 'Inter', size: 11 }, padding: 16 },
        },
      },
    },
  });
}

function createPalletChart(data) {
  const rows = [...data.capasHistory.rows].reverse();
  const labels = rows.map(r => formatTime(r[0]));
  const pallets = rows.map(r => parseNumber(r[3]) || parseNumber(r[1]));

  const ctx = document.getElementById('palletChart').getContext('2d');
  if (charts.pallet) charts.pallet.destroy();

  const defaults = getChartDefaults();
  charts.pallet = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Pallets Acum.',
        data: pallets,
        borderColor: COLORS.pallet,
        backgroundColor: 'rgba(249,115,22,0.1)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
      }],
    },
    options: {
      ...defaults,
      plugins: {
        ...defaults.plugins,
        legend: { display: false },
      },
    },
  });
}

function startRefreshTimer() {
  const now = new Date();
  const msElapsed = (now.getMinutes() % 15) * 60000 + now.getSeconds() * 1000 + now.getMilliseconds();
  const msUntilNext = REFRESH_INTERVAL - msElapsed;

  setTimeout(() => {
    refreshData();
    setInterval(refreshData, REFRESH_INTERVAL);
  }, msUntilNext);
}

function toggleRangePanel() {
  if (rangeMode) {
    clearRangeFilter();
    return;
  }
  const section = document.getElementById('rangeSection');
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

function setPreset(hours) {
  const now   = new Date();
  const start = new Date(now.getTime() - hours * 3600000);
  const fmt   = d => {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  document.getElementById('rfStart').value = fmt(start);
  document.getElementById('rfEnd').value   = fmt(now);
  applyRangeFilter();
}

async function loadRangeData(startDt, endDt) {
  const inRange = r => {
    const dt = r[1] ? String(r[1]).substring(0, 16) : '';
    return dt >= startDt && dt <= endDt;
  };

  const toMs = s => s ? new Date(String(s).replace(' ', 'T')).getTime() : 0;

  // delta entre fila inicio y fin del rango; si es negativo (reset) usa valor final
  const delta = (endRow, startRow, col) => {
    const d = parseNumber(endRow[col]) - parseNumber(startRow[col]);
    return String(d >= 0 ? d : parseNumber(endRow[col]));
  };

  const [sacosAll, capasAll, selvAll] = await Promise.all([
    fetchSheetData(SHEETS.sacosArmAnt, 'SELECT * ORDER BY B DESC LIMIT 5000'),
    fetchSheetData(SHEETS.capas, "SELECT * WHERE A != 'periodo_inicio' ORDER BY B DESC LIMIT 5000"),
    fetchSheetData(SHEETS.sacosSelvAnt, 'SELECT * ORDER BY B DESC LIMIT 5000'),
  ]);

  const sacosFiltered = sacosAll.rows.filter(inRange); // DESC: [0]=más reciente
  const capasFiltered = capasAll.rows.filter(inRange);
  const selvFiltered  = selvAll.rows.filter(inRange);

  // ── Sacos KPI: usa la fila más reciente del rango + duración calculada ──
  const sacosEnd   = sacosFiltered[0];
  const sacosStart = sacosFiltered[sacosFiltered.length - 1];
  let sacosKpiRow;
  if (sacosEnd) {
    sacosKpiRow = [...sacosEnd]; // copia la fila más reciente (valores acumulados al fin del rango)
    if (sacosStart && sacosEnd !== sacosStart) {
      // Reemplaza solo la duración con el tiempo real del rango seleccionado
      const durMin = Math.round((toMs(sacosEnd[1]) - toMs(sacosStart[1])) / 60000);
      sacosKpiRow[0] = sacosStart[1]; // periodo_inicio = primer timestamp del rango
      sacosKpiRow[8] = String(durMin);
    }
  }

  // ── Capas KPI: fila más reciente del rango ───────────────────────────────
  const capasEnd   = capasFiltered[0];
  const capasStart = capasFiltered[capasFiltered.length - 1];
  const capasKpiRow = capasEnd ? [...capasEnd] : undefined;

  // ── Selvalegre KPI ───────────────────────────────────────────────────────
  const selvEnd   = selvFiltered[0];
  const selvStart = selvFiltered[selvFiltered.length - 1];
  let selvKpiRow;
  if (selvEnd && selvStart && selvEnd !== selvStart) {
    selvKpiRow = [...selvEnd];
    const dSelv = parseNumber(selvEnd[5]) - parseNumber(selvStart[5]);
    selvKpiRow[5] = String(dSelv >= 0 ? dSelv : parseNumber(selvEnd[5]));
  } else {
    selvKpiRow = selvEnd;
  }

  // ── Convertir para gráficos (sin cambios) ────────────────────────────────
  const sacosHistRows = sacosFiltered.map(r => [r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]]);
  // capas SELECT *: A(0) B(1) C(2) D(3) E(4) F(5) G(6) H(7) I(8) J(9)
  const capasHistRows = capasFiltered.map(r => [r[1], r[2], r[5], r[6], r[7], r[9]]);

  return {
    sacosLatest:  { headers: sacosAll.headers,          rows: sacosKpiRow ? [sacosKpiRow] : [] },
    sacosHistory: { headers: sacosAll.headers.slice(1), rows: sacosHistRows },
    capasLatest:  { headers: capasAll.headers,          rows: capasKpiRow ? [capasKpiRow] : [] },
    capasHistory: { headers: capasAll.headers.slice(1), rows: capasHistRows },
    selvLatest:   { headers: selvAll.headers,           rows: selvKpiRow  ? [selvKpiRow]  : [] },
  };
}

async function applyRangeFilter() {
  const startEl = document.getElementById('rfStart');
  const endEl   = document.getElementById('rfEnd');
  const status  = document.getElementById('rfStatus');
  const btn     = document.getElementById('rfApplyBtn');

  if (!startEl.value || !endEl.value) {
    status.style.color = 'var(--red)';
    status.textContent = 'Seleccione fecha de inicio y fin.';
    return;
  }
  if (startEl.value >= endEl.value) {
    status.style.color = 'var(--red)';
    status.textContent = 'La fecha de inicio debe ser anterior a la fecha fin.';
    return;
  }

  btn.disabled = true;
  status.style.color = 'var(--text-muted)';
  status.textContent = 'Cargando datos del rango...';

  try {
    const data = await loadRangeData(
      startEl.value.replace('T', ' '),
      endEl.value.replace('T', ' ')
    );

    rangeMode = true;
    const badge = document.getElementById('statusBadge');
    badge.classList.remove('error');
    badge.classList.add('historical');
    badge.querySelector('span:last-child').textContent = 'Historial';

    updateKPIs(data);
    updateTable(data);
    createAccumChart(data);
    createPieChart(data);
    createBarChart(data);

    const n = data.sacosHistory.rows.length;
    status.style.color = n > 0 ? 'var(--green)' : 'var(--orange)';
    status.textContent = n > 0 ? `${n} registro(s) en el rango seleccionado.` : 'Sin datos en ese período.';
  } catch (err) {
    status.style.color = 'var(--red)';
    status.textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function clearRangeFilter() {
  rangeMode = false;
  document.getElementById('rangeSection').style.display = 'none';
  document.getElementById('rfStatus').textContent = '';
  const badge = document.getElementById('statusBadge');
  badge.classList.remove('historical');
  badge.querySelector('span:last-child').textContent = 'En vivo';
  await refreshData();
}

async function refreshData() {
  if (rangeMode) return;
  try {
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.classList.remove('error');
    statusBadge.querySelector('span:last-child').textContent = 'Actualizando...';

    const data = await loadAllData();
    updateKPIs(data);
    updateTable(data);
    createAccumChart(data);
    createPieChart(data);
    createBarChart(data);


    const now = new Date();
    document.getElementById('lastUpdate').textContent =
      now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    statusBadge.querySelector('span:last-child').textContent = 'En vivo';
  } catch (err) {
    console.error('Error refreshing data:', err);
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.classList.add('error');
    statusBadge.querySelector('span:last-child').textContent = `Error: ${err.message}`;
  }
}

function initCameraFeeds() {
  const cameras = [
    { key: 'sacos',   videoId: 'cam1Video', statusId: 'cam1Status', offlineId: 'cam1Offline' },
    { key: 'pallets', videoId: 'cam2Video', statusId: 'cam2Status', offlineId: 'cam2Offline' },
  ];

  cameras.forEach(({ key, videoId, statusId, offlineId }) => {
    const video = document.getElementById(videoId);
    const statusEl = document.getElementById(statusId);
    const offlineEl = document.getElementById(offlineId);
    const url = CAMERA_STREAMS[key];

    const setOnline = () => {
      offlineEl.style.display = 'none';
      video.style.display = 'block';
      statusEl.classList.remove('error');
      statusEl.querySelector('span:last-child').textContent = 'En vivo';
    };

    const setOffline = () => {
      offlineEl.style.display = 'flex';
      video.style.display = 'none';
      statusEl.classList.add('error');
      statusEl.querySelector('span:last-child').textContent = 'Sin señal';
    };

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 1, liveMaxLatencyDurationCount: 3, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play(); setOnline(); });
      hls.on(Hls.Events.ERROR, (e, data) => { if (data.fatal) setOffline(); });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => { video.play(); setOnline(); });
      video.addEventListener('error', setOffline);
    } else {
      setOffline();
    }
  });
}

async function init() {
  try {
    await refreshData();
    document.getElementById('loadingOverlay').classList.add('hidden');
    startRefreshTimer();
    initCameraFeeds();
  } catch (err) {
    console.error('Init error:', err);
    document.getElementById('loadingOverlay').innerHTML =
      `<p style="color: var(--red);">Error al cargar datos. Verifique la conexión.</p>
       <button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;background:var(--blue);color:white;border:none;border-radius:8px;cursor:pointer;">Reintentar</button>`;
  }
}

function toggleCameras() {
  const section = document.getElementById('camerasSection');
  const btn = document.getElementById('camToggleBtn');
  const visible = section.style.display !== 'none';
  section.style.display = visible ? 'none' : 'grid';
  btn.classList.toggle('active', !visible);
}

function toggleDownload() {
  const section = document.getElementById('downloadSection');
  const btn = document.querySelector('.export-btn');
  const visible = section.style.display !== 'none';
  section.style.display = visible ? 'none' : 'block';
  btn.classList.toggle('active', !visible);
}

async function downloadData() {
  const startEl = document.getElementById('dlStart');
  const endEl = document.getElementById('dlEnd');
  const sheetSel = document.getElementById('dlSheet');
  const btn = document.getElementById('dlBtn');
  const status = document.getElementById('dlStatus');

  if (!startEl.value || !endEl.value) {
    status.style.color = 'var(--red)';
    status.textContent = 'Seleccione fecha de inicio y fin.';
    return;
  }
  if (startEl.value >= endEl.value) {
    status.style.color = 'var(--red)';
    status.textContent = 'La fecha de inicio debe ser anterior a la fecha fin.';
    return;
  }

  const startDt = startEl.value.replace('T', ' ');
  const endDt = endEl.value.replace('T', ' ');
  const sheetType = sheetSel.value;

  btn.disabled = true;
  status.style.color = 'var(--text-muted)';
  status.textContent = 'Consultando datos...';

  const inRange = (r) => {
    const dt = r[1] ? String(r[1]).substring(0, 16) : '';
    return dt >= startDt && dt <= endDt;
  };

  try {
    const wb = XLSX.utils.book_new();
    let totalRows = 0;

    if (sheetType === 'sacos' || sheetType === 'ambos') {
      const data = await fetchSheetData(SHEETS.sacosArmAnt, 'SELECT * ORDER BY B');
      const filtered = data.rows.filter(inRange);
      const wsData = [data.headers, ...filtered];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Sacos-Arm-Ant');
      totalRows += filtered.length;
    }

    if (sheetType === 'capas' || sheetType === 'ambos') {
      const data = await fetchSheetData(SHEETS.capas, 'SELECT * ORDER BY B');
      const filtered = data.rows.filter(inRange);
      const wsData = [data.headers, ...filtered];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Capas-Total-Arm');
      totalRows += filtered.length;
    }

    const fromLabel = startEl.value.replace('T', '_').replace(':', 'h').substring(0, 13);
    const toLabel = endEl.value.replace('T', '_').replace(':', 'h').substring(0, 13);
    XLSX.writeFile(wb, `Conteo Sacos_${fromLabel}_a_${toLabel}.xlsx`);

    status.style.color = totalRows > 0 ? 'var(--green)' : 'var(--orange)';
    status.textContent = totalRows > 0
      ? `Descargado: ${totalRows} registro(s).`
      : 'No se encontraron registros en ese período.';
  } catch (err) {
    status.style.color = 'var(--red)';
    status.textContent = 'Error al descargar: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

// ── Autenticación ─────────────────────────────────────────────────────────────

function handleLogin(e) {
  e.preventDefault();
  const user  = document.getElementById('loginUser').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const error = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');

  if (user === CONFIG.AUTH.USER && pass === CONFIG.AUTH.PASS) {
    sessionStorage.setItem('unacem_auth', btoa(`${user}:${Date.now()}`));
    document.getElementById('loginOverlay').classList.add('hidden');
    init();
  } else {
    error.textContent = 'Usuario o contraseña incorrectos.';
    btn.disabled = true;
    setTimeout(() => { btn.disabled = false; }, 2000); // bloqueo 2s anti-fuerza bruta
  }
}

function togglePassword() {
  const input = document.getElementById('loginPass');
  const icon  = document.getElementById('eyeIcon');
  const show  = input.type === 'password';
  input.type  = show ? 'text' : 'password';
  icon.innerHTML = show
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

function logout() {
  sessionStorage.removeItem('unacem_auth');
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('unacem_auth')) {
    document.getElementById('loginOverlay').classList.add('hidden');
    init();
  }
});
