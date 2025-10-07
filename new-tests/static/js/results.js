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

  // ============ Extract per-task views ============
  const views = data.logs.filter(l => l.type === 'view' && l.end && l.start);
  const labels = views.map((v, i) => `${i+1}`);
  const seconds = v => Math.max(0, Math.round((v.end - v.start) / 1000));
  const durations = views.map(seconds);

  // Optional goal decoding (for researcher layer only)
  const goalsMap = data.goalsByScenario || {};
  const safeNum = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  const steps = views.map((v, i) => {
    const snap   = v.snapshot || {};
    const totals = snap.totals || {};
    const state  = snap.state  || {};
    const g      = snap.goals || goalsMap[v.scenarioId] || {};
    const tol    = Number.isFinite(g.target_tolerance) ? g.target_tolerance : 0.05;

    const power     = safeNum(totals.power);
    const cost      = safeNum(totals.cost);
    const emissions = safeNum(totals.emissions);
    const overloads = safeNum(state.overloaded_count);

    const hasTarget   = Number.isFinite(g.target_mw);
    const meetsPower  = hasTarget ? (power >= g.target_mw*(1 - tol) && power <= g.target_mw*(1 + tol)) : null;
    const hasCostCap  = Number.isFinite(g.max_cost);
    const meetsCost   = hasCostCap ? (cost <= g.max_cost) : null;
    const hasEmiCap   = Number.isFinite(g.max_emissions);
    const meetsEmis   = hasEmiCap ? (emissions <= g.max_emissions) : null;
    const hasOverCap  = Number.isFinite(g.max_overloads);
    const meetsLines  = hasOverCap ? (overloads <= g.max_overloads) : (overloads === 0);

    const checks = [meetsPower, meetsCost, meetsEmis, meetsLines].filter(v => v !== null);
    const overall = checks.length ? checks.every(Boolean) : (overloads === 0);

    return {
      index: i+1,
      view: (v.view || '').toUpperCase(),
      scenarioId: v.scenarioId || '',
      reason: v.reason || 'done',
      secs: durations[i],
      power, cost, emissions, overloads,
      goals: {
        target_mw: g.target_mw ?? null,
        target_tolerance: tol,
        max_cost: g.max_cost ?? null,
        max_emissions: g.max_emissions ?? null,
        max_overloads: g.max_overloads ?? null
      },
      meetsPower, meetsCost, meetsEmis, meetsLines, overall
    };
  });

  const completedCount = steps.filter(s => s.overall).length;
  const totalTasks = steps.length;

  // ============ Build minimal user summary ============
  panel.innerHTML = `
    <h1 style="margin:0 0 8px">Results</h1>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div class="pill" style="background:#1f2937;padding:8px 12px;border-radius:999px">
        ✅ Tasks completed: <b>${completedCount}</b> / <b>${totalTasks}</b>
      </div>
    </div>

    <div style="margin:8px 0 4px">
      <h3 style="margin:0 0 6px">Time per task</h3>
      <canvas id="chart-time-line" height="180" style="width:100%"></canvas>
      <div style="opacity:.7;font-size:.9rem;margin-top:4px">Lower is faster</div>
    </div>

    <details id="research" style="margin-top:16px;border-top:1px solid rgba(255,255,255,.12);padding-top:12px">
      <summary style="cursor:pointer;list-style:none">
        <span class="pill" style="background:#1f2937;padding:6px 10px;border-radius:999px">Research export</span>
        <span class="muted" style="opacity:.75;margin-left:8px">Save / JSON / CSV (raw optional)</span>
      </summary>

      <div id="actions" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px">
        <label style="display:flex;align-items:center;gap:8px;background:#111827;padding:8px 12px;border-radius:10px">
          <input id="save-toggle" type="checkbox"> Save to server
        </label>
        <label style="display:flex;align-items:center;gap:8px;background:#111827;padding:8px 12px;border-radius:10px">
          <input id="include-snapshots" type="checkbox" checked> Include raw snapshots
        </label>
        <button id="btn-save" class="btn" style="background:#22c55e;color:#052e16">Save</button>
        <button id="btn-download" class="btn" style="background:#334155;color:#e2e8f0">Download JSON</button>
        <button id="btn-csv" class="btn" style="background:#334155;color:#e2e8f0">Export CSV</button>
        <a href="/test" class="btn" style="background:#334155;color:#e2e8f0;text-decoration:none">Run another test</a>
        <a href="/"      class="btn" style="background:#334155;color:#e2e8f0;text-decoration:none">Home</a>
      </div>
      <div id="msg" style="margin-top:8px;min-height:1.2em;opacity:.9"></div>
    </details>
  `;

  // ============ Render the time-per-task LINE chart ============
  drawLine(document.getElementById('chart-time-line'), labels, durations, {
    yLabel: 'seconds'
  });

  // ============ Wire research actions ============
  const $save   = document.getElementById('btn-save');
  const $dl     = document.getElementById('btn-download');
  const $csv    = document.getElementById('btn-csv');
  const cbSave  = document.getElementById('save-toggle');
  const cbSnap  = document.getElementById('include-snapshots');
  const $msg    = document.getElementById('msg');

  $save?.addEventListener('click', async () => {
    const payload = buildPayloadForSave(steps, sum(durations), data, { includeSnapshots: cbSnap.checked });
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
      $msg.textContent = '“Save to server” is off. Use Download/CSV to store locally.';
    }
  });

  $dl?.addEventListener('click', () => {
    const payload = buildPayloadForSave(steps, sum(durations), data, { includeSnapshots: cbSnap.checked });
    downloadBlob(JSON.stringify(payload, null, 2), `dv-results_${tsSlug(new Date())}.json`, 'application/json');
  });

  $csv?.addEventListener('click', () => {
    const csv = buildCSV(steps);
    downloadBlob(csv, `dv-results_${tsSlug(new Date())}.csv`, 'text/csv');
  });

  // ============ Helpers ============
  function sum(a){ return a.reduce((s,x)=>s+x,0); }
  function avg(a){ return a.length ? sum(a)/a.length : 0; }
  function tsSlug(d){ const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`; }

  function downloadBlob(text, name, type){
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function buildPayloadForSave(steps, totalSeconds, src, { includeSnapshots }){
    const hint = src.plan || {};
    return {
      savedAt: new Date().toISOString(),
      plan: {
        steps: src.flow || [],
        sequence: hint.sequence || null,
        query: hint.query || null
      },
      summary: {
        views: steps.length,
        totalSeconds
      },
      steps: steps.map(s => ({
        index: s.index,
        view: s.view,
        scenarioId: s.scenarioId,
        seconds: s.secs,
        reason: s.reason,
        totals: { power: s.power, cost: s.cost, emissions: s.emissions },
        overloaded: s.overloads,
        goals: s.goals,
        meets: {
          power: s.meetsPower,
          cost: s.meetsCost,
          emissions: s.meetsEmis,
          lines: s.meetsLines,
          overall: s.overall
        }
      })),
      raw: includeSnapshots ? src : undefined
    };
  }

  function buildCSV(steps){
    // flat, analysis-friendly
    const header = [
      'index','view','scenarioId','seconds','reason',
      'power','cost','emissions','overloads',
      'goal_target_mw','goal_target_tolerance','goal_max_cost','goal_max_emissions','goal_max_overloads',
      'meets_power','meets_cost','meets_emissions','meets_lines','overall'
    ];
    const rows = steps.map(s => ([
      s.index, s.view, s.scenarioId, s.secs, s.reason,
      s.power, s.cost, s.emissions, s.overloads,
      nz(s.goals.target_mw), nz(s.goals.target_tolerance), nz(s.goals.max_cost), nz(s.goals.max_emissions), nz(s.goals.max_overloads),
      tf(s.meetsPower), tf(s.meetsCost), tf(s.meetsEmis), tf(s.meetsLines), tf(s.overall)
    ]));
    return [header.join(','), ...rows.map(r => r.join(','))].join('\n');

    function nz(v){ return (v==null || Number.isNaN(v)) ? '' : String(v); }
    function tf(v){ return v==null ? '' : (v ? '1' : '0'); }
  }

  // Lightweight LINE chart (Canvas2D)
  function drawLine(canvas, labels, values, { yLabel } = {}){
    if (!canvas || !labels.length || !values.length) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    const W = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const H = canvas.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);

    const max = Math.max(1, ...values);
    const min = 0;
    const left = 40, right = 10, top = 10, bottom = 28;
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
      const val = Math.round((min + (max-min) * i / ticks));
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(left, y, w, i===0?1:0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(String(val), left - 6, y);
    }

    // line
    ctx.strokeStyle = 'rgba(99,102,241,0.95)'; // indigo-ish
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i=0;i<labels.length;i++){
      const x = left + (w * i / (labels.length - 1 || 1));
      const v = values[i];
      const y = top + h - ((v - min) / (max - min || 1)) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // markers
    ctx.fillStyle = 'rgba(99,102,241,0.95)';
    for (let i=0;i<labels.length;i++){
      const x = left + (w * i / (labels.length - 1 || 1));
      const v = values[i];
      const y = top + h - ((v - min) / (max - min || 1)) * h;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
    }

    // x labels (sparse)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i=0;i<labels.length;i++){
      const x = left + (w * i / (labels.length - 1 || 1));
      if (labels.length <= 12 || i % Math.ceil(labels.length/12) === 0){
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(labels[i], x, top + h + 4);
      }
    }

    if (yLabel){
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(yLabel, left, top - 2);
    }
  }
})();
