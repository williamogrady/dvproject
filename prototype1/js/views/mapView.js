// mapView.js

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { systemState } from '/prototype1/logic/state.js';

//----------------------------------//
// 1. Global Variables
//----------------------------------//
let allNodes = [], allLinks = [], nodeById = {};
let generators = [];
let opGenerators = [], opBuses = [], opLines = [];
let selectedGeneratorId = null;
let currentMode = "";
let generatorState = new Map(); // Add this at global scope

const uiState = {
  selectedGeneratorId: null
};

const svg = d3.select("#map-canvas");
const group = svg.append("g");
const backgroundGroup = group.append("g").attr("id", "background-layer");
const foregroundGroup = group.append("g").attr("id", "foreground-layer");

// Tooltip and selection window
const tooltip = d3.select("#tooltip");
const selectionWindow = d3.select("#selection-window");

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

function showTooltip(event, d) {
  console.log("🔍 Tooltip triggered for:", d.id); // TEMP log
  if (d.x == null || d.y == null) return;

  if (selectedGeneratorId !== null && d.id !== selectedGeneratorId) {
    tooltip
      .style("visibility", "visible")
      .html(d.id || d)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY + 10) + "px");
    return;
  }

  if (selectedGeneratorId === null) {
    tooltip
      .style("visibility", "visible")
      .html(d.id || d)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY + 10) + "px");
  }
}

function moveTooltip(event) {
  tooltip.style("left", (event.pageX + 10) + "px")
         .style("top", (event.pageY + 10) + "px");
}

function hideTooltip(event, d) {
  if (selectedGeneratorId !== null && d.id !== selectedGeneratorId) return;
  tooltip.style("visibility", "hidden");
}

/*
function getOpGeneratorData(genId) {
  const busNum = parseInt(genId.replace("Gen", ""));
  return generators.find(d => d.busNumber === busNum);
}
*/

function showInfoPanel(d) {
  const gen = opGenerators.find(g => g.id === d.id);
  if (!gen) return;

  selectionWindow
    .style("visibility", "visible")
    .style("left", `${d.x}px`)
    .style("top", `${d.y - 40}px`)
    .html(`
      <div><strong>${d.id}</strong></div>
      <div>Min: ${gen.ratedMinMW} MW</div>
      <div>Max: ${gen.ratedMaxMW} MW</div>
      <div style="color: steelblue; margin-top: 6px;">Selected</div>
    `);
}

function hideInfoPanel() {
  selectionWindow.style("visibility", "hidden");
}


export function setGeneratorState(state) {
    generatorState = state;
  }

//----------------------------------//
// 3. Drawing Functions
//----------------------------------//
function drawTopology(group, nodes, links, faded = false, mode = "manual", uiState) {
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
      console.log("Assigning classes:", classes.join(" "));
      return classes.join(" ");
    })
    .attr("transform", d => {
      let base = `translate(${d.x}, ${d.y})`;
      if (d.type === "bus" && d.rotate !== undefined && d.rotateX !== null && d.rotateY !== null) {
        return `${base} rotate(${d.rotate}, ${d.rotateX - d.x}, ${d.rotateY - d.y})`;
      }
      return base;
    });

  // Draw shapes
  nodeGroups.each(function(d) {
    const g = d3.select(this);

    if (d.type === "generator") {
      g.append("circle")
        .attr("r", 20)
        .attr("class", () => {
          const base = "generator-circle";
          const state = generatorState.get(d.id);
          return state?.status === "off"
            ? `${base} generator-off`
            : `${base} generator-on`;
        })
        .on("mouseover", event => showTooltip(event, d))
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .on("click", function(event, d) {
          event.stopPropagation();
          uiState.selectedGeneratorId = uiState.selectedGeneratorId === d.id ? null : d.id;
          updateGeneratorVisuals(generatorState, uiState);
          showInfoPanel(d); // optional
        });

      g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("pointer-events", "none")  // so it doesn't block clicks
      .attr("class", "generator-label")
      .text(d => {
        const state = generatorState.get(d.id);
        return state?.status === "off" ? "off" : "on";
      });
    }

    else if (d.type === "bus") {
      g.append("rect")
        .attr("x", -d.width / 2)
        .attr("y", -d.height / 2)
        .attr("width", d.width)
        .attr("height", d.height);
    }

    else if (d.type === "load") {
      g.append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(100));
    }
  });
}

 
  
function updateGeneratorVisuals(generatorState, uiState) {
  d3.selectAll(".node-generator").each(function(d) {
    const g = d3.select(this);
    const isSelected = d.id === uiState.selectedGeneratorId;
    const state = generatorState.get(d.id);

    g.classed("selected-generator", isSelected);

    g.select("text.generator-label")
  .text(() => {
    const state = generatorState.get(d.id);
    return state?.status === "off" ? "off" : "on";
  });

    g.select("circle")
      .attr("class", () => {
        const base = "generator-circle";
        return state?.status === "off"
          ? `${base} generator-off`
          : `${base} generator-on`;
      })
  });
}



//----------------------------------//
// 4. Visualization Logic
//----------------------------------//
export function updateVisualization(mode) {
  console.log("Updating visualization with mode:", mode);
  currentMode = mode;

  // Set .visible on each generator depending on mode
  generators.forEach(g => {
    g.visible = (mode === "full") || g.available;
  });

  // Split nodes by visibility
  const visibleGenerators = generators.filter(g => g.visible);
  const backgroundGenerators = generators.filter(g => !g.available && g.visible);

  const visibleNodes = [
    ...allNodes.filter(n => n.type !== "generator"),
    ...visibleGenerators
  ];

  const backgroundNodes = backgroundGenerators;

  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const backgroundNodeIds = new Set(backgroundNodes.map(n => n.id));

  const visibleLinks = allLinks.filter(l =>
    visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target)
  );
  const backgroundLinks = allLinks.filter(l =>
    backgroundNodeIds.has(l.source) && backgroundNodeIds.has(l.target)
  );

  backgroundGroup.selectAll("*").remove();
  foregroundGroup.selectAll("*").remove();

  drawTopology(backgroundGroup, backgroundNodes, backgroundLinks, true, "full", uiState);
  drawTopology(foregroundGroup, visibleNodes, visibleLinks, false, "manual", uiState);
}
  

//----------------------------------//
// 5. Export to main.js
//----------------------------------//
export function initMapView(nodesArg, linksArg, generatorsArg, busesArg, linesArg, mode) {
  allNodes = nodesArg;
  allLinks = linksArg;
  generators = generatorsArg; // ← this is the fix
  opBuses = busesArg;
  opLines = linesArg;
  nodeById = Object.fromEntries(allNodes.map(d => [d.id, d]));
  

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

export function updateSystemStyle(systemState, generatorState) {
  d3.selectAll(".node-generator-manual")
  .each(function(d) {
    const state = generatorState.get(d.id);
    d3.select(this)
      .classed("generator-on", state?.status === "on")
      .classed("generator-off", state?.status === "off");
      
  });
  }
