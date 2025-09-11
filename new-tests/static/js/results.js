// /static/js/results.js
const root = document.getElementById('results-root');
const wrap = document.getElementById('table-wrap');
const summary = document.getElementById('summary');

function load() {
  let data = null;
  try { data = JSON.parse(sessionStorage.getItem('dv_last_results') || 'null'); } catch {}
  if (!data) {
    summary.textContent = 'No results found in this browser session.';
    wrap.innerHTML = '';
    return;
  }

  const totalSteps = data.flow.length;
  const viewSteps  = data.logs.filter(l => l.type === 'view');
  const totalTimeS = viewSteps.reduce((a, l) => a + Math.max(0, Math.round((l.end - l.start) / 1000)), 0);

  summary.innerHTML = `
    <span class="muted">Completed</span> <b>${viewSteps.length}</b> views / <b>${totalSteps}</b> steps
    &nbsp;·&nbsp; Total time <b>${fmt(totalTimeS)}</b>
  `;

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>View</th>
          <th>Scenario</th>
          <th>Time</th>
          <th>Ended</th>
          <th>Power</th>
          <th>Cost</th>
          <th>Emissions</th>
          <th>Overloads</th>
        </tr>
      </thead>
      <tbody>
        ${viewSteps.map((l, i) => {
          const secs = Math.max(0, Math.round((l.end - l.start) / 1000));
          const t = l.snapshot?.totals || {};
          const ended = l.reason || 'done';
          return `
            <tr>
              <td>${i+1}</td>
              <td>${escapeHtml(l.view)}</td>
              <td>${escapeHtml(l.scenarioId || '')}</td>
              <td>${fmt(secs)}</td>
              <td><span class="pill">${escapeHtml(ended)}</span></td>
              <td>${num(t.power)}</td>
              <td>${num(t.cost)}</td>
              <td>${num(t.emissions)}</td>
              <td>${num(l.snapshot?.state?.overloaded_count)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function num(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (typeof v === 'number') return Math.round(v).toString();
  return escapeHtml(String(v));
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

load();
