// mapView.js

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

//----------------------------------//
// 1. Global Variables
//----------------------------------//
let allNodes = [], allLinks = [], nodeById = {};
let opGenerators = [], opBuses = [], opLines = [];
let selectedGeneratorId = null;
let currentMode = "";

const svg = d3.select("#map-canvas");
const group = svg.append("g");
const backgroundGroup = group.append("g").attr("id", "background-layer");
const foregroundGroup = group.append("g").attr("id", "foreground-layer");

//----------------------------------//
// 2. Utility Functions
//----------------------------------//
function extractClosestPoint(dString, node) {
  const matchStart = dString.match(/M\s*([\d.]+)[ ,]([\d.]+)/);
  const endCoords = dString.trim().split(/[A-Za-z]/).filter(Boolean).at(-1)
    .trim().split(/[ ,]/).map(Number);
  const start = matchStart ? { x: +matchStart[1], y: +matchStart[2] } : null;
  const end = { x: endCoords[0], y: endCoords[1] };
  return (!start || distance(node, end) < distance(node, start)) ? end : start;
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

//----------------------------------//
// 3. Drawing Functions
//----------------------------------//
function drawTopology(group, nodes, links, faded = false, mode = "manual") {
    console.log("Drawing topology with mode:", mode);
  
    // Draw lines
    group.selectAll("path.link")
      .data(links)
      .enter()
      .append("path")
      .attr("class", () => {
        if (mode === "full" || faded) return "link link-full";
        else return "link link-manual";
      })
      .attr("d", d => d.d);
  
    // Draw node groups
    const nodeGroups = group.selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", d => {
        let classes = ["node", d.type];
        if (mode === "full" || faded) {
          classes.push("node-full");
        } else {
          classes.push(`node-${d.type}-manual`);
          if (faded) classes.push("faded");
        }
        return classes.join(" ");
      })
      .attr("transform", d => {
        let base = `translate(${d.x}, ${d.y})`;
        if (d.type === "bus" && d.rotate !== undefined && d.rotateX !== null && d.rotateY !== null) {
          return `${base} rotate(${d.rotate}, ${d.rotateX - d.x}, ${d.rotateY - d.y})`;
        }
        return base;
      })
  
    // Draw shapes based on type
    nodeGroups.each(function(d) {
      const g = d3.select(this);
  
      if (d.type === "generator") {
        g.append("circle").attr("r", 12);
      } else if (d.type === "bus") {
        g.append("rect")
          .attr("x", -d.width / 2)
          .attr("y", -d.height / 2)
          .attr("width", d.width)
          .attr("height", d.height);
      } else if (d.type === "load") {
        g.append("path")
          .attr("d", d3.symbol().type(d3.symbolTriangle).size(100));
      }
    });
  }
  

//----------------------------------//
// 4. Visualization Logic
//----------------------------------//
export function updateVisualization(mode) {
    console.log("Updating visualization with mode:", mode);
  currentMode = mode;

  backgroundGroup.selectAll("*").remove();
  foregroundGroup.selectAll("*").remove();

  let visibleNodes = [];

  if (mode === "full") {
    drawTopology(backgroundGroup, allNodes, allLinks, false, "full");
  } else if (mode === "manual") {
    visibleNodes = allNodes.filter(n => {
      const idNum = parseInt(n.id.replace(/(Bus|Gen|Load)/, ""));
      if (n.id.startsWith("Bus")) return opBuses.some(b => b.id === idNum);
      if (n.id.startsWith("Gen")) return opGenerators.some(g => g.busNumber === idNum);
      if (n.id.startsWith("Load")) return opBuses.some(b => b.id === idNum);
      return false;
    });
  } else if (mode === "generators-only") {
    visibleNodes = allNodes.filter(n => n.type === "generator");
  }

  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleLinks = allLinks.filter(l =>
    visibleIds.has(l.source) && visibleIds.has(l.target)
  );

  drawTopology(backgroundGroup, allNodes, allLinks, true, mode);
  drawTopology(foregroundGroup, visibleNodes, visibleLinks, false, mode);
}

//----------------------------------//
// 5. Export to main.js
//----------------------------------//
export function initMapView(nodes, links, generators, buses, lines, mode) {

  console.log("Initializing map view with mode:", mode);
  allNodes = nodes;
  allLinks = links;
  opGenerators = generators;
  opBuses = buses;
  opLines = lines;
  nodeById = Object.fromEntries(nodes.map(d => [d.id, d]));

  

  allLinks.forEach(link => {
    const source = nodeById[link.source];
    const target = nodeById[link.target];
    [source, target].forEach(node => {
      if (node && (node.type === "generator" || node.type === "load")) {
        const point = extractClosestPoint(link.d, node);
        if (!node.x || !node.y) {
          node.x = point.x;
          node.y = point.y;
        }
      }
    });
  });

  allNodes.forEach(n => {
    if ((n.type === "generator" || n.type === "load") && (isNaN(n.x) || isNaN(n.y))) {
      n.x = -9999;
      n.y = -9999;
    }
  });


    const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on("zoom", (event) => {
        group.attr("transform", event.transform);
    });

    svg.call(zoom);

  updateVisualization(mode);

}

export function updateSystemStyle(systemState) {
    d3.selectAll(".node-generator-manual")
      .each(function(d) {
        const gen = opGenerators.find(g => "Gen" + g.busNumber === d.id);
        d3.select(this).select("circle")
          .attr("fill", gen?.currentOutput > 0 ? "#87e291" : "none");
      });
  }
  

