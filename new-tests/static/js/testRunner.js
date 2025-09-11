// /static/js/testRunner.js

const qs = new URLSearchParams(location.search);

// 1) Parse flow "list:clean_north_power|break:10|map:clean_north_power"
//    You can also override durations with ?t_list=180&t_map=240

const FLOW_DEF =  qs.get('flow') || 'list:clean_north_power|break:10|map:clean_north_power';
function parseFlow() {
  const tList = Number(qs.get('t_list') || 180);
  const tMap  = Number(qs.get('t_map')  || 240);
  return FLOW_DEF.split('|').map(tok => {
     const [kind, arg] = tok.split(':');
     if (kind === 'break') return { type: 'break', seconds: Number(arg || 10) };
     if (kind === 'list')  return { type: 'view', view: 'list', scenarioId: arg, seconds: tList };
     if (kind === 'map')   return { type: 'view', view: 'map',  scenarioId: arg, seconds: tMap  };
     return { type: 'unknown', raw: tok };
   }).filter(s => s.type !== 'unknown');
 }

const steps = parseFlow();

// 2) UI handles
const stage = document.getElementById('stage');
const veil  = document.getElementById('veil');
const startBtn = document.getElementById('startBtn');
const timerEl  = document.getElementById('timer');
const progressEl = document.getElementById('progress');

progressEl.textContent = `0 / ${steps.length}`;
startBtn.addEventListener('click', () => { veil.remove(); start(); });

// 3) State
let idx = -1;
let secondsLeft = 0;
let tickInt = null;
let logs = [];
let lastState = null;
let finishing = false;   // ← guard against double-advance

// Listen for messages from embedded views
let awaitingOverlay = false;
let overlayTimeout = null;

window.addEventListener('message', (e) => {
  const msg = e.data || {};

  if (msg.type === 'dv:state') {
    lastState = msg; // {type:'dv:state', scenarioId, state, meta...}
  }
  // Advance only after the prototype's result overlay is closed
  if (msg.type === 'runner:overlayClosed') {
    finishStep('overlayClosed');
  }
  // (Optional fallback if you still emit submitClicked somewhere)
  if (msg.type === 'runner:submitClicked') {
    finishStep('submit');
 }
 });


// 4) Timer helpers
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function startTimer(sec) {
  secondsLeft = sec;
  timerEl.textContent = fmt(secondsLeft);
  clearInterval(tickInt);
  tickInt = setInterval(() => {
    secondsLeft -= 1;
    timerEl.textContent = fmt(Math.max(0, secondsLeft));
    if (secondsLeft <= 0) {
      clearInterval(tickInt);
      finishStep('timeout');
    }
  }, 1000);
}
function stopTimer() {
  clearInterval(tickInt);
  tickInt = null;
}

// 5) Flow control
function start() {
  next();
}

function next() {
  idx += 1;
  progressEl.textContent = `${Math.min(idx, steps.length)} / ${steps.length}`;

  if (idx >= steps.length) {
    return finishAll();
  }

  const step = steps[idx];

  if (step.type === 'break') {
    // Show veil for a short countdown, then continue
    showBreak(step.seconds);
    return;
  }

  if (step.type === 'view') {
    // Mount view into iframe and start countdown
    const base = step.view === 'list' ? '/listB' : '/mapB';
    const url  = `${base}?runner=1&scenario=${encodeURIComponent(step.scenarioId)}`;
    stage.classList.remove('visible');
    stage.src = 'about:blank';

    // Record log entry start
    logs.push({
      idx,
      type: 'view',
      view: step.view,
      scenarioId: step.scenarioId,
      start: Date.now()
    });

    // Load the view
    stage.onload = () => {
      stage.classList.add('visible');
      // Ask the view to post its state (if it supports it)
      try {
        stage.contentWindow.postMessage({ type: 'runner:init', scenarioId: step.scenarioId }, '*');
      } catch {}
      startTimer(Number(step.seconds || 180));
    
      console.log(`[Runner] ENTER step #${idx + 1}/${steps.length}:`, step);
    };
    stage.src = url;
  }
}

function showBreak(seconds) {
  // Temporary overlay panel for the break
  const br = document.createElement('div');
  br.className = 'veil';
  br.innerHTML = `
    <div class="panel">
      <h1>Short break</h1>
      <p>Next step will start in <b><span id="br-secs">${seconds}</span>s</b>.</p>
      <button id="br-skip">Continue now</button>
    </div>`;
  document.querySelector('.stage').appendChild(br);

  const span = br.querySelector('#br-secs');
  const btn  = br.querySelector('#br-skip');
    let done = false;
  let s = Number(seconds || 10);
  const int = setInterval(() => { s -= 1; span.textContent = s; if (s <= 0) { clear(); } }, 1000);
  function clear() {
   if (done) return;
   done = true;
   clearInterval(int);
   br.remove();
   next();
 }

  btn.addEventListener('click', clear);
}

function finishStep(reason) {
    if (finishing) return;  // ← debounce
    finishing = true;
  stopTimer();
  // Update the last log entry
  const entry = logs[logs.length - 1];
  if (entry && entry.type === 'view' && !entry.end) {
    entry.end = Date.now();
    entry.reason = reason;
     if (lastState) {
              entry.snapshot = {
       scenarioId: lastState.scenarioId ?? entry.scenarioId,
        state: lastState.state ?? null,
        meta: lastState.meta ?? null
      };
    }
  }
  next();
  setTimeout(() => { next(); finishing = false; }, 0);
}

function finishAll() {
  // Store results for the /results page
  const payload = {
    finishedAt: Date.now(),
    flow: steps,
    logs
  };
  try {
    sessionStorage.setItem('dv_last_results', JSON.stringify(payload));
  } catch {}
  location.href = '/results';
}
