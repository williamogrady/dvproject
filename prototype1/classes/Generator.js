export class Generator {
  constructor(data) {
    // Static attributes
    this.id = `Gen${data.busNumber}`;
    this.busNumber = data.busNumber;
    this.station = data.station;
    this.fuelType = data.fuelType;
    this.ratedMinMW = data.ratedMinMW;
    this.ratedMaxMW = data.ratedMaxMW;
    this.rampRate = data.rampRate;
    this.costPerMW = data.costPerMW;
    this.emissionIntensity = data.emissionIntensity;
    this.region = data.region;

    // Dynamic state
    this.status = data.status;                       // 'on' or 'off'
    this.currentOutput = data.currentOutput;
    this.isSelected = false;
  }

  toggle() {
    if (this.status === 'on') {
      this.turnOff();
    } else {
      this.turnOn();
    }
  }

  turnOn(output = this.ratedMinMW) {
    this.status = 'on';
    this.currentOutput = Math.min(output, this.ratedMaxMW);
  }

  turnOff() {
    this.status = 'off';
    this.currentOutput = 0;
  }

  setOutput(value) {
    const capped = Math.max(this.ratedMinMW, Math.min(value, this.ratedMaxMW));
    this.currentOutput = capped;
    this.status = capped > 0 ? 'on' : 'off';
  }

  select() {
    this.isSelected = true;
  }

  deselect() {
    this.isSelected = false;
  }

  getCSSClass() {
    // Compose classes based on state
    const baseState = this.status === 'on' ? 'generator-on' : 'generator-off';
    const selected = this.isSelected ? 'selected-generator' : '';
    return `${selected} ${baseState}`.trim();
  }

  getTooltipText() {
    return `${this.station} (Bus ${this.busNumber})\n` +
           `Fuel: ${this.fuelType}\n` +
           `Output: ${this.currentOutput} MW\n` +
           `Status: ${this.status}`;
  }
}
