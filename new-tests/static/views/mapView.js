async function fetchAllScenarios() {
  const res = await fetch("/api/scenarios");
  const data = await res.json();
  availableScenarios = data;

  const urlScenario = new URLSearchParams(location.search).get('scenario');

  const fromUrl = urlScenario && data.find(s => s.scenario_id === urlScenario)?.scenario_id;
  const fromDefault = data.find(s => s.scenario_id === "clean_north_power")?.scenario_id;
  const fallback = data[0]?.scenario_id;

  const initialId = fromUrl || fromDefault || fallback;

  if (!initialId) {
    console.error("No scenarios available.");
    return;
  }

  currentScenarioId = initialId;
  currentScenarioData = data.find(s => s.scenario_id === initialId) || null;

  populateScenarioDropdown(data, initialId);
  loadScenario(initialId);
}



const FILTER_KEYS = { power: 'power', cost: 'cost', emissions: 'emissions' };
  console.log("[CHECK] window.d3 =", window.d3);
console.log("[CHECK] typeof window.d3.scaleLinear =", typeof window.d3.scaleLinear);

  const d3ref = window.d3;
if (!d3ref) {
  console.error("D3 failed to load before app script.");
  // You could early-return here if you want:
  // throw new Error("D3 not loaded");
}
// Use d3ref instead of bare d3 if you want to be explicit:
// const svg = d3ref.select("#map");
// === BOOT BANNER ===
console.log("%c[BOOT] app module starting", "background:#222;color:#0f0;padding:2px 6px");
console.log("[BOOT] document.readyState:", document.readyState);
console.log("[BOOT] window.d3 present?", !!window.d3, "version:", window.d3 && window.d3.version);

// Flag how many times this module executes
window.__APP_BOOT_COUNT__ = (window.__APP_BOOT_COUNT__ || 0) + 1;
console.log("[BOOT] __APP_BOOT_COUNT__ =", window.__APP_BOOT_COUNT__);

// Show all <script> tags in document order
[...document.scripts].forEach((s,i) => {
  console.log(`[SCRIPTS] #${i}`, s.src || "(inline)", "type=", s.type || "classic", "defer=", !!s.defer);
});

// Give this inline script a name in stack traces:
try { //# sourceURL=app-module.js
} catch(e) {}

const svg = d3.select("#map");
const svgElement = svg.node();
const zoomLayer = svg.select("#zoom-layer");
const zoomGroup = svg.append("g").attr("id", "zoom-group");


let selectedGeneratorId = null;

const roundToHalf = v => Math.round((v || 0) / HALF_STEP) * HALF_STEP;

let totalPower = 0;
let totalCost = 0;
let totalEmissions = 0;

// === Overloaded lines state ===
let previousLineLoads = {}; // line.id -> previous load pct (0..1)

let lineMetrics = new Map();

let currentScaleMode = null;
let currentGenerators = [];
let currentLines = [];

let staticLines = [];
let staticNodes = [];

let currentScenarioId = "";
let currentScenarioData = null;
let availableScenarios = [];

let currentMapMode = "full";

function clearAllFocusFades(){
  d3.selectAll(".map-bus, .map-load, .map-line, #chevron-layer .chevron, .line-load-indicator, .map-gen-group")
    .interrupt()
    .style("opacity", null)
    .attr("opacity", null);
}


function applyVisualFocus(){
  const powerFocused = activeFilters.has('power');
  const linesFocused = (currentMapMode === "lines");

  // Always clear any lingering inline fades/scales first
  clearAllFocusFades();
  smoothScale("#chevron-layer .chevron, .line-load-indicator", 1);
  smoothScale(".map-gen-group", 1);

  // Selections
  const selGens   = ".map-gen-group";
  const selLines  = ".map-line";
  const selChevs  = "#chevron-layer .chevron, .line-load-indicator"; // cover both classes
  const selBuses  = ".map-bus";
  const selLoads  = ".map-load";

  // First: return everything to base (opacity=1, scale=1)
  smoothFade([selBuses, selLoads, selLines, selChevs, selGens].join(","), 1);
  smoothScale([selChevs].join(","), 1);
  smoothScale([selGens].join(","), 1);

  // Then apply the focused mode
  if (linesFocused && !powerFocused){
    // Lines focus → keep lines/chevrons full; fade all else; gently scale chevrons
    smoothFade([selBuses, selLoads, selGens].join(","), 0.2);
    smoothScale(selChevs, FOCUS_CHV_SCALE);
  } else if (powerFocused && !linesFocused){
    // Power focus → keep generators full; fade all else; gently scale generators
    smoothFade([selBuses, selLoads, selLines, selChevs].join(","), 0.2);
    smoothScale(selGens, FOCUS_GEN_SCALE);
  }
}


function setLinesFocus(on){
  const card   = document.getElementById("scale-lines");
  const status = document.getElementById("status-lines");
  currentMapMode = on ? "lines" : "full";

  if (card){
    card.classList.toggle("selected", on);
    card.classList.add("scale-lines");
  }
  if (status){
    status.textContent = on ? "Lines in focus" : "Click to focus";
  }

  // Redraw chevrons for lines mode sizing, then apply visual fades
  refreshChevrons(currentLines || [], currentMapMode);
  applyVisualFocus();
}

// Smooth focus constants
const FOCUS_FADE_MS   = 320;
const FOCUS_EASE      = d3.easeCubicInOut;
const FOCUS_GEN_SCALE = 1.18;  // generators scale when Power focus
const FOCUS_CHV_SCALE = 1.12;  // chevrons scale when Lines focus

function smoothFade(sel, to, ms = FOCUS_FADE_MS){
  const S = d3.selectAll(sel).interrupt();
  // Animate using inline style so it wins during the transition…
  const t = S.transition().duration(ms).ease(FOCUS_EASE).style("opacity", to);
  // …but when restoring to base, clear inline opacity so CSS (e.g., .gen-disabled) applies again.
  if (to === 1) {
    t.on("end", function(){
      d3.select(this).style("opacity", null).attr("opacity", null);
    });
  }
  return t;
}


// Scale elements while preserving their original transform (no compounding)
function smoothScale(sel, toScale, ms = FOCUS_FADE_MS){
  d3.selectAll(sel).each(function(){
    const node = d3.select(this);
    const baseT = node.attr("data-base-transform")
                || (node.attr("transform") || "").replace(/\s*scale\([^)]+\)/g, "");
    node.attr("data-base-transform", baseT);
    node.interrupt()
        .transition().duration(ms).ease(FOCUS_EASE)
        .attr("transform", `${baseT} scale(${toScale})`);
  });
}


const defs = svg.append("defs");
const softShadow = defs.append("filter")
  .attr("id", "softShadow")
  .attr("x", "-20%").attr("y", "-20%")
  .attr("width", "140%").attr("height", "140%");
softShadow.append("feDropShadow")
  .attr("dx", 0).attr("dy", 2)
  .attr("stdDeviation", 2.5)
  .attr("flood-opacity", 0.25);

// collapsed on startup; expands when filters are active
// collapsed on startup; expands when filters are active
const expandedById = new Map();
function isExpanded(id){
  // any *explicit* active filter means all gens expand
  if (activeFilters.size > 0) return true;
  return expandedById.get(id) === true;
}
function setExpanded(id, val=true){ expandedById.set(id, !!val); }
function setExpandedForAll(val){
  d3.selectAll(".map-gen").each(function(d){ expandedById.set(d.id, !!val); });
}

const activeFilters = new Set(); // 'power' | 'cost' | 'emissions'
function appliedSet(){
  return activeFilters.size === 0
    ? new Set(['power','cost','emissions'])
    : new Set(activeFilters);
}

