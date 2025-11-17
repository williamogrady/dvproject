import { updateSystemState, systemState } from './state.js';
import { updateSystemStyle } from '/prototype1/js/views/mapView.js';

/**
 * Load a scenario into the live system.
 * @param {Object} scenario - Scenario JSON object
 * @param {Array<Generator>} generators - Generator class instances
 * @param {Array<Object>} loads - Flat array of loads with `Pload`
 * @param {Array<Line>} lines - Line class instances
 */
export function loadScenario(scenario, generators, loads, lines) {
  console.log("Loading scenario:", scenario);

  // ---- Generator Overrides ---- //
  const genOverrides = scenario.startState?.generators;
  const allOff = scenario.startState?.allGeneratorsOff === true;

  generators.forEach(gen => {
    if (allOff) {
      gen.setOutput(0);
    } else if (genOverrides && genOverrides.hasOwnProperty(gen.id)) {
      gen.setOutput(genOverrides[gen.id]);
    } else {
      gen.setOutput(gen.ratedMaxMW / 2); // fallback default
    }
  });

  // ---- Line Flow Overrides (Optional) ---- //
  if (scenario.startState?.lines) {
    const lineOverrides = scenario.startState.lines;
    lines.forEach(line => {
      const override = lineOverrides.find(l => l.id === line.id);
      if (override) {
        line.setFlow(override.currentFlow, override.direction);
      } else {
        line.resetFlow();
      }
    });
  } else {
    lines.forEach(line => line.resetFlow());
  }

  // ---- Update system stats and view ---- //
  updateSystemState(generators, loads, lines);
  updateSystemStyle(systemState, generators); // still useful for visual sync
}
