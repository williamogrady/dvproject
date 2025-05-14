import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { updateSystemState, systemState } from '/prototype1/logic/state.js';

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

  setupZoom();
  drawLines(fullLines);
  drawBuses(fullNodes);
  drawLoads(fullNodes);
  drawStaticGenerators(fullNodes);
  drawGenerators();

  updateSystemState(generators, [], []);
  attachRegionFilterHandlers();
  enableDrag(); // Assumes the filter panel is already in HTML
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
  zoomGroup.selectAll("path.link")
    .data(lines)
    .join("path")
    .attr("class", "link link-full")
    .attr("d", d => d.d);
}

function drawBuses(nodes) {
  zoomGroup.selectAll("g.bus")
    .data(nodes.filter(d => d.type === "bus"))
    .join("g")
    .attr("class", "bus full-node")
    .attr("transform", d => {
      const base = `translate(${d.x}, ${d.y})`;
      if (d.rotate !== undefined && d.rotateX != null && d.rotateY != null) {
        return `${base} rotate(${d.rotate}, ${d.rotateX - d.x}, ${d.rotateY - d.y})`;
      }
      return base;
    })
    .append("rect")
    .attr("class", "bus-rect")
    .attr("x", d => -d.width / 2)
    .attr("y", d => -d.height / 2)
    .attr("width", d => d.width)
    .attr("height", d => d.height);
}

function drawLoads(nodes) {
  zoomGroup.selectAll("g.load")
    .data(nodes.filter(d => d.type === "load"))
    .join("g")
    .attr("class", "load full-node")
    .attr("transform", d => `translate(${d.x}, ${d.y})`)
    .append("path")
    .attr("class", "load-shape")
    .attr("d", d3.symbol().type(d3.symbolTriangle).size(100));
}

function drawStaticGenerators(nodes) {
  zoomGroup.selectAll("g.static-gen")
    .data(nodes.filter(d => d.type === "generator" && !d.ratedMaxMW))
    .join("g")
    .attr("class", "static-gen generator full-node")
    .attr("transform", d => `translate(${d.x}, ${d.y})`)
    .append("circle")
    .attr("class", "generator-shape")
    .attr("r", 20);
}

function drawGenerators() {
  zoomGroup.selectAll("g.gen-node")
    .data(generators, d => d.id)
    .join("g")
    .attr("class", d => {
      const base = "gen-node generator";
      const status = d.currentOutput > 0 ? "generator-on" : "generator-off";
      const selected = d.selected ? "selected-generator" : "";
      const highlight = d.northGroup ? "highlight-group" : "";
      return `${base} ${status} ${selected} ${highlight}`.trim();
    })
    .attr("transform", d => `translate(${d.x}, ${d.y}) rotate(${d.rotation || 0})`)
    .each(function (d) {
      const g = d3.select(this);
      g.selectAll("*").remove();

      g.append("circle")
        .attr("r", 25)
        .attr("class", "generator-shape")
        .on("click", () => {
          generators.forEach(g => g.selected = false);
          d.selected = true;
          selectedGenerator = d;
          drawGenerators();
          updateInfoPanel(d);
  
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
  if (!panel || !header) return;

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
