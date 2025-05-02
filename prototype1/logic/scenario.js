import { updateSystemState, systemState } from './state.js';
import { updateMapView } from '/prototype1/js/views/mapView.js';

export function loadScenario(scenario, generators, loads, lines) {
  // 1. Apply scenario generator start states
  if (scenario.startState?.allGeneratorsOff) {
    generators.forEach(gen => {
      gen.currentOutput = 0;
    });
  } else if (scenario.startState?.generators) {
    generators.forEach(gen => {
      if (scenario.startState.generators.hasOwnProperty(gen.id)) {
        gen.currentOutput = scenario.startState.generators[gen.id];
      }
    });
  }

  // 2. Update system state
  updateSystemState(generators, loads, lines);

  // 3. Update the map view
  updateMapView(systemState);
}
