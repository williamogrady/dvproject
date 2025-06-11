const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ''
});

// Load single, full SVG file with correct coordinates
const svgContent = fs.readFileSync('topology-noarrows.svg', 'utf8');
const parsed = parser.parse(svgContent);
const svgRoot = parsed.svg || parsed;

let elements = [];

function walk(node) {
  if (Array.isArray(node)) node.forEach(walk);
  else if (typeof node === 'object') {
    if (node.path) {
      if (Array.isArray(node.path)) elements.push(...node.path);
      else elements.push(node.path);
    }
    Object.values(node).forEach(walk);
  }
}

walk(svgRoot);

const links = [];

elements.forEach(el => {
  const id = el.id;
  const d = el.d;

  if (!id || !id.startsWith('Line') || !d) return;

  const parts = id.includes('_') ? id.split('_') : id.split('-');
  if (parts.length < 3) return;

  let rawBus = parts[1];
  let rawOther = parts[2];
  let source = '', target = '';

  if (rawOther === 'Gen') {
    source = `Bus${rawBus.replace('Bus', '')}`;
    target = `Gen${rawBus.replace('Bus', '')}`;
  } else if (rawOther === 'Load') {
    source = `Bus${rawBus.replace('Bus', '')}`;
    target = `Load${rawBus.replace('Bus', '')}`;
  } else {
    source = parts[1];
    target = parts[2];
  }

  links.push({
    id,
    source,
    target,
    d
  });
});

fs.writeFileSync('full_lines.json', JSON.stringify(links, null, 2));
console.log(`✅ Wrote full_lines.json with ${links.length} lines from topology-noarrows.svg`);
