// /new-tests/static/js/testRunner.js
// Build the runner UI + logic, with sequence selection if no plan is provided.

(() => {
  'use strict';

  // ---------- Base UI ----------

let submitClicked = false;       // did the user click submit in the active step?
let allMetAtSubmit = false;      // snapshot of allMet at submit moment
let pendingReason = null;        // 'submit_success' | 'submit_unmet' | 'timeout'
let timeUpFired   = false;       // ← NEW: was this step ended by time up?
let stepFinished = false;

 function computeAllMet(state) {
  const meets = state?.meets;
  if (meets) return !!(meets.power && meets.overloads);
  // Fallback: infer from totals/state/goals if present
  try {
    const goals = state?.goals || {};
    const totals = state?.totals || {};
   const overloaded = (state?.state?.overloaded_count ?? null);
    const tol = goals?.target_tolerance ?? 0.05;
   const powerOK = goals?.target_mw == null
     ? true
      : (totals.power >= goals.target_mw * (1 - tol) &&
         totals.power <= goals.target_mw * (1 + tol));
    const overloadsOK = (overloaded == null) ? false : (overloaded <= (goals.max_overloads ?? 0));
    return !!(powerOK && overloadsOK);
  } catch { return false; }
 }
 // ---------- Base UI ----------
document.body.innerHTML = `
  <style>
    :root { color-scheme: dark; }
    html, body { margin:0; height:100%; background:#0b1220; color:#eef2ff; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    #runner-root { position:fixed; inset:0; display:grid; grid-template-rows:auto 1fr; }
    .top {
      display:grid;
      grid-template-columns: 1fr auto 1fr;
      align-items:center; gap:10px;
      padding:10px 14px; background:rgba(255,255,255,.05); border-bottom:1px solid rgba(255,255,255,.08);
    }
    .title { font-weight:800; letter-spacing:.2px; display:flex; align-items:center; gap:8px; }
    .progress { font-size:12px; opacity:.8; background:#1f2937; padding:6px 10px; border-radius:999px; }
    #timer { justify-self:end; font-variant-numeric:tabular-nums; font-weight:900; }

    /* Pills */
    .pillbar { justify-self:center; display:flex; gap:8px; align-items:center; }
    .pill {
      min-width:26px; height:26px; padding:0 8px;
      display:inline-flex; align-items:center; justify-content:center;
      border-radius:999px; font-weight:700; font-size:13px;
      border:1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.04);
      color:#cbd5e1; opacity:.8;
      transition: transform .08s ease, background .15s ease, color .15s ease, opacity .15s ease, border-color .15s ease;
    }
    .pill--current { background:#ffffff; color:#0b1220; border-color:#ffffff; opacity:1; transform: translateY(-1px); }
    .pill--todo    { background: rgba(255,255,255,.03); color:#94a3b8; opacity:.55; }
    .pill--pass    { background:#16a34a; color:#052e16; border-color: rgba(22,163,74,.8); opacity:1; }
    .pill--fail    { background:#ef4444; color:#fff; border-color: rgba(239,68,68,.85); opacity:1; }

    .stage { position:relative; overflow:hidden; background:#0f172a; }
    #stage { position:absolute; inset:0; width:100%; height:100%; border:0; opacity:0; transition:opacity .3s ease; background:#0b1220; }
    #stage.visible { opacity:1; }
    .veil { position:absolute; inset:0; display:grid; place-items:center; background:rgba(8,12,22,.9); z-index:3; }
    .panel { max-width:760px; text-align:center; padding:12px; }
    .panel h1 { margin:0 0 10px; font-size:28px; }
    .panel p { margin:0 0 12px; opacity:.9; }
    .btn { background:#22c55e; color:#052e16; border:0; border-radius:10px; padding:10px 16px; font-weight:900; cursor:pointer; }
    .btn[disabled] { opacity:.6; cursor:not-allowed; }
    select, input[type="text"] { min-width:260px; padding:10px; border-radius:10px; background:#0b1220; color:#eef2ff; border:1px solid rgba(255,255,255,.2); }
    code { background:#111827; padding:2px 6px; border-radius:6px; }
  </style>
  <div id="runner-root">
    <div class="top">
      <div class="title">User Test <span class="progress" id="progress">0 / 0</span></div>
      <div id="pillbar" class="pillbar"></div>
      <div id="timer">--:--</div>
    </div>
    <div class="stage">
      <iframe id="stage" referrerpolicy="no-referrer"></iframe>
      <div class="veil" id="veil">
        <div class="panel" id="panel">
          <!-- Filled below depending on whether a plan is present -->
        </div>
      </div>
    </div>
  </div>
`;


  // ---------- Helpers: sequences & parsing ----------

  // ----- Pills -----
const pillbarEl = document.getElementById('pillbar');
let viewIndexToPill = []; // maps 1-based view position -> pill element

function buildPills(total) {
  pillbarEl.innerHTML = '';
  viewIndexToPill = [];
  for (let i = 1; i <= total; i++) {
    const span = document.createElement('span');
    span.className = 'pill pill--todo';
    span.textContent = String(i);
    pillbarEl.appendChild(span);
    viewIndexToPill[i] = span;
  }
}

function setPillState(pos, kind) {
  const el = viewIndexToPill[pos];
  if (!el) return;
  el.classList.remove('pill--todo','pill--current','pill--pass','pill--fail');
  el.classList.add(
    kind === 'current' ? 'pill--current' :
    kind === 'pass'    ? 'pill--pass'    :
    kind === 'fail'    ? 'pill--fail'    : 'pill--todo'
  );
}

// ----- Participant helpers -----
function getParticipantId() {
  try { return sessionStorage.getItem('dv_participant_id') || null; } catch { return null; }
}
function setParticipantId(v) {
  try { if (v == null || v === '') sessionStorage.removeItem('dv_participant_id');
        else sessionStorage.setItem('dv_participant_id', String(v)); } catch {}
}
function parsePid(v) {
  const n = Number(String(v).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}


function clearCurrentPill(pos) {
  const el = viewIndexToPill[pos];
  if (!el) return;
  el.classList.remove('pill--current');
  if (!el.classList.contains('pill--pass') && !el.classList.contains('pill--fail')) {
    el.classList.add('pill--todo');
  }
}

function decideOutcome(reason) {
    return String(reason || '') === 'submit_success' ? 'pass' : 'fail';
  }

function clearCurrentPill(pos) {
  const el = viewIndexToPill[pos];
  if (!el) return;
  el.classList.remove('pill--current');
  if (!el.classList.contains('pill--pass') && !el.classList.contains('pill--fail')) {
    el.classList.add('pill--todo');
  }
}

function finishStep(reason) {
  if (finishing) return;
  finishing = true;

  stopTimer();

  const entry = logs[logs.length - 1];
  if (entry && entry.type === 'view' && !entry.end) {
    entry.end       = Date.now();
    entry.reason    = reason;
    entry.submitted = !!submitClicked;
    entry.allMet    = !!allMetAtSubmit;

    if (lastState) {
      entry.snapshot = {
        scenarioId:     lastState.scenarioId ?? entry.scenarioId,
        totals:         lastState.totals ?? null,
        state:          lastState.state ?? null,
        meta:           lastState.meta ?? null,
        score:          (lastState.score ?? null),
        score_base:     (lastState.score_base ?? null),
        score_doubled:  (lastState.score_doubled ?? false)
      };
    }

    const outcome = decideOutcome(reason);
    console.log('[testRunner]: STEP RESULT', {
  view: entry.view, scenario: entry.scenario, reason, outcome
  });
    clearCurrentPill(viewPos);
    setPillState(viewPos, outcome);

  }

  setTimeout(() => { finishing = false; next(); }, 0);
}


  function expandSeries(scriptObj) {
    const out = [];
    for (const item of (scriptObj?.series || [])) {
      if (item.view && Array.isArray(item.scenarios)) {
        const view = String(item.view).toLowerCase().trim(); // "list" | "map"
        const secs = Number(item.seconds || (view === 'list' ? 180 : 240));
        const breakBetween = !!item.breakBetween;
        item.scenarios.forEach((sc, i) => {
          const id   = typeof sc === 'string' ? sc : sc?.id;
          const s    = (typeof sc === 'object' && sc?.seconds != null) ? Number(sc.seconds) : secs;
          if (!id) return;
          out.push({ type:'view', view, scenarioId:id, seconds:s });
          if (breakBetween && i < item.scenarios.length - 1) out.push({ type:'break', seconds:5 });
        });
        continue;
      }
      if (item.break) {
        out.push({ type:'break', seconds:Number(item.break.seconds || 10), note:item.break.note || '' });
        continue;
      }
    }
    return out;
  }

  function parseFlowString(flow, tList=180, tMap=240) {
    return String(flow).split('|').map(tok => {
      const [kRaw, aRaw] = tok.split(':');
      const kind = (kRaw || '').trim().toLowerCase();
      const arg  = (aRaw || '').trim();
      if (kind === 'break') return { type:'break', seconds:Number(arg || 10) };
      if (kind === 'list')  return { type:'view', view:'list', scenarioId:arg, seconds:tList };
      if (kind === 'map')   return { type:'view', view:'map',  scenarioId:arg, seconds:tMap  };
      return { type:'unknown', raw:tok };
    }).filter(s => s.type !== 'unknown');
  }

async function loadSequenceByName(name) {
  // Always fetch by the *id* (file stem), not the label
  const slug = String(name).trim();
  const url = `/sequences/${encodeURIComponent(slug)}.json`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sequence not found: "${slug}" (HTTP ${res.status})`);

  const text = await res.text();
  if (!text || !text.trim()) throw new Error(`Sequence file "${slug}.json" is empty.`);

  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error(`Invalid JSON in "${slug}.json": ${e.message}`); }

  if (Array.isArray(data)) return data;           // already flat
  if (data.series)         return expandSeries(data);
  if (data.flow)           return parseFlowString(String(data.flow));

  throw new Error(`Unsupported sequence schema in "${slug}.json".`);
}


  async function resolveStepsFromURL() {
    const qs = new URLSearchParams(location.search);
    const seq = qs.get('sequence');
    if (seq) return await loadSequenceByName(seq);

    const script = qs.get('script');
    if (script) {
      try {
        const obj = JSON.parse(script);
        const steps = expandSeries(obj);
        if (steps.length) return steps;
      } catch (e) { console.warn('[Runner] bad script JSON', e); }
    }

    const flow  = qs.get('flow');
    if (flow)   return parseFlowString(flow, Number(qs.get('t_list')||180), Number(qs.get('t_map')||240));

    return []; // no plan supplied
  }

  // ---------- State ----------
  const qs = new URLSearchParams(location.search);
  const hasPlanParams = qs.has('sequence') || qs.has('script') || qs.has('flow');

  const stage = document.getElementById('stage');
  const veil  = document.getElementById('veil');
  const panel = document.getElementById('panel');
  const timerEl = document.getElementById('timer');
  const progressEl = document.getElementById('progress');

  let steps = [];
  let totalViewSteps = 0;
  let viewPos = 0;
  let idx = -1;
  let secondsLeft = 0;
  let tickInt = null;
  let logs = [];
  let lastState = null;
  let finishing = false;
  let overlayWait = null; // timeout id if we’re waiting for overlayClosed
  let timerEndsAt = 0;
  let timerTick   = 0;

  // ---------- Timer ----------
 const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

function startTimer(totalSeconds = 180) {
  stopTimer();

  timeUpFired = false;  // ← NEW: reset for this step
  const tick = () => {
    const left = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    timerEl.textContent = `Time left: ${fmt(left)}`;
    if (left <= 0) {
      stopTimer();
      timeUpFired = true; // ← NEW: mark timeout
      try { stage.contentWindow.postMessage({ type: 'runner:timeUp' }, '*'); } catch {}
      if (overlayWait) clearTimeout(overlayWait);
      overlayWait = setTimeout(() => { overlayWait = null; finishStep('timeout'); }, 15000);
      return;
    }
    timerTick = requestAnimationFrame(tick);
  };

  timerEndsAt = Date.now() + (Number(totalSeconds) * 1000);
  timerEl.textContent = `Time left: ${fmt(Number(totalSeconds) || 0)}`;
  timerTick = requestAnimationFrame(tick);
}

function stopTimer() {
  if (timerTick) cancelAnimationFrame(timerTick);
  timerTick = 0;
}


function showBreak(note = '') {
  // Hide/clear the iframe stage if you do that today
  stage.classList.remove('visible');
  stage.src = 'about:blank';

  // Simple overlay/panel for the break
  const br = document.createElement('div');
  br.className = 'veil';
  br.innerHTML = `
    <div class="panel">
      <h1>Break</h1>
      ${note ? `<p style="opacity:.9;margin:6px 0">${note}</p>` : ''}
      <button class="btn" id="br-continue">Continue</button>
    </div>`;
  document.querySelector('.stage').appendChild(br);

  br.querySelector('#br-continue')?.addEventListener('click', () => {
    br.remove();
    next();
  });
}

// ---------- Messages from views ----------
function requestFinalState() {
  try { stage.contentWindow?.postMessage({ type: 'runner:requestState' }, '*'); } catch {}
}

window.addEventListener('message', (e) => {
  const msg = e?.data || {};

  // [testRunner]: guard against late beacons after finishing this step
  if (stepFinished) {
    console.log('[testRunner]: ignoring message after finish', msg?.type || 'unknown');
    return;
  }

  // Streamed snapshots from the views
  if (msg.type === 'runner:state' || msg.type === 'dv:state') {
    lastState = msg;
    console.log('[testRunner]: dv:state RECEIVED', {
  hasMeets: !!(msg && msg.meets),
  meets: msg?.meets ? {
    power: msg.meets.power, overloads: msg.meets.overloads,
    cost: msg.meets.cost, emissions: msg.meets.emissions, overall: msg.meets.overall
  } : 'NA',
  totals: msg?.totals || 'NA',
  state:  msg?.state  || 'NA',
  ts:     msg?.meta?.ts || 'NA'
});
    return;
  }

  // User clicked SUBMIT in the view → classify now, but do not advance
  if (msg.type === 'runner:submitClicked') {
    submitClicked  = true;
    console.log('[testRunner]: runner:submitClicked RECEIVED');
    allMetAtSubmit = computeAllMet(lastState);
    pendingReason  = allMetAtSubmit ? 'submit_success' : 'submit_unmet';
    console.log('[testRunner]: submit verdict', {
    allMetAtSubmit, pendingReason,
    snapshot: (typeof lastState !== 'undefined') ? {
      hasMeets: !!lastState?.meets,
      meets: lastState?.meets || 'NA',
      totals: lastState?.totals || 'NA',
      state:  lastState?.state  || 'NA',
      ts:     lastState?.meta?.ts || 'NA'
    } : 'no lastState'
  });
    requestFinalState();
    return;
  }


if (msg.type === 'runner:overlayClosed') {
  console.log('[testRunner]: runner:overlayClosed RECEIVED', {
    submitClicked, pendingReason,
    lastStateHasMeets: !!lastState?.meets,
    meets: lastState?.meets || 'NA',
    totals: lastState?.totals || 'NA',
    state:  lastState?.state  || 'NA',
    ts:     lastState?.meta?.ts || 'NA'
  });

  let reason;
  if (submitClicked) {
    // Do NOT recompute here; trust the submit-time verdict.
    reason = pendingReason || 'submit_unmet';
  } else if (timeUpFired) {
    reason = 'timeout';
  } else {
    reason = 'submit_unmet';
  }

  console.log('[testRunner]: finishing', { reason });

  // Lock this step to prevent late dv:state from downgrading it
  stepFinished = true;
  finishStep(reason);
  return;
}



});


  // ---------- Flow control ----------
  function start() { next(); }

function next() {
  idx += 1;
  if (idx >= steps.length) return finishAll();

  const step = steps[idx];

  if (step.type === 'break') {
    showBreak(step.note || '');
    return;
  }

  if (step.type === 'view') {
    viewPos += 1;
    progressEl.textContent = `${viewPos} / ${totalViewSteps}`;
    setPillState(viewPos, 'current');

    const base = step.view === 'list' ? '/listB' : '/mapB';
    const url = `${base}?runner=1&scenario=${encodeURIComponent(step.scenarioId)}`;

    stage.classList.remove('visible');
    stage.src = 'about:blank';

    logs.push({
      idx,
      type: 'view',
      view: step.view,
      scenarioId: step.scenarioId,
      seconds: step.seconds,
      start: Date.now()
    });

    stage.onload = () => {
      stage.classList.add('visible');
      try {
        stage.contentWindow.postMessage({ type:'runner:init', scenarioId: step.scenarioId }, '*');
      } catch {}
      startTimer(Number(step.seconds || 180));
      console.log(`[Runner] ENTER ${step.view}:${step.scenarioId}  [${viewPos}/${totalViewSteps}]`);
    };
    stage.src = url;
    return;
  }

  console.warn('[Runner] Skipping unknown step:', step);
  next();
}


function finishAll() {
  const qs = new URLSearchParams(location.search);
  const sequenceId = qs.get('sequence') || null;

  const payload = {
    finishedAt: Date.now(),
    flow: steps,
    logs,
    runner: {
      participant_id: parsePid(getParticipantId()) || null,
      sequence: sequenceId
    }
  };
  try { sessionStorage.setItem('dv_last_results', JSON.stringify(payload)); } catch {}
  location.href = '/results';
}



  // ---------- Start screen(s) ----------
  async function init() {
    if (!hasPlanParams) {
  // Sequence picker UI
  panel.innerHTML = `
    <h1>Choose a sequence</h1>
    <p style="opacity:.9;margin:0 0 12px">Pick a predefined plan to run.</p>

    <div style="display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;margin-bottom:6px">
      <select id="seq-select">
        <option value="">— Select a sequence —</option>
      </select>

      <div style="display:flex;align-items:center;gap:8px">
        <label for="participant-id" style="opacity:.85">Participant #</label>
        <input id="participant-id" type="number" min="1" step="1" inputmode="numeric" placeholder="optional"
               style="width:110px;padding:10px;border-radius:10px;background:#0b1220;color:#eef2ff;border:1px solid rgba(255,255,255,.2)"/>
      </div>

      <button id="seq-start" class="btn" disabled>Start</button>
    </div>

    <div id="seq-msg" style="opacity:.8;font-size:13px"></div>
  `;

  const sel     = document.getElementById('seq-select');
  const go      = document.getElementById('seq-start');
  const msg     = document.getElementById('seq-msg');
  const pidInput= document.getElementById('participant-id');

  // Prefill participant if we have it (optional)
  const savedPid = getParticipantId();
  if (savedPid) pidInput.value = savedPid;

  // Populate strictly from /api/sequences
  (async () => {
    let items = [];
    try {
      const r = await fetch('/api/sequences', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        items = Array.isArray(j) ? j : (j.sequences || []);
      }
    } catch {}

    if (Array.isArray(items) && items.length) {
      items.forEach(it => {
        const id    = typeof it === 'string' ? it : it.id;
        const label = (typeof it === 'object' && it.label) ? it.label : id;
        if (!id) return;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label;
        sel.appendChild(opt);
      });
      msg.textContent = 'Choose a plan from the list.';
    } else {
      // Fallback to manual input if directory is empty
      sel.outerHTML = `
        <input id="seq-input" type="text" placeholder="Type a sequence id (e.g., x-y-z)"
               style="min-width:260px;padding:10px;border-radius:10px;background:#0b1220;color:#eef2ff;border:1px solid rgba(255,255,255,.2)"/>`;
      msg.textContent = 'No sequences found. Enter a filename (without .json).';
    }

    // Hook up enabling logic (sequence required; participant optional)
    const input = document.getElementById('seq-input'); // may exist after fallback
    const getChosen = () => (input ? input.value.trim() : sel.value.trim());
    const updateStartEnabled = () => { go.disabled = !getChosen(); };

    (input || sel).addEventListener('input', updateStartEnabled);
    (input || sel).addEventListener('change', updateStartEnabled);
    updateStartEnabled();
  })();

  // Start: save optional participant, then reload with ?sequence=
  go.addEventListener('click', () => {
    const input = document.getElementById('seq-input');
    const chosen = (input ? input.value : sel.value).trim();
    if (!chosen) return;

    // Participant is optional; store only if valid integer, else clear
    const n = parsePid(pidInput.value);
    if (n) setParticipantId(n); else setParticipantId(null);

    const p = new URLSearchParams(location.search);
    p.set('sequence', chosen);
    location.search = p.toString(); // reload with the selected plan
  });

  // Progress is meaningless until a plan is picked
  progressEl.textContent = `0 / 0`;
  timerEl.textContent    = `--:--`;
  return;
}


    // Plan provided -> standard start screen
    panel.innerHTML = `
      <h1>Get ready</h1>
      <p>We’ll guide you through a short flow. Click start when you’re ready.</p>
      <button id="startBtn" class="btn">Start</button>
    `;

    const startBtn = document.getElementById('startBtn');

    // Resolve steps and wire up Start
    try {
      steps = await resolveStepsFromURL();
    } catch (e) {
      console.error(e);
      panel.innerHTML = `<h1>Couldn’t load plan</h1><p style="opacity:.85">${String(e.message || e)}</p>`;
      return;
    }

    if (!steps.length) {
      panel.innerHTML = `<h1>No steps found</h1><p style="opacity:.85">Provide <code>?sequence=</code>, <code>?script=</code>, or <code>?flow=</code>.</p>`;
      return;
    }

    totalViewSteps = steps.filter(s => s.type === 'view').length;
    viewPos = 0;
    progressEl.textContent = `0 / ${totalViewSteps}`;
    buildPills(totalViewSteps); // NEW: create pills for each view step

    startBtn.addEventListener('click', () => { veil.remove(); start(); }, { once:true });
  }

  init().catch(err => {
    console.error('[Runner] init failed', err);
    panel.innerHTML = `<h1>Init failed</h1><p style="opacity:.85">${String(err.message || err)}</p>`;
  });
})();