// Collapsed dice pips: ON => white dots for current, black for remaining
// OFF => all capacity dots black
function drawDicePipsCollapsed(containerSel, size, currentMW, maxMW, isOn){
  const grid = 3;
  const cell = size / grid;
  const r = Math.max(4.2, cell * 0.34);

  // Round to your 50 MW half-step logic
  const capMW = roundCapToHalf(maxMW || 0);
  const curMW = Math.min(roundToHalf(currentMW || 0), capMW);

  const capDots = Math.floor(Math.min(9, capMW / 100));  // 100 MW per dot
  const curDots = Math.floor(Math.min(9, curMW / 100));

  const g = containerSel.append("g").attr("class", "dice-pips");

  for (let i = 0; i < capDots; i++) {
    const row = Math.floor(i / grid), col = i % grid;
    const cx = 0 - size/2 + cell*(col + 0.5);
    const cy = 0 - size/2 + cell*(row + 0.5);

    // Decide color by state:
    // - if ON: first curDots are white ("on"), rest black ("off")
    // - if OFF: all black ("off")
    const isFilledNow = isOn && (i < curDots);
    const cls = isFilledNow ? "pip-dot on" : "pip-dot off";

    g.append("circle")
      .attr("class", cls)
      .attr("cx", cx).attr("cy", cy).attr("r", r);
  }
}


function map(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}


// Define zoom behavior — same as before
// ===== Zoom behavior (SVG chips don't need manual reposition) =====
const zoomBehavior = d3.zoom()
  .scaleExtent([0.2, 2.0])
  .on("zoom", (event) => {
    zoomGroup.attr("transform", event.transform);
  });

svg.call(zoomBehavior);


function resetFilters() {
  activeFilters.clear();

  ["scale-power","scale-cost","scale-emissions"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("selected","scale-power","scale-cost","scale-emissions");
  });
  ["status-power","status-cost","status-emissions"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "Click to scale";
  });

  updateMapGeneratorsFromScenario();
}


window.addEventListener("load", () => {
  const initialScale = 0.3;
  const centerX = svgElement.clientWidth / 2;
  const centerY = svgElement.clientHeight / 2;

  svg.call(
    zoomBehavior.transform,
    d3.zoomIdentity
      .translate(centerX - 200, centerY - 150)
      .scale(initialScale)
      .translate(-centerX, -centerY)
  );

  // ✅ FIX: call fetchAllScenarios here
  fetchAllScenarios();
});

function getLineLoadPct(line) {
  return line.rate_a > 0 ? (line.flow / line.rate_a) : 0;
}

function getLoadColor(pct) {
  return d3.interpolateYlOrRd(Math.min(1, Math.max(0, pct)));
}


async function fetchAllScenarios() {
  console.log("fetchAllScenarios")
      const res = await fetch("/api/scenarios");
      const data = await res.json();

      availableScenarios = data;

      // Find default scenario
      const defaultScenario = data.find(s => s.scenario_id === "clean_north_power");

        if (defaultScenario) {
    currentScenarioId = defaultScenario.scenario_id;
    currentScenarioData = defaultScenario;

        populateScenarioDropdown(data, currentScenarioId);
        loadScenario(currentScenarioId);
      } else {
        console.error("No scenario with ID 'default' found.");
      }
    }

function renderOverview(gens, scenarioData = {}, lines) {
  totalPower = gens.reduce((sum, g) => sum + g.pg, 0);
  console.log("in renderOverview with totalPower:", totalPower)
  totalCost = gens.reduce((sum, g) => sum + g.pg * g.cost_per_mw, 0);
  totalEmissions = gens.reduce((sum, g) => sum + g.pg * g.emissions_per_mw, 0);

  const overloaded = lines.filter(line => line.flow > line.rate_a).length;
  const currentPower = gens.reduce((acc, g) => acc + (g.pg || 0), 0);

  
  
// in renderOverview(...)
const powerFraction = document.querySelector("#overview-power .fraction");
if (powerFraction) powerFraction.textContent = `${Math.round(totalPower)} MW`;
updatePowerBlocks(totalPower, currentScenarioData.target_mw);

  document.getElementById("overview-cost").textContent = `$${totalCost.toFixed(0)}`;
  document.getElementById("overview-emissions").textContent = `${totalEmissions.toFixed(0)} CO₂`;
  document.getElementById("overview-lines").textContent = overloaded;
  updatePowerBlocks(totalPower, currentScenarioData.target_mw)
  evaluateScenarioState(scenarioData, lines)
  if (lines) {
    console.log("🔁 Refreshing chevrons with updated line data");
    refreshChevrons(lines, currentMapMode);
    updateLinesCard(lines || []);

  }
  
}

 async function loadScenario(scenarioId) {
  console.log("loadScenario")
  const res = await fetch(`/api/scenario/${scenarioId}`);
  const data = await res.json();
  currentScenarioId = scenarioId;
  currentScenarioData = data;
  currentGenerators = data.generators;
  currentLines = data.lines;


  console.log("calling renderOverview");
  setupTaskSection(currentScenarioData);
  updateMapGeneratorsFromScenario(); // Make sure this is called too
  renderOverview(currentGenerators, currentScenarioData || {}, currentLines);

}

    function populateScenarioDropdown(scenarios, selectedId) {
        const select = document.getElementById("scenario-select");
        select.innerHTML = "";

        scenarios.forEach(s => {
          const option = document.createElement("option");
          option.value = s.scenario_id;
          option.textContent = s.title || s.scenario_id;
          if (s.scenario_id === selectedId) {
            option.selected = true;
          }
          select.appendChild(option);
        });
      }

    document.getElementById("scenario-select").addEventListener("change", (e) => {
      previousLineLoads = {};  // was previousLineFlows
      loadScenario(e.target.value);
    });

    document.getElementById("reset-button").addEventListener("click", () => {
      previousLineLoads = {};  // was previousLineFlows
      loadScenario(currentScenarioId);
    });

    // ===== Chevrons =====

// Draws a fresh chevron layer from enriched line data
function drawChevrons(lines, nodes, mode) {
  // Remove old layer
  d3.select("#chevron-layer").remove();
  const chevronGroup = d3.select("#zoom-group").append("g").attr("id", "chevron-layer");

  const isLinesMode = mode === "lines";

  lines.forEach(line => {
    const fromId = line.source, toId = line.target;
    if (!fromId || !toId) return;

    const from = nodes.find(n => n.id === fromId);
    const to   = nodes.find(n => n.id === toId);
    if (!from || !to || from.type !== "bus" || to.type !== "bus") return;

    const pathEl = document.getElementById(line.id);
    if (!pathEl || !pathEl.getTotalLength) return;

    const totalLen = pathEl.getTotalLength();
    const A = pathEl.getPointAtLength(totalLen * 0.45);
    const B = pathEl.getPointAtLength(totalLen * 0.55);

    const angleDeg = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI + 180;
    const midX = (A.x + B.x) / 2;
    const midY = (A.y + B.y) / 2;

    const loadPct = (line.rate_a > 0) ? (line.flow / line.rate_a) : 0;
    const color = getLoadColor ? getLoadColor(loadPct) : d3.interpolateYlOrRd(Math.max(0, Math.min(1, loadPct)));

    // Slight size boost in Lines mode
    const scale = isLinesMode ? (1 + 0.6 * Math.max(0, loadPct)) : 1;
    const base = 10;
    const size = Math.max(8, base * scale);

    chevronGroup.append("path")
  .datum(line)
  .attr("class", "chevron")
  .attr("id", `chev-${line.id}`)
  .attr("d", chevronPath ? chevronPath(size) : defaultChevronPath(size))
  .attr("fill", color)
  .attr("opacity", 0.95)
  .attr("stroke", "#111")
  .attr("stroke-width", 0.4)
  .attr("data-x", midX)
  .attr("data-y", midY)
  .attr("transform", `translate(${midX}, ${midY}) rotate(${angleDeg})`)
.attr("data-base-transform", `translate(${midX}, ${midY}) rotate(${angleDeg})`);


  });
}

