/**
 * Köln Live-Monitor — lightweight inline-SVG chart helpers.
 * No dependency, no new package: Design Rebuild Phase 1 needs sparklines
 * and small bar charts (KPI cards, Analytics tab) and none existed before.
 * Every call site passes real values from state.dataStores - never fake
 * placeholder data.
 */

/**
 * Renders a sparkline (area + line + emphasized last point) into containerEl.
 * @param {HTMLElement} containerEl
 * @param {number[]} values - chronological, oldest first
 * @param {{color?: string}} [opts]
 */
export function renderSparkline(containerEl, values, opts = {}) {
  if (!containerEl) return;
  const color = opts.color || '#00f0ff';

  const clean = (values || []).filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length < 2) {
    // Not enough history yet - render nothing rather than a fake flat line.
    containerEl.innerHTML = '';
    return;
  }

  const w = 100;
  const h = 32;
  const pad = 3;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;

  const points = clean.map((v, i) => {
    const x = (i / (clean.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1][0].toFixed(2)} ${h - pad} L ${points[0][0].toFixed(2)} ${h - pad} Z`;
  const [lastX, lastY] = points[points.length - 1];
  const gradId = `spark-grad-${Math.random().toString(36).slice(2, 9)}`;

  containerEl.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%; height:100%; display:block; overflow:visible;">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="2.2" fill="${color}">
        <animate attributeName="r" values="2.2;3;2.2" dur="1.8s" repeatCount="indefinite"/>
      </circle>
    </svg>
  `;
}

/**
 * Renders a small vertical bar chart into containerEl.
 * @param {HTMLElement} containerEl
 * @param {{label: string, value: number, color?: string}[]} data
 * @param {{unit?: string, defaultColor?: string}} [opts]
 */
export function renderBarChart(containerEl, data, opts = {}) {
  if (!containerEl) return;
  const clean = (data || []).filter(d => typeof d.value === 'number' && !Number.isNaN(d.value));
  if (clean.length === 0) {
    containerEl.innerHTML = '<div class="chart-empty-note">Keine Daten verfügbar</div>';
    return;
  }

  const defaultColor = opts.defaultColor || '#00f0ff';
  const max = Math.max(...clean.map(d => d.value), 1);
  const unit = opts.unit || '';

  containerEl.innerHTML = `
    <div class="bar-chart-row">
      ${clean.map(d => {
        const pct = Math.max(4, Math.round((d.value / max) * 100));
        const color = d.color || defaultColor;
        return `
          <div class="bar-chart-col" title="${escapeChartHtml(d.label)}: ${d.value}${unit}">
            <div class="bar-chart-val mono">${d.value}${unit}</div>
            <div class="bar-chart-track">
              <div class="bar-chart-fill" style="height:${pct}%; background:${color}; box-shadow:0 0 8px ${color}66;"></div>
            </div>
            <div class="bar-chart-label mono">${escapeChartHtml(d.label)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function escapeChartHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
