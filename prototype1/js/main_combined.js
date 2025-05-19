import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { Generator } from '../classes/Generator.js';
import { Bus } from '../classes/Bus.js';
import { Line } from '../classes/Line.js';
import { initListView } from './views/listView.js';

Promise.all([
  d3.json('/prototype1/data/topology/full_nodes.json'),
  d3.json('/prototype1/data/topology/full_lines.json'),
  d3.json('/prototype1/data/operation/buses.json'),
  d3.json('/prototype1/data/operation/generators.json'),
  d3.json('/prototype1/data/operation/lines.json')
]).then(([fullNodeData, fullLineData, busData, generatorData, lineProps]) => {
  const fullNodes = [];
  const fullLines = [];
  const interactiveGenerators = [];

  // Create lookup from busNumber → generatorData
const genByBusNumber = Object.fromEntries(generatorData.map(d => [d.busNumber, d]));

//Debugging
let totalGenerators = 0;
let matchedGenerators = 0;
let unmatchedGenerators = 0;

for (const node of fullNodeData) {
  if (node.type === "generator") {
    totalGenerators++;

    const busNumber = parseInt(node.id.replace(/\D/g, ""), 10);
    const opGen = genByBusNumber[busNumber];
    let enriched;

    if (opGen) {
      matchedGenerators++;
      enriched = new Generator(opGen);
      enriched.status = opGen.status || "off";
    } else {
      unmatchedGenerators++;
      console.log("🚫 Unmatched generator:", node.id, "→ busNumber:", busNumber);
      enriched = new Generator({
        busNumber,
        region: "South",
        ratedMaxMW: 0,
        currentOutput: 0,
        status: "unavailable",
        id: node.id
      });
    }

    enriched.type = "generator";
    enriched.x = node.x;
    enriched.y = node.y;  
    enriched.width = node.width;
    enriched.height = node.height;
    enriched.rotation = node.rotation ?? 0;
    enriched.rotate = node.rotate;
    enriched.rotateX = node.rotateX;
    enriched.rotateY = node.rotateY;
    enriched.selected = false;
    enriched.filteredRegion = false;

    fullNodes.push(enriched);
    if (opGen) interactiveGenerators.push(enriched);
  } else {
    fullNodes.push({ ...node });
  }
}

console.log("📊 Total generators in full_nodes:", totalGenerators);
console.log("✅ Matched (interactive) generators:", matchedGenerators);
console.log("🟡 Unmatched (unavailable) generators:", unmatchedGenerators);

// Build generator lookup only once (move this outside the map loop)
const genById = {};
for (const node of fullNodes) {
  if (node.type === "generator") {
    genById[node.id] = node;
  }
}

fullLineData.forEach(topLine => {
  const fromId = topLine.source;
  const toId = topLine.target;

  const isBusToBus = fromId.startsWith("Bus") && toId.startsWith("Bus");
  const isBusToLoad = (fromId.startsWith("Bus") && toId.startsWith("Load")) || (fromId.startsWith("Load") && toId.startsWith("Bus"));
  const isBusToGen  = (fromId.startsWith("Bus") && toId.startsWith("Gen"))  || (fromId.startsWith("Gen")  && toId.startsWith("Bus"));

  // Match only for Bus–Bus
  let opLine = null;
  if (isBusToBus) {
    const fromNumber = parseInt(fromId.replace("Bus", ""), 10);
    const toNumber = parseInt(toId.replace("Bus", ""), 10);

    opLine = lineProps.find(line =>
      (line.from_number === fromNumber && line.to_number === toNumber) ||
      (line.from_number === toNumber && line.to_number === fromNumber)
    );
  }

  const enriched = new Line({
    id: topLine.id,
    type: "line",
    from: fromId,
    to: toId,
    d: topLine.d || topLine.path || "",

    ...(opLine ? {
      fromName: opLine.from_name,
      toName: opLine.to_name,
      voltage: opLine.nominal_voltage,
      normalLimit: opLine.normal_MVA_limit,
      emergencyLimit: opLine.emergency_MVA_limit
    } : {})
  });

  // Assign availability per your rules
  if (opLine) {
    enriched.available = true; // ✅ matched Bus–Bus
  } else if (isBusToLoad || isBusToGen) {
    enriched.available = true; // ✅ Gen/Load lines always available
  } else {
    enriched.available = false; // ❌ unmatched Bus–Bus
  }

  fullLines.push(enriched);
});

// ✅ These now run AFTER all lines are pushed
console.log("✅ Interactive generator objects created:", interactiveGenerators.length);
console.log("🔍 Sample generator:", interactiveGenerators[0]);
console.log("✅ Buses enriched from full_nodes:", busData.length);
console.log("🔍 Sample bus:", busData[0]);
console.log("✅ Enriched lines count:", fullLines.length);
console.log("🔍 Sample enriched line:", fullLines.find(l => l.normalLimit || l.currentFlow));
console.log("Lines loaded:", fullLines.length);
console.log("Sample line:", fullLines[0]);
console.log("Offline lines:", fullLines.filter(d => d.offline));

// Pass everything to the view
initListView(interactiveGenerators, fullNodes, fullLines)
});