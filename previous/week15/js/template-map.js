// Attempt at adapting D3's ForceGraph for the IEEE 118 Data

// Import Grid Data
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"; // needed if you're using ES module in browser

  const buses = await d3.json("week15/data/buses.json");
  const lines = await d3.json("week15/data/lines.json");
  const west = await d3.json("week15/data/generators/west-generators.json");
  const north = await d3.json("week15/data/generators/north-generators.json");
  const south = await d3.json("week15/data/generators/south-generators.json");

  const generators = [...west, ...north, ...south];


// 1. Create nodes 

const nodes = [];
const links = [];

// --- Buses ---
for (const bus of buses) {
  nodes.push({ id: bus.id, group: "bus" });

  // --- Loads (if any) ---
  if (bus.hasLoad) {
    const loadId = `load-${bus.id}`;
    nodes.push({ id: loadId, group: "load" });
    links.push({ source: loadId, target: bus.id });
  }
}

// --- Generators ---
for (const gen of generators) {
  const genId = `gen-${gen.busNumber}`;
  nodes.push({ id: genId, group: "generator" });
  links.push({ source: genId, target: gen.busNumber });
}

// --- Output ---
console.log("Nodes:", nodes);
console.log("Links:", links);



// 2. Create links

// Bus to bus links
for (const bus of buses) {
    for (n in bus.isConnected) {
        const connectedBusId = bus.isConnected[n];
        const busLink = { source: bus.id, target: connectedBusId };
        links.push(busLink);
    }
}

// Bus to generator links
for (const gen of generators) {
    const busId = gen.busNumber;
    const bus = buses.find(b => b.id === busId);
    if (bus) {
        const busLink = { source: busId, target: busId };
        links.push(busLink);
    }
}

// Bus to load links
for (const bus of buses) {
    if (bus.hasLoad) {
        const loadId = `load-${bus.id}`;
        const busLink = { source: bus.id, target: loadId };
        links.push(busLink);
    }
}

// 3. Colour nodes by group

// color all bus nodes gray
const busColor = "gray";
for (const node of nodes) {
    if (node.group === "bus") {
        node.color = busColor;
    }
}
// color all generator nodes green
const generatorColor = "green";
for (const node of nodes) {
    if (node.group === "generator") {
        node.color = generatorColor;
    }
}

// color all load nodes blue
const loadColor = "blue";  
for (const node of nodes) {
    if (node.group === "load") {
        node.color = loadColor;
    }
}
