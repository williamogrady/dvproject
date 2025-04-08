(function() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const mid = width / 2;

  const svg = d3.select("body")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // 1. Create a group for the map area (blue background)
  const mapGroup = svg.append("g").attr("class", "map");

  // Left: Blue map area (for power grid)
  mapGroup.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", mid)
    .attr("height", height)
    .attr("fill", "steelblue");

  // Draw the power grid graph first, so that it stays below the control panel
  const gridGroup = svg.append("g")
    .attr("class", "powergrid");

  // Function to randomly place the nodes (generators and loads)
  const randomPosition = () => ({
    x: Math.random() * (width - 100) + 50,
    y: Math.random() * (height - 100) + 50
  });

  /*
  // Create the power grid graph: generators (circles), loads (triangles), and transmission lines (edges)
  const generators = [];
  const loads = [];

  // Create generators (circles)
  for (let i = 0; i < 10; i++) {
    const pos = randomPosition();
    const generator = gridGroup.append("circle")
      .attr("cx", pos.x)
      .attr("cy", pos.y)
      .attr("r", 20)
      .attr("fill", "transparent")
      .attr("stroke", "green")
      .attr("stroke-width", 4)
      .attr("class", "generator")
      .attr("data-status", "off") // Generator starts OFF
      .on("click", function() {
        const status = d3.select(this).attr("data-status");
        if (status === "off") {
          d3.select(this).attr("fill", "green");
          d3.select(this).attr("data-status", "on");
        } else {
          d3.select(this).attr("fill", "transparent");
          d3.select(this).attr("data-status", "off");
        }
      });
    generators.push(generator);
  }

  // Create loads (triangles)
  for (let i = 0; i < 5; i++) {
    const pos = randomPosition();
    const load = gridGroup.append("polygon")
      .attr("points", `${pos.x - 20},${pos.y + 20} ${pos.x + 20},${pos.y + 20} ${pos.x},${pos.y - 20}`)
      .attr("fill", "red")
      .attr("stroke", "black")
      .attr("stroke-width", 2);
    loads.push(load);
  }

  // Create transmission lines (random connections between generators and loads)
  const allNodes = [...generators, ...loads];
  const lines = [];

  for (let i = 0; i < 10; i++) {
    const node1 = allNodes[Math.floor(Math.random() * allNodes.length)];
    const node2 = allNodes[Math.floor(Math.random() * allNodes.length)];

    // Make sure we don't connect a node to itself
    if (node1 !== node2) {
      const line = gridGroup.append("line")
        .attr("x1", node1.attr("cx") || node1.attr("points").split(' ')[0].split(',')[0])
        .attr("y1", node1.attr("cy") || node1.attr("points").split(' ')[0].split(',')[1])
        .attr("x2", node2.attr("cx") || node2.attr("points").split(' ')[0].split(',')[0])
        .attr("y2", node2.attr("cy") || node2.attr("points").split(' ')[0].split(',')[1])
        .attr("stroke", "black")
        .attr("stroke-width", 2);
      lines.push(line);
    }
  }
  */
  // 3. Create a group for the control panel (red area)
  const controlGroup = svg.append("g").attr("class", "control");

  // Right: Red control panel
  controlGroup.append("rect")
    .attr("x", mid)
    .attr("y", 0)
    .attr("width", mid)
    .attr("height", height)
    .attr("fill", "crimson");

  // Divider line
  controlGroup.append("line")
    .attr("x1", mid)
    .attr("y1", 0)
    .attr("x2", mid)
    .attr("y2", height)
    .attr("stroke", "white")
    .attr("stroke-width", 2);

  // Label
  controlGroup.append("text")
    .attr("x", mid + 20)
    .attr("y", 30)
    .attr("fill", "white")
    .attr("font-size", "20px")
    .text("Control Panel");

  // 4. Move controlGroup to the front (on top of powergrid)
  controlGroup.raise();

  // 5. Draw cursor lines
  const lineGroup = svg.append("g");

  const horizontalLine = lineGroup.append("line")
    .attr("stroke", "black")
    .attr("stroke-dasharray", "5,5")
    .style("visibility", "hidden");

  const verticalLine = lineGroup.append("line")
    .attr("stroke", "black")
    .attr("stroke-dasharray", "5,5")
    .style("visibility", "hidden");

  svg.on("mousemove", function(event) {
    const [x, y] = d3.pointer(event);

    if (x >= 0 && x <= mid && y >= 0 && y <= height) {
      horizontalLine
        .attr("x1", 0)
        .attr("y1", y)
        .attr("x2", mid)
        .attr("y2", y)
        .style("visibility", "visible");

      verticalLine
        .attr("x1", x)
        .attr("y1", 0)
        .attr("x2", x)
        .attr("y2", height)
        .style("visibility", "visible");
    } else {
      horizontalLine.style("visibility", "hidden");
      verticalLine.style("visibility", "hidden");
    }
  });

  // 6. Set up view toggle
  document.getElementById("toggleView").innerText = "Switch to Map View";
  document.getElementById("toggleView").onclick = window.toggleView;
})();
