import { COLORS, LFO_WAVEFORMS, SEQUENCER_CONSTANTS } from "./constants.js";

export class Visualizations {
  static createLFOVisualization(channel, lfo, subdivisions) {
    const canvas = document.createElement("canvas");
    canvas.className = "lfo-visualization";
    canvas.width = 400;
    canvas.height = 60;
    
    this.renderLFOWaveform(canvas, lfo, subdivisions);
    return canvas;
  }

  static renderLFOWaveform(canvas, lfo, subdivisions) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    const amplitude = (height / 2 - 10) * (lfo.width / 100);

    ctx.clearRect(0, 0, width, height);

    // Draw center line
    ctx.strokeStyle = COLORS.GRID_LINE;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw subdivision markers
    ctx.strokeStyle = COLORS.STEP_MARKER;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= subdivisions; i++) {
      const x = (i / subdivisions) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw waveform
    ctx.strokeStyle = COLORS.LFO_WAVEFORM;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const totalCycles = lfo.rate;
    const samples = width * 2;

    for (let i = 0; i <= samples; i++) {
      const x = (i / samples) * width;
      const phase = (i / samples) * totalCycles;
      const localPhase = phase % 1;

      let y;
      if (lfo.waveform === LFO_WAVEFORMS.RAMP) {
        y = centerY - amplitude * this.calculateRampValue(localPhase, lfo.duty / 100);
      } else {
        y = centerY - amplitude * Math.sin(localPhase * 2 * Math.PI);
      }

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  static calculateRampValue(phase, duty) {
    if (duty === 0) return -1;
    if (duty === 1) return 1;
    
    if (phase < duty) {
      return (phase / duty) * 2 - 1;
    } else {
      return ((1 - phase) / (1 - duty)) * 2 - 1;
    }
  }

  static createSHVisualization(channel, shValues, mode, width) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("sh-visualization");
    svg.setAttribute("viewBox", "0 0 400 60");
    svg.setAttribute("width", "400");
    svg.setAttribute("height", "60");

    const centerY = 30;
    const amplitude = 20 * (width / 100);

    // Center line
    const centerLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    centerLine.setAttribute("x1", "0");
    centerLine.setAttribute("y1", centerY);
    centerLine.setAttribute("x2", "400");
    centerLine.setAttribute("y2", centerY);
    centerLine.setAttribute("stroke", COLORS.GRID_LINE);
    centerLine.setAttribute("stroke-width", "1");
    centerLine.setAttribute("stroke-dasharray", "2,2");
    svg.appendChild(centerLine);

    // Value lines
    const stepWidth = 400 / shValues.length;
    shValues.forEach((value, i) => {
      const x = i * stepWidth + stepWidth / 2;
      const scaledValue = value * amplitude;
      const y = centerY - scaledValue;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", centerY);
      line.setAttribute("x2", x);
      line.setAttribute("y2", y);
      
      const color = this.interpolateColor(value);
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);

      // Value dot
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", "3");
      circle.setAttribute("fill", color);
      svg.appendChild(circle);
    });

    return svg;
  }

  static interpolateColor(value) {
    // value is between -1 and 1
    const normalizedValue = (value + 1) / 2; // 0 to 1
    
    if (normalizedValue < 0.5) {
      // Red to gray
      const t = normalizedValue * 2;
      const r = Math.round(255 * (1 - t) + 128 * t);
      const g = Math.round(0 * (1 - t) + 128 * t);
      const b = Math.round(0 * (1 - t) + 128 * t);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Gray to green
      const t = (normalizedValue - 0.5) * 2;
      const r = Math.round(128 * (1 - t) + 0 * t);
      const g = Math.round(128 * (1 - t) + 255 * t);
      const b = Math.round(128 * (1 - t) + 0 * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  static updateLFOVisualization(channel, lfo, subdivisions) {
    const canvas = document.querySelector(`.channel[data-channel="${channel}"] .lfo-visualization`);
    if (canvas) {
      this.renderLFOWaveform(canvas, lfo, subdivisions);
    }
  }

  static updateSHVisualization(channel, shValues, mode, width) {
    const container = document.querySelector(`.channel[data-channel="${channel}"] .sh-params`);
    if (!container) return;

    const existingSvg = container.querySelector(".sh-visualization");
    const newSvg = this.createSHVisualization(channel, shValues, mode, width);
    
    if (existingSvg) {
      existingSvg.replaceWith(newSvg);
    } else {
      container.appendChild(newSvg);
    }
  }
}