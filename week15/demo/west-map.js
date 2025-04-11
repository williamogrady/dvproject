async function drawWestRegion() {
    const busesResp = await fetch("buses-demo.json");
    const linesResp = await fetch("lines-copy.json");
  
    if (!busesResp.ok) throw new Error("Failed to load buses JSON");
    if (!linesResp.ok) throw new Error("Failed to load lines JSON");
  
    const [buses, lines] = await Promise.all([
      busesResp.json(),
      linesResp.json()
    ]);
  
    const width = window.innerWidth;
    const height = window.innerHeight;
  
    const svg = d3.select("body")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("background", "#111");
  
    // Define West region screen space
    const regionX0 = 0;
    const regionY0 = 0;
    const regionW = 0.75 * width;
    const regionH = height;
  
    // Filter West buses
    const westBuses = buses.filter((b) => b.region === "West");
  
    // Map bus ID to screen coordinates
    const getCoords = (bus) => {
      const col = bus.x / 5;
      const row = bus.y / 4;
      const x = regionX0 + (col / 10) * regionW;
      const y = regionY0 + (row / 10) * regionH;
      return { x, y };
    };
  
    // Build a lookup
    const busById = {};
    westBuses.forEach((b) => { busById[b.id] = b; });
  
    // Filter lines where both buses are in West
    const westLines = lines.filter((line) =>
      busById[line.fromBus] && busById[line.toBus]
    );
  
    // Draw lines
    svg.selectAll("line")
      .data(westLines)
      .enter()
      .append("line")
      .attr("x1", d => getCoords(busById[d.fromBus]).x)
      .attr("y1", d => getCoords(busById[d.fromBus]).y)
      .attr("x2", d => getCoords(busById[d.toBus]).x)
      .attr("y2", d => getCoords(busById[d.toBus]).y)
      .attr("stroke", "#666")
      .attr("stroke-width", 2);
  
    // Draw buses
    svg.selectAll("rect")
      .data(westBuses)
      .enter()
      .append("rect")
      .attr("x", d => getCoords(d).x - 5)
      .attr("y", d => getCoords(d).y - 10)
      .attr("width", 10)
      .attr("height", 20)
      .attr("fill", d => d.hasGenerator ? "#0f0" : "#ccc")
      .attr("stroke", d => d.hasLoad ? "#09f" : "#000")
      .attr("stroke-width", 1);
  }
  
  // Export for use in HTML
  window.drawWestRegion = drawWestRegion;
  