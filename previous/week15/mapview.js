(function() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const controlSize = 150;
  let startX = 20;
  let startY = 20;

  const svg = d3.select("body")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Blue background (map)
  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "steelblue");

  const controlGroup = svg.append("g");

  const controlPanel = controlGroup.append("rect")
    .attr("x", startX)
    .attr("y", startY)
    .attr("width", controlSize)
    .attr("height", controlSize)
    .attr("fill", "crimson")
    .attr("opacity", 0.9);

  controlGroup.append("text")
    .attr("x", startX + 10)
    .attr("y", startY + 25)
    .attr("fill", "white")
    .attr("font-size", "16px")
    .text("Control Panel");

  controlGroup.call(
    d3.drag()
      .on("drag", function (event) {
        let newX = event.x - controlSize / 2;
        let newY = event.y - controlSize / 2;
        newX = Math.max(0, Math.min(newX, width - controlSize));
        newY = Math.max(0, Math.min(newY, height - controlSize));
        controlPanel.attr("x", newX).attr("y", newY);
        controlGroup.select("text")
          .attr("x", newX + 10)
          .attr("y", newY + 25);
        // Update the startX and startY based on the new position of the control panel
        startX = newX;
        startY = newY;
      })
  );

  // Draw cursor lines (only when over the map area)
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

    // Check if cursor is within the control panel bounds (after dragging)
    const isOverControlPanel = x >= startX && x <= startX + controlSize && y >= startY && y <= startY + controlSize;

    // Only show lines when cursor is inside the blue area (map) and not over the control panel
    if (x >= 0 && x <= width && y >= 0 && y <= height && !isOverControlPanel) {
      horizontalLine
        .attr("x1", 0)
        .attr("y1", y)
        .attr("x2", width)
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

  // Attach event to button (defined in index)
  document.getElementById("toggleView").innerText = "Switch to List View";
  document.getElementById("toggleView").onclick = window.toggleView;

  // Draw the power grid graph above the blue rectangle but below the red rectangle
  const gridGroup = svg.append("g")
    .attr("class", "powergrid");

  // Function to randomly place the nodes (generators and loads)
  const randomPosition = () => ({
    x: Math.random() * (width - 100) + 50,
    y: Math.random() * (height - 100) + 50
  });

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
})();
