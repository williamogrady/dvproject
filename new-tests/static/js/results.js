// /new-tests/static/js/results.js
(() => {
  'use strict';

  const veil  = document.getElementById('veil');
  const panel = veil ? veil.querySelector('.panel') : null;

  let data = null;
  try { data = JSON.parse(sessionStorage.getItem('dv_last_results') || 'null'); } catch {}

  if (!panel) {
    console.warn('Results: panel not found');
    document.body.innerHTML = '<pre>Results panel not found.</pre>';
    return;
  }

  // ===== Shared inline styles (bigger, centered) =====
  const S = {
    shell: `
      max-width: 960px; margin: 0 auto; text-align: center;
      padding: 36px 20px 40px;
    `,
    h1: `
      margin: 0 0 18px; font-size: 40px; line-height: 1.2;
      letter-spacing: .2px;
    `,
    subrow: `
      display: flex; justify-content: center; gap: 16px; flex-wrap: wrap;
      margin-bottom: 18px;
    `,
    pill: `
      background: #0f172a; color: #e2e8f0;
      padding: 12px 18px; border-radius: 999px;
      font-size: 18px;
    `,
    chartSection: `margin: 20px 0 28px;`,
    chartTitle: `margin: 0 0 10px; font-size: 22px;`,
    chartWrap: `width: 100%; max-width: 900px; margin: 0 auto; position: relative;`,
    hint: `opacity:.75; font-size: 16px; margin-top: 10px;`,
    actions: `
      display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
      margin-top: 18px; justify-content: center;
    `,
    btn: `
      display: inline-flex; align-items: center; justify-content: center;
      background: #334155; color: #e2e8f0; text-decoration: none;
      padding: 14px 22px; border-radius: 14px; font-size: 18px;
      border: 1px solid rgba(255,255,255,.08);
      transition: transform .06s ease;
    `,
    btnHover: `:hover{ transform: translateY(-1px); }`,
    msg: `margin-top: 12px; min-height: 1.6em; opacity:.9; text-align:center; font-size:16px;`,
  };

  // ===== No results state =====
  if (!data || !Array.isArray(data.logs)) {
    panel.innerHTML = `
      <div style="${S.shell}">
        <h1 style="${S.h1}">Results</h1>
        <p style="opacity:.85; font-size:18px">We couldn't find a completed run in this browser session.</p>
        <div id="actions" style="${S.actions}">
          <a href="/test" class="btn" style="${S.btn}">Try Again</a>
          <a href="/"      class="btn" style="${S.btn}">Go Home</a>
        </div>
      </div>`;
    return;
  }

// ===== Extract steps (per-task) =====
const views     = data.logs.filter(l => l.type === 'view' && l.end && l.start);
const labels    = views.map((_, i) => String(i + 1));
const secondsOf = v => Math.max(0, Math.round((v.end - v.start) / 1000));
const durations = views.map(secondsOf);

// Minimal step objects for CSV + summary (simple completion rule)
const steps = views.map((v, i) => {
  const snap    = v.snapshot || {};
  const reason  = String(v.reason || '').toLowerCase();

  // Treat any submission as a completed task on the summary page
  const didSubmit =
    reason === 'done' ||
    reason === 'submitted' ||
    reason === 'complete' ||
    reason === 'overlayclosed' ||     // overlay was shown & dismissed
    reason === 'submit(fallback)';    // legacy

  const completed = !!didSubmit;

  return {
    index: i + 1,
    scenarioId: v.scenarioId || v.scenario || '',
    secs: secondsOf(v),
    completed
  };
});


const completedCount = steps.filter(s => s.completed).length;


  // ===== UI: bigger, centered layout =====
  panel.innerHTML = `
    <div style="${S.shell}">
      <h1 style="${S.h1}">Results</h1>

      <div style="${S.subrow}">
        <div class="pill" style="${S.pill}">
          ✅ Tasks completed: <b>${completedCount}</b> / <b>${steps.length}</b>
        </div>
      </div>

      <div id="chart-section" style="${S.chartSection}">
        <h3 style="${S.chartTitle}">Time per task</h3>
        <div id="chart-wrap" style="${S.chartWrap}">
          <canvas id="chart-time-line" height="260" style="display:block; width:100%"></canvas>
        </div>
        <div style="${S.hint}">Lower is faster</div>
      </div>

      <div id="actions" style="${S.actions}">
        <button id="btn-csv" class="btn" style="${S.btn}">Export data to CSV</button>
        <a href="/test" class="btn" style="${S.btn}">Try Again</a>
        <a href="/"      class="btn" style="${S.btn}">Go Home</a>
      </div>

      <div id="msg" style="${S.msg}"></div>
    </div>
  `;

 // ===== Chart: stable sizing (no warp) =====
const $canvas = document.getElementById('chart-time-line');
const $wrap   = document.getElementById('chart-wrap');

let isAnimating = true;        // block redraws during the reveal
let lastW = 0;

// one animated draw on first layout
drawLine($canvas, $wrap, labels, durations, {
  yLabel: 'time',
  yFormat: 'mm:ss',
  animate: true,
  onDone: () => { isAnimating = false; }
});

// Tooltip once; it uses geometry stored on canvas by drawLine()
attachLineTooltip($canvas, $wrap, { yFormat: 'mm:ss' });

function redrawIfNeeded() {
  if (isAnimating) return;     // don't redraw mid-animation
  const w = Math.floor($wrap?.clientWidth || 0);
  if (!w || w === lastW) return;
  lastW = w;
  drawLine($canvas, $wrap, labels, durations, { yLabel: 'time', yFormat: 'mm:ss', animate: false });
}

if ('ResizeObserver' in window) {
  let roPending = false;
  const ro = new ResizeObserver(() => {
    if (!roPending) {
      roPending = true;
      requestAnimationFrame(() => { roPending = false; redrawIfNeeded(); });
    }
  });
  ro.observe($wrap);
} else {
  let roPending = false;
  window.addEventListener('resize', () => {
    if (!roPending) {
      roPending = true;
      requestAnimationFrame(() => { roPending = false; redrawIfNeeded(); });
    }
  });
}

  // ===== CSV export (instant) =====
  const $csv = document.getElementById('btn-csv');
  const $msg = document.getElementById('msg');

  $csv?.addEventListener('click', () => {
    const payload = buildPayloadMinimal(steps, data);
    const csv     = buildCSVMinimal(payload);
    downloadBlob(csv, `dv-results_${tsSlug(new Date())}.csv`, 'text/csv');
    $msg.textContent = 'CSV downloaded.';
  });

  // =================== Helpers ===================

  // Minimal payload per final schema:
  // run: { participant_id, sequence: "A"|"B"|"C"|"D" }
  // steps: [ { scenario, seconds, completed } ]
  function buildPayloadMinimal(stepArr, srcData) {
    const participant_id =
      srcData.participant_id ||
      srcData.runner?.participant_id ||
      srcData.plan?.participant_id ||
      "anon";

    let sequence =
      srcData.sequence ||
      srcData.runner?.sequence ||
      srcData.plan?.sequence ||
      null;

    if (typeof sequence === 'number') sequence = ['A','B','C','D'][sequence] || null;

    return {
      participant_id,
      sequence, // "A" | "B" | "C" | "D" (or null if missing)
      steps: stepArr.map(s => ({
        scenario: s.scenarioId || s.scenario || '',
        seconds: Math.max(0, Math.round(Number(s.secs) || 0)),
        completed: !!s.completed
      }))
    };
  }

  function buildCSVMinimal(payload) {
    const header = ['participant_id','sequence','scenario','seconds','completed'];
    const rows = payload.steps.map(st => ([
      csvSafe(payload.participant_id),
      csvSafe(payload.sequence),
      csvSafe(st.scenario),
      String(st.seconds),
      st.completed ? '1' : '0'
    ]));
    return [header.join(','), ...rows.map(r => r.join(','))].join('\n');

    function csvSafe(v){ return (v == null) ? '' : String(v).replace(/"/g,'""'); }
  }

  function downloadBlob(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function tsSlug(d){
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }
// Format seconds as mm:ss
function fmtMMSS(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}

// Draw the line chart; stores geometry on canvas for tooltip
function drawLine(canvas, container, labels, values, { yLabel, yFormat = 'seconds', animate = false, onDone } = {}) {
  if (!canvas || !container || !labels?.length || !values?.length) return;

  const dpr  = window.devicePixelRatio || 1;
  const cssW = Math.floor(container.clientWidth || container.getBoundingClientRect().width || 0);
  if (cssW <= 0) return;

  const Hcss = canvas.height; // fixed via the height attribute
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(Hcss * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const max = Math.max(1, ...values);
  const min = 0;
  const left = 50, right = 14, top = 16, bottom = 38;
  const w = cssW - left - right, h = Hcss - top - bottom;

  function yFormatLabel(sec) {
    return (yFormat === 'mm:ss') ? fmtMMSS(sec) : String(sec);
  }

  function drawAxes() {
    ctx.clearRect(0, 0, cssW, Hcss);

    // baseline
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(left, top + h, w, 1);

    // y ticks
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const y = top + h - (h * i / ticks);
      const secVal = (min + (max - min) * i / ticks);
      const label = yFormatLabel(secVal);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(left, y, w, i === 0 ? 1 : 0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(label, left - 8, y);
    }
    if (yLabel) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(yLabel, left, top - 6);
    }
  }

  // Precompute points
  const pts = labels.map((_, i) => {
    const x = left + (w * (labels.length <= 1 ? 0 : i / (labels.length - 1)));
    const v = values[i];
    const y = top + h - ((v - min) / (max - min || 1)) * h;
    return [x, y];
  });

  function drawFull() {
    // full line + markers + x labels (once)
    ctx.strokeStyle = 'rgba(99,102,241,0.98)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(99,102,241,0.98)';
    for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }

    // x labels (sparse)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i < labels.length; i++) {
      const [x] = pts[i];
      if (labels.length <= 12 || i % Math.ceil(labels.length / 12) === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(labels[i], x, top + h + 8);
      }
    }
  }

  if (!animate) {
    drawAxes();
    drawFull();
    // store geometry for tooltip lookups
    canvas.__dv = { labels, values, pts, box: { left, top, w, h }, yFormat };
    if (typeof onDone === 'function') onDone();
    return;
  }

  // Animated reveal (no duplicate draw after)
  let t0 = null;
  const totalLen = (() => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i-1][0];
      const dy = pts[i][1] - pts[i-1][1];
      len += Math.hypot(dx, dy);
    }
    return Math.max(1, len);
  })();

  function frame(now) {
    if (t0 == null) t0 = now;
    const p = Math.min(1, (now - t0) / 900); // ≈0.9s reveal

    drawAxes();

    // draw partial line up to p
    ctx.strokeStyle = 'rgba(99,102,241,0.98)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);

    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i-1];
      const [x1, y1] = pts[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (acc + seg <= totalLen * p) {
        ctx.lineTo(x1, y1);
        acc += seg;
      } else {
        const r = (totalLen * p - acc) / seg;
        const xi = x0 + (x1 - x0) * r;
        const yi = y0 + (y1 - y0) * r;
        ctx.lineTo(xi, yi);
        acc = totalLen * p;
        break;
      }
    }
    ctx.stroke();

    if (p < 1) requestAnimationFrame(frame);
    else {
      drawAxes();
      drawFull();
      canvas.__dv = { labels, values, pts, box: { left, top, w, h }, yFormat };
      if (typeof onDone === 'function') onDone();
    }
  }

  requestAnimationFrame(frame);
}