function updateLinesCard(/* liveLines not needed anymore */) {
  const countEl = document.getElementById("overview-lines");
  const okPill  = document.getElementById("lines-ok-pill");
  const rowRich = document.getElementById("row-rich");
  const rowTop  = document.getElementById("row-top");
  const status  = document.getElementById("status-lines");
  if (!countEl || !okPill || !rowRich || !rowTop || !status) return;

  // Stabilize heights / spacing (keeps original proportions)
  rowRich.style.height = "36px";
  rowTop.style.height  = "28px";
  status.style.marginTop = "10px";

  // Build a sortable array from metrics (fallback to 0 if missing)
  const lines = staticLines.map(s => {
    const m = lineMetrics.get(s.id);
    const pct = m ? m.pct : 0;
    const flow = m ? m.flow : 0;
    const rate = m ? m.rate_a : (s.rate_a ?? 1);
    return { ...s, _pct: pct, flow, rate_a: rate };
  });

  // Partition/sort
  const byPctDesc = (a,b) => b._pct - a._pct;
  const overloaded = lines.filter(l => l._pct > 1).sort(byPctDesc);
  const nonOver    = lines.filter(l => l._pct <= 1).sort(byPctDesc);

  // Row 2: count + All good! pill
  countEl.textContent = overloaded.length;
  const showOk = overloaded.length === 0;
  okPill.textContent = "All good!";
  okPill.style.display = showOk ? "inline-block" : "none";
  if (showOk) {
    Object.assign(okPill.style, {
      background: "#4caf50",
      color: "#fff",
      fontWeight: "700",
      borderRadius: "9999px",
      padding: "2px 8px"
    });
  }

  // Mini chevron (same as you already have)
  function miniChevron(color, sizePx){
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("width", sizePx);
    svg.setAttribute("height", sizePx);
    svg.setAttribute("viewBox", "-12 -12 24 24");
    svg.style.transform = "translateY(-5px)";
    const g = document.createElementNS("http://www.w3.org/2000/svg","g");
    g.setAttribute("transform", "rotate(90)");
    const path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", chevronPath(6));
    path.setAttribute("fill", color);
    path.setAttribute("stroke", "#111");
    path.setAttribute("stroke-width", "0.4");
    g.appendChild(path);
    svg.appendChild(g);
    return svg;
  }

  // Card builders
  const buildCard = (line, isRich) => {
    const prevPct = previousLineLoads[line.id] ?? line._pct;
    const delta   = (line._pct - prevPct) * 100;
    const dir     = Math.abs(delta) < 0.5 ? "neutral" : (delta > 0 ? "up" : "down");
    const deltaLabel = dir === "neutral" ? "– 0%" : `${dir === "up" ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}%`;
    const accent  = getLoadColor(line._pct);
    const loadTxt = `${(line._pct * 100).toFixed(0)}%`;

    const card = document.createElement("div");
    card.className = `line-card${isRich ? "" : " top-card"}`;
    card.style.setProperty("--accent", accent);
    card.style.borderColor = accent;
    card.style.borderWidth = isRich ? "3px" : "1.5px";
    card.style.borderStyle = "solid";
    card.setAttribute("data-line-id", line.id);
    card.innerHTML = `
      <div class="left"></div>
      <div class="right">
        <div class="load">${loadTxt}</div>
        <div class="delta ${dir}">${deltaLabel}</div>
      </div>`;
    card.querySelector(".left").appendChild(miniChevron(accent, isRich ? 16 : 14));
    card.addEventListener("click", (e) => { e.stopPropagation(); pingChevron(line.id); });
    return card;
  };

  const buildPlaceholder = (isRich) => {
    const ph = document.createElement("div");
    ph.className = `line-card${isRich ? "" : " top-card"} placeholder`;
    ph.setAttribute("aria-hidden", "true");
    ph.style.visibility = "hidden";
    ph.style.pointerEvents = "none";
    ph.style.borderColor = "transparent";
    return ph;
  };

  // Row 3: top 3 overloaded
  rowRich.innerHTML = "";
  const row3 = overloaded.slice(0, 3);
  row3.forEach(l => rowRich.appendChild(buildCard(l, true)));
  for (let i = row3.length; i < 3; i++) rowRich.appendChild(buildPlaceholder(true));

  // Row 4: overflow overloaded + top non-over (cap at 3)
  rowTop.innerHTML = "";
  const overflow = overloaded.slice(3);
  const topNon   = nonOver.slice(0, 3);
  const row4List = [...overflow, ...topNon].slice(0, 3);
  row4List.forEach(l => rowTop.appendChild(buildCard(l, false)));
  for (let i = row4List.length; i < 3; i++) rowTop.appendChild(buildPlaceholder(false));

  // Remember for next delta
  lines.forEach(l => { previousLineLoads[l.id] = l._pct; });

  // Reset scrollers
  rowRich.scrollLeft = 0;
  rowTop.scrollLeft  = 0;
}


function pingChevron(lineId){
  const chev = d3.select(`#chev-${CSS.escape(lineId)}`);
  if (chev.empty()) return;

  // Base transform (translate+rotate only; avoid compounding scales)
  const baseT = chev.attr("data-base-transform")
             || (chev.attr("transform") || "").replace(/\s*scale\([^)]+\)/g, "");
  chev.attr("data-base-transform", baseT);

  // Anti-spam
  if (chev.attr("data-animating") === "1") return;
  chev.attr("data-animating", "1");

  // Gentle pop: 300% at a slower pace
  const MAX_SCALE = 3.0;

  chev.interrupt()
      .attr("transform", `${baseT} scale(1)`)
      .transition().duration(250).ease(d3.easeCubicOut)
        .attr("transform", `${baseT} scale(${MAX_SCALE})`)
      .transition().duration(350).ease(d3.easeCubicIn)
        .attr("transform", `${baseT} scale(1)`)
        .on("end", () => chev.attr("data-animating", null));
}


function chevronPath(scale) {
    const length = scale * 2;
  const width = scale;

  return `
    M 0 0
    L ${length} ${-width}
    L ${length * 0.8} 0
    L ${length} ${width}
    Z
  `;
}

function refreshChevrons(liveLines, currentMapMode) {
  // Index both directions so lookups don’t miss when sign flips
  const liveIdx = new Map();
  for (const l of (liveLines || [])) {
    liveIdx.set(`Bus${l.from_bus}|Bus${l.to_bus}`, l);
    liveIdx.set(`Bus${l.to_bus}|Bus${l.from_bus}`, l);
  }

  const enriched = staticLines.map(s => {
    const live = liveIdx.get(`${s.source}|${s.target}`);
    const flow = live?.flow ?? 0;
    const rate = live?.rate_a ?? 1;
    const pct  = rate > 0 ? Math.abs(flow) / rate : 0;
    return { ...s, flow, rate_a: rate, _pct: pct };
  });

  // Update the shared metrics map (source of truth for BOTH rows)
  lineMetrics.clear();
  for (const L of enriched) {
    lineMetrics.set(L.id, { pct: L._pct, flow: L.flow, rate_a: L.rate_a });
  }

  // (Re)draw chevrons using enriched data as you already do
  d3.select("#chevron-layer").remove();
  drawChevrons(enriched, staticNodes, currentMapMode);

  // Optionally stamp DOM for debug/consistency
  enriched.forEach(L => {
    d3.select(`#chev-${CSS.escape(L.id)}`).attr("data-pct", L._pct);
  });
}


// === Rect Generators: settings (tune freely) ================================
const DICE = 54;        // collapsed square side (px)
const BLOCK_UNIT       = 100;      // MW per block
const HALF_STEP        = BLOCK_UNIT / 2;
const BASE_BLOCK_H     = 28;       // px (upper bound; will scale down to fit MAX_GEN_H)
const BLOCK_GAP        = 4;        // px vertical gap
const PAD_INNER        = 10;       // px inner padding
const HALO_PAD         = 8;        // px halo padding
const MIN_GEN_W        = 50;       // px minimum width (clickable)
const WIDTH_VARIATION  = 80;       // px subtle width variation by cost
const MAX_GEN_W        = MIN_GEN_W + WIDTH_VARIATION;
const MAX_GEN_H        = 220;      // px tallest generator on screen
const BASE_S = 64;  // default dice size when Power scaling is OFF


