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
  
    // Attach event to button
    document.getElementById("toggleView").innerText = "Switch to Map View";
    document.getElementById("toggleView").onclick = window.toggleView;
  })();
  