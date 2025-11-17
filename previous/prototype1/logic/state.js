// System State Object is the "brain" of the grid simulation logic.


export const systemState = {
    totalLoad: 0,             // MW
    totalGeneration: 0,       // MW
    powerBalance: 0,          // MW
    totalCost: 0,             // $
    totalEmissions: 0,        // tons CO₂ (or arbitrary unit)
    overloadedLines: [],      // array of line IDs or objects
    violations: []            // string descriptions of problems
  };
  
  /**
   * Recalculate the state of the grid based on generator, load, and line data.
   * 
   * @param {Array} generators - Each must include currentOutput, costPerMW, emissionIntensity
   * @param {Array} loads - Each must include Pload
   * @param {Array} lines - Each must include currentFlow and capacity
   */
  export function updateSystemState(generators, loads, lines) {
    // Load
    const totalLoad = loads.reduce((sum, load) => sum + (load.Pload || 0), 0);
  
    // Generation, cost, emissions
    let totalGeneration = 0;
    let totalCost = 0;
    let totalEmissions = 0;
  
    generators.forEach(gen => {
      const output = gen.currentOutput || 0;
      totalGeneration += output;
      totalCost += output * (gen.costPerMW || 0);
      totalEmissions += output * (gen.emissionIntensity || 0);
    });
    
  
    // Overloaded lines
    const overloadedLines = lines.filter(
      line => line.currentFlow > line.capacity
    );
  
    // Violations (basic ones for now)
    const violations = [];
    const imbalance = Math.abs(totalGeneration - totalLoad);
    if (imbalance > 5) {
      violations.push(`Power imbalance: ${imbalance.toFixed(2)} MW`);
    }
    if (overloadedLines.length > 0) {
      violations.push(`${overloadedLines.length} overloaded line(s)`);
    }
  
    // Update global state
    systemState.totalLoad = totalLoad;
    systemState.totalGeneration = totalGeneration;
    systemState.powerBalance = totalGeneration - totalLoad;
    systemState.totalCost = totalCost;
    systemState.totalEmissions = totalEmissions;
    systemState.overloadedLines = overloadedLines;
    systemState.violations = violations;
  }
  