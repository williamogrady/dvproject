import { updateSystemState, systemState } from './state.js';
import { updateSystemStyle } from '/prototype1/js/views/mapView.js';

export function loadScenario(scenario, generators, loads, lines, generatorState) {
  // 1. Apply scenario generator start states
  console.log("Loading scenario:", scenario);
  if (scenario.startState?.allGeneratorsOff) {
    console.log("All generators turning off");
    generators.forEach(gen => {
      gen.currentOutput = 0;
    });
  } else if (scenario.startState?.generators) {
    generators.forEach(gen => {
      if (scenario.startState.generators.hasOwnProperty(gen.id)) {
        gen.currentOutput = scenario.startState.generators[gen.id];
        generatorState.set(gen.id, { status: gen.currentOutput <= 0 ? "off" : "on" });
      }
    });
  }

  // 2. Update system state
  updateSystemState(generators, loads, lines);

  // 3. Update the map view
  updateSystemStyle(systemState, generatorState);
}
