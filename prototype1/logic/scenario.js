import { updateSystemState, systemState } from './state.js';
import { updateSystemStyle } from '/prototype1/js/views/mapView.js';

export function loadScenario(scenario, generators, loads, lines, generatorState) {
  console.log("Loading scenario:", scenario);

  if (scenario.startState?.allGeneratorsOff) {
    console.log("All generators turning off");
    generators.forEach(gen => {
      gen.currentOutput = 0;
      generatorState.set(gen.id, { status: "off" });
    });

  } else if (scenario.startState?.generators) {
    console.log("Applying partial generator startState");

    generators.forEach(gen => {
      console.log(gen.id, "output:", gen.currentOutput, "→", generatorState.get(gen.id));
      const override = scenario.startState.generators[gen.id];
      if (override !== undefined) {
        gen.currentOutput = override;
      } else {
        gen.currentOutput = gen.ratedMaxMW / 2;
      }

      generatorState.set(gen.id, {
        status: gen.currentOutput <= 0 ? "off" : "on"
      });
    });

  } else {
    // No explicit generator state given — use default behavior
    generators.forEach(gen => {
      gen.currentOutput = gen.ratedMaxMW / 2;
      generatorState.set(gen.id, { status: "on" });
    });
  }

  updateSystemState(generators, loads, lines);
  updateSystemStyle(systemState, generatorState);
}
