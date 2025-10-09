const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// Usage: node convert.js [input.svg] [output.json]
// Defaults: svgmapframe.svg -> full_lines.json
const IN_SVG  = process.argv[2] || 'svgmapframe.svg';
const OUT_JSON = process.argv[3] || 'full_lines.json';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ''
});

function readSvg(file) {
  const svgContent = fs.readFileSync(file, 'utf8');
  const parsed = parser.parse(svgContent);
  return parsed.svg || parsed;
}

function walkCollect(node, out = []) {
  if (Array.isArray(node)) {
    node.forEach(n => walkCollect(n, out));
    return out;
  }
  if (node && typeof node === 'object') {
    // collect <path>
    if (node.path) {
      if (Array.isArray(node.path)) out.push(...node.path);
      else out.push(node.path);
    }
    // collect <line> (convert to simple M-L path)
    if (node.line) {
      const ls = Array.isArray(node.line) ? node.line : [node.line];
      ls.forEach(l => {
        if (!l) return;
        const { x1, y1, x2, y2, id } = l;
        if (x1 != null && y1 != null && x2 != null && y2 != null) {
          out.push({
            id,
            d: `M ${x1},${y1} L ${x2},${y2}`
          });
        }
      });
    }
    Object.values(node).forEach(v => walkCollect(v, out));
  }
  return out;
}

// Split a path's d into independent subpaths by capital 'M' commands
function splitD(d) {
  if (!d || typeof d !== 'string') return [];
  // Normalize whitespace
  const s = d.replace(/\s+/g, ' ').trim();

  // If there's only one 'M' (or none), just return as-is
  const mCount = (s.match(/(?:^|[^a-zA-Z])M[\s-]*/g) || []).length;
  if (mCount <= 1) return [s];

  // Split **before** each 'M' (keep the 'M' with the segment)
  const parts = s.split(/(?=M[\s-])/g).map(p => p.trim()).filter(Boolean);
  return parts;
}

function parseSourceTargetFromId(id) {
  // Your current convention supports "Line_BusX_BusY", also underscores/ hyphens. :contentReference[oaicite:1]{index=1}
  if (!id) return { source: '', target: '' };
  if (!id.startsWith('Line')) return { source: '', target: '' };

  const parts = id.includes('_') ? id.split('_') : id.split('-');
  if (parts.length < 3) return { source: '', target: '' };

  const rawBus = parts[1];
  const rawOther = parts[2];

  if (rawOther === 'Gen') {
    return {
      source: `Bus${rawBus.replace('Bus', '')}`,
      target: `Gen${rawBus.replace('Bus', '')}`
    };
  }
  if (rawOther === 'Load') {
    return {
      source: `Bus${rawBus.replace('Bus', '')}`,
      target: `Load${rawBus.replace('Bus', '')}`
    };
  }
  // Bus-to-Bus
  return { source: parts[1], target: parts[2] };
}

(function main() {
  const svgRoot = readSvg(IN_SVG);
  const elements = walkCollect(svgRoot);

  const links = [];
  const seen = new Set();
  let splitCount = 0;

  elements.forEach(el => {
    const id = el.id;
    const d = el.d;
    if (!id || !d || !id.startsWith('Line')) return;

    const segments = splitD(d);
    if (segments.length > 1) splitCount++;

    const { source, target } = parseSourceTargetFromId(id);

    segments.forEach((segD, i) => {
      const baseId = segments.length > 1 ? `${id}-seg${i + 1}` : id;
      let finalId = baseId;
      // enforce uniqueness (in case svg repeats IDs like ..._2) :contentReference[oaicite:2]{index=2}
      let k = 2;
      while (seen.has(finalId)) {
        finalId = `${baseId}__${k++}`;
      }
      seen.add(finalId);

      links.push({
        id: finalId,
        source,
        target,
        d: segD
      });
    });
  });

  // Sort by id for stable diffs
  links.sort((a, b) => a.id.localeCompare(b.id));

  fs.writeFileSync(OUT_JSON, JSON.stringify(links, null, 2), 'utf8');

  console.log(`✅ Wrote ${OUT_JSON} with ${links.length} lines from ${IN_SVG}`);
  if (splitCount > 0) {
    console.log(`ℹ️  Detected and split ${splitCount} multi-segment path(s) into separate records.`);
  }
})();
