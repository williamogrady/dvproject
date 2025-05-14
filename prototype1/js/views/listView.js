import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { updateSystemState, systemState } from '/prototype1/logic/state.js';
import { renderStatusPanel } from '/prototype1/statusPanel.js';

const svg = d3.select("#topology");
const zoomGroup = svg.append("g").attr("id", "zoom-group");

let generators = [];
let fullNodes = [];
let fullLines = [];
let selectedGenerator = null;

export function initListView(interactiveGenerators, allNodes, lines) {
  generators = interactiveGenerators;
  fullNodes = allNodes;
  fullLines = lines;

  renderUI();
  setupZoom();

  drawLines(fullLines);
  drawBuses(fullNodes);
  drawLoads(fullNodes);
  drawStaticGenerators(fullNodes);
  drawGenerators();

  updateSystemState(generators, [], []);
  renderStatusPanel(generators, systemState);
  enableDrag();
  attachRegionFilterHandlers();
}

function renderUI() {
  if (!document.getElementById("info-panel")) {
    const infoPanel = document.createElement("div");
    infoPanel.id = "info-panel";
    infoPanel.innerHTML = `<h2>Generator Info</h2><div id="details">Select a generator</div>`;
    document.body.appendChild(infoPanel);
  }

  if (!document.getElementById("status-panel")) {
    const statusPanel = document.createElement("div");
    statusPanel.id = "status-panel";
    document.body.appendChild(statusPanel);
  }

  if (!document.getElementById("filter-panel")) {
    const filterPanel = document.createElement("div");
    filterPanel.id = "filter-panel";
    filterPanel.innerHTML = `
      <div id="filter-header">Filters</div>
      <label><input type="checkbox" class="region-filter" value="north"> North</label><br>
      <label><input type="checkbox" class="region-filter" value="west"> West</label><br>
      <label><input type="checkbox" class="region-filter" value="south"> South</label><br>
    `;
    document.body.appendChild(filterPanel);
  }
}

function setupZoom() {
  svg.call(
    d3.zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        zoomGroup.attr("transform", event.transform);
      })
  );
}

//---------------------------//
// Drawing Functions
//---------------------------//

function drawLines(lines) {
  zoomGroup.selectAll("path.line")
    .data(lines)
    .join("path")
    .attr("class", "line")
    .attr("d", d => d.d)
    .attr("stroke", "#888")
    .attr("stroke-width", 1.5)
    .attr("fill", "none");
}

function drawBuses(nodes) {
  zoomGroup.selectAll("g.bus")
    .data(nodes.filter(d => d.type === "bus"))
    .join("g")
    .attr("class", "bus")
    .attr("transform", d => {
      const base = `translate(${d.x}, ${d.y})`;
      if (d.rotate !== undefined && d.rotateX != null && d.rotateY != null) {
        return `${base} rotate(${d.rotate}, ${d.rotateX - d.x}, ${d.rotateY - d.y})`;
      }
      return base;
    })
    .each(function (d) {
      d3.select(this).append("rect")
        .attr("x", -d.width / 2)
        .attr("y", -d.height / 2)
        .attr("width", d.width)
        .attr("height", d.height)
        .attr("fill", "#999");
    });
}

function drawLoads(nodes) {
  zoomGroup.selectAll("g.load")
    .data(nodes.filter(d => d.type === "load"))
    .join("g")
    .attr("class", "load")
    .attr("transform", d => `translate(${d.x}, ${d.y})`)
    .each(function (d) {
      d3.select(this).append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(100))
        .attr("fill", "#54e2f7");
    });
}

function drawStaticGenerators(nodes) {
  zoomGroup.selectAll("g.static-gen")
    .data(nodes.filter(d => d.type === "generator" && !d.ratedMaxMW))
    .join("g")
    .attr("class", "static-gen")
    .attr("transform", d => `translate(${d.x}, ${d.y})`)
    .each(function (d) {
      d3.select(this).append("circle")
        .attr("r", 30)
        .attr("fill", "#bbbbbb")
        .attr("stroke", "#444")
        .attr("stroke-dasharray", "4,2")
    });
}

function drawGenerators() {
  zoomGroup.selectAll("g.gen-node")
    .data(generators, d => d.id)
    .join("g")
    .attr("class", "gen-node")
    .attr("transform", d => `translate(${d.x}, ${d.y}) rotate(${d.rotation || 0})`)
    .each(function (d) {
      const g = d3.select(this);
      g.selectAll("*").remove();

      g.append("circle")
        .attr("r", 30)
        .attr("class", () => {
          const base = "generator-circle";
          const status = d.currentOutput > 0 ? "generator-on" : "generator-off";
          const selected = d.selected ? "selected-single" : "";
          const highlight = d.northGroup ? "highlight-group" : "";
          return `${base} ${status} ${selected} ${highlight}`;
        })
        .attr("stroke", d.currentOutput > 0 ? "green" : "#333")
        .attr("stroke-width", d.currentOutput > 0 ? 4 : 1.5)
        .on("click", () => {
          generators.forEach(g => g.selected = false);
          d.selected = true;
          selectedGenerator = d;
          drawGenerators();
          updateInfoPanel(d);
          renderStatusPanel(generators, systemState);
        });

      g.append("text")
        .attr("y", 50)
        .attr("text-anchor", "middle")
        .text(d.id);
    });
}

//---------------------------//
// UI Logic
//---------------------------//

function updateInfoPanel(gen) {
  const panel = d3.select("#details");
  panel.html("");
  panel.append("div").html(`<strong>ID:</strong> ${gen.id}`);
  panel.append("div").html(`<strong>Bus:</strong> ${gen.busNumber}`);
  panel.append("div").html(`<strong>Status:</strong> ${gen.currentOutput > 0 ? "ON" : "OFF"}`);
  panel.append("div").html(`<strong>Output:</strong> ${gen.currentOutput} MW / ${gen.ratedMaxMW || 100} MW`);
  panel.append("div").html(`<strong>Region:</strong> ${gen.region}`);

  panel.append("button")
    .text(`Turn ${gen.currentOutput > 0 ? "OFF" : "ON"}`)
    .on("click", () => {
      gen.currentOutput = gen.currentOutput > 0 ? 0 : gen.ratedMaxMW || 100;
      updateSystemState(generators, [], []);
      drawGenerators();
      updateInfoPanel(gen);
      renderStatusPanel(generators, systemState);
    });
}

function attachRegionFilterHandlers() {
  document.querySelectorAll(".region-filter").forEach(input => {
    input.addEventListener("change", () => {
      const activeRegions = Array.from(document.querySelectorAll(".region-filter:checked"))
        .map(cb => cb.value.toLowerCase());

      generators.forEach(g => {
        g.northGroup = activeRegions.includes(g.region.toLowerCase());
      });

      drawGenerators();
    });
  });
}

function enableDrag() {
  const panel = document.getElementById("filter-panel");
  const header = document.getElementById("filter-header");

  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    panel.style.left = `${e.clientX - offsetX}px`;
    panel.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = "auto";
  });
}