// Round capacity to nearest half-block (capacity shown is full/half only)
const roundCapToHalf = pmax => Math.ceil((pmax || 0) / HALF_STEP) * HALF_STEP;

// Compute number of visual blocks (top can be half)
function capBlocks(p){
  const cap = roundCapToHalf(p);
  const full = Math.floor(cap / BLOCK_UNIT);
  const hasHalfTop = (cap % BLOCK_UNIT) === HALF_STEP;
  return full + (hasHalfTop ? 1 : 0);
}

// Compute global block height so the tallest gen fits MAX_GEN_H
function computeBlockH(gens){
  const pmaxExtent = d3.extent(gens, g => g.pmax || 0);
  const maxBlocks  = capBlocks(pmaxExtent[1] || 0);
  const available  = MAX_GEN_H - PAD_INNER*2 - (maxBlocks - 1) * BLOCK_GAP;
  return Math.min(BASE_BLOCK_H, available / Math.max(1, maxBlocks));
}

// Build capacity blocks (TOP → DOWN). Top block may be HALF_STEP wide (half capacity).
function capacityBoundsTopDown(pmax){
  const cap = roundCapToHalf(pmax);
  const fullBlocks = Math.floor(cap / BLOCK_UNIT);
  const hasHalfTop = (cap % BLOCK_UNIT) === HALF_STEP;
  const out = [];
  let rem = cap;

  if (hasHalfTop){
    out.push({ size: HALF_STEP, upper: rem, lower: rem - HALF_STEP }); // TOP = half
    rem -= HALF_STEP;
  }
  for (let i=0; i<fullBlocks; i++){
    out.push({ size: BLOCK_UNIT, upper: rem, lower: rem - BLOCK_UNIT });
    rem -= BLOCK_UNIT;
  }
  return out; // index 0 is TOP
}

function updateGeneratorStrokes() {
  d3.selectAll(".map-gen").each(function() {
    const el = d3.select(this);
    const id = el.attr("id");
    const isSelected = (id === selectedGeneratorId);

    if (isSelected) {
      // Only emphasize selection; leave base/dice styling intact
      el.attr("stroke", "#42a5f5").attr("stroke-width", 3);
    } else {
      // Do NOT override; let CSS classes control appearance
      el.attr("stroke", null).attr("stroke-width", null);
    }
  });
}







function makePowerWidthScale(gens = currentGenerators){
  const [minP, maxP] = window.d3.extent(gens, g => g.pmax || 0);
  return window.d3.scaleSqrt()
    .domain([Math.max(1,minP||1), Math.max(2,maxP||2)])
    .range([MIN_GEN_W, MAX_GEN_W])
    .clamp(true);
}




function wireToggle(key, elId, statusId){
  const el = document.getElementById(elId);
  const status = document.getElementById(statusId);
  if (!el) { console.warn("Missing toggle element:", elId); return; }
  if (el.dataset.wired === "1") return;
  el.dataset.wired = "1";

  const setState = (on) => {
  if (on) activeFilters.add(key); else activeFilters.delete(key);
  el.classList.toggle("selected", on);
  if (elId == "scale-power") {
    if (status) status.textContent = on ? "Generators in focus" : "Click to focus";

    // Make focus modes exclusive: turning Power ON turns Lines OFF
    if (on && currentMapMode === "lines") setLinesFocus(false);

    // Apply fades for Power focus (or clear when OFF)
    applyVisualFocus();
  }
  else if (status) {
    status.textContent = on ? "Currently scaling" : "Click to scale";
  }
};


  // initial
  setState(activeFilters.has(key));

  el.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const next = !activeFilters.has(key);
    console.log(`[TOGGLE] ${key}: ${!next} → ${next}`);
    setState(next);
    safeUpdate();
  }, { passive: false });
}

wireToggle(FILTER_KEYS.power,     "scale-power",     "status-power");
wireToggle(FILTER_KEYS.cost,      "scale-cost",      "status-cost");
wireToggle(FILTER_KEYS.emissions, "scale-emissions", "status-emissions");


let __updating = false;
function safeUpdate(){
  if (__updating) return;
  __updating = true;
  Promise.resolve().then(() => {
    updateMapGeneratorsFromScenario();
    __updating = false;
  });
}

["scale-power","scale-cost","scale-emissions"].forEach(id => {
  const el = document.getElementById(id);
  if (el) console.log("[TOGGLE WIRED?]", id, el.dataset.wired);
});


// Register once
window.__HELPERS__ = window.__HELPERS__ || {};
["makeCostColorScale","makePowerWidthScale","makeEmiStrokeScale","makeEmiSpacingScale","ensureHatch"]
  .forEach(n => {
    if (window.__HELPERS__[n]) {
      console.error(`[HELPERS] Duplicate definition: ${n}`);
      debugger;
    }
    window.__HELPERS__[n] = true;
  });
console.log("[HELPERS] Registered once.");


// Draw pips by capacity (max) and fill by current (pg).
// Binary-only rendering for dice: NO half dots (capacity or current).
function drawPipsByMaxD3(containerSel, cx, cy, size, currentMW, maxMW){
  const grid = 3;
  const cell = size / grid;
  const r = Math.max(4.2, cell * 0.34);

  const capMW = roundCapToHalf(maxMW);
  const curMW = Math.min(roundToHalf(currentMW), capMW);

  const maxBlocks = capMW / 100;   // 100 MW per dot
  const curBlocks = Math.min(maxBlocks, curMW / 100);

  const capDots = Math.floor(Math.min(9, maxBlocks));
  const curDots = Math.floor(Math.min(9, curBlocks));

  const g = containerSel.append("g").attr("class", "dice-pips");

  for (let i = 0; i < capDots; i++) {
    const row = Math.floor(i / grid), col = i % grid;
    const px = cx - size/2 + cell*(col + 0.5);
    const py = cy - size/2 + cell*(row + 0.5);

    // capacity outline (always)
    g.append("circle")
      .attr("class", "pip-capacity")
      .attr("cx", px).attr("cy", py).attr("r", r);

    // current fill (overlay)
    if (i < curDots) {
      g.append("circle")
        .attr("class", "pip-current")
        .attr("cx", px).attr("cy", py).attr("r", r - 0.6);
    }
  }
}


// Ensure a child UI layer inside each generator group
function ensureUiLayer(gSel){
  let ui = gSel.selectChild("g.gen-ui");
  if (ui.empty()) ui = gSel.append("g").attr("class","gen-ui");
  return ui;
}

// === Click handler for capacity/current slots (top-level!) ===
function onBlockClick(ev, b, node) {
  const gen = currentGenerators.find(x => `Gen${x.bus}` === node.id);
  if (!gen) return;

  // Logical bounds for this block against gen.pmax
  const upper = Math.min(b.upper, gen.pmax || 0);
  const lower = Math.min(b.lower, gen.pmax || 0);

  // Toggle: clicking a filled block drops to its lower edge, else raise to upper edge
  let targetMW = ((gen.pg || 0) >= upper) ? lower : upper;

  // Quantize to 50 MW steps and clamp
  const HALF_STEP = BLOCK_UNIT / 2;
  targetMW = Math.round(targetMW / HALF_STEP) * HALF_STEP;
  targetMW = Math.max(0, Math.min(targetMW, gen.pmax || 0));

  // Optimistic UI
  gen.pg = targetMW;
  updateMapGeneratorsFromScenario();

  // Persist to backend
  const percent = Math.min(100, Math.round((targetMW / (gen.pmax || 1)) * 100));
  fetch(`/api/set_generation/${gen.index}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ percent, user_active: true })
  })
  .then(r => r.json())
  .then(data => {
    currentGenerators = data.generators;
    currentLines = data.lines;
    renderOverview(currentGenerators, currentScenarioData, currentLines);
    updateMapGeneratorsFromScenario();
    updateGeneratorHalos();

    // Re-open the selected generator’s UI if needed
    if (selectedGeneratorId) {
      const selected = d3.select(`#${CSS.escape(selectedGeneratorId)}`);
      if (!selected.empty()) selected.dispatch("click");
    }
  })
  .catch(console.error);

  ev.stopPropagation();
}

