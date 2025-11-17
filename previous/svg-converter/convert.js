const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const IN_SVG    = 'svgmapframe.svg';
const OUT_LINES = 'full_lines.json';
const OUT_NODES = 'full_nodes.json';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  allowBooleanAttributes: true,
});

function readSvg(file) {
  const svgContent = fs.readFileSync(file, 'utf8');
  const parsed = parser.parse(svgContent);
  return parsed.svg || parsed;
}

function walk(node, cb) {
  if (Array.isArray(node)) { for (const n of node) walk(n, cb); return; }
  if (node && typeof node === 'object') {
    cb(node);
    for (const v of Object.values(node)) walk(v, cb);
  }
}

function num(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function getXYWH(el) {
  // Rect-like
  const x = num(el.x), y = num(el.y), w = num(el.width), h = num(el.height);
  if (x != null && y != null && w != null && h != null) return { x, y, width: w, height: h };

  // Line-like -> thin rect box
  const x1 = num(el.x1), y1 = num(el.y1), x2 = num(el.x2), y2 = num(el.y2);
  if (x1 != null && y1 != null && x2 != null && y2 != null) {
    const minx = Math.min(x1, x2), miny = Math.min(y1, y2);
    const w2 = Math.max(1, Math.abs(x2 - x1));
    const h2 = Math.max(1, Math.abs(y2 - y1));
    return { x: minx, y: miny, width: w2, height: h2 };
  }

  // Circle-like
  const cx = num(el.cx), cy = num(el.cy), r = num(el.r);
  if (cx != null && cy != null) {
    const rr = r != null ? r : 1;
    return { x: cx - rr, y: cy - rr, width: rr * 2, height: rr * 2 };
  }

  if (x != null && y != null) return { x, y, width: 0, height: 0 };
  return null;
}

// --- NEW: rotation helpers ---------------------------------------------------
function parseRotateTransform(transformStr) {
  if (!transformStr) return null;
  const m = String(transformStr).match(/rotate\(\s*([-\d.]+)(?:[,\s]+([-\d.]+)[,\s]+([-\d.]+))?\s*\)/i);
  if (!m) return null;
  const angle = num(m[1]);
  const cx = num(m[2]); // may be null if not present
  const cy = num(m[3]);
  return {
    rotate: Number.isFinite(angle) ? angle : 0,
    rotateX: Number.isFinite(cx) ? cx : null,
    rotateY: Number.isFinite(cy) ? cy : null,
  };
}

function rotationFromEndpoints(el) {
  const x1 = num(el.x1), y1 = num(el.y1), x2 = num(el.x2), y2 = num(el.y2);
  if ([x1, y1, x2, y2].every(v => v != null)) {
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return {
      rotate: Math.round(angle * 1000) / 1000,
      rotateX: (x1 + x2) / 2,
      rotateY: (y1 + y2) / 2,
    };
  }
  return null;
}

function extractRotation(el) {
  // Prefer geometric inference for lines; else parse transform rotate(...)
  return rotationFromEndpoints(el) || parseRotateTransform(el.transform) || null;
}
// ----------------------------------------------------------------------------

function parseSourceTargetFromId(id) {
  if (!id || !String(id).startsWith('Line')) return { source: '', target: '' };
  const parts = id.includes('_') ? id.split('_') : id.split('-');
  if (parts.length < 3) return { source: '', target: '' };

  const rawA = parts[1];
  const rawB = parts[2];

  if (/^Gen$/i.test(rawB)) {
    const n = rawA.replace(/[^0-9]/g, '');
    return { source: `Bus${n}`, target: `Gen${n}` };
  }
  if (/^Load$/i.test(rawB)) {
    const n = rawA.replace(/[^0-9]/g, '');
    return { source: `Bus${n}`, target: `Load${n}` };
  }

  return { source: rawA, target: rawB };
}

function nodeTypeFromId(id) {
  if (!id) return null;
  if (/^Bus\d+$/i.test(id))  return 'bus';
  if (/^Gen\d+$/i.test(id))  return 'generator';
  if (/^Load\d+$/i.test(id)) return 'load';
  return null;
}

function firstMoveXY(d) {
  if (!d || typeof d !== 'string') return null;
  const m = d.match(/M\s*([-\d.]+)[,\s]+([-\d.]+)/i);
  if (!m) return null;
  const x = num(m[1]), y = num(m[2]);
  if (x == null || y == null) return null;
  return { x, y };
}

function extract() {
  const root = readSvg(IN_SVG);

  const lines = [];
  const nodes = [];
  const seenLineIds = new Set();
  const seenNodeIds = new Set();

  // pushNode now gets source element for rotation
  function pushNode(id, geom, srcEl) {
    if (!id) return;
    if (seenNodeIds.has(id)) return;
    const type = nodeTypeFromId(id);
    if (!type) return;
    seenNodeIds.add(id);

    const out = { id, type };

    if (type === 'bus') {
      // Rect-like geometry + rotation metadata for MapView
      if (geom) {
        out.x = geom.x ?? null;
        out.y = geom.y ?? null;
        out.width  = geom.width  ?? null;
        out.height = geom.height ?? null;
      } else {
        out.x = out.y = out.width = out.height = null;
      }
      const rot = extractRotation(srcEl || {});
      out.rotate  = rot ? rot.rotate  : null;
      out.rotateX = rot ? rot.rotateX : null;
      out.rotateY = rot ? rot.rotateY : null;
    } else {
      // generator/load → store center point; rotation not required
      if (geom) {
        const gx = (geom.x != null) ? Math.round(geom.x + (geom.width  ? geom.width/2  : 0)) : null;
        const gy = (geom.y != null) ? Math.round(geom.y + (geom.height ? geom.height/2 : 0)) : null;
        out.x = gx ?? null;
        out.y = gy ?? null;

        // If the element itself had an explicit rotate(...), keep it (Map may use it for loads)
        const rot = parseRotateTransform(srcEl?.transform);
        out.rotate  = rot ? rot.rotate  : null;
        out.rotateX = rot ? rot.rotateX : null;
        out.rotateY = rot ? rot.rotateY : null;
      } else {
        out.x = out.y = null;
        out.rotate = out.rotateX = out.rotateY = null;
      }
    }

    nodes.push(out);
  }

  walk(root, (el) => {
    if (!el || typeof el !== 'object') return;

    // ---- LINES ----
    if (el.path) {
      const paths = Array.isArray(el.path) ? el.path : [el.path];
      for (const p of paths) {
        const id = p.id;
        if (!id || !String(id).startsWith('Line')) continue;
        if (seenLineIds.has(id)) continue;
        seenLineIds.add(id);
        const d = p.d || '';
        const { source, target } = parseSourceTargetFromId(id);
        lines.push({ id, source, target, d });
      }
    }

    if (el.line) {
      const ls = Array.isArray(el.line) ? el.line : [el.line];
      for (const l of ls) {
        const id = l.id;
        if (!id || !String(id).startsWith('Line')) continue;
        if (seenLineIds.has(id)) continue;
        seenLineIds.add(id);
        const { x1, y1, x2, y2 } = l;
        const d = (x1 != null && y1 != null && x2 != null && y2 != null)
          ? `M ${x1},${y1} L ${x2},${y2}`
          : '';
        const { source, target } = parseSourceTargetFromId(id);
        lines.push({ id, source, target, d });
      }
    }

    // ---- NODES ----
    if (el.rect) {
      const rs = Array.isArray(el.rect) ? el.rect : [el.rect];
      for (const r of rs) { pushNode(r.id, getXYWH(r), r); }
    }

    if (el.circle) {
      const cs = Array.isArray(el.circle) ? el.circle : [el.circle];
      for (const c of cs) { pushNode(c.id, getXYWH(c), c); }
    }

    if (el.line) {
      const ls = Array.isArray(el.line) ? el.line : [el.line];
      for (const l of ls) { pushNode(l.id, getXYWH(l), l); }
    }

    if (el.path) {
      const ps = Array.isArray(el.path) ? el.path : [el.path];
      for (const p of ps) {
        const t = nodeTypeFromId(p.id);
        if (!t) continue;
        let geom = null;
        const xy = firstMoveXY(p.d);
        if (xy) geom = { x: xy.x, y: xy.y, width: 0, height: 0 };
        pushNode(p.id, geom, p);
      }
    }

    if (el.use) {
      const us = Array.isArray(el.use) ? el.use : [el.use];
      for (const u of us) { pushNode(u.id, getXYWH(u), u); }
    }

    if (el.image) {
      const is = Array.isArray(el.image) ? el.image : [el.image];
      for (const im of is) { pushNode(im.id, getXYWH(im), im); }
    }
  });

  lines.sort((a,b) => a.id.localeCompare(b.id));
  nodes.sort((a,b) => a.id.localeCompare(b.id));

  fs.writeFileSync(OUT_LINES, JSON.stringify(lines, null, 2), 'utf8');
  fs.writeFileSync(OUT_NODES, JSON.stringify(nodes, null, 2), 'utf8');

  console.log(`✅ Overwrote ${OUT_LINES} with ${lines.length} entries`);
  console.log(`✅ Overwrote ${OUT_NODES} with ${nodes.length} entries`);
  console.log(`(IDs preserved exactly as in SVG)`);
}

try { extract(); }
catch (e) {
  console.error('❌ Conversion failed:', e);
  process.exit(1);
}
