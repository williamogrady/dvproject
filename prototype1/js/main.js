import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { initMapView, updateVisualization } from './views/mapView.js';
import { updateSystemState, systemState } from '/prototype1/logic/state.js';
import { loadScenario } from '/prototype1/logic/scenario.js';

let currentMode = "full";
let scenarioActive = false;
let savedGeneratorState = [];
let generators = [], loads = [], lines = [], nodes = [], links = [];

//----------------------------------//
//  Scenario loading
//----------------------------------//
function loadScenarioFromFile(url) {
  fetch(url)
    .then(res => res.json())
    .then(scenario => {
      loadScenario(scenario, generators, loads, lines);
    });
}

document.getElementById("toggle-scenario").addEventListener("click", () => {
    if (!scenarioActive) {
        // Save current generator outputs
        savedGeneratorState = generators.map(g => ({
          id: g.id,
          currentOutput: g.currentOutput
        }));
      
        loadScenarioFromFile('./data/scenarios/allGeneratorsOff.json');
        scenarioActive = true;
        document.getElementById("toggle-scenario").textContent = "Unload Scenario";
    } else {
            // Restore saved generator state
            savedGeneratorState.forEach(saved => {
              const g = generators.find(gen => gen.id === saved.id);
              if (g) {
                g.currentOutput = saved.currentOutput;
              }
            });
          
            updateSystemState(generators, loads, lines);
            updateVisualization(systemState);
            renderSystemOverview(systemState);
          
            scenarioActive = false;
            document.getElementById("toggle-scenario").textContent = "Load Scenario";
          }
  });


Promise.all([
  d3.json('/prototype1/data/topology/full_nodes.json'),
  d3.json('/prototype1/data/topology/full_lines.json'),
  d3.json('/prototype1/data/operation/buses.json'),
  d3.json('/prototype1/data/operation/generators.json'),
  d3.json('/prototype1/data/operation/lines.json')
]).then(([loadedNodes, loadedLinks, buses, gens, loadedLines]) => {
  nodes = loadedNodes;
  links = loadedLinks;
  loads = buses;
  generators = gens;
  lines = loadedLines;

  initMapView(nodes, links, generators, loads, lines);
  document.getElementById("toggle-topology").addEventListener("click", toggleTopologyMode);

  // 🔁 Load initial scenario
  loadScenarioFromFile('./data/scenarios/allGeneratorsOff.json');

  updateSystemState(generators, loads, lines);
   updateVisualization(systemState);
  renderSystemOverview(systemState);

});



/*
function showView(viewName) {
    document.getElementById('map-view-ui').style.display = viewName === 'map' ? 'block' : 'none';
    document.getElementById('list-view-ui').style.display = viewName === 'list' ? 'block' : 'none';
  }


showView('map'); // or 'list'
*/

function toggleTopologyMode() {
    currentMode = currentMode === "full" ? "manual" : "full";
    updateVisualization(currentMode);
  
    const button = document.getElementById("toggle-topology");
    button.textContent = currentMode === "full"
      ? "Show Manual Data"
      : "Show Full Topology";
  }

function makeDraggable(panelId, headerId) {
    const panel = document.getElementById(panelId);
    const header = document.getElementById(headerId);
  
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
  
    header.addEventListener("mousedown", function(e) {
      isDragging = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
      header.style.cursor = "grabbing";
    });
  
    document.addEventListener("mousemove", function(e) {
      if (isDragging) {
        panel.style.left = (e.clientX - offsetX) + "px";
        panel.style.top = (e.clientY - offsetY) + "px";
      }
    });
  
    document.addEventListener("mouseup", function() {
      isDragging = false;
      header.style.cursor = "move";
    });
  }
  
  // Activate draggable behavior for both panels
  makeDraggable("control-panel", "control-header");
  makeDraggable("system-panel", "system-header");


  function renderSystemOverview(systemState) {
    const panel = document.getElementById("system-content");
    panel.innerHTML = `
      <div><strong>Load:</strong> ${systemState.totalLoad.toFixed(1)} MW</div>
      <div><strong>Generation:</strong> ${systemState.totalGeneration.toFixed(1)} MW</div>
      <div><strong>Balance:</strong> ${systemState.powerBalance.toFixed(1)} MW</div>
      <div><strong>Cost:</strong> $${systemState.totalCost.toFixed(0)}</div>
      <div><strong>Emissions:</strong> ${systemState.totalEmissions.toFixed(1)}</div>
    `;
  }


  