function costHaloColor(cost) {
  if (cost === 0.5)  return "#2e7d32"; // green
  if (cost === 4)    return "#f9a825"; // yellow
  if (cost === 6)    return "#fb8c00"; // orange
  if (cost === 7.5)  return "#c62828"; // red
  return "#9e9e9e";                     // fallback grey (unexpected)
}


   // === Fetch and Draw Map ===
Promise.all([
  fetch("/new-tests/full_nodes.json").then(res => res.json()),
  fetch("/new-tests/full_lines.json").then(res => res.json()),
  fetch("/api/generators").then(res => res.json())  // <-- ✅ Add this
]).then(([nodes, lines, generatorData]) => {
  currentGenerators = generatorData;
  staticNodes = nodes;
  staticLines = lines;

  // Helper: logical upper bound for this block = min(display upper, real pmax)
function logicalUpper(b, gen) { return Math.min(b.upper, gen.pmax || 0); }
function logicalLower(b, gen) { return Math.min(b.lower, gen.pmax || 0); }

  zoomGroup.selectAll("path.map-line")
    .data(lines)
    .enter()
    .append("path")
    .attr("class", "map-line")
    .attr("id", d => d.id)
    .attr("d", d => d.d)
    .attr("stroke", "#888")
    .attr("stroke-width", 1.5)
    .attr("fill", "none");

zoomGroup.selectAll("rect.map-bus")
  .data(nodes.filter(d => d.type === "bus"))
  .enter()
  .append("rect")
  .attr("class", "map-bus")
  .attr("id", d => d.id)
  .attr("x", d => d.x - d.width / 2)
  .attr("y", d => d.y - d.height / 2)
  .attr("width", d => d.width)
  .attr("height", d => d.height)
  .attr("fill", "#666")
  .attr("stroke", "#000")
  .attr("stroke-width", 0.8)
  .attr("transform", d => {
    if (d.rotate && d.rotateX !== null && d.rotateY !== null) {
      return `rotate(${d.rotate}, ${d.rotateX}, ${d.rotateY})`;
    }
    return null;
  });

zoomGroup.selectAll("path.map-load")
  .data(nodes.filter(d => d.type === "load"))
  .enter()
  .append("path")
  .attr("class", "map-load")
  .attr("id", d => d.id)
  .attr("d", d => {
  const size  = 30;                 // overall height of the house
  const x     = d.x;
  const y     = d.y;
  const roofH = size * 0.45;        // roof height (tweak if you want)
  const top   = y - size / 2;       // top peak
  const eaveY = top + roofH;        // where roof meets the walls
  const baseY = y + size / 2;       // bottom of the house
  const left  = x - size / 2;
  const right = x + size / 2;

  // Points: peak → left eave → left base → right base → right eave → close
  return `M ${x},${top}
          L ${left},${eaveY}
          L ${left},${baseY}
          L ${right},${baseY}
          L ${right},${eaveY}
          Z`;
})
  .attr("transform", d => {
    if (d.rotate && d.rotateX !== null && d.rotateY !== null) {
      return `rotate(${d.rotate}, ${d.rotateX}, ${d.rotateY})`;
    }
    return null;
  });

    // Generators - drawn last to ensure they are on top

// === Generators — Rectangles with top→down blocks ===========================
const generatorNodes = nodes.filter(d => d.type === "generator");

  // Scales derived from currentGenerators (already populated after scenario load)
  const costExtent = d3.extent(currentGenerators, g => g.cost_per_mw || 0);
  const emisExtent = d3.extent(currentGenerators, g => g.emissions_per_mw || 0);

  const widthByPmax = makePowerWidthScale();
  const SCALED_BLOCK_H = computeBlockH(currentGenerators);

function genDims(gen){
  const a = appliedSet();
  const widthActive = a.has('cost');
  const powerActive = a.has('power');
  const onlyCost    = (a.size === 1 && a.has('cost'));

  const W = widthByPmax(gen.pmax || 0);

  const caps = capacityBoundsTopDown(gen.pmax || 0);
  const n = Math.max(1, caps.length);
  const scaledH  = n * SCALED_BLOCK_H + (n - 1) * BLOCK_GAP + PAD_INNER * 2;
  const NEUTRAL_H = PAD_INNER * 2 + SCALED_BLOCK_H * 3 + BLOCK_GAP * 2;
  const H = (powerActive || widthActive) ? scaledH : NEUTRAL_H;

  const innerW = W - PAD_INNER * 2;
  return { W, H, innerW, caps };
}


 const genGroups = zoomGroup.selectAll("g.map-gen-group")
  .data(generatorNodes.filter(d => currentGenerators.some(g => `Gen${g.bus}` === d.id)), d => d.id)
  .enter().append("g")
  .attr("class", "map-gen-group")
  .attr("transform", d => `translate(${d.x}, ${d.y})`);

// NEW: start collapsed (dice)
genGroups.each(d => expandedById.set(d.id, false));


// Rect halo (selection/hover)
genGroups.append("rect")
  .attr("class", "map-gen-halo")
  .attr("fill", "none")
  .attr("stroke", "#42a5f5")
  .attr("stroke-width", 3)
  .attr("opacity", 0)
  .attr("rx", 12).attr("ry", 12)
  .style("pointer-events", "none");

// Main generator rectangle (keeps .map-gen id/class for your existing selectors)
genGroups.append("rect")
  .attr("class", "map-gen")
  .attr("id", d => d.id)
  .attr("fill", "#fff")
  .attr("stroke", "#757575")
  .attr("stroke-width", 10)

// Clip to keep fills inside the padded frame
genGroups.append("clipPath")
  .attr("id", d => `clip-${d.id}`)
  .append("rect");

// AFTER you append ".map-gen" and the clipPath:

// Emissions hatch overlay (filled with pattern later)
genGroups.append("rect")
  .attr("class", "gen-hatch")
  .attr("fill", "none")
  .attr("pointer-events", "none");

// Badge/UI layer on top for lock, etc.
genGroups.append("g").attr("class", "gen-badges");


// Block container (clipped)
genGroups.append("g")
  .attr("class", "blocks")
  .attr("clip-path", d => `url(#clip-${d.id})`);

// Draw once; update function will refresh sizes/fills later as pg/cost/pmax change
function drawRectGenerators(){
  const widthByPmax = makePowerWidthScale();
  const SCALED_BLOCK_H = computeBlockH(currentGenerators);

  genGroups.each(function(node){
    const g = d3.select(this);

    // Just ensure basic sizing on the frame once; actual size handled in updater
    g.select(".map-gen")
      .attr("x", -25).attr("y", -25)
      .attr("width", 50).attr("height", 50)
      .attr("rx", 10).attr("ry", 10);

    // Halo starts hidden; updater will size/show
    g.select(".map-gen-halo")
      .attr("x", -0).attr("y", -0)
      .attr("width", 0).attr("height", 0);

    // Clip rect exists; updater will size it
    g.select(`#clip-${CSS.escape(node.id)} rect`)
      .attr("x", 0).attr("y", 0)
      .attr("width", 0).attr("height", 0);

    // Ensure a blocks container exists (no drawing here)
    const blocks = g.select(".blocks");
    blocks.selectAll("rect.gen-block-bg").data([]).join("rect").attr("class","gen-block-bg");
    blocks.selectAll("rect.gen-block-fill").data([]).join("rect").attr("class","gen-block-fill");

    // Clicks will be bound in the updater when we have actual block data
  });
}
  // after drawRectGenerators() is defined and genGroups are built:
  drawRectGenerators();
  updateMapGeneratorsFromScenario();
});

