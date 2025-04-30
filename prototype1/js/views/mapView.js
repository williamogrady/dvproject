//----------------------------------//
// 1. Global Variables
//----------------------------------//
let allNodes = [],
    allLinks = [],
    nodeById = {};

let mode = "manual"; 

let selectedGeneratorId = null;

const svg = d3.select("#topology");
const group = svg.append("g");  

const infoBubbleGroup = group.append("g").attr("id", "info-bubble-layer");

const tooltip = d3.select("#tooltip");

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
   
  
//----------------------------------//
// 3. Drawing Functions
//----------------------------------//
function drawTopology(group, nodes, links, faded = false, mode = "full") {
    console.log("🚨 drawTopology() called with mode:", mode, "faded:", faded);
  
      // Draw Links
  group.selectAll("path.link")
  .data(links)
  .enter()
  .append("path")
  .attr("class", d => {
    if (mode === "full") return "link link-full";
    if (mode === "manual" && faded) return "link link-manual-faded";
    return "link link-manual";
  })
  .attr("d", d => d.d)
  .on("mouseover", showTooltip)
  .on("mousemove", moveTooltip)
  .on("mouseout", hideTooltip);
    
    // Draw Nodes
    const nodeGroups = group.selectAll(".node")
  .data(nodes)
  .enter()
  .append("g")
  .attr("class", d => {
    let classes = ["node"];

    if (mode === "full" || faded) {
      classes.push("node-full", d.type);
    } else if (mode === "manual" && !faded) {
      if (d.type === "generator") classes.push("node-generator-manual");
      if (d.type === "bus") classes.push("node-bus-manual");
      if (d.type === "load") classes.push("node-load-manual");
    }

    if (selectedGeneratorId === d.id && mode === "manual" && !faded) {
      classes.push("selected-generator");
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
  .on("mouseover", showTooltip)
  .on("mousemove", moveTooltip)
  .on("mouseout", hideTooltip);
  
    nodeGroups.each(function(d) {
      const g = d3.select(this);
  
      let fillColor = "#fff"; // Default
  
      if (mode === "manual" && !faded) {
        fillColor = "steelblue"; // Force all manual nodes to steelblue
      } else {
        if (d.type === "generator") fillColor = "#87e291";
        if (d.type === "bus") fillColor = "#999999";
        if (d.type === "load") fillColor = "#54e2f7";
      }
  
      if (d.type === "generator") {
        const circle = g.append("circle")
          .attr("r", 12)
          .attr("fill", (mode === "manual" && !faded && d.id === selectedGeneratorId) ? "orange" : fillColor)
          .attr("opacity", faded ? 0.2 : 1);
      
        if (mode === "manual" && !faded) {
            circle.on("click", function(event) {
                event.stopPropagation();
                d3.select("#hover-tooltip").remove(); // Remove any hover
              
                if (selectedGeneratorId === d.id) {
                  selectedGeneratorId = null;
                  infoBubbleGroup.selectAll("*").remove();
                } else {
                  selectedGeneratorId = d.id;
                  showInfoBubble(d);
                }
                updateVisualization(mode);
                infoBubbleGroup.raise();
              });
              
              
      }
      } else if (d.type === "bus") {
        g.append("rect")
          .attr("x", -d.width / 2)
          .attr("y", -d.height / 2)
          .attr("width", d.width)
          .attr("height", d.height)
          .attr("fill", fillColor)
          .attr("opacity", faded ? 0.2 : 1);
      } else if (d.type === "load") {
        g.append("path")
          .attr("d", d3.symbol().type(d3.symbolTriangle).size(100))
          .attr("fill", fillColor)
          .attr("opacity", faded ? 0.2 : 1);
      }
    });
  }
  
  

//----------------------------------//
// 4. Visualization Logic
//----------------------------------//
async function updateVisualization(mode) {
    console.log("🧭 updateVisualization() called with mode:", mode);
  
    backgroundGroup.selectAll("*").remove(); // Always clear background
    foregroundGroup.selectAll("*").remove(); // Always clear foreground
  
    if (mode === "full") {
      console.log("⬜ Drawing full topology...");
      drawTopology(backgroundGroup, allNodes, allLinks, false, "full");
    } else if (mode === "manual") {
      console.log("🟦 Drawing manual filtered data...");
  
      const busIds = new Set(opBuses.map(d => d.id));
      const genBusIds = new Set(opGenerators.map(d => d.busNumber));
  
      const matchedNodes = allNodes.filter(node => {
        const idNum = parseInt(node.id.replace(/(Bus|Gen|Load)/, ""));
        if (node.id.startsWith("Bus")) return busIds.has(idNum);
        if (node.id.startsWith("Gen")) return genBusIds.has(idNum);
        if (node.id.startsWith("Load")) return busIds.has(idNum);
        return false;
      });
  
      const matchedNodeIds = new Set(matchedNodes.map(n => n.id));
  
      const matchedLinks = allLinks.filter(link =>
        matchedNodeIds.has(link.source) && matchedNodeIds.has(link.target)
      );
  
      // Draw full background faded
      drawTopology(backgroundGroup, allNodes, allLinks, true, "manual");
  
      // Draw manual data highlighted in foreground
      drawTopology(foregroundGroup, matchedNodes, matchedLinks, false, "manual");
    }
  }
  
  
  

//----------------------------------//
// 5. Data Loading
//----------------------------------//
Promise.all([
    d3.json("/prototype1/data/topology/full_nodes.json"),
    d3.json("/prototype1/data/topology/full_lines.json"),
    d3.json("/prototype1/data/operation/buses.json"),
    d3.json("/prototype1/data/operation/generators.json"),
    d3.json("/prototype1/data/operation/lines.json")
  ]).then(([nodes, fullLinks, buses, generators, lines]) => {
    allNodes = nodes;
    allLinks = fullLinks;
    opBuses = buses;
    opGenerators = generators;
    opLines = lines;
    nodeById = Object.fromEntries(nodes.map(d => [d.id, d]));
  
    console.log("📦 Data loaded:");
    console.log("   - Topology Nodes:", allNodes.length);
    console.log("   - Topology Links:", allLinks.length);
    console.log("   - Operation Buses:", opBuses.length);
    console.log("   - Operation Generators:", opGenerators.length);
    console.log("   - Operation Lines:", opLines.length);
  
    // Snap generators and loads to correct positions
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
      if ((n.type === "generator" || n.type === "load")) {
        if (typeof n.x !== 'number' || typeof n.y !== 'number' || isNaN(n.x) || isNaN(n.y)) {
          n.x = -9999; // Move them way outside the screen
          n.y = -9999;
        }
      }
    });
    updateVisualization(mode);
  });
  

//----------------------------------//
// 6. Event Listeners
//----------------------------------//
// Toggle between full and manual topology
document.getElementById("toggle-topology").addEventListener("click", () => {
  mode = (mode === "manual") ? "full" : "manual";

  const button = document.getElementById("toggle-topology");
  button.textContent = (mode === "manual") ? "Show Full Topology" : "Show Manual Data";

  updateVisualization(mode);
});

// Checkbox: Toggle visibility of generators
document.getElementById("toggle-generators").addEventListener("change", function() {
  const visible = this.checked;
  d3.selectAll(".node-generator-manual").style("display", visible ? null : "none");
});

// Checkbox: Toggle visibility of transmission lines
document.getElementById("toggle-lines").addEventListener("change", function() {
  const visible = this.checked;
  d3.selectAll(".link").style("display", visible ? null : "none");
});

// Make the MAP CONTROLS panel draggable
(function() {
  const panel = document.getElementById("control-panel");     // still using this ID
  const header = document.getElementById("control-header");

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener("mousedown", function(e) {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    header.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", function(e) {
    if (isDragging) {
      panel.style.left = (e.clientX - offsetX) + "px";
      panel.style.top = (e.clientY - offsetY) + "px";
    }
  });

  document.addEventListener("mouseup", function() {
    isDragging = false;
    header.style.cursor = "move";
  });
})();

// Make the SYSTEM OVERVIEW panel draggable
(function() {
  const panel = document.getElementById("system-panel");
  const header = document.getElementById("system-header");

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener("mousedown", function(e) {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    header.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", function(e) {
    if (isDragging) {
      panel.style.left = (e.clientX - offsetX) + "px";
      panel.style.top = (e.clientY - offsetY) + "px";
    }
  });

  document.addEventListener("mouseup", function() {
    isDragging = false;
    header.style.cursor = "move";
  });
})();


//----------------------------------//
// 7. Zoom
//----------------------------------//

const zoom = d3.zoom()
  .scaleExtent([0.2, 4])
  .on("zoom", (event) => {
    group.attr("transform", event.transform);
  });

svg.call(zoom);
