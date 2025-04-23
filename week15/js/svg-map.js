//----------------------------------//
// 1. Global Variables
//----------------------------------//
let allNodes = [],
    allLinks = [],
    opBuses = [],
    opGenerators = [],
    opLines = [],
    nodeById = {};

let currentMode = "full"; // 'manual' is the other mode

const svg = d3.select("#topology");
const svgGroup = svg.append("g");

//----------------------------------//
// 2. Utility Functions
//----------------------------------//
function extractStartPoint(dString) {
  const match = dString.match(/M\s*([\d.]+)[ ,]([\d.]+)/);
  return match ? { x: +match[1], y: +match[2] } : null;
}

function extractEndPoint(dString) {
  const commands = dString.trim().split(/[A-Za-z]/).filter(Boolean);
  const last = commands.at(-1).trim().split(/[ ,]/).map(Number);
  return { x: last[0], y: last[1] };
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

//----------------------------------//
// 3. Topology Drawing Function
//----------------------------------//
function drawTopology(nodes, links) {
  svgGroup.selectAll("*").remove(); // Clear previous

  // Draw links
  svgGroup.selectAll("path.link")
    .data(links)
    .enter()
    .append("path")
    .attr("class", "link")
    .attr("d", d => d.d);

  // Draw nodes
  const nodeGroups = svgGroup.selectAll(".node")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", d => `node ${d.type}`)
    .attr("transform", d => {
      let base = `translate(${d.x}, ${d.y})`;
      if (d.type === "bus" && d.rotate !== undefined && d.rotateX !== null && d.rotateY !== null) {
        return `${base} rotate(${d.rotate}, ${d.rotateX - d.x}, ${d.rotateY - d.y})`;
      }
      return base;
    });

  nodeGroups.each(function(d) {
    const g = d3.select(this);
    let fillColor = "#fff", radius = 12;

    if (currentMode === "manual") {
      if (d.type === "generator") fillColor = "#6ecff6";
      if (d.type === "bus") fillColor = "#4aa3df";
      if (d.type === "load") fillColor = "#007acc";
    } else {
      if (d.type === "generator") fillColor = "#87e291";
      if (d.type === "bus") fillColor = "#999999";
      if (d.type === "load") fillColor = "#54e2f7";
    }

    if (d.type === "generator") {
      g.append("circle").attr("r", radius).attr("fill", fillColor);
    } else if (d.type === "bus") {
      g.append("rect")
        .attr("x", d => -d.width / 2)
        .attr("y", d => -d.height / 2)
        .attr("width", d => d.width)
        .attr("height", d => d.height)
        .attr("fill", fillColor);
    } else if (d.type === "load") {
      g.append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(300))
        .attr("fill", fillColor);
    }
  });

  nodeGroups.append("text")
    .text(d => d.id)
    .attr("y", -15)
    .attr("text-anchor", "middle");
}

//----------------------------------//
// 4. Full & Filtered Draw Wrappers
//----------------------------------//
function drawFullTopology() {
  console.log("🔁 Drawing FULL topology");
  drawTopology(allNodes, allLinks);
}

function drawFilteredTopology(filteredNodes, filteredLinks) {
  console.log("🔁 Drawing MANUAL topology");
  drawTopology(filteredNodes, filteredLinks);
}

//----------------------------------//
// 5. Mode Switch Logic
//----------------------------------//
async function updateVisualization(mode) {
  console.log(`🧭 Switching to mode: ${mode}`);

  if (mode === "full") {
    drawFullTopology();
  } else {
    const busIds = new Set(opBuses.map(d => d.id));
    const genBusIds = new Set(opGenerators.map(d => d.busNumber));

    console.log("✅ opGenerators", opGenerators.map(g => ({ id: g.id, bus: g.bus })));
    console.log("✅ opLines", opLines.map(l => [l.from_number, l.to_number]));

    const matchedNodes = allNodes.filter(node => {
      const idNum = parseInt(node.id.replace(/(Bus|Gen|Load)/, ""));
      if (node.id.startsWith("Bus")) return busIds.has(idNum);
      if (node.id.startsWith("Gen")) {
        const busNum = parseInt(node.id.replace("Gen", ""));
        return genBusIds.has(busNum);
      }
      if (node.id.startsWith("Load")) return busIds.has(idNum);
      return false;
    });

    const opLineKeys = new Set(opLines.map(l =>
        [l.from_number, l.to_number].sort((a, b) => a - b).join("-")
      ));
      
      const matchedLinks = allLinks.filter(link => {
        const from = parseInt(link.source.replace(/(Bus|Gen|Load)/, ""));
        const to = parseInt(link.target.replace(/(Bus|Gen|Load)/, ""));
        const key = [from, to].sort((a, b) => a - b).join("-");
        return opLineKeys.has(key);
      });

    console.log("✔️ Matched Generator Nodes:", matchedNodes.filter(n => n.type === "generator"));
    console.log("✔️ Matched Links:", matchedLinks.length);
    drawFilteredTopology(matchedNodes, matchedLinks);
  }
}

//----------------------------------//
// 6. Data Load (initialization)
//----------------------------------//
Promise.all([
  d3.json("./week15/data/topology/full_nodes.json"),
  d3.json("./week15/data/topology/full_lines.json"),
  d3.json("./week15/data/operation/buses.json"),
  d3.json("./week15/data/operation/generators.json"),
  d3.json("./week15/data/operation/lines.json")
]).then(([nodes, fullLinks, buses, generators, lines]) => {
  allNodes = nodes;
  allLinks = fullLinks;
  opBuses = buses;
  opGenerators = generators;
  opLines = lines;
  nodeById = Object.fromEntries(nodes.map(d => [d.id, d]));

  // Snap generators and loads to the correct positions
  fullLinks.forEach(link => {
    [link.source, link.target].forEach(id => {
      const node = nodeById[id];
      if (node && (node.type === "generator" || node.type === "load")) {
        const start = extractStartPoint(link.d);
        const end = extractEndPoint(link.d);
        if (start && end) {
          const closer = distance(node, start) < distance(node, end) ? start : end;
          node.x = closer.x;
          node.y = closer.y;
        }
      }
    });
  });

  allNodes.forEach(n => {
    if ((n.type === "generator" || n.type === "load") &&
        (typeof n.x !== 'number' || typeof n.y !== 'number')) {
      n.x = -9999;
      n.y = -9999;
    }
  });

  updateVisualization("full"); // Start in full mode
});

//----------------------------------//
// 7. Event Listeners
//----------------------------------//
document.getElementById("change-mode").addEventListener("click", () => {
  currentMode = currentMode === "full" ? "manual" : "full";
  document.getElementById("mode-indicator").textContent =
    `Current Mode: ${currentMode === "full" ? "Full Topology" : "Manual Data"}`;
  updateVisualization(currentMode);
});

const zoom = d3.zoom()
  .scaleExtent([0.2, 4])
  .on("zoom", (event) => {
    svgGroup.attr("transform", event.transform);
  });

svg.call(zoom);
