const grid = {
    generators: [],
    lines: []
  };

  let selectedGenerator = null;

  // === 1. Load JSON Data ===
  Promise.all([
    fetch("west-demo.json").then(res => res.json()),
    fetch("lines-demo.json").then(res => res.json())
  ])
  .then(([generators, lines]) => {
    grid.generators = generators.map(g => ({ ...g, currentOutputMW: 0 }));
    grid.lines = lines;
    console.clear();
    console.log("Data loaded.");
    startConsoleView();
  })
  .catch(err => {
    console.error("Failed to load data:", err);
  });

  // === Console UI Entrypoint ===
  function startConsoleView() {
    status(); // render system map & generator stats
    menu();   // print available commands
  }

  // === 2. Main Console Menu ===
  function menu() {
    console.log("\n=== MAIN MENU ===");
    console.log("status()               → Show map & generator status");
    console.log("menu()                 → Show this menu again");
    console.log("select('NAME')         → Select generator by station name");
    console.log("setOutput(int)         → Set power output of selected generator");
    console.log("showLines()            → Show power line loadings\n");
  }

  // === 3. Map & System Overview ===
  function status() {
    let totalOutput = 0;
    let totalCost = 0;

    console.log("\n=== GRID STATE ===");
    grid.generators.forEach((g) => {
      const output = g.currentOutputMW ?? 0;
      totalOutput += output;
      totalCost += output * g.costPerMW;
      const active = (selectedGenerator?.station === g.station) ? "⬅️ SELECTED" : "";
      console.log(`${g.station.padEnd(10)} → ${output.toFixed(1)} MW (${g.fuelType}, Cost: $${g.costPerMW}/MW) ${active}`);
    });

    console.log("\n=== SYSTEM TOTALS ===");
    console.log(`Total Output: ${totalOutput.toFixed(1)} MW`);
    console.log(`Total Cost: $${totalCost.toFixed(1)}`);

    console.log("\n=== ASCII MAP ===");
    console.log("   [BREED]───[FTWAYN]");
    console.log("      │         │");
    console.log("    [DEERC]──────");
  }

  // === 4. Select Generator by Name ===
  function select(name) {
    const g = grid.generators.find(gen => gen.station.toUpperCase() === name.toUpperCase());
    if (!g) {
      console.log(`Generator "${name}" not found.`);
      return;
    }
    selectedGenerator = g;
    const output = g.currentOutputMW ?? 0;
    const percent = Math.round((output / g.ratedMaxMW) * 100);
    console.log(`Selected: ${g.station}`);
    console.log(`Current Output: ${output.toFixed(1)} MW (${percent}% of ${g.ratedMaxMW} MW)`);
    console.log(`Use setOutput(0|25|50|75|100) to change it.`);
  }

  // === 5. Set Output of Selected Generator ===
  function setOutput(percent) {
    if (!selectedGenerator) {
      console.log("No generator selected. Use select('NAME') first.");
      return;
    }
    if (![0, 25, 50, 75, 100].includes(percent)) {
      console.log("Invalid percent. Use 25, 50, 75, or 100.");
      return;
    }

    selectedGenerator.currentOutputMW = (percent / 100) * selectedGenerator.ratedMaxMW;
    console.log(`${selectedGenerator.station} output set to ${selectedGenerator.currentOutputMW.toFixed(1)} MW (${percent}%)`);
    status();
  }

  // === 6. Power Line Status ===
  function showLines() {
    console.log("\n=== POWER LINE STATUS ===");
    grid.lines.forEach(line => {
      const from = grid.generators.find(g => g.busNumber === line.from)?.currentOutputMW ?? 0;
      const to = grid.generators.find(g => g.busNumber === line.to)?.currentOutputMW ?? 0;
      const flow = (from + to) / 2;
      const loading = flow / line.limit;
      const status = loading > 0.9
        ? "CRITICAL"
        : loading > 0.75
        ? "WARNING"
        : "NORMAL";
      console.log(`Line ${line.from}–${line.to}: ${Math.round(loading * 100)}% [${status}]`);
    });
    console.log("");
  }
