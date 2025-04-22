const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ''
});

const svgContent = fs.readFileSync('./topology.svg', 'utf8');
const parsed = parser.parse(svgContent);
const svgElements = parsed.svg || parsed;

let elements = [];
function walk(node) {
  if (Array.isArray(node)) node.forEach(walk);
  else if (typeof node === 'object') {
    ['path', 'line'].forEach(tag => {
      const el = node[tag];
      if (el) {
        if (Array.isArray(el)) elements.push(...el);
        else elements.push(el);
      }
    });
    Object.values(node).forEach(walk);
  }
}
walk(svgElements);

const links = [];

elements.forEach(el => {
  const id = el.id;
  if (!id || !id.startsWith('Line')) return;

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

  const d = el.d || `M${el.x1},${el.y1}L${el.x2},${el.y2}`;

  links.push({
    id,
    source,
    target,
    d
  });
});

fs.writeFileSync('full_lines.json', JSON.stringify(links, null, 2));
console.log(`✅ Updated full_lines.json (${links.length} lines)`);
