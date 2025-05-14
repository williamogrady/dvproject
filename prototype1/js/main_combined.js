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
  const interactiveGenerators = [];

  // Create lookup from busNumber → generatorData
const genByBusNumber = Object.fromEntries(generatorData.map(d => [d.busNumber, d]));

for (const node of fullNodeData) {
  if (node.type === "generator") {
    // Extract bus number from ID like "Gen4"
    const busNumber = parseInt(node.id.replace(/\D/g, ""), 10);
    const opGen = genByBusNumber[busNumber];
    if (opGen) {
      const enriched = new Generator(opGen);
      enriched.x = node.x;
      enriched.y = node.y;
      enriched.width = node.width;
      enriched.height = node.height;
      enriched.rotation = node.rotation ?? 0;
      enriched.rotate = node.rotate;
      enriched.rotateX = node.rotateX;
      enriched.rotateY = node.rotateY;
      enriched.selected = false;
      enriched.northGroup = false;
      enriched.currentOutput = 0;
      fullNodes.push(enriched);
      interactiveGenerators.push(enriched);
      continue; // don't fall through
    }
  }

   // For all non-interactive generators, buses, loads, etc.
  fullNodes.push({ ...node });
}

  // Step 2: enrich lines with SVG path coordinates
 const fullLines = fullLineData.map(topLine => {
  const fromId = topLine.source; // e.g., "Bus77"
  const toId = topLine.target;

  const fromNumber = parseInt(fromId.replace(/\D/g, ""), 10);
  const toNumber = parseInt(toId.replace(/\D/g, ""), 10);

  const opLine = lineProps.find(line =>
    (line.from_number === fromNumber && line.to_number === toNumber) ||
    (line.from_number === toNumber && line.to_number === fromNumber)
  );

  const enriched = new Line({
    ...(opLine || {}),
    id: topLine.id,
    from: fromId,
    to: toId
  });

  enriched.d = topLine.d;
  return enriched;
});

  console.log("✅ Interactive generator objects created:", interactiveGenerators.length);
  console.log("🔍 Sample generator:", interactiveGenerators[0]);

  console.log("✅ Buses enriched from full_nodes:", busData.length);
  console.log("🔍 Sample bus:", busData[0]);

  console.log("✅ Enriched lines count:", fullLines.length);
console.log("🔍 Sample enriched line:", fullLines.find(l => l.normalLimit || l.currentFlow));

  console.log("Lines loaded:", fullLines.length);
  console.log("Sample line:", fullLines[0]);



  // Step 3: pass everything to listView
  initListView(interactiveGenerators, fullNodes, fullLines);
});
