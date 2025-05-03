// mapView.js

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

//----------------------------------//
// 1. Global Variables
//----------------------------------//
let allNodes = [], allLinks = [], nodeById = {};
let opGenerators = [], opBuses = [], opLines = [];
let selectedGeneratorId = null;
let currentMode = "";
let generatorState = new Map(); // Add this at global scope


const svg = d3.select("#map-canvas");
const group = svg.append("g");
const backgroundGroup = group.append("g").attr("id", "background-layer");
const foregroundGroup = group.append("g").attr("id", "foreground-layer");

const infoBubbleGroup = group.append("g").attr("id", "info-bubble-layer");

const tooltip = d3.select("#tooltip");

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
    // Check: only allow hover tooltip if d has valid coordinates (node), otherwise do nothing
    if (d.x == null || d.y == null) {
      return;
    }
  
    if (selectedGeneratorId !== null && d.id !== selectedGeneratorId) {
      // Show hover tooltip near mouse even when something is selected
      tooltip
        .style("visibility", "visible")
        .html(d.id || d)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px")
        .style("font-size", "14px")
        .style("width", "auto");
      return;
    }
  
    if (selectedGeneratorId === null) {
      tooltip
        .style("visibility", "visible")
        .html(d.id || d)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px")
        .style("font-size", "14px")
        .style("width", "auto");
    }
  }
  
  
  

function moveTooltip(event) {
  tooltip.style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY + 10) + "px");
}

function hideTooltip(event, d) {
    if (selectedGeneratorId !== null && d.id !== selectedGeneratorId) {
      d3.select("#hover-tooltip").remove(); // Only remove lightweight hover tooltip
      return;
    }
    if (selectedGeneratorId === null) {
      tooltip.style("visibility", "hidden");
    }
  }
  
  

  function showPinnedTooltip(d) {
    const opGen = getOpGeneratorData(d.id);
    if (!opGen) return;
  
    tooltip
      .style("visibility", "visible")
      .style("left", `${d.x}px`)
      .style("top", `${d.y - 30}px`)
      .style("font-size", "20px")
      .style("width", "260px")
      .html(`
        <div><strong>${d.id} (${opGen.station})</strong></div>
        <div>ratedMinMW: ${opGen.ratedMinMW}</div>
        <div>ratedMaxMW: ${opGen.ratedMaxMW}</div>
        <div style="margin-top:8px; color: steelblue;"><strong>Selected</strong></div>
      `);
  }
  

  function showInfoBubble(d) {
    const opGen = getOpGeneratorData(d.id);
    if (!opGen) return;
  
    infoBubbleGroup.selectAll("*").remove(); // Only one bubble at a time
  
    infoBubbleGroup.append("foreignObject")
      .attr("x", d.x + 10)
      .attr("y", d.y - 50)
      .attr("width", 220)
      .attr("height", 120)
      .append("xhtml:div")
      .style("background", "white")
      .style("border", "1px solid #ccc")
      .style("border-radius", "8px")
      .style("padding", "10px")
      .style("font-family", "sans-serif")
      .style("font-size", "14px")
      .style("box-shadow", "0px 2px 10px rgba(0,0,0,0.2)")
      .html(`
        <div><strong>${d.id} (${opGen.station})</strong></div>
        <div>ratedMinMW: ${opGen.ratedMinMW}</div>
        <div>ratedMaxMW: ${opGen.ratedMaxMW}</div>
        <div style="margin-top:8px; color: steelblue;"><strong>Selected</strong></div>
      `);
  }

function getOpGeneratorData(genId) {
    const busNum = parseInt(genId.replace("Gen", ""));
    return opGenerators.find(d => d.busNumber === busNum);
  }


export function setGeneratorState(state) {
    generatorState = state;
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
      });
  
    // Draw shapes based on type
    nodeGroups.each(function(d) {
      const g = d3.select(this);
  
      if (d.type === "generator") {
        g.append("circle")
  .attr("r", 12)
  .attr("class", () => {
    // We'll rely on class-based styling instead of inline fill
    return "generator-circle";
  })
  .on("mouseover", function(event) {
    const d = g.datum();
    const state = generatorState.get(d.id)?.status || "unknown";
    showTooltip(event, { id: `${d.id} (${state})` });
  })
  .on("mousemove", moveTooltip)
  .on("mouseout", hideTooltip)
  .on("mousemove", moveTooltip)
   .on("mouseout", hideTooltip);
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
      drawTopology(backgroundGroup, allNodes, allLinks, false, "full");
      return;
    }
  
    // Manual/other mode
    const manualNodeIds = new Set();
    opBuses.forEach(b => manualNodeIds.add("Bus" + b.id));
    opGenerators.forEach(g => manualNodeIds.add("Gen" + g.busNumber));
    opLines.forEach(l => manualNodeIds.add(l.id));
  
    visibleNodes = allNodes.filter(n => manualNodeIds.has(n.id));
    visibleLinks = allLinks.filter(l =>
      manualNodeIds.has(l.source) && manualNodeIds.has(l.target)
    );
  
    const backgroundNodes = allNodes.filter(n => !manualNodeIds.has(n.id));
    const backgroundLinks = allLinks.filter(l =>
      !(manualNodeIds.has(l.source) && manualNodeIds.has(l.target))
    );
  
    drawTopology(backgroundGroup, backgroundNodes, backgroundLinks, true, mode);
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

export function updateSystemStyle(systemState, generatorState) {
  d3.selectAll(".node-generator-manual")
  .each(function(d) {
    const state = generatorState.get(d.id);
    d3.select(this)
      .classed("generator-on", state?.status === "on")
      .classed("generator-off", state?.status === "off");
  });
  }
