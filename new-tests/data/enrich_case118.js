// node enrich_case118.js
const fs = require('fs');
const path = require('path');

const GEN_PATH = path.resolve(__dirname, '../data/operation/generators.json');
const MAP_PATH = path.resolve(__dirname, '../data/operation/generator_info.json'); // converted once from .py
const FUEL_DEF = path.resolve(__dirname, '../data/operation/fuel_defaults.json');
const OUT_PATH = path.resolve(__dirname, '../data/operation/generators_enriched.json');

// helpers
function rng(seed) { let x = seed|0 || 1234567; return () => ((x = (x*1664525 + 1013904223)>>>0) / 2**32); }
const rr = rng(118);

function jitter(val, pct=0.15) { // ±pct
  const f = 1 + (rr()*2-1)*pct;
  return Math.max(0, val*f);
}

const gens = JSON.parse(fs.readFileSync(GEN_PATH, 'utf8'));
const maps = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const defs = JSON.parse(fs.readFileSync(FUEL_DEF, 'utf8'));

const fuelById   = maps.GENERATOR_FUEL_TYPES || {};
const regionById = maps.GENERATOR_REGIONS || {};
const nameById   = maps.GENERATOR_NAMES || {};

// Optionally: upgrade some existing units to expand variety
const PROMOTE_TO_NUCLEAR = new Set(); // e.g., ['49'] if you want to switch PHILO to nuclear
const PROMOTE_TO_WIND    = new Set(); // e.g., ['55','56']
const PROMOTE_TO_SOLAR   = new Set();

for (const g of gens) {
  const idNum = Number(g.id ?? g.ID ?? g.gen_id ?? g.bus ?? 0); // adapt to your shape
  const idStr = String(g.id ?? idNum);

  // base attributes
  let fuel = fuelById[idNum] || g.fuel || 'combined';
  if (PROMOTE_TO_NUCLEAR.has(idStr)) fuel = 'nuclear';
  if (PROMOTE_TO_WIND.has(idStr))    fuel = 'wind';
  if (PROMOTE_TO_SOLAR.has(idStr))   fuel = 'solar';

  const d = defs[fuel] || defs['combined'];
  const [pmin0, pmax0] = [g.pmin ?? 0, g.pmax ?? (d.pmax_range ? jitter((d.pmax_range[0]+d.pmax_range[1])/2, 0.3) : 300)];
  const pmax = Math.max(pmax0, jitter((d.pmax_range ? (d.pmax_range[0] + rr()*(d.pmax_range[1]-d.pmax_range[0])) : pmax0), 0.25));
  const pmin = Math.min(pmin0, Math.max(0, Math.round(0.05 * pmax))); // keep a small pmin

  // initial dispatch: renewables at cap factor, thermal mid-high range
  let pg;
  if (fuel === 'wind' || fuel === 'solar') {
    const [lo, hi] = d.cap_factor || [0.3, 0.4];
    const cf = lo + rr()*(hi-lo);
    pg = Math.round(pmax * cf);
  } else if (fuel === 'nuclear') {
    pg = Math.round(pmax * 0.95);
  } else {
    pg = Math.round(pmax * (0.45 + rr()*0.35)); // 45–80% loaded
  }
  pg = Math.max(pmin, Math.min(pg, pmax));

  // costs/emissions/ramps (with slight jitter)
  const cost_coeff = Array.isArray(d.cost_coeff) ? d.cost_coeff.map((c,i)=> i===0 ? c : Math.round(jitter(c, 0.1)*100)/100 ) : [0, 20, 0];
  const co2_rate   = Math.max(0, Math.round(jitter(d.co2_rate ?? 0, 0.1)*1000)/1000);
  const ramp_up    = Math.round(jitter(d.ramp_up ?? 100, 0.25));
  const ramp_down  = Math.round(jitter(d.ramp_down ?? 100, 0.25));

  Object.assign(g, {
    id: idStr,
    name: nameById[idNum] || g.name || `Gen${idStr}`,
    region: regionById[idNum] || g.region || 'Unknown',
    fuel,
    pmin, pmax, pg,
    cost_coeff,  // a,b,c (for cost = a*pg^2 + b*pg + c)
    co2_rate,    // tCO2 per MWh at full power (simplified)
    ramp_up, ramp_down
  });
}

fs.writeFileSync(OUT_PATH, JSON.stringify(gens, null, 2));
console.log(`Wrote ${OUT_PATH} with ${gens.length} generators enriched.`);
