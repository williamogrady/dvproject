// statusPanel.js
export function renderStatusPanel(generators, state) {
  const panel = document.getElementById("status-panel");
  if (!panel) return;

  const onGens = generators.filter(g => g.currentOutput > 0);
  const offGens = generators.filter(g => g.currentOutput === 0);

  panel.innerHTML = `
    <div><strong>Total Generation:</strong> ${state.totalGeneration.toFixed(1)} MW</div>
    <hr>
    <div><strong>Generators ON (${onGens.length}):</strong></div>
    <ul>${onGens.map(g => `<li>${g.id} (${g.currentOutput} MW)</li>`).join("")}</ul>
    <div><strong>Generators OFF (${offGens.length}):</strong></div>
    <ul>${offGens.map(g => `<li>${g.id}</li>`).join("")}</ul>
  `;
}
