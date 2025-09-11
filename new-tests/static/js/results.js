// /new-tests/static/js/results.js
(() => {
  'use strict';

  // ----- DOM target (use the existing panel inside results.html) -----
  const veil = document.getElementById('veil');
  const panel = veil ? veil.querySelector('.panel') : null;

  // ----- Load payload from the runner -----
  let data = null;
  try { data = JSON.parse(sessionStorage.getItem('dv_last_results') || 'null'); } catch {}

  if (!panel) {
    console.warn('Results: panel not found');
    document.body.innerHTML = '<pre>Results panel not found.</pre>';
    return;
  }
  if (!data || !Array.isArray(data.logs)) {
    panel.innerHTML = `
      <h1>No results</h1>
      <p style="opacity:.85">We couldn't find a completed run in this browser session.</p>
      <div style="margin-top:12px;display:flex;gap:10px;justify-content:center">
        <a class="btn" href="/test" style="background:#334155;color:#e2e8f0;text-decoration:none;padding:10px 14px;border-radius:10px">Run a test</a>
        <a class="btn" href="/"      style="background:#334155;color:#e2e8f0;text-decoration:none;padding:10px 14px;border-radius:10px">Home</a>
      </div>`;
    return;
  }

  // ----- Extract view steps -----
  const views = data.logs.filter(l => l.type === 'view' && l.end && l.start);
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const dur = v => Math.max(0, Math.round((v.end - v.start) / 1000));
  const labels = views.map((v, i) => `${i + 1}. ${v.view.toUpperCase()}`);

  const durations   = views.map(dur);
  const powers      = views.map(v => safeNum(v.snapshot?.totals?.power));
  const costs       = views.map(v => safeNum(v.snapshot?.totals?.cost));
  const emissions   = views.map(v => safeNum(v.snapshot?.totals?.emissions));
  const overloadeds = views.map(v => safeNum(v.snapshot?.state?.overloaded_count));

  const totalTime = durations.reduce((a, b) => a + b, 0);

  // ----- Build UI skeleton -----
  panel.innerHTML = `
    <h1 style="margin-bottom:6px">Results</h1>
    <div class="muted" style="opacity:.85;margin-bottom:16px">
      Completed <b>${views.length}</b> levels · Total time <b>${fmt(totalTime)}</b>
    </div>

    <div id="chart-wrap" style="display:grid;gap:16px;margin:12px 0">
      <div>
        <h3 style="margin:0 0 6px">Time per level</h3>
        <canvas id="chart-time" height="180"></canvas>
      </div>
      <div>
        <h3 style="margin:0 0 6px">Cost & Emissions per level</h3>
        <canvas id="chart-metrics" height="220"></canvas>
      </div>
    </div>

    <div id="table-wrap" style="margin:16px 0"></div>

    <div id="actions" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:10px">
      <label style="display:flex;align-items:center;gap:8px;background:#111827;padding:8px 12px;border-radius:10px">
        <input id="save-toggle" type="checkbox"> Save to server
      </label>
      <label style="display:flex;align-items:center;gap:8px;background:#111827;padding:8px 12px;border-radius:10px">
        <input id="include-snapshots" type="checkbox" checked> Include raw snapshots
      </label>
      <button id="btn-save" class="btn" style="background:#22c55e;color:#052e16">Save</button>
      <button id="btn-download" class="btn" style="background:#334155;color:#e2e8f0">Download JSON</button>
      <a href="/test" class="btn" style="background:#334155;color:#e2e8f0;text-decoration:none">Run another test</a>
      <a href="/"      class="btn" style="background:#334155;color:#e2e8f0;text-decoration:none">Home</a>
    </div>
    <div id="msg" style="margin-top:8px;min-height:1.2em;opacity:.9"></div>
  `;

  // ----- Table -----
  const tWrap = panel.querySelector('#table-wrap');
  tWrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">#</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">View</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Scenario</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Time</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Ended</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Power</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Cost</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Emissions</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Overloads</th>
      </tr></thead>
      <tbody>
        ${views.map((v, i) => {
          const secs = durations[i];
          const totals = v.snapshot?.totals || {};
          const ended = v.reason || 'done';
          return `
            <tr>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${i + 1}</td>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${esc(v.view)}</td>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${esc(v.scenarioId || '')}</td>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${fmt(secs)}</td>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)"><span class="pill" style="background:#1f2937;padding:4px 8px;border-radius:999px">${esc(ended)}</span></td>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${num(totals.power)}</td>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${num(totals.cost)}</td>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${num(totals.emissions)}</td>
              <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${num(v.snapshot?.state?.overloaded_count)}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  // ----- Charts -----
  drawBars(document.getElementById('chart-time'), labels, [
    { name: 'Time (s)', values: durations }
  ], { yLabel: 'seconds' });

  drawBarsGrouped(document.getElementById('chart-metrics'), labels, [
    { name: 'Cost',      values: costs },
    { name: 'Emissions', values: emissions }
  ], { yLabel: 'value' });

  // ----- Actions -----
  const $save   = document.getElementById('btn-save');
  const $dl     = document.getElementById('btn-download');
  const cbSave  = document.getElementById('save-toggle');
  const cbSnap  = document.getElementById('include-snapshots');
  const $msg    = document.getElementById('msg');

  $save.addEventListener('click', async () => {
    const payload = buildPayload(data, { includeSnapshots: cbSnap.checked });
    // Always allow download-only; server save only if checkbox checked
    if (cbSave.checked) {
      try {
        const res = await fetch('/api/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ save: true, run: payload })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json().catch(() => ({}));
        $msg.textContent = j.message || 'Saved to server.';
      } catch (e) {
        $msg.textContent = 'Save failed. Check server logs.';
        console.error('Save failed', e);
      }
    } else {
      $msg.textContent = '“Save to server” is off. Use Download to store locally.';
    }
  });

  $dl.addEventListener('click', () => {
    const payload = buildPayload(data, { includeSnapshots: cbSnap.checked });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = `dv-results_${tsSlug(new Date())}.json`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ===== helpers =====
  function num(v) { return (v == null || Number.isNaN(v)) ? '—' : Math.round(Number(v)); }
  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function tsSlug(d){ const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`; }

  // Pack the run with optional pruning
  function buildPayload(src, { includeSnapshots }) {
    // Try to keep a hint of which plan ran (if runner stored it)
    const hint = src.plan || {};
    const base = {
      savedAt: new Date().toISOString(),
      plan: {
        steps: src.flow || [],
        sequence: hint.sequence || null,
        query: hint.query || null
      },
      summary: {
        views: views.length,
        totalSeconds: totalTime
      },
      steps: views.map((v, i) => ({
        index: i + 1,
        view: v.view,
        scenarioId: v.scenarioId,
        seconds: durations[i],
        reason: v.reason || 'done',
        totals: {
          power: powers[i],
          cost: costs[i],
          emissions: emissions[i]
        },
        overloaded: overloadeds[i]
      })),
      // Keep the original raw structure if requested
      raw: includeSnapshots ? src : undefined
    };
    return base;
  }

  // Light-weight bar charts (Canvas2D), no libs
  function drawBars(canvas, labels, seriesArr, { yLabel } = {}) {
    if (!canvas || !labels.length) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    const W = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const H = canvas.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);

    const values = seriesArr[0].values;
    const max = Math.max(1, ...values);
    const left = 36, right = 10, top = 10, bottom = 28;
    const w = W - left - right, h = H - top - bottom;

    // axes
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(left, top + h, w, 1);
    // y ticks
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ticks = 4;
    for (let i=0;i<=ticks;i++){
      const y = top + h - (h * i / ticks);
      const val = Math.round(max * i / ticks);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(left, y, w, i===0?1:0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(String(val), left - 6, y);
    }

    // bars
    const n = labels.length;
    const gap = 8;
    const barW = Math.max(6, (w - gap*(n+1)) / n);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    for (let i=0;i<n;i++){
      const x = left + gap + i*(barW+gap);
      const val = values[i];
      const bh = (val/max) * h;
      ctx.fillStyle = 'rgba(99,102,241,0.9)'; // indigo-ish
      ctx.fillRect(x, top + h - bh, barW, bh);
      // label
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.save(); ctx.translate(x + barW/2, top + h + 4); ctx.rotate(-Math.PI/12);
      ctx.fillText(labels[i], 0, 0); ctx.restore();
    }

    if (yLabel){
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(yLabel, left, top - 2);
    }
  }

  function drawBarsGrouped(canvas, labels, seriesArr, { yLabel } = {}) {
    if (!canvas || !labels.length || seriesArr.length < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    const W = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const H = canvas.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);

    const allVals = seriesArr.flatMap(s => s.values);
    const max = Math.max(1, ...allVals);
    const left = 40, right = 10, top = 10, bottom = 28;
    const w = W - left - right, h = H - top - bottom;

    // axes
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(left, top + h, w, 1);

    // ticks
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ticks = 4;
    for (let i=0;i<=ticks;i++){
      const y = top + h - (h * i / ticks);
      const val = Math.round(max * i / ticks);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(left, y, w, i===0?1:0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(String(val), left - 6, y);
    }

    // group bars
    const n = labels.length;
    const m = seriesArr.length;
    const gap = 10;
    const groupW = Math.max(16, (w - gap*(n+1)) / n);
    const innerGap = 6;
    const barW = (groupW - innerGap*(m-1)) / m;

    const palette = [
      'rgba(234,179,8,0.9)',   // amber for cost
      'rgba(34,197,94,0.9)',   // green for emissions
      'rgba(99,102,241,0.9)'   // indigo (spare)
    ];

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i=0;i<n;i++){
      const gx = left + gap + i*(groupW+gap);
      for (let k=0;k<m;k++){
        const val = Number(seriesArr[k].values[i]) || 0;
        const bh = (val/max) * h;
        const x = gx + k*(barW + innerGap);
        ctx.fillStyle = palette[k % palette.length];
        ctx.fillRect(x, top + h - bh, barW, bh);
      }
      // label
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.save(); ctx.translate(gx + groupW/2, top + h + 4); ctx.rotate(-Math.PI/12);
      ctx.fillText(labels[i], 0, 0); ctx.restore();
    }

    // legend
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    seriesArr.forEach((s, i) => {
      const y = top - 2 + i*14;
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(left, y, 10, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(s.name, left + 14, y + 1);
    });

    if (yLabel){
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(yLabel, left, top + 14*seriesArr.length);
    }
  }
})();
