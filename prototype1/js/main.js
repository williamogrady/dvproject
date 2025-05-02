import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { initMapView, updateVisualization, updateSystemStyle } from './views/mapView.js';
import { updateSystemState, systemState } from '/prototype1/logic/state.js';
import { loadScenario } from '/prototype1/logic/scenario.js';

let currentMode = "manual";
let currentScenario = null;
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
        currentScenario = scenario;
        loadScenario(scenario, generators, loads, lines);
        renderSystemOverview(systemState); // refresh after loading
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
            currentScenario = null;
            savedGeneratorState.forEach(saved => {
              const g = generators.find(gen => gen.id === saved.id);
              if (g) {
                g.currentOutput = saved.currentOutput;
              }
            });
          
            updateSystemState(generators, loads, lines);
            updateVisualization(currentMode);
            renderSystemOverview(systemState);
          
            scenarioActive = false;
            document.getElementById("toggle-scenario").textContent = "Load Scenario";
            renderSystemOverview(systemState);
          }
  });



/*
function showView(viewName) {
    document.getElementById('map-view-ui').style.display = viewName === 'map' ? 'block' : 'none';
    document.getElementById('list-view-ui').style.display = viewName === 'list' ? 'block' : 'none';
  }


showView('map'); // or 'list'
*/

function toggleTopologyMode() {
    // Flip the mode
    currentMode = currentMode === "manual" ? "full" : "manual";
  
    // Redraw map in the new mode
    updateVisualization(currentMode);
  
    // Update the button label to reflect the *next* available switch
    const button = document.getElementById("toggle-topology");
    button.textContent = currentMode === "manual"
      ? "Show Full Topology"
      : "Show Manual Data";
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


  function renderSystemOverview(state) {
    const panel = document.getElementById("system-content");
  
    const name = currentScenario ? currentScenario.name || currentScenario.id : "---";
    const goal = currentScenario?.targetLoad
      ? `Goal: ${currentScenario.targetLoad} MW`
      : "Goal: ---";
  
    panel.innerHTML = `
      <div><strong>Scenario:</strong> ${name}</div>
      <div><strong>${goal}</strong></div>
      <div><strong>Load:</strong> ${state.totalLoad.toFixed(1)} MW</div>
      <div><strong>Generation:</strong> ${state.totalGeneration.toFixed(1)} MW</div>
      <div><strong>Balance:</strong> ${state.powerBalance.toFixed(1)} MW</div>
      <div><strong>Cost:</strong> $${state.totalCost.toFixed(0)}</div>
      <div><strong>Emissions:</strong> ${state.totalEmissions.toFixed(1)}</div>
    `;
  }


 // --------------------------------------// 
 // Load data and initialize map view
 // --------------------------------------//

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
  console.log("Loaded data");

  // Set a baseline output level before first render
    generators.forEach(g => {
        g.currentOutput = g.ratedMaxMW / 2;
    });

  initMapView(nodes, links, generators, loads, lines, currentMode);
  console.log("Map view initialized with mode,", currentMode);
  document.getElementById("toggle-topology").addEventListener("click", toggleTopologyMode);

  // 🔁 Start off with scenario active
  //loadScenarioFromFile('./data/scenarios/allGeneratorsOff.json');

  updateSystemState(generators, loads, lines);
  updateVisualization(currentMode);
  renderSystemOverview(systemState);

  document.getElementById("toggle-topology").textContent = 
  currentMode === "full" ? "Show Manual Data" : "Show Full Topology";

});






  
