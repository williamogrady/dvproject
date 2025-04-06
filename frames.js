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
        })
    );
  
    // Attach event to button (defined in index)
    document.getElementById("toggleView").innerText = "Switch to List View";
    document.getElementById("toggleView").onclick = window.toggleView;
  })();
  