// POWER → side length S (square). Reuse your MIN/MAX constants or set dice-specific ones.
function makePowerDiceScale(gens = currentGenerators){
  const [minP, maxP] = d3.extent(gens, g => g.pmax || 0);
  const MIN_S = 44;      // min square side in px
  const MAX_S = 120;     // max square side in px
  return d3.scaleSqrt()
    .domain([Math.max(1, minP || 1), Math.max(2, maxP || 2)])
    .range([MIN_S, MAX_S])
    .clamp(true);
}

// Draw a 3×3 grid of pips and wire clicks.
// If the first (lowest) pip is already filled and you click it → set to zero.
function drawDicePipsScaled(g, W, H, maxPips, curPips, lockedOrDisabled, onSetPips){
  const pipG = g.selectAll("g.dice-pips").data([0]).join(enter => enter.append("g").attr("class","dice-pips"));
  pipG.selectAll("*").remove();

  const cx = 0, cy = 0;
  const grid = 3;
  const pad  = Math.max(6, Math.min(W,H) * 0.10);
  const boxW = W - pad*2, boxH = H - pad*2;
  const cellW = boxW / grid, cellH = boxH / grid;
  const r = Math.max(3, Math.min(cellW, cellH) * 0.22);

  // positions left-to-right, bottom-to-top (so "lowest" pip = first)
  const positions = [];
  for (let gy = grid-1; gy >= 0; gy--){
    for (let gx = 0; gx < grid; gx++){
      positions.push({
        x: -boxW/2 + gx*cellW + cellW/2,
        y: -boxH/2 + gy*cellH + cellH/2
      });
    }
  }

  const pipCount = Math.min(9, Math.max(1, maxPips));
  const data = positions.slice(0, pipCount).map((p, i) => ({...p, i}));

  const pips = pipG.selectAll("circle.pip").data(data, d => d.i);
  pips.enter().append("circle")
    .attr("class", "pip")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", r)
    .attr("stroke", "#111")
    .attr("stroke-width", 1)
    .attr('fill', d => d.i < curBlocks ? '#22c55e' : '#374151') // green on, dark gray off
    .style("cursor", lockedOrDisabled ? "default" : "pointer")
    .on("click", function (ev, d) {
      if (lockedOrDisabled) return;
      // clicking first (lowest) when filled -> set to 0
      if (curPips > 0 && d.i === 0 && d.i < curPips) {
        onSetPips(0);
        return;
      }
      // clicking pip k sets to k+1, and fills all below
      onSetPips(d.i + 1);
    });
}

// ---- SCALES & PATTERNS ------------------------------------------------------

function makeCostColorScale(gens = currentGenerators) {
  const vals = (Array.isArray(gens) ? gens : [])
    .map(g => g?.cost_per_mw)
    .filter(v => Number.isFinite(v));

  let minC = Math.min(...vals), maxC = Math.max(...vals);
  if (!Number.isFinite(minC) || !Number.isFinite(maxC)) { minC = 0; maxC = 1; }
  if (minC === maxC) { const pad = Math.max(1, Math.abs(minC)*0.1); minC -= pad; maxC += pad; }

  const d0 = minC, d3max = maxC;
  const d1 = d0 + (d3max - d0) * 0.33;
  const d2 = d0 + (d3max - d0) * 0.66;

  return window.d3.scaleLinear()
    .domain([d0, d1, d2, d3max])
    .range(["#2e7d32", "#f9a825", "#fb8c00", "#c62828"]) // green→yellow→orange→red
    .clamp(true);
}

function makeEmiStrokeScale(gens = currentGenerators) {
  const [minE, maxE] = window.d3.extent(gens, g => g.emissions_per_mw || 0);
  return window.d3.scaleLinear().domain([minE||0, maxE||1]).range([0.6, 4.5]).clamp(true);
}

function makeEmiSpacingScale(gens = currentGenerators) {
  const [minE, maxE] = window.d3.extent(gens, g => g.emissions_per_mw || 0);
  return window.d3.scaleLinear().domain([minE||0, maxE||1]).range([12, 6]).clamp(true);
}

function ensureHatch(defsSel, genId, strokeW, step) {
  const pid = `hatch-${genId}`;
  let pat = defsSel.select(`#${CSS.escape(pid)}`);
  if (pat.empty()) {
    pat = defsSel.append("pattern")
      .attr("id", pid).attr("patternUnits", "userSpaceOnUse")
      .attr("width", step).attr("height", step)
      .attr("patternTransform", "rotate(45)");
    pat.append("line")
      .attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", step)
      .attr("stroke", "#000").attr("stroke-linecap", "butt");
  }
  pat.attr("width", step).attr("height", step);
  pat.select("line").attr("y2", step).attr("stroke-width", strokeW);
  return `url(#${pid})`;
}

const BLOCK_GREEN = "#4caf50";  // match overview card green
const BLOCK_MW    = 100;

function drawPowerBlocks(g, W, H, pmax, pg, lockedOrDisabled, onSetPg) {
  const grid = 3;
  const pad  = Math.max(4, Math.min(W, H) * 0.10);
  const boxW = W - pad*2, boxH = H - pad*2;
  const cellW = boxW / grid, cellH = boxH / grid;

  const maxBlocks = Math.max(1, Math.min(9, Math.round((pmax || 0) / BLOCK_MW)));
  const curBlocks = Math.max(0, Math.min(maxBlocks, Math.round((pg   || 0) / BLOCK_MW)));

  // positions left→right, bottom→top
  const positions = [];
  for (let gy = grid - 1; gy >= 0; gy--) {
    for (let gx = 0; gx < grid; gx++) {
      positions.push({
        x: -boxW/2 + gx*cellW,
        y: -boxH/2 + gy*cellH,
        w:  cellW,
        h:  cellH
      });
    }
  }
  const data = positions.slice(0, maxBlocks).map((p, i) => ({ ...p, i })); // ← fixed

  const sel = g.selectAll("rect.gen-block").data(data, d => d.i);
  sel.join(
    e => e.append("rect").attr("class","gen-block"),
    u => u,
    x => x.remove()
  )
  .attr("x", d => d.x + 1).attr("y", d => d.y + 1)
  .attr("width", d => d.w - 2).attr("height", d => d.h - 2)
  .attr("rx", 4).attr("ry", 4)
  .attr("fill", d => (d.i < curBlocks ? BLOCK_GREEN : "#757575"))
  .style("cursor", lockedOrDisabled ? "default" : "pointer")
  .on("click", function(ev, d) {
    if (lockedOrDisabled) return;
    // first filled toggles to 0
    let newBlocks = (d.i === 0 && curBlocks > 0) ? 0 : (d.i + 1);
    newBlocks = Math.max(0, Math.min(maxBlocks, newBlocks));
    onSetPg(newBlocks * BLOCK_MW);
  });
}

function includesGen(arr, gen){
  if (!Array.isArray(arr)) return false;
  const id = gen.id, index = gen.index, bus = gen.bus;
  return arr.some(v => v === index || v === id || v === bus || v === `Gen${bus}`);
}



