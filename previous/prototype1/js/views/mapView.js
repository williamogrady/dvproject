// mapView.js (refactored to object-oriented generator structure)

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

let allNodes = [], allLinks = [], nodeById = {};
let opGenerators = [], opBuses = [], opLines = [];
let currentMode = "";

const uiState = {
  selectedGeneratorId: null,
  panelOpen: false,
  hoveredNodeId: null
};

const svg = d3.select("#topology");
const group = svg.append("g");
const backgroundGroup = group.append("g").attr("id", "background-layer");
const foregroundGroup = group.append("g").attr("id", "foreground-layer");

const tooltip = d3.select("#tooltip");
const selectionWindow = d3.select("#generator-menu");

function showTooltip(event, d) {
  if (d.x == null || d.y == null) return;
  tooltip
    .style("visibility", "visible")
    .html(d.getTooltipText ? d.getTooltipText() : d.id)
    .style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY + 10) + "px");
}

function moveTooltip(event) {
  tooltip.style("left", (event.pageX + 10) + "px")
         .style("top", (event.pageY + 10) + "px");
}

function hideTooltip() {
  tooltip.style("visibility", "hidden");
}

function showInfoPanel(gen) {
  selectionWindow
    .style("visibility", "visible")
    .style("left", `${gen.x}px`)
    .style("top", `${gen.y - 40}px`)
    .html(`
      <div><strong>${gen.station}</strong></div>
      <div>Output: ${gen.currentOutput} MW</div>
      <div>Min: ${gen.ratedMinMW} MW</div>
      <div>Max: ${gen.ratedMaxMW} MW</div>
    `);
}

function hideInfoPanel() {
  selectionWindow.style("visibility", "hidden");
}


// drawing functions

function drawFullTopology(nodes, links) {
  console.log("🎯 Drawing full topology with", nodes.length, "nodes and", links.length, "links");

  // Draw all lines
  backgroundGroup.selectAll("path.link-full")
    .data(links)
    .enter()
    .append("path")
    .attr("class", "link link-full")
    .attr("d", d => d.d);

  // Draw all nodes
  const nodeGroups = backgroundGroup.selectAll(".full-node")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", d => `full-node ${d.type}`)
    .attr("transform", d => `translate(${d.x}, ${d.y})`);

  nodeGroups.each(function(d) {
    const g = d3.select(this);

    if (d.type === "bus") {
      g.append("rect")
        .attr("x", -d.width / 2)
        .attr("y", -d.height / 2)
        .attr("width", d.width)
        .attr("height", d.height)
        .attr("fill", "#ccc"); // Optional: fallback fill
    }

    else if (d.type === "generator") {
      g.append("circle")
        .attr("r", d.radius)
        .attr("fill", "#aaa");
    }

    else if (d.type === "load") {
      g.append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(d.size))
        .attr("fill", "steelblue");
    }

    else {
      g.append("circle")
        .attr("r", 8)
        .attr("fill", "red");
    }
  });
}



function drawOperationalTopology(gens, buses, lines) {
  const opNodeGroups = foregroundGroup.selectAll(".op-node")
    .data([...gens, ...buses])
    .enter()
    .append("g")
    .attr("class", d => `node ${d.getCSSClass?.() || d.type}`)
    .attr("transform", d => `translate(${d.x}, ${d.y})`);

  opNodeGroups.each(function(d) {
    const g = d3.select(this);

    if (d.toggle) {
      g.append("circle")
        .attr("r", 20)
        .on("click", () => {
          d.toggle();
          updateSystemStyle(null, opGenerators);
          updateVisualization(currentMode);
        });
    } else if (d.type === "bus") {
      g.append("rect").attr("x", -6).attr("y", -6).attr("width", 12).attr("height", 12);
    }
  });

  foregroundGroup.selectAll("path.op-line")
    .data(lines)
    .enter()
    .append("path")
    .attr("class", d => `line ${d.status}`)
    .attr("d", d => d.getPathD());
}


export function updateVisualization(mode) {
  currentMode = mode;

  backgroundGroup.selectAll("*").remove();
  foregroundGroup.selectAll("*").remove();

  console.log("👀 Calling drawFullTopology with", allNodes.length, "nodes and", allLinks.length, "links");
drawFullTopology(allNodes, allLinks);


  if (mode === "manual") {
    drawOperationalTopology(opGenerators, opBuses, opLines);
  }
}

export function initMapView(nodes, links, generators, buses, lines, mode) {
  console.log("Initializing map view with mode:", mode);

  allNodes = nodes;
  allLinks = links;
  opGenerators = generators;
  opBuses = buses;
  opLines = lines;
  nodeById = Object.fromEntries(nodes.map(d => [d.id, d]));

  // Extract generator/load positions if missing (fallback from topology lines)
  allLinks.forEach(link => {
    const source = nodeById[link.source];
    const target = nodeById[link.target];
    [source, target].forEach(node => {
      if (node && (node.type === "generator" || node.type === "load") && (!node.x || !node.y)) {
        const point = extractClosestPoint(link.d, node);
        node.x = point.x;
        node.y = point.y;
      }
    });
  });

  allNodes.forEach(n => {
    if ((n.type === "generator" || n.type === "load") && (isNaN(n.x) || isNaN(n.y))) {
      n.x = -9999;
      n.y = -9999;
    }
  });

  // Attach zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on("zoom", event => group.attr("transform", event.transform));

  svg.call(zoom);

  updateVisualization(mode);
}


export function updateSystemStyle(systemState, generators) {
  d3.selectAll(".node-generator-manual")
    .attr("class", d => d.getCSSClass());
}