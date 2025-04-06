(function() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const mid = width / 2;
  
    const svg = d3.select("body")
      .append("svg")
      .attr("width", width)
      .attr("height", height);
  
    // Left: Blue map area
    svg.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", mid)
      .attr("height", height)
      .attr("fill", "steelblue");
  
    // Right: Red control panel
    svg.append("rect")
      .attr("x", mid)
      .attr("y", 0)
      .attr("width", mid)
      .attr("height", height)
      .attr("fill", "crimson")
      .attr("opacity", 0.9);
  
    // Divider line
    svg.append("line")
      .attr("x1", mid)
      .attr("y1", 0)
      .attr("x2", mid)
      .attr("y2", height)
      .attr("stroke", "white")
      .attr("stroke-width", 2);
  
    // Label inside control panel
    svg.append("text")
      .attr("x", mid + 20)
      .attr("y", 30)
      .attr("fill", "white")
      .attr("font-size", "20px")
      .text("Control Panel");
  
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
  
      // Only show lines when cursor is inside the blue area (left side of the screen)
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
  
    // Attach event to button
    document.getElementById("toggleView").innerText = "Switch to Map View";
    document.getElementById("toggleView").onclick = window.toggleView;
  })();
  