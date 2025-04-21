// Import built-in file system module so we can read/write files
const fs = require('fs');

// Import the XMLParser class from fast-xml-parser to read SVG like a JS object
const { XMLParser } = require('fast-xml-parser');

// Create an instance of the parser with settings that preserve attribute names
const parser = new XMLParser({
  ignoreAttributes: false,     // we want to keep attributes like id, cx, x, etc.
  attributeNamePrefix: ''      // so they appear as 'id' instead of '@_id'
});

// Read your SVG file into a string
const svgContent = fs.readFileSync('./topology.svg', 'utf8');

// Parse the SVG string into a nested JavaScript object
const parsed = parser.parse(svgContent);

// Some SVGs wrap everything inside <svg> — we want to work on the inner content
const svgElements = parsed.svg || parsed;

// Prepare an empty list to collect individual visual elements
let elements = [];

/**
 * Recursive walk through the entire parsed SVG object
 * to find and flatten all visual elements (circle, rect, path).
 * Figma puts things in groups, so this digs them out.
 */
function walk(node) {
  if (Array.isArray(node)) {
    node.forEach(walk); // handle lists of things
  } else if (typeof node === 'object') {
    // If this object contains visual elements we care about
    if (node.circle || node.rect || node.path) {
      ['circle', 'rect', 'path'].forEach(tag => {
        const el = node[tag];
        if (el) {
          // Push multiple elements or just one
          if (Array.isArray(el)) elements.push(...el);
          else elements.push(el);
        }
      });
    }
    // Recurse through the rest of the object
    Object.values(node).forEach(walk);
  }
}
walk(svgElements);  // start the recursive walk

// Prepare arrays for output
const nodes = [];
const links = [];

/**
 * Loop through each visual element we found and classify it
 */
elements.forEach(el => {
  const id = el.id;
  if (!id) return; // skip anything without an ID

  // Buses are rectangles
  if (id.startsWith('Bus')) {
    const x = parseFloat(el.x) + parseFloat(el.width || 0) / 2;
    const y = parseFloat(el.y) + parseFloat(el.height || 0) / 2;
    nodes.push({ id, x, y, type: 'bus' });

  // Generators are circles
  } else if (id.startsWith('Gen')) {
    const x = parseFloat(el.cx);
    const y = parseFloat(el.cy);
    nodes.push({ id, x, y, type: 'generator' });

  // Loads are paths (usually triangle shapes)
  } else if (id.startsWith('Load')) {
    // Approximate position: try to extract first coordinate from path
    const match = el.d.match(/M\s*(\d+)[ ,](\d+)/);
    if (match) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      nodes.push({ id, x, y, type: 'load' });
    }

  // Lines (edges between nodes)
  } else if (id.startsWith('Line')) {
    const parts = id.split('_');
    let source = parts[1];
    let target = parts[2];

    // If generator or load, we infer the correct full ID
    if (target === 'Gen') {
      source = `Gen${source.replace('Bus', '')}`; // e.g. Bus4 → Gen4
      target = parts[1]; // target is the bus
    }
    else if (target === 'Load') {
      source = `Load${source.replace('Bus', '')}`;
      target = parts[1];
    }

    links.push({ source, target });
  }
});


// Write the nodes and links to JSON files
fs.writeFileSync('nodes.json', JSON.stringify(nodes, null, 2));
fs.writeFileSync('links.json', JSON.stringify(links, null, 2));

console.log(`✅ Done! Wrote ${nodes.length} nodes and ${links.length} links.`);
