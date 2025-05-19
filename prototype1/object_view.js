/// object_view.js
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { Generator } from './classes/Generator.js';
import { updateSystemState, systemState } from './logic/state.js';
import { renderStatusPanel } from './statusPanel.js';

const svg = d3.select("#canvas");
const infoBox = d3.select("#details");

let opGenerators = [];
let selectedGenerator = null;

const maxCols = 8;
const spacing = 110;

fetch('/prototype1/data/operation/generators.json')
  .then(res => res.json())
  .then(genData => {
    opGenerators = genData
      .sort((a, b) => {
        const idA = a.id || "";
        const idB = b.id || "";
        const numA = parseInt(idA.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(idB.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
      })
      .map((d, i) => {
        const g = new Generator(d);
        const col = i % maxCols;
        const row = Math.floor(i / maxCols);
        g.x = col * spacing + 80;
        g.y = row * spacing + 80;
        g.region = g.region || ["North", "South", "East", "West"][i % 4];
        g.selected = false;
        g.filteredRegion = false;
        g.currentOutput = 0;
        return g;
      });

    updateAndRender();
  });

function updateAndRender() {
  updateSystemState(opGenerators, [], []);
  drawGrid();
  renderStatusPanel(opGenerators, systemState);
}

function drawGrid() {
  const groups = svg.selectAll("g.gen-node")
    .data(opGenerators, d => d.id)
    .join("g")
    .attr("class", "gen-node node-generator-manual")
    .attr("transform", d => `translate(${d.x}, ${d.y})`)
    .on("click", (event, d) => {
      if (selectedGenerator?.id === d.id) return;
      opGenerators.forEach(g => g.selected = false);
      d.selected = true;
      selectedGenerator = d;
      updateInfoPanel(d);
      drawGrid();
    });

  groups.selectAll("circle")
    .data(d => [d])
    .join("circle")
    .attr("r", 30)
    .attr("class", d => {
      const status = d.currentOutput > 0 ? "generator-on" : "generator-off";
      const selected = d.selected ? "selected-single" : "";
      const highlight = d.filteredRegion ? "highlight-group" : "";
      return `generator-circle ${status} ${selected} ${highlight}`;
    })
    .attr("stroke", d => d.currentOutput > 0 ? "green" : "#333")
    .attr("stroke-width", d => d.currentOutput > 0 ? 4 : 1.5);

  groups.selectAll("text")
    .data(d => [d])
    .join("text")
    .attr("y", 50)
    .attr("text-anchor", "middle")
    .text(d => d.id);
}

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
      updateAndRender();
      updateInfoPanel(gen);
    });
}

// Enable draggable filter panel + region checkboxes
window.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("filter-panel");
  const header = document.getElementById("filter-header");

  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  header.addEventListener("mousedown", function (e) {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", function (e) {
    if (!isDragging) return;
    panel.style.left = (e.clientX - offsetX) + "px";
    panel.style.top = (e.clientY - offsetY) + "px";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = "auto";
  });

  // Region filters
  document.querySelectorAll(".region-filter").forEach(input => {
    input.addEventListener("change", () => {
      const activeRegions = Array.from(document.querySelectorAll(".region-filter:checked"))
        .map(cb => cb.value.toLowerCase());

      opGenerators.forEach(g => {
        g.filteredRegion = activeRegions.includes(g.region.toLowerCase());
      });

      drawGrid();
    });
  });
});
