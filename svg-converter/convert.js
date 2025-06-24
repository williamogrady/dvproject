const fs = require("fs");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

const svg = fs.readFileSync("topology-noarrows.svg", "utf8");
const parsed = parser.parse(svg);

const elements = [];
function walk(node) {
  if (Array.isArray(node)) node.forEach(walk);
  else if (typeof node === "object") {
    if (node.path || node.rect || node.polygon || node.g) {
      const targets = [].concat(
        node.path || [],
        node.rect || [],
        node.polygon || [],
        node.g || []
      );
      elements.push(...targets);
    }
    Object.values(node).forEach(walk);
  }
}
walk(parsed);

const nodes = [];
elements.forEach(el => {
  if (!el.id) return;

  const id = el.id;
  const type = id.startsWith("Gen")
    ? "generator"
    : id.startsWith("Bus")
    ? "bus"
    : id.startsWith("Load")
    ? "load"
    : null;

  if (!type) return;

  const x = parseFloat(el.x || el.cx || 0);
  const y = parseFloat(el.y || el.cy || 0);

  const node = { id, x, y, type};

  if (type === "bus" && el.width && el.height) {
    node.width = parseFloat(el.width);
    node.height = parseFloat(el.height);
  }

  if (type === "load" && el.transform && el.transform.startsWith("rotate")) {
    const match = el.transform.match(/rotate\((-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
    if (match) {
      node.rotate = parseFloat(match[1]);
      node.rotateX = parseFloat(match[2]);
      node.rotateY = parseFloat(match[3]);
    }
  }

  nodes.push(node);
});

fs.writeFileSync("full_nodes.json", JSON.stringify(nodes, null, 2));
console.log("✅ Wrote full_nodes.json with", nodes.length, "nodes");
