//----------------------------------//
// 1. Global Variables
//----------------------------------//
let allNodes = [],
    allLinks = [],
    opBuses = [],
    opGenerators = [],
    opLines = [],
    nodeById = {};

let currentMode = "full";
let mode = ""; 

const svg = d3.select("#topology");
const group = svg.append("g");

const backgroundGroup = group.append("g").attr("id", "background-layer");
const foregroundGroup = group.append("g").attr("id", "foreground-layer");

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

const tooltip = d3.select("#tooltip");

function showTooltip(event, d) {
  tooltip
    .style("visibility", "visible")
    .html(d.id || d)
    .style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY + 10) + "px");
}

function moveTooltip(event) {
  tooltip
    .style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY + 10) + "px");
}

function hideTooltip() {
  tooltip.style("visibility", "hidden");
}

//----------------------------------//
// 3. Topology Drawing Function
//----------------------------------//
function drawTopology(group, nodes, links, faded = false, mode = "full") {

  console.log("🚨 drawTopology() CALLED", {
    group: group.attr("id") || "group",
    faded,
    nodesCount: nodes.length,
    linksCount: links.length,
    RECEIVED_MODE: mode,
    GLOBAL_MODE: currentMode
  });
  
  group.selectAll("*").remove(); // Clear previous content
  
  // 🔍 Visual debug markers
  group.append("text")
    .attr("x", 50)
    .attr("y", 50)
    .attr("font-size", "16px")
    .attr("fill", faded ? "gray" : "lime")
    .text(faded ? "FADED BG DRAW" : `ACTIVE MODE: ${mode}`);


  group.selectAll("path.link")
    .data(links)
    .enter()
    .append("path")
    .attr("class", "link")
    .attr("d", d => d.d)
    .attr("opacity", faded ? 0.1 : 1); // Fade effect

    group.selectAll("path.link")
    .on("mouseover", showTooltip)
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);

  const nodeGroups = group.selectAll(".node")
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
    })
    .attr("opacity", faded ? 0.2 : 1); // Fade effect

    nodeGroups
  .on("mouseover", showTooltip)
  .on("mousemove", moveTooltip)
  .on("mouseout", hideTooltip);

  nodeGroups.each(function(d) {
    const g = d3.select(this);
    let fillColor = "#fff", radius = 12;

    if (mode === "manual" && !faded) {
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
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(100))
        .attr("fill", fillColor);
    }
    
  });

  
}

//----------------------------------//
// 4. Full & Filtered Draw Wrappers
//----------------------------------//
function drawFullTopology() {
  console.log("⬜ drawFullTopology()");
  group.selectAll("*").remove();
  drawTopology(group, allNodes, allLinks, false, "full");
}

function drawFilteredTopology(filteredNodes, filteredLinks) {
  console.log("🟦 drawFilteredTopology()", {
    filteredNodes: filteredNodes.map(n => n.id),
    filteredLinks: filteredLinks.map(l => `${l.source} → ${l.target}`)
  });

  backgroundGroup.selectAll("*").remove();
  foregroundGroup.selectAll("*").remove();

  drawTopology(backgroundGroup, allNodes, allLinks, true, "manual");
  drawTopology(foregroundGroup, filteredNodes, filteredLinks, false, "manual");
}
//----------------------------------//
// 5. Mode Switch Logic
//----------------------------------//
async function updateVisualization(mode) {
  console.log("🧭 updateVisualization() called with mode:", mode);

  if (mode === "full") {
    console.log("UPDATE VIS ⬜ Drawing full topology...");
    drawFullTopology();
  } else {
    console.log("UPDATE VIS 🟦 Drawing filtered topology...");
    const busIds = new Set(opBuses.map(d => d.id));
    const genBusIds = new Set(opGenerators.map(d => d.busNumber));

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

    const matchedNodeIds = new Set(matchedNodes.map(n => n.id));

    const matchedLinks = allLinks.filter(link =>
      matchedNodeIds.has(link.source) && matchedNodeIds.has(link.target)
    );


    console.log("🟦 Drawing manual topology...");
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

  console.log("📦 Total topology nodes:", allNodes.length);
  console.log("🧩 Generator nodes:", allNodes.filter(n => n.type === "generator"));

  // Snap generators and loads to the correct positions
  fullLinks.forEach(link => {
    const sourceNode = nodeById[link.source];
    const targetNode = nodeById[link.target];

    [sourceNode, targetNode].forEach(node => {
      if (node && (node.type === "generator" || node.type === "load")) {
        const start = extractStartPoint(link.d);
        const end = extractEndPoint(link.d);
        if (start && end) {
          const closer = distance(node, start) < distance(node, end) ? start : end;
          if (!node.x || !node.y) {
            node.x = closer.x;
            node.y = closer.y;
          }
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
  mode = mode === "full" ? "manual" : "full";
  document.getElementById("mode-indicator").textContent =
    `Current Mode: ${mode === "full" ? "Full Topology" : "Manual Data"}`;
  updateVisualization(mode);
});

const zoom = d3.zoom()
  .scaleExtent([0.2, 4])
  .on("zoom", (event) => {
    group.attr("transform", event.transform);
  });

svg.call(zoom);
