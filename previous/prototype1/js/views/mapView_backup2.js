// mapView.js

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { systemState } from '/prototype1/logic/state.js';

//----------------------------------//
// 1. Global Variables
//----------------------------------//
let allNodes = [], allLinks = [], nodeById = {};
let opGenerators = [], opBuses = [], opLines = [];
let selectedGeneratorId = null;
let currentMode = "";
let generatorState = new Map(); // Add this at global scope

const uiState = {
  selectedGeneratorId: null,
  panelOpen: false,
  hoveredNodeId: null
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
  
    // Draw shapes based on type
    nodeGroups.each(function(d) {
      const g = d3.select(this);
  
      if (d.type === "generator") {
        const circle = g.append("circle")
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
          .on("click", event => {
            event.stopPropagation();
          
            if (uiState.selectedGeneratorId === d.id) {
              console.log("Unselecting generator", d.id);
              uiState.generatorselectedId = null;
              hideInfoPanel();
            } else {
              console.log("Selecting generator", d.id);
              uiState.selectedGeneratorId = d.id;
              showInfoPanel(d);
            }
          
            updateVisualization(mode);
            d3.selectAll(".node-generator-manual")
            .classed("selected-generator", d => d.id === uiState.selectedGeneratorId);
            console.log("Calling updateSystemStyle");
            updateSystemStyle(systemState, generatorState);
          });
      
        g.classed("selected-generator", d.id === uiState.selectedGeneratorId && !faded && mode === "manual");
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
  
    let visibleNodes = [], visibleLinks = [];
  
    if (mode === "full") {
      drawTopology(backgroundGroup, allNodes, allLinks, false, "full", uiState);
      return;
    }
  
    // Manual/other mode
    const manualNodeIds = new Set();
    opBuses.forEach(b => manualNodeIds.add("Bus" + b.id));
    opGenerators.forEach(g => manualNodeIds.add("Gen" + g.busNumber));
    opLines.forEach(l => manualNodeIds.add(l.id));
  
    visibleNodes = allNodes.filter(n =>
      manualNodeIds.has(n.id) || n.type === "load"
    );
    visibleLinks = allLinks.filter(l =>
      manualNodeIds.has(l.source) && manualNodeIds.has(l.target) ||
      isLoadLink(l)
    );
    
    function isLoadLink(link) {
      const source = nodeById[link.source];
      const target = nodeById[link.target];
      return (source?.type === "bus" && target?.type === "load") ||
             (source?.type === "load" && target?.type === "bus");
    }
  
    const backgroundNodes = allNodes.filter(n => !manualNodeIds.has(n.id));
    const backgroundLinks = allLinks.filter(l =>
      !(manualNodeIds.has(l.source) && manualNodeIds.has(l.target))
    );
  
    drawTopology(backgroundGroup, backgroundNodes, backgroundLinks, true, mode, uiState);
    drawTopology(foregroundGroup, visibleNodes, visibleLinks, false, mode, uiState);
  }
  



function attachGeneratorLogic(selection, generatorState, uiState) {
  selection.each(function(d) {
    const group = d3.select(this);
    const state = generatorState.get(d.id);
    const isSelected = d.id === uiState.selectedGeneratorId;

    // Status classes
    group
      .classed("generator-on", state?.status === "on")
      .classed("generator-off", state?.status === "off")
      .classed("selected-generator", isSelected);

    // Event handlers
    group.select("circle")
      .on("mouseover", event => showTooltip(event, d))
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip)
      .on("click", event => {
        event.stopPropagation();
        uiState.selectedGeneratorId = isSelected ? null : d.id;
        d3.selectAll(".node-generator-manual").call(attachGeneratorLogic, generatorState, uiState);
        if (uiState.selectedGeneratorId) {
          showInfoPanel(d);
        } else {
          hideInfoPanel();
        }
      });

    // Status text
    const label = group.select("text.generator-label");
    if (label.empty()) {
      group.append("text")
        .attr("class", "generator-label")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .text(state?.status === "on" ? "on" : "off");
    } else {
      label.text(state?.status === "on" ? "on" : "off");
    }
  });
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

export function updateSystemStyle(systemState, generatorState) {
  d3.selectAll(".node-generator-manual")
  .each(function(d) {
    const state = generatorState.get(d.id);
    d3.select(this)
      .classed("generator-on", state?.status === "on")
      .classed("generator-off", state?.status === "off");
      console.log("Current UI State:", uiState);
  });
  }
