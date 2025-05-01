// extendGenerators.js
const fs = require('fs');

const generators = require('./generators.json');

const fuelDefaults = {
  "coal":           { costPerMW: 50, emissionIntensity: 0.9 },
  "gas turbine":    { costPerMW: 75, emissionIntensity: 0.6 },
  "combined cycle": { costPerMW: 40, emissionIntensity: 0.4 },
  "hydro":          { costPerMW: 5,  emissionIntensity: 0.0 }
};

generators.forEach(gen => {
  const type = gen.fuelType.toLowerCase();
  const def = fuelDefaults[type];
  if (!def) {
    console.warn(`⚠ Unknown fuel type for ${gen.station}`);
    return;
  }

  gen.costPerMW = def.costPerMW;
  gen.emissionIntensity = def.emissionIntensity;
});

fs.writeFileSync('./generators_extended.json', JSON.stringify(generators, null, 2));
console.log('✅ Updated generator file written to generators_extended.json');
