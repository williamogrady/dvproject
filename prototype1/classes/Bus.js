export class Bus {
  constructor(data) {
    this.id = `Bus${data.id}`;       // Unique DOM ID for linking and lookup
    this.busNumber = data.id;        // Numeric bus number (for matching lines/generators)
    this.region = data.region;
    this.hasGenerator = data.hasGenerator;
    this.hasLoad = data.hasLoad;
    this.connectedTo = data.connectedTo; // Array of busNumbers

    // Visual state
    this.isSelected = false;
    this.status = 'normal'; // could also be 'highlighted', 'faulted', etc.

    // Positional data (to be injected later)
    this.x = null;
    this.y = null;
  }

  // Inject coordinates from full_nodes.json or layout engine
  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  // Selection logic (for interaction)
  select() {
    this.isSelected = true;
  }

  deselect() {
    this.isSelected = false;
  }

  // CSS class based on state (region, selection, etc.)
  getCSSClass() {
    let base = 'bus';
    if (this.isSelected) base += ' selected-bus';
    if (this.status !== 'normal') base += ` ${this.status}`;
    return base;
  }

  // Optional: tooltip string
  getTooltipText() {
    return `Bus ${this.busNumber}\n` +
           `Region: ${this.region}\n` +
           `Generator: ${this.hasGenerator ? 'Yes' : 'No'}\n` +
           `Load: ${this.hasLoad ? 'Yes' : 'No'}`;
  }

  // Optional: used in layout
  getCoords() {
    return { x: this.x, y: this.y };
  }
}
