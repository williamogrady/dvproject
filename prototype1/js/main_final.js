// May 19th, FINAL PUSH
// main_final.js
// Purpose: Load data, enrich as Generator/Bus/Line objects, and initialize the view

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { Generator } from '../classes/Generator.js';
import { Bus } from '../classes/Bus.js';
import { Line } from '../classes/Line.js';
import { initListView } from './views/listView.js';

// Loading and processing Data
Promise.all([
  d3.json('/prototype1/data/topology/full_nodes.json'),
  d3.json('/prototype1/data/topology/full_lines.json'),
  d3.json('/prototype1/data/operation/buses.json'),
  d3.json('/prototype1/data/operation/generators.json'),
  d3.json('/prototype1/data/operation/lines.json')
]).then(([fullNodes, fullLines, opBuses, opGenerators, opLines]) => {
  const generatorObjects = [];
  const busObjects = [];
  const lineObjects = [];

  const genByBusNumber = Object.fromEntries(opGenerators.map(d => [d.busNumber, d]));

  let busMismatchCount = 0;

  for (const node of fullNodes) {
    if (node.type === "generator") {
      const busNumber = parseInt(node.id.replace(/\D/g, ""), 10);
      const opGen = genByBusNumber[busNumber];

      // Creating Generator Objects
      const enrichedGenerators = new Generator(opGen ? {
        ...opGen,
        status: opGen.status || "off"
      } : {
        busNumber,
        region: "South",
        ratedMaxMW: 0,
        currentOutput: 0,
        status: "unavailable",
        id: node.id
      });

      Object.assign(enrichedGenerators, {
        type: "generator",
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rotation: node.rotation ?? 0,
        rotate: node.rotate,
        rotateX: node.rotateX,
        rotateY: node.rotateY,
        selected: false,
        filteredRegion: false
      });

      generatorObjects.push(enrichedGenerators);
      
      // Creating Bus Objects
    } else if (node.type === "bus") {
        const busId = node.id;
        const busNumber = parseInt(busId.replace(/\D/g, ""), 10);
      
        // Step 1: Get all line connections involving this bus
        const connectedFromTopo = fullLines
        .filter(line =>
        line.source === busId || line.target === busId // this bus is on either end
        )
        .map(line =>
        line.source === busId ? line.target : line.source // get the other node
        )
        .map(id =>
        parseInt(id.replace(/\D/g, ""), 10) // extract just the number
        )
        .sort(); // sort for consistent comparison

        // Step 2: Get the matching bus from the operational data
        const opBus = opBuses.find(b => busNumber); // double equals: loose match OK

        // Step 3: Extract and sort opBus.connectedTo (or default to empty array)
        const opConnected = (opBus?.connectedTo || []).slice().sort();

        // Step 4: Compare the two lists
        const matches = JSON.stringify(connectedFromTopo) === JSON.stringify(opConnected);

      
        if (!matches) {
          console.warn("🔍 Bus mismatch", busNumber, {
            fromTopo: connectedFromTopo,
            fromOp: opConnected
          });
          busMismatchCount++;
        }
      
        // Match load by number
        const loadNode = fullNodes.find(n =>
          n.type === "load" && parseInt(n.id.replace(/\D/g, ""), 10) === busNumber
        );
      
        // Match generators by number
        const connectedGenerators = fullNodes
          .filter(n =>
            n.type === "generator" &&
            fullLines.some(line => line.source === busId && line.target === n.id)
          )
          .map(n => n.id);
      
        const enriched = new Bus({
          ...node,
          connectedTo: connectedFromTopo,
          generators: connectedGenerators,
          load: loadNode ? {
            id: loadNode.id,
            x: loadNode.x,
            y: loadNode.y,
            width: loadNode.width,
            height: loadNode.height
          } : null
        });
      
        busObjects.push(enriched);
      }
    }
  

  for (const topLine of fullLines) {
    const fromId = topLine.source;
    const toId = topLine.target;

    const isBusToBus = fromId.startsWith("Bus") && toId.startsWith("Bus");
    const isBusToLoad = (fromId.startsWith("Bus") && toId.startsWith("Load")) || (fromId.startsWith("Load") && toId.startsWith("Bus"));
    const isBusToGen = (fromId.startsWith("Bus") && toId.startsWith("Gen")) || (fromId.startsWith("Gen") && toId.startsWith("Bus"));

    let opLine = null;
    if (isBusToBus) {
      const fromNumber = parseInt(fromId.replace("Bus", ""), 10);
      const toNumber = parseInt(toId.replace("Bus", ""), 10);

      opLine = opLines.find(line =>
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

    enriched.available = Boolean(opLine || isBusToLoad || isBusToGen);
    lineObjects.push(enriched);
  }

  initListView(generatorObjects, busObjects, lineObjects);
});
