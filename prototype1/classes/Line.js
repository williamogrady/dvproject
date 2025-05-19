export class Line {
  constructor(data) {
    this.from = data.from_number;       // Bus number
    this.to = data.to_number;           // Bus number

    this.fromName = data.from_name;     // Optional (e.g., "RIVERS~1")
    this.toName = data.to_name;

    this.normalLimit = data.normal_MVA_limit;
    this.emergencyLimit = data.emergency_MVA_limit;
    this.voltage = data.nominal_voltage;

    // Optional visual ID (for DOM matching)
    this.id = `Line-${this.from}-${this.to}`;

    // Dynamic state
    this.currentFlow = 0;       // in MVA
    this.loadStatus = 'normal';     // 'normal', 'warning', 'overloaded'
    this.direction = null;      // 'forward', 'reverse' or null

    // Positional data (set later based on from/to Bus objects)
    this.start = { x: null, y: null };
    this.end = { x: null, y: null };

    this.available = false;       // 'true' or 'false'
  }

  // Used in drawing logic
  setCoordinates(fromCoords, toCoords) {
    this.start = fromCoords;
    this.end = toCoords;
  }

  // Updates power flow and determines status
  setFlow(value, direction = 'forward') {
    this.currentFlow = value;
    this.direction = direction;

    const ratio = value / this.normalLimit;
    if (ratio > 1.2) this.status = 'overloaded';
    else if (ratio > 1.0) this.status = 'warning';
    else this.status = 'normal';
  }

  resetFlow() {
    this.currentFlow = 0;
    this.status = 'normal';
    this.direction = null;
  }

  // Class for line styling (stroke color, etc.)
  getCSSClass() {
    return `line ${this.status}`;
  }

  // Tooltip or legend label
  getTooltipText() {
    return `Line ${this.from} → ${this.to}\n` +
           `Voltage: ${this.voltage} kV\n` +
           `Flow: ${this.currentFlow} MVA\n` +
           `Limit: ${this.normalLimit} / ${this.emergencyLimit}`;
  }

  // SVG path string for drawing (straight line)
  getPathD() {
    return `M ${this.start.x},${this.start.y} L ${this.end.x},${this.end.y}`;
  }
}
