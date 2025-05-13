import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { Generator } from '../classes/Generator.js';
import { Bus } from '../classes/Bus.js';
import { Line } from '../classes/Line.js';
import { initListView } from './views/listView.js';

Promise.all([
  d3.json('/prototype1/data/topology/full_nodes.json'),
  d3.json('/prototype1/data/topology/full_lines.json'),
  d3.json('/prototype1/data/operation/buses.json'),
  d3.json('/prototype1/data/operation/generators.json'),
  d3.json('/prototype1/data/operation/lines.json')
]).then(([nodeData, lineData, busData, genData, lineProps]) => {

  // Create bus objects from operation data + assign positions from topology
  const opBuses = busData.map(bus => {
    const b = new Bus(bus);
    const node = nodeData.find(n => n.id === `Bus${b.busNumber}`);
    if (node) b.setPosition(node.x, node.y);
    return b;
  });

  // Create generator objects and attach to bus positions
  const opGenerators = genData
    .sort((a, b) => {
      const numA = parseInt((a.id || "").replace(/\D/g, ""), 10) || 0;
      const numB = parseInt((b.id || "").replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    })
    .map(genData => {
      const gen = new Generator(genData);
      const bus = opBuses.find(b => b.busNumber === gen.busNumber);
      if (bus) {
        const { x, y } = bus.getCoords();
        gen.x = x;
        gen.y = y;
      } else {
        gen.x = 0;
        gen.y = 0;
      }
      gen.currentOutput = 0;
      gen.selected = false;
      gen.region = gen.region || ["North", "South", "East", "West"][Math.floor(Math.random() * 4)];
      gen.northGroup = false;
      return gen;
    });

  // Create line objects
  const opLines = lineProps.map(props => {
    const line = new Line(props);
    const fromBus = opBuses.find(b => b.busNumber === line.from);
    const toBus = opBuses.find(b => b.busNumber === line.to);
    if (fromBus && toBus) {
      line.setCoordinates(fromBus.getCoords(), toBus.getCoords());
    }
    return line;
  });

  // Initialize listView with all enriched objects
  initListView(opGenerators, opBuses, opLines);
});
