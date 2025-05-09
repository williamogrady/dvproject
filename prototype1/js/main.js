import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { initMapView, updateVisualization, updateSystemStyle } from './views/mapView.js';
import { updateSystemState, systemState } from '/prototype1/logic/state.js';
import { loadScenario } from '/prototype1/logic/scenario.js';

let currentMode = "manual";
let currentScenario = null;
let scenarioActive = false;
let generatorState = new Map(); // holds current generator status info
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
        loadScenario(scenario, generators, loads, lines, generatorState);
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
            
      // Unload scenario: Restore "manual" state
          
        currentScenario = null;
            
            savedGeneratorState.forEach(saved => {
              const g = generators.find(gen => gen.id === saved.id);
              if (g) {
                g.currentOutput = saved.currentOutput;
              }
            });
            
            // Reset generator state based on current outputs
            generatorState.clear();
            generators.forEach(g => {
              generatorState.set(g.id, { status: g.currentOutput <= 0 ? "off" : "on" });
            });
          
            updateSystemState(generators, loads, lines);
            updateVisualization(currentMode);
            updateSystemStyle(systemState, generatorState);
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
  currentMode = currentMode === "manual" ? "full" : "manual";

  updateVisualization(currentMode);
  updateSystemStyle(systemState, generatorState); // <- ADD THIS

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
]).then(([fullNodes, fullLinks, opBuses, opGenerators, opLines]) => {
  nodes = fullNodes;
  links = fullLinks;
  lines = opLines;
  loads = fullNodes
    .filter(n => n.type === "load")
    .map(n => ({
      id: n.id,
      busNumber: parseInt(n.id.replace("Load", "")),
      Pload: 50 // default load value
    }));

  // Build enriched generator objects
  generators = fullNodes
    .filter(n => n.type === "generator")
    .map(n => {
      const opGen = opGenerators.find(g => `Gen${g.busNumber}` === n.id);
      return {
        ...n, // x, y, id, type, etc.
        ratedMaxMW: opGen?.ratedMaxMW || 0,
        ratedMinMW: opGen?.ratedMinMW || 0,
        costPerMW: opGen?.costPerMW || 0,
        emissionIntensity: opGen?.emissionIntensity || 0,
        currentOutput: opGen ? opGen.ratedMaxMW / 2 : 0,
        available: !!opGen, // part of manual data?
        visible: false,     // set by view mode later
        inScenario: false   // scenario tagging
      };
    });

  // Init generator state
  generatorState = new Map();
  generators.forEach(g => {
    const isOff = g.currentOutput <= 0;
    generatorState.set(g.id, { status: isOff ? "off" : "on" });
  });

  // Pass state to mapView
  setGeneratorState(generatorState);
  initMapView(nodes, links, generators, opBuses, lines, currentMode);
  updateSystemState(generators, loads, lines);
  updateSystemStyle(systemState, generatorState);
  renderSystemOverview(systemState);

  document.getElementById("toggle-topology").addEventListener("click", toggleTopologyMode);
  document.getElementById("toggle-topology").textContent =
    currentMode === "full" ? "Show Manual Data" : "Show Full Topology";

  console.log("Data loaded and system initialized.");
});


export function setGeneratorState(state) {
  console.log("Setting generator state:", state);
  generatorState = state;
}






  
