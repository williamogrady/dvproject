(function() {
    const width = window.innerWidth;
    const height = window.innerHeight;
  
    // Get the SVG element from the HTML (this will be called from the view scripts)
    const svg = d3.select("svg");
  
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
      const generator = svg.append("circle")
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
      const load = svg.append("polygon")
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
        const line = svg.append("line")
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
  