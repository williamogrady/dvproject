// check_lines.js
// Minimal console logger for line topology alignment (Bus↔Bus)
// Usage: node check_lines.js ./case118_data.json ./full_lines.json

const fs = require('fs');

const [,, CASE_PATH, LINES_PATH] = process.argv;
if (!CASE_PATH || !LINES_PATH) {
  console.log('Usage: node check_lines.js <case118_data.json> <full_lines.json>');
  process.exit(1);
}

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error('Failed to read', p, e.message); process.exit(1); }
}

function asCasePairs(caseData) {
  // Accept {branches:[[f,t,...],...]} or {branch:[...]} or [{fbus,tbus}, ...]
  const out = [];
  if (Array.isArray(caseData)) {
    for (const it of caseData) {
      if (Array.isArray(it) && it.length >= 2) out.push([+it[0], +it[1]]);
      else if (it && typeof it === 'object' && 'fbus' in it && 'tbus' in it) out.push([+it.fbus, +it.tbus]);
    }
    return out;
  }
  if (caseData && Array.isArray(caseData.branches)) {
    for (const row of caseData.branches) if (Array.isArray(row) && row.length >= 2) out.push([+row[0], +row[1]]);
  } else if (caseData && Array.isArray(caseData.branch)) {
    for (const row of caseData.branch) if (Array.isArray(row) && row.length >= 2) out.push([+row[0], +row[1]]);
  }
  return out;
}

function normalizeBusLabel(s) {
  const m = String(s||'').match(/^Bus(\d+)$/i);
  return m ? +m[1] : null;
}

function collectFullLinePairs(fullLines) {
  // Accept list or {lines:[...]}
  const arr = Array.isArray(fullLines) ? fullLines
            : (fullLines && Array.isArray(fullLines.lines) ? fullLines.lines : []);
  const pairs = []; // {s,t,id}
  for (const L of arr) {
    const s = normalizeBusLabel(L && L.source);
    const t = normalizeBusLabel(L && L.target);
    if (Number.isFinite(s) && Number.isFinite(t)) {
      pairs.push({ s, t, id: (L && L.id) || '' });
    }
  }
  return pairs;
}

function keyOrdered(a,b){ return `${a}|${b}`; }
function keyUnordered(a,b){ return `${Math.min(a,b)}|${Math.max(a,b)}`; }

function run(){
  const caseData  = loadJSON(CASE_PATH);
  const linesData = loadJSON(LINES_PATH);

  const casePairs = asCasePairs(caseData);       // [[f,t], ...]
  const flPairs   = collectFullLinePairs(linesData); // [{s,t,id}, ...]

  const caseSetUn = new Set(casePairs.map(([f,t]) => keyUnordered(f,t)));

  // Index full_lines
  const exact = new Map();     // "f|t" -> [ids]
  const reversed = new Map();  // "f|t" -> [ids] but stored as "t|f" in data
  const byUn = new Map();      // "min|max" -> [{s,t,id},...]

  for (const {s,t,id} of flPairs){
    const kExact = keyOrdered(s,t);
    const kRev   = keyOrdered(t,s);
    const kUn    = keyUnordered(s,t);

    if (!exact.has(kExact)) exact.set(kExact, []);
    exact.get(kExact).push(id);

    if (!reversed.has(kRev)) reversed.set(kRev, []);
    reversed.get(kRev).push(id);

    if (!byUn.has(kUn)) byUn.set(kUn, []);
    byUn.get(kUn).push({s,t,id});
  }

  // Tally per case branch
  let same=0, revOnly=0, mixed=0, missing=0;
  const rows = [];
  for (const [f,t] of casePairs){
    const kExact = keyOrdered(f,t);
    const sameIds = exact.get(kExact) || [];
    const revIds  = reversed.get(kExact) || []; // present as (t,f) in data

    let status, ids;
    if (sameIds.length && !revIds.length){ status='Same'; same++; ids = sameIds; }
    else if (!sameIds.length && revIds.length){ status='ReversedOnly'; revOnly++; ids = revIds; }
    else if (sameIds.length && revIds.length){ status='Mixed'; mixed++; ids = [...sameIds.map(x=>`(f→t) ${x}`), ...revIds.map(x=>`(t→f) ${x}`)]; }
    else { status='Missing'; missing++; ids = []; }

    rows.push({ fbus:f, tbus:t, status, ids });
  }

  // Extras in SVG not in case (unordered)
  const extras = [];
  for (const [kUn, list] of byUn.entries()){
    if (!caseSetUn.has(kUn)){
      for (const e of list) extras.push({ pair:kUn, source:e.s, target:e.t, id:e.id });
    }
  }

  // Duplicates per ordered direction
  const dupOrdered = [];
  for (const [k, ids] of exact.entries()){
    if (ids.length > 1) dupOrdered.push({ pair:k, ids });
  }
  for (const [k, ids] of reversed.entries()){
    if (ids.length > 1) dupOrdered.push({ pair:`(rev) ${k}`, ids });
  }

  // Mixed per unordered (A→B and B→A both present)
  const mixedUn = [];
  for (const [f,t] of casePairs){
    const un = keyUnordered(f,t);
    const list = byUn.get(un) || [];
    const hasFwd = list.some(x=>x.s===f && x.t===t);
    const hasRev = list.some(x=>x.s===t && x.t===f);
    if (hasFwd && hasRev){
      mixedUn.push({ pair:un, ids: list.map(x=>`${x.s}->${x.t}:${x.id}`) });
    }
  }

  // Report
  console.log('=== Lines topology check (case118 ↔ full_lines) ===\n');
  console.log(`Case branches (ordered)         : ${casePairs.length}`);
  console.log(`SVG Bus↔Bus entries (ordered)   : ${flPairs.length}`);
  console.log(`\nStatus over case branches:`);
  console.log(`  Same           : ${same}`);
  console.log(`  ReversedOnly   : ${revOnly}`);
  console.log(`  Mixed          : ${mixed}`);
  console.log(`  Missing        : ${missing}`);

  console.log(`\nExtras in SVG (not in case, unordered pairs): ${extras.length}`);
  if (extras.length) console.log(extras.slice(0,30)); // show a sample; adjust as needed

  console.log(`\nDuplicates (same ordered pair appears multiple times): ${dupOrdered.length}`);
  if (dupOrdered.length) console.log(dupOrdered.slice(0,30));

  console.log(`\nMixed by unordered pair (both A→B and B→A exist): ${mixedUn.length}`);
  if (mixedUn.length) console.log(mixedUn.slice(0,30));

  // Optional: print specific problem lists
  const list = (label, where) => {
    const arr = rows.filter(r => r.status === where).slice(0,50)
      .map(r => ({ fbus:r.fbus, tbus:r.tbus, ids:r.ids }));
    console.log(`\n${label} (sample):`, arr);
  };
  list('ReversedOnly branches', 'ReversedOnly');
  list('Missing branches', 'Missing');

  console.log('\nTip:\n- "ReversedOnly": path exists only as B→A; normalize metadata to f→t (case118).\n- "Mixed": keep only one canonical direction in data, or ensure renderer treats A→B as canonical and flips geometry once.\n- "Extras": lines in SVG not present in case118; remove or tag as non-branch.');
}

run();