// Tooltip: DOM element over canvas, nearest-point lookup
function attachLineTooltip(canvas, container, { yFormat = 'seconds' } = {}) {
  // Create tooltip dom
  const tip = document.createElement('div');
  Object.assign(tip.style, {
    position: 'absolute',
    zIndex: 10,
    pointerEvents: 'none',
    padding: '6px 8px',
    borderRadius: '8px',
    background: 'rgba(17,24,39,.95)',
    color: '#e5e7eb',
    font: '13px system-ui, sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,.35)',
    transform: 'translate(-50%, -120%)',
    display: 'none'
  });
  container.style.position = container.style.position || 'relative';
  container.appendChild(tip);

  function fmtY(sec) {
    return (yFormat === 'mm:ss') ? fmtMMSS(sec) : String(Math.round(sec));
  }

  function nearestPt(mx, my, pts) {
    let best = { i: -1, d2: Infinity };
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const dx = mx - x, dy = my - y;
      const d2 = dx*dx + dy*dy;
      if (d2 < best.d2) best = { i, d2 };
    }
    return best;
  }

  function onMove(e) {
    const g = canvas.__dv;
    if (!g) return;

    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // outside plot area?
    const { left, top, w, h } = g.box;
    if (mx < left || mx > left + w || my < top || my > top + h) {
      tip.style.display = 'none';
      return;
    }

    // find nearest point
    const { i, d2 } = nearestPt(mx, my, g.pts || []);
    if (i < 0 || d2 > 25*25) { // 25px radius threshold
      tip.style.display = 'none';
      return;
    }

    const [px, py] = g.pts[i];
    const label = g.labels[i];
    const val   = g.values[i];

    tip.innerHTML = `<b>Task ${label}</b><br>${fmtY(val)}`;
    tip.style.left = `${px}px`;
    tip.style.top  = `${py}px`;
    tip.style.display = 'block';
  }

  function onLeave() {
    tip.style.display = 'none';
  }

  container.addEventListener('mousemove', onMove);
  container.addEventListener('mouseleave', onLeave);
}

})();
