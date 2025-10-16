// check_missing_nodes.js
// Minimal console logger for missing/extra BUSES and GENERATORS
// Usage: node check_missing_nodes.js ./case118_data.json ./full_nodes.json

const fs = require('fs');

const [,, casePath, nodesPath] = process.argv;
if (!casePath || !nodesPath) {
  console.log('Usage: node check_missing_nodes.js <case118_data.json> <full_nodes.json>');
  process.exit(1);
}

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) {
    console.error('Failed to read', p, e.message);
    process.exit(1);
  }
}

function numFromId(id, prefix) {
  const m = String(id||'').match(new RegExp('^' + prefix + '(\\d+)$','i'));
  return m ? parseInt(m[1],10) : null;
}

const caseData = loadJSON(casePath);
const fullNodes = loadJSON(nodesPath);

// ---- EDIT HERE if needed: pick arrays in your case file ----
const caseBusRows = Array.isArray(caseData.buses) ? caseData.buses : [];          // e.g. [[1, ...], [2, ...], ...]
const caseGenRows = Array.isArray(caseData.generators) ? caseData.generators : []; // e.g. [[bus, Pg, Qg, ...], ...]
// ------------------------------------------------------------

const caseBuses = new Set(
  caseBusRows
    .map(r => (Array.isArray(r) && r.length ? parseInt(r[0],10) : null))
    .filter(n => Number.isFinite(n))
);

const genBusCounts = new Map(); // bus -> count of gens at that bus
for (const r of caseGenRows) {
  if (!Array.isArray(r) || r.length === 0) continue;
  const b = parseInt(r[0],10); // gen_bus
  if (!Number.isFinite(b)) continue;
  genBusCounts.set(b, (genBusCounts.get(b) || 0) + 1);
}
const requiredGenBuses = new Set(genBusCounts.keys());

// Extract Bus*/Gen* from full_nodes.json
const nodeArray = Array.isArray(fullNodes) ? fullNodes
                  : Array.isArray(fullNodes.nodes) ? fullNodes.nodes
                  : Array.isArray(fullNodes.items) ? fullNodes.items
                  : Object.values(fullNodes).flat().filter(x => x && typeof x === 'object');

const busesInSVG = new Set();
const gensInSVG  = new Set();

for (const n of nodeArray) {
  const id = n && n.id;
  const b = numFromId(id, 'Bus');
  if (Number.isFinite(b)) { busesInSVG.add(b); continue; }
  const g = numFromId(id, 'Gen');
  if (Number.isFinite(g)) { gensInSVG.add(g); continue; }
}

// Compute diffs
function setDiff(a, b) { // a\b
  const out = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return out.sort((x,y)=>x-y);
}
function toList(s) { return Array.from(s).sort((a,b)=>a-b); }

const missingBuses = setDiff(caseBuses, busesInSVG);
const extraBuses   = setDiff(busesInSVG, caseBuses);

const missingGenBuses = setDiff(requiredGenBuses, gensInSVG);
const extraGenBuses   = setDiff(gensInSVG, requiredGenBuses);

// Report
console.log('=== case118 ↔ SVG topology check ===\n');
console.log(`Total case118 buses        : ${caseBuses.size}`);
console.log(`Total SVG Bus* nodes       : ${busesInSVG.size}`);
console.log(`→ Missing Bus* in SVG      : ${missingBuses.length} ${missingBuses.length?('- '+missingBuses.join(', ')) : ''}`);
console.log(`→ Extra Bus* in SVG        : ${extraBuses.length} ${extraBuses.length?('- '+extraBuses.join(', ')) : ''}\n`);

console.log(`Total case118 generators   : ${caseGenRows.length}`);
console.log(`Distinct gen buses (case)  : ${requiredGenBuses.size}`);
console.log(`SVG Gen* nodes (by ID)     : ${gensInSVG.size}`);
console.log(`→ Missing Gen* (by bus id) : ${missingGenBuses.length} ${missingGenBuses.length?('- '+missingGenBuses.join(', ')) : ''}`);
console.log(`→ Extra Gen* (by bus id)   : ${extraGenBuses.length} ${extraGenBuses.length?('- '+extraGenBuses.join(', ')) : ''}\n`);

const multiAtBus = [...genBusCounts.entries()].filter(([_,c])=>c>1);
if (multiAtBus.length) {
  console.log('Buses with multiple generators in case118 (you may need multiple Gen nodes here):');
  for (const [bus, count] of multiAtBus) console.log(`- Bus ${bus}: ${count} generators`);
} else {
  console.log('No buses with multiple generators detected in case118 data.');
}

console.log('\nTip: This script only checks by ID pattern Gen<bus>. If your Gen IDs use another scheme, map them accordingly.');