// ===== Single-mode dice view: size = power; cost = fill; emissions = hatch; pips clickable =====
function updateMapGeneratorsFromScenario() {
  window.__UPDATER_CALLS__ = (window.__UPDATER_CALLS__ || 0) + 1;
  console.log(`[UPDATER] (dice+blocks) #${window.__UPDATER_CALLS__}`);

  const gens = Array.isArray(currentGenerators) ? currentGenerators : [];
  const costColor  = makeCostColorScale(gens);
  const emiStroke  = makeEmiStrokeScale(gens);
  const emiSpacing = makeEmiSpacingScale(gens);

  // toggles (start OFF; wire once elsewhere)
  const focusPower = !!activeFilters?.has?.('power');      // repurposed: uniform enlarge = "focus"
  const showCost   = !!activeFilters?.has?.('cost');       // cost→halo
  const scaleEmi   = !!activeFilters?.has?.('emissions');  // emissions→hatch

  // visit each generator group
  d3.selectAll(".map-gen-group").each(function() {
    const g  = d3.select(this);
    const rect = g.select(".map-gen");
    const id = rect.empty() ? null : rect.attr("id");
    if (!id) return;

    const gen = gens.find(x => `Gen${x.bus}` === id || x.id === id) || { id, pmax:0, pg:0, cost_per_mw:1, emissions_per_mw:0 };
    const pmax = gen.pmax || 0;
    const pg   = gen.pg   || 0;

    // ensure needed layers exist
    if (g.select(".map-gen-halo").empty()) g.append("rect").attr("class", "map-gen-halo");
    if (g.select(".gen-hatch").empty())   g.append("rect").attr("class", "gen-hatch").attr("pointer-events","none");
    if (g.select(".dice-blocks").empty()) g.append("g").attr("class", "dice-blocks");
    if (g.select(".gen-badges").empty())  g.append("g").attr("class", "gen-badges");

    // state flags (lock/disabled affect interaction only)
const lockedArr   = window.currentScenarioData?.locked_generators   || window.currentScenarioData?.locked   || [];
 const disabledArr = window.currentScenarioData?.disabled_generators || window.currentScenarioData?.disabled || [];
 const isLocked   = !!(gen.locked || includesGen(lockedArr, gen));
 const isDisabled = !!(gen.disabled || gen.status === "disabled" || includesGen(disabledArr, gen));
    g.classed("gen-disabled", isDisabled);

    // ---- SIZE (uniform focus) ----
    const S = focusPower ? BASE_S * 1.5 : BASE_S;
    const W = S, H = S;

    // main card (neutral fill; cost lives on halo now)
    rect
      .attr("x", -W/2).attr("y", -H/2)
      .attr("width", W).attr("height", H)
      .attr("rx", 10).attr("ry", 10)
      .attr("fill", "#fff")
      .attr("stroke", "#111").attr("stroke-width", 1.2);

    // ---- COST HALO (only when showCost) ----
    // ---- COST HALO (categorical mapping) ----
const halo = g.select(".map-gen-halo")
  .attr("x", -W/2 - HALO_PAD).attr("y", -H/2 - HALO_PAD)
  .attr("width",  W + HALO_PAD*2).attr("height", H + HALO_PAD*2)
  .attr("rx", 12).attr("ry", 12)
  .attr("fill", "none");

if (showCost) {
  const thick = Math.max(6, S * 0.12);   // thickness scales with size
  halo.attr("stroke", costHaloColor(Number(gen.cost_per_mw)))
      .attr("stroke-width", thick)
      .attr("opacity", 1);               // ← make visible
} else {
  halo.attr("stroke", "none")
      .attr("opacity", 0);               // ← hide when OFF
}


    // ---- EMISSIONS HATCH (clear when OFF) ----
    const hatch = g.select(".gen-hatch")
      .attr("x", -W/2).attr("y", -H/2)
      .attr("width", W).attr("height", H);

    hatch.attr("fill", "none").attr("opacity", 0).attr("stroke", "none");
    if (scaleEmi) {
      const url = ensureHatch(defs, id,
        emiStroke(gen.emissions_per_mw || 0),
        emiSpacing(gen.emissions_per_mw || 0));
      hatch.attr("fill", url).attr("opacity", 0.40);
    }

    // ---- BLOCKS (replace pips) ----
// ensure a dedicated container for dice blocks
let blocksG = g.select(".dice-blocks");
if (blocksG.empty()) blocksG = g.append("g").attr("class", "dice-blocks");

// remove/ignore old pips call; use blocks instead
drawPowerBlocks(
  blocksG, W, H, gen.pmax, gen.pg,
  (isLocked || isDisabled),
  (newPg) => {
    if (isLocked || isDisabled) return;

    // optimistic update
    const m = currentGenerators.find(x => `Gen${x.bus}` === id || x.id === id);
    if (m) m.pg = newPg;

    // live UI refresh (overview + map)
    renderOverview(currentGenerators, currentScenarioData || {}, currentLines || []);
    updateMapGeneratorsFromScenario();

    // persist to backend
    const percent = Math.min(100, Math.round((newPg / Math.max(1, gen.pmax || 1)) * 100));
    fetch(`/api/set_generation/${gen.index}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent, user_active: true })
    })
    .then(r => r.json())
    .then(data => {
      currentGenerators = data.generators;
      currentLines      = data.lines;
      renderOverview(currentGenerators, currentScenarioData || {}, currentLines || []);
      updateMapGeneratorsFromScenario();
      updateGeneratorHalos?.();
    })
    .catch(console.error);
  }
);


    // ---- LOCK BADGE (centered, large) ----
    const badges = g.select(".gen-badges");
    badges.selectAll("*").remove();
    if (isLocked) {
  badges.append("text")
    .attr("class", "gen-locked-icon")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("x", 0).attr("y", 0)
    .attr("font-size", Math.min(W, H)*0.7)   // big as rect
    .text("🔒");
  g.classed("gen-locked", true);
} else if (isDisabled) {
  badges.append("text")
    .attr("class", "gen-disabled-icon")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("x", 0).attr("y", 0)
    .attr("font-size", Math.min(W, H)*0.7)   // big as rect
    .text("🚫");
  g.classed("gen-disabled", true);
} else {
  g.classed("gen-locked", false)
   .classed("gen-disabled", false);
}

  });

  // if you keep these hooks:
  if (typeof updateGeneratorStrokes === "function") updateGeneratorStrokes();
  if (typeof updateGeneratorHalos   === "function") updateGeneratorHalos();
}



document.getElementById("toggleBtn").addEventListener("click", () => {
  const panel = document.getElementById("adminPanel");
  const isCollapsed = panel.classList.contains("collapsed");

  if (isCollapsed) {
    panel.classList.remove("collapsed");
    panel.classList.add("expanded");
    toggleBtn.textContent = "Hide Admin Controls";
  } else {
    panel.classList.add("collapsed");
    panel.classList.remove("expanded");
    toggleBtn.textContent = "Show Admin Controls";
  }
});
  

// MapView-identical blocks, with inline fills so "goal" always shows.
function updatePowerBlocks(totalPower, targetPower) {
  const container =
    document.querySelector("#overview-power .blocks") ||
    document.querySelector("#scale-power .blocks");
  const valueWrap = document.getElementById("overview-power");
  const label =
    document.querySelector("#overview-power .fraction") ||
    document.querySelector("#scale-power .fraction");
  if (!container || !valueWrap) return;

  totalPower  = +totalPower  || 0;
  targetPower = +targetPower || 0;

  // --- Ensure fraction-row and the pill exist (once) ---
  let row = valueWrap.querySelector(".fraction-row");
  if (!row) {
    row = document.createElement("div");
    row.className = "fraction-row";

    // Insert row right after the blocks container
    const blocksEl = valueWrap.querySelector(".blocks");
    if (blocksEl && blocksEl.nextSibling) {
      valueWrap.insertBefore(row, blocksEl.nextSibling);
    } else {
      valueWrap.appendChild(row);
    }

    if (label) row.appendChild(label);
  } else {
    if (label && label.parentElement !== row) row.appendChild(label);
  }

  let pill = document.getElementById("power-ok-pill");
  if (!pill) {
    pill = document.createElement("div");
    pill.id = "power-ok-pill";
    pill.className = "pill-ok";
    pill.textContent = "All good!";
    // default style; CSS controls final look
    pill.style.display = "none";
    row.appendChild(pill);
  }

  // --- Update fraction text ---
  if (label && targetPower > 0) {
    label.textContent = `${Math.round(totalPower)} / ${Math.round(targetPower)} MW`;
  } else if (label) {
    label.textContent = `${Math.round(totalPower)} MW`;
  }

  // --- Toggle pill visibility when within ±5% of target ---
  const meets = targetPower > 0 &&
                totalPower >= targetPower * 0.95 &&
                totalPower <= targetPower * 1.05;
  pill.style.display = meets ? "inline-block" : "none";

  // --- Rebuild blocks (unchanged) ---
  container.innerHTML = "";
  if (!(targetPower > 0)) return;

  const MW_PER_BLOCK = 100;
  const count   = Math.ceil(targetPower / MW_PER_BLOCK);
  const overAmt = totalPower - targetPower;

  // Density thresholds
  let cellMin = 22, blockH = 26, gap = 6;
  if (count > 120)      { cellMin = 12; blockH = 14; gap = 4; }
  else if (count > 80)  { cellMin = 14; blockH = 16; gap = 5; }
  else if (count > 40)  { cellMin = 18; blockH = 20; gap = 6; }

  container.style.setProperty("--cell-min", `${cellMin}px`);
  container.style.setProperty("--block-h",  `${blockH}px`);
  container.style.setProperty("--gap",      `${gap}px`);

  for (let i = 0; i < count; i++) {
    const startMW = i * MW_PER_BLOCK;
    const endMW   = (i + 1) * MW_PER_BLOCK;
    const el = document.createElement("div");
    el.className = "block";

    if (totalPower >= endMW) {
      el.classList.add("full");
      el.style.background = "#4caf50";
    } else if (totalPower <= startMW) {
      el.classList.add("goal");
      el.style.background = "#e0e0e0";
    } else {
      el.classList.add("partial");
      const pct = Math.max(1, Math.min(99, Math.round(((totalPower - startMW) / MW_PER_BLOCK) * 100)));
      el.style.background = `linear-gradient(90deg, #4caf50 ${pct}%, #e0e0e0 ${pct}%)`;
    }

    container.appendChild(el);
  }

  // Overshoot badge
  if (overAmt > 0 && count > 0) {
    const last = container.lastElementChild;
    if (last) {
      last.className = "block over";
      last.style.background = "#ef5350";
      last.style.color = "#fff";
      last.style.display = "flex";
      last.style.alignItems = "center";
      last.style.justifyContent = "center";
      last.style.fontSize = "12px";
      last.textContent = overAmt > 2000 ? "!!!" : `+${Math.ceil(overAmt / MW_PER_BLOCK)}`;
    }
  }
}
  

function setupTaskSection(scenario) {
  const container = document.getElementById("overview-task-section");
  const hasBudget = scenario.max_cost !== undefined && scenario.max_cost !== null;
    const lockedList = scenario.locked_generators || scenario.locked || [];
  const disabList  = scenario.disabled_generators || scenario.disabled || [];
const hasDisabled = Array.isArray(disabList) && disabList.length > 0;
  const hasLocked  = Array.isArray(lockedList)  && lockedList.length > 0;

  container.innerHTML = `
    <div class="task-card">
      <div class="overview-label">Scenario Task</div>
      <div class="task-card" id="task-checklist">
        <div class="task-content">
          <!-- LEFT COLUMN: REQUIREMENTS -->
          <div class="task-left">
            <div class="task-title">Requirements</div>
            <ul id="task-requirements">
              <li>
  <input type="checkbox" disabled id="check-power" />
  Meet target power${scenario.target_mw != null ? ` (${scenario.target_mw} MW)` : ""}
</li>
              <li><input type="checkbox" disabled id="check-lines" /> No line overloads</li>
              ${hasBudget
                ? `<li id="budget-check"><input type="checkbox" disabled id="check-budget" /> Stay within budget</li>`
                : ``}
            </ul>
          </div>

          <!-- RIGHT COLUMN: CONSTRAINTS -->
          <div class="task-right">
            <div class="task-title">Scenario Constraints</div>
            <div class="task-subtitle" id="task-constraints">
              ${hasLocked ? `<div id="constraint-locked">🔒 Some generators are locked</div>` : ``}
              ${hasDisabled ? `<div id="constraint-disabled">🚫 Some generators are disabled</div>` : ``}
            </div>
          </div>
        </div>

        <!-- SUBMIT BUTTON -->
        <div class="task-submit-row">
          <button id="submit-button" disabled>Submit Solution</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("submit-button").addEventListener("click", () => {
  if (document.getElementById("submit-button").disabled) return;

  showResultOverlay(totalPower, totalCost, totalEmissions);
});
}


function evaluateScenarioState(scenario, lines) {
  const meetsPower = !scenario.target_mw
  ? true
  : (totalPower >= scenario.target_mw * 0.95 &&
     totalPower <= scenario.target_mw * 1.05);
  const meetsLines = !lines.some(line => line.flow > line.rate_a);
  const meetsBudget = !scenario.max_cost || totalCost <= scenario.max_cost;

  console.log("🔎 Evaluating scenario state!");
  //console.log("   ⚡ totalPower:", totalPower, "→ meetsPower:", meetsPower);
  //console.log("   🔌 line overload check:", meetsLines ? "✅ OK" : "❌ Overloaded");
  //console.log("   💸 totalCost:", totalCost, "/", scenario.max_cost, "→ meetsBudget:", meetsBudget);

  const powerCheckbox = document.getElementById("check-power");
  const linesCheckbox = document.getElementById("check-lines");
  const budgetCheckbox = document.getElementById("check-budget");

  if (powerCheckbox) {
    powerCheckbox.checked = meetsPower;
    //console.log("   📥 check-power checkbox updated:", meetsPower);
  } else {
    console.warn("⚠️ check-power checkbox not found");
  }

  if (linesCheckbox) {
    linesCheckbox.checked = meetsLines;
    //console.log("   📥 check-lines checkbox updated:", meetsLines);
  } else {
    console.warn("⚠️ check-lines checkbox not found");
  }

  if (budgetCheckbox && scenario.max_cost !== undefined) {
    budgetCheckbox.checked = meetsBudget;
    //console.log("   📥 check-budget checkbox updated:", meetsBudget);
  } else if (scenario.max_cost !== undefined) {
    console.warn("⚠️ check-budget checkbox not found");
  }

  const allMet = meetsPower && meetsLines && (scenario.max_cost ? meetsBudget : true);
  const submitBtn = document.getElementById("submit-button");

    if (allMet) {
    submitBtn.classList.add("active");
    submitBtn.disabled = false;
  } else {
    submitBtn.classList.remove("active");
    submitBtn.disabled = true;
  }
}



function showResultOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "result-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0, 0, 0, 0.6)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "999";

  const box = document.createElement("div");
  box.className = "results-box";
  box.innerHTML = `
    <h2 class="results-title">✅ Scenario Complete</h2>
    <div class="results-summary">
      <p><strong>⚡ Power:</strong> ${Math.round(totalPower)} MW</p>
      <p><strong>💲 Cost:</strong> $${Math.round(totalCost)}</p>
      <p><strong>🫧 Emissions:</strong> ${Math.round(totalEmissions)} tCO₂</p>
    </div>
    <button class="results-close" id="close-overlay">Close</button>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById("close-overlay").addEventListener("click", () => {
    overlay.remove();
  });
}

  // Lines card stays a mode toggle, not a compound filter
// === Lines card handler ===
const linesCard = document.getElementById("scale-lines");
const linesStatus = document.getElementById("status-lines");
if (linesCard) {
  linesCard.addEventListener("click", () => {
    const next = (currentMapMode !== "lines");

    // Lines focus and Power focus are exclusive: turning Lines ON turns Power OFF
    if (next && activeFilters.has('power')) {
      activeFilters.delete('power');
      const powerEl = document.getElementById("scale-power");
      const powerStatus = document.getElementById("status-power");
      if (powerEl) powerEl.classList.remove("selected");
      if (powerStatus) powerStatus.textContent = "Click to focus";
    }

    setLinesFocus(next);

    // If we changed filters (turned power off), refresh generator rendering
    safeUpdate();
  }, { passive:false });
}




