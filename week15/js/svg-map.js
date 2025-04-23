let allNodes = [], 
    allLinks = [], 
    nodeById = {};

    const svg = d3.select("#topology");
    const svgGroup = svg.append("g");

    let currentMode = "full"; // other mode is "manual"

    document.getElementById("change-mode").addEventListener("click", () => {
      currentMode = currentMode === "full" ? "manual" : "full";
      document.getElementById("mode-indicator").textContent = `Current Mode: ${currentMode === "full" ? "Full Topology" : "Manual Data"}`;
      updateVisualization(currentMode);
    });

    const zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        svgGroup.attr("transform", event.transform);
      });

    svg.call(zoom);

      function extractStartPoint(dString) {
    const match = dString.match(/M\s*([\d.]+)[ ,]([\d.]+)/);
    return match ? { x: +match[1], y: +match[2] } : null;
  }

  function extractEndPoint(dString) {
    const commands = dString.trim().split(/[A-Za-z]/).filter(Boolean);
    const last = commands.at(-1).trim().split(/[ ,]/).map(Number);
    return { x: last[0], y: last[1] };
  }



  async function updateVisualization(mode) {
    console.log(`🧭 Switching to mode: ${mode}`);
    if (mode === "full") {
      drawFullTopology(); // Already implemented
    } else {
      const [opBuses, opGenerators, opLines] = await Promise.all([
        d3.json("/data/operation/buses.json"),
        d3.json("/data/operation/generators.json"),
        d3.json("/data/operation/lines.json")
      ]);
      const [topoNodes, topoLinks] = await Promise.all([
        d3.json("/data/topology/full_nodes.json"),
        d3.json("/data/topology/full_lines.json")
      ]);

      // Match IDs
      const busIds = new Set(opBuses.map(d => d.id));
      const genBusIds = new Set(opGenerators.map(d => d.bus));
      const allowedBusIds = new Set([...busIds, ...genBusIds]);

      const matchedNodes = topoNodes.filter(node => {
        const idNum = parseInt(node.id.replace(/(Bus|Gen|Load)/, ""));
        if (node.id.startsWith("Bus")) return busIds.has(idNum);
        if (node.id.startsWith("Gen")) return genBusIds.has(idNum);
        if (node.id.startsWith("Load")) return busIds.has(idNum); // Show load if its bus is present
        return false;
      });

      const matchedLinks = topoLinks.filter(link => {
        const from = parseInt(link.source.replace(/Bus/, ""));
        const to = parseInt(link.target.replace(/Bus/, ""));
        return opLines.some(l => (l.fromNumber === from && l.toNumber === to) || (l.fromNumber === to && l.toNumber === from));
      });

      drawFilteredTopology(matchedNodes, matchedLinks);
    }
  }

  function drawTopology(nodes, links) {
    svgGroup.selectAll("*").remove(); // Clear previous

    // Draw links
    svgGroup.selectAll("path.link")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", d => d.d);

    // Draw nodes
    const nodeGroups = svgGroup.selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", d => `node ${d.type}`)
      .attr("transform", d => {
        let base = `translate(${d.x}, ${d.y})`;
        if (d.type === "bus" && d.rotate !== undefined && d.rotateX !== null && d.rotateY !== null) {
          return `${base} rotate(${d.rotate}, ${d.rotateX - d.x}, ${d.rotateY - d.y})`;
        }
        return base;
      });

        nodeGroups.each(function(d) {
    const g = d3.select(this);
    let fillColor = "#fff"; // fallback

    if (currentMode === "manual") {
      if (d.type === "generator") fillColor = "#6ecff6", radius = 12;
      if (d.type === "bus") fillColor = "#4aa3df";
      if (d.type === "load") fillColor = "#007acc";
    } else {
      if (d.type === "generator") fillColor = "#87e291", radius = 6;
      if (d.type === "bus") fillColor = "#999999";
      if (d.type === "load") fillColor = "#54e2f7";
    }

    if (d.type === "generator") {
      g.append("circle")
        .attr("r", radius)
        .attr("fill", fillColor);
    } else if (d.type === "bus") {
      g.append("rect")
        .attr("x", d => -d.width / 2)
        .attr("y", d => -d.height / 2)
        .attr("width", d => d.width)
        .attr("height", d => d.height)
        .attr("fill", fillColor);
    } else if (d.type === "load") {
      g.append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(300))
        .attr("fill", fillColor);
    }
    });

    nodeGroups.append("text")
      .text(d => d.id)
      .attr("y", -15)
      .attr("text-anchor", "middle");
  }


  function drawFullTopology() {
    console.log("🔁 Drawing FULL topology");
    drawTopology(allNodes, allLinks);
  }

  function drawFilteredTopology(filteredNodes, filteredLinks) {
    console.log("🔁 Drawing MANUAL topology");
    drawTopology(filteredNodes, filteredLinks);
  }

  Promise.all([
    d3.json("./week15/data/topology/full_nodes.json"),
    d3.json("./week15/data/topology/full_lines.json"),
    d3.json("/week15/data/operation/buses.json"),
    d3.json("/week15/data/operation/generators.json"),
    d3.json("/week15/data/operation/lines.json")
  ]).then(([nodes, fullLinks, opBuses, opGenerators, opLines]) => {
    allNodes = nodes;
    allLinks = fullLinks;
   
      nodeById = Object.fromEntries(nodes.map(d => [d.id, d]));

      function extractStartPoint(dString) {
        const match = dString.match(/M\\s*([\\d.]+)[ ,]([\\d.]+)/);
        return match ? { x: +match[1], y: +match[2] } : null;
      }

      function extractEndPoint(dString) {
        const commands = dString.trim().split(/[A-Za-z]/).filter(Boolean);
        const last = commands.at(-1).trim().split(/[ ,]/).map(Number);
        return { x: last[0], y: last[1] };
      }

      function distance(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      }

      fullLinks.forEach(link => {
        [link.source, link.target].forEach(id => {
          const node = nodeById[id];
          if (node && (node.type === "generator" || node.type === "load")) {
            const start = extractStartPoint(link.d);
            const end = extractEndPoint(link.d);
            if (start && end) {
              const closer = distance(node, start) < distance(node, end) ? start : end;
              node.x = closer.x;
              node.y = closer.y;
            }
          }
        });
      });

    // Snap generators and loads to the endpoint of their lines
    const unmatchedNodes = [];

    fullLinks.forEach(link => {
  const sourceNode = nodeById[link.source];
  const targetNode = nodeById[link.target];

  if (sourceNode && (sourceNode.type === "generator" || sourceNode.type === "load")) {
    const start = extractStartPoint(link.d);
    if (start && !isNaN(start.x) && !isNaN(start.y)) {
      sourceNode.x = start.x;
      sourceNode.y = start.y;
    }
  }

  if (targetNode && (targetNode.type === "generator" || targetNode.type === "load")) {
    const end = extractEndPoint(link.d);
    if (end && !isNaN(end.x) && !isNaN(end.y)) {
      targetNode.x = end.x;
      targetNode.y = end.y;
    }
  }
    updateVisualization("full"); // Use this instead of drawFullTopology()
});

    // Fallback for completely unmatched nodes
    nodes.forEach(n => {
      if ((n.type === "generator" || n.type === "load") &&
          (typeof n.x !== 'number' || typeof n.y !== 'number')) {
        unmatchedNodes.push(n.id);
        n.x = -9999;
        n.y = -9999;
      }
    });

    console.log("🔎 Unmatched generator/load nodes:", unmatchedNodes);




      // Draw curved paths from full_lines.json
      svgGroup.selectAll("path.link")
        .data(fullLinks)
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d => d.d);
      /*
      // Debug: Red dots at source node positions
      svgGroup.selectAll("circle.src-debug")
        .data(fullLinks)
        .enter()
        .append("circle")
        .attr("class", "src-debug")
        .attr("cx", d => nodeById[d.source]?.x || 0)
        .attr("cy", d => nodeById[d.source]?.y || 0)
        .attr("r", 10)
        .attr("fill", "red")

      // Debug: Blue dots at target node positions
      svgGroup.selectAll("circle.tgt-debug")
        .data(fullLinks)
        .enter()
        .append("circle")
        .attr("class", "tgt-debug")
        .attr("cx", d => nodeById[d.target]?.x || 0)
        .attr("cy", d => nodeById[d.target]?.y || 0)
        .attr("r", 20)
        .attr("fill", "blue")
      */

      /*
      const nodeGroups = svgGroup.selectAll(".node")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", d => `node ${d.type}`)
        .attr("transform", d => {
          let base = `translate(${d.x}, ${d.y})`;
          if (d.type === "bus" && d.rotate !== undefined && d.rotateX !== null && d.rotateY !== null) {
            return `${base} rotate(${d.rotate}, ${d.rotateX - d.x}, ${d.rotateY - d.y})`;
          }
          return base;
        });
        

      nodeGroups.each(function(d) {
        const g = d3.select(this);
        if (d.type === "generator") {
          g.append("circle").attr("r", 12);
        } else if (d.type === "bus") {
          g.append("rect")
          .attr("x", d => -d.width / 2)
          .attr("y", d => -d.height / 2)
          .attr("width", d => d.width)
          .attr("height", d => d.height);
        } else if (d.type === "load") {
          g.append("path")
            .attr("d", d3.symbol().type(d3.symbolTriangle).size(300));
        }
      });

      nodeGroups.append("text")
        .text(d => d.id)
        .attr("y", -15)
        .attr("text-anchor", "middle");
    });

*/

  });
  