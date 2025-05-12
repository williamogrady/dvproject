import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { Generator } from '../classes/Generator.js';
import { Bus } from '../classes/Bus.js';
import { Line } from '../classes/Line.js';

import { initMapView, updateVisualization, updateSystemStyle } from './views/mapView.js';
import { updateSystemState, systemState } from '../logic/state.js';
import { loadScenario } from '../logic/scenario.js';

export let opGenerators = [];
export let opBuses = [];
export let opLines = [];
export let loads = [];

let fullNodes = [], fullLines = [];

let currentMode = "full";
let currentScenario = null;
let scenarioActive = false;
let savedGeneratorOutputs = [];
Promise.all([
  d3.json('/prototype1/data/topology/full_nodes.json'),
  d3.json('/prototype1/data/topology/full_lines.json'),
  d3.json('/prototype1/data/operation/buses.json'),
  d3.json('/prototype1/data/operation/generators.json'),
  d3.json('/prototype1/data/operation/lines.json')
]).then(([nodeData, lineLayoutData, busData, genData, lineData]) => {
  fullNodes = nodeData;
  fullLines = lineLayoutData;

  // 🔧 Enrich fullNodes for visual drawing (full topology mode)
  fullNodes.forEach(n => {
    if (n.type === "bus") {
      n.width = 12;
      n.height = 12;
    } else if (n.type === "generator") {
      n.radius = 10;
    } else if (n.type === "load") {
      n.size = 100;
    }
  });

  // 1. Create Buses (inject position from fullNodes)
  opBuses = busData.map(d => {
    const bus = new Bus(d);
    const node = fullNodes.find(n => n.id === `Bus${bus.busNumber}`);
    if (node) bus.setPosition(node.x, node.y);
    return bus;
  });

  // 2. Create Generators (attach to corresponding bus position)
  opGenerators = genData.map(d => {
    const gen = new Generator(d);
    const bus = opBuses.find(b => b.busNumber === gen.busNumber);
    if (bus) {
      const { x, y } = bus.getCoords();
      gen.x = x;
      gen.y = y;
    }
    return gen;
  });

  // 3. Create Lines (use bus coordinates for endpoints)
  opLines = lineData.map(d => {
    const line = new Line(d);
    const fromBus = opBuses.find(b => b.busNumber === line.from);
    const toBus = opBuses.find(b => b.busNumber === line.to);
    if (fromBus && toBus) {
      line.setCoordinates(fromBus.getCoords(), toBus.getCoords());
    }
    return line;
  });

  // 4. Create Loads (for simulation logic only)
  loads = fullNodes
    .filter(n => n.type === "load")
    .map(loadNode => ({
      id: loadNode.id,
      busNumber: parseInt(loadNode.id.replace("Load", "")),
      Pload: 50
    }));

  // 5. Initialize View
  initMapView(opGenerators, opBuses, opLines, fullNodes, fullLines, currentMode);
  updateSystemState(opGenerators, loads, opLines);
  updateSystemStyle(systemState, opGenerators);
  renderSystemOverview(systemState);

  // 6. Hook Up UI Buttons
  document.getElementById("toggle-topology").addEventListener("click", toggleTopologyMode);
  document.getElementById("toggle-topology").textContent =
    currentMode === "manual" ? "Show Full Topology" : "Show Manual Data";

  document.getElementById("toggle-scenario").addEventListener("click", handleScenarioToggle);
});


// ----------------------------------------
// Scenario Handling
// ----------------------------------------

function handleScenarioToggle() {
  const button = document.getElementById("toggle-scenario");

  if (!scenarioActive) {
    savedGeneratorOutputs = opGenerators.map(g => ({
      id: g.id,
      currentOutput: g.currentOutput
    }));

    fetch('./data/scenarios/allGeneratorsOff.json')
      .then(res => res.json())
      .then(scenario => {
        currentScenario = scenario;
        loadScenario(scenario, opGenerators, loads, opLines);
        updateSystemState(opGenerators, loads, opLines);
        updateSystemStyle(systemState, opGenerators);
        renderSystemOverview(systemState);

        scenarioActive = true;
        button.textContent = "Unload Scenario";
      });

  } else {
    // Restore saved generator state
    savedGeneratorOutputs.forEach(saved => {
      const gen = opGenerators.find(g => g.id === saved.id);
      if (gen) gen.setOutput(saved.currentOutput);
    });

    currentScenario = null;
    scenarioActive = false;

    updateSystemState(opGenerators, loads, opLines);
    updateSystemStyle(systemState, opGenerators);
    renderSystemOverview(systemState);
    updateVisualization(currentMode);

    button.textContent = "Load Scenario";
  }
}

// ----------------------------------------
// Topology Mode Toggle
// ----------------------------------------

function toggleTopologyMode() {
  currentMode = currentMode === "manual" ? "full" : "manual";
  updateVisualization(currentMode);
  updateSystemStyle(systemState, opGenerators);

  const button = document.getElementById("toggle-topology");
  button.textContent = currentMode === "manual"
    ? "Show Full Topology"
    : "Show Manual Data";
}

// ----------------------------------------
// Utility UI Functions
// ----------------------------------------

function renderSystemOverview(state) {
  const panel = document.getElementById("system-content");
  const name = currentScenario?.name || "---";
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

// ----------------------------------------
// Optional Global Hook for External Access
// ----------------------------------------

export function getSystemObjects() {
  return { opGenerators, opBuses, opLines, loads, fullNodes, fullLines };
}
