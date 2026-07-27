// chart.js
// Hand-drawn SVG calibration chart: grid, axes through zero, fitted line, scatter points.
// No charting library — keeps the whole project dependency-free.
import { fmt } from "./math.js";
import { COLORS } from "./colors.js";

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

/**
 * Draws the calibration curve into an existing <svg> element (viewBox 0 0 600 260).
 * @param {SVGElement} svg
 * @param {object} reg - result of linreg(), extended with .xs and .ys arrays
 * @param {boolean} isRatioY - true when the y-axis represents an analyte/IS ratio (internal standard mode)
 * @param {number|null} extraMinX - optional extra x value to make sure is included in the domain (e.g. the standard-addition x-intercept)
 */
export function drawChart(svg, reg, isRatioY, extraMinX) {
  svg.innerHTML = "";
  const W = 600, H = 260, ML = 50, MR = 20, MT = 14, MB = 34;
  const plotW = W - ML - MR, plotH = H - MT - MB;

  let minX = Math.min(...reg.xs, 0);
  const maxX = Math.max(...reg.xs);
  if (extraMinX !== null && extraMinX !== undefined && !Number.isNaN(extraMinX)) {
    minX = Math.min(minX, extraMinX);
  }
  const padX = (maxX - minX) * 0.15 || 1;
  const x0 = minX - padX, x1 = maxX + padX;

  const yVals = reg.ys.concat([reg.slope * x0 + reg.intercept, reg.slope * x1 + reg.intercept, 0]);
  const minY = Math.min(...yVals), maxY = Math.max(...yVals);
  const padY = (maxY - minY) * 0.15 || 1;
  const y0 = minY - padY, y1 = maxY + padY;

  const sx = (x) => ML + ((x - x0) / (x1 - x0)) * plotW;
  const sy = (y) => MT + plotH - ((y - y0) / (y1 - y0)) * plotH;

  function line(x1_, y1_, x2_, y2_, color, width, dash) {
    const l = svgEl("line", { x1: x1_, y1: y1_, x2: x2_, y2: y2_, stroke: color, "stroke-width": width || 1 });
    if (dash) l.setAttribute("stroke-dasharray", dash);
    svg.appendChild(l);
  }
  function text(x, y, anchor, cls, content) {
    const t = svgEl("text", { x, y, "text-anchor": anchor, class: cls });
    t.textContent = content;
    svg.appendChild(t);
  }

  // grid + tick labels
  for (let i = 0; i <= 4; i++) {
    const gx = ML + (i * plotW) / 4;
    line(gx, MT, gx, MT + plotH, COLORS.border, 1, "3,3");
    text(gx, MT + plotH + 16, "middle", "tick-label", fmt(x0 + (i * (x1 - x0)) / 4, 3));
  }
  for (let i = 0; i <= 4; i++) {
    const gy = MT + (i * plotH) / 4;
    line(ML, gy, ML + plotW, gy, COLORS.border, 1, "3,3");
    text(ML - 6, gy + 3, "end", "tick-label", fmt(y1 - (i * (y1 - y0)) / 4, 3));
  }

  // axes through zero, when zero is within the visible range
  if (y0 < 0 && y1 > 0) line(ML, sy(0), ML + plotW, sy(0), COLORS.borderLight, 1.5);
  if (x0 < 0 && x1 > 0) line(sx(0), MT, sx(0), MT + plotH, COLORS.borderLight, 1.5);

  // fitted line
  line(sx(x0), sy(reg.slope * x0 + reg.intercept), sx(x1), sy(reg.slope * x1 + reg.intercept), COLORS.violet, 2.2);

  // scatter points
  reg.xs.forEach((x, i) => {
    svg.appendChild(svgEl("circle", { cx: sx(x), cy: sy(reg.ys[i]), r: 4.5, fill: COLORS.magenta }));
  });

  // axis labels
  text(ML + plotW / 2, H - 4, "middle", "axis-label", "concentration");
  const yl = svgEl("text", { x: 12, y: MT + plotH / 2, "text-anchor": "middle", class: "axis-label" });
  yl.setAttribute("transform", `rotate(-90 12 ${MT + plotH / 2})`);
  yl.textContent = isRatioY ? "analyte/IS ratio" : "signal";
  svg.appendChild(yl);
}

/** Small decorative mass-spectrum-style divider, drawn once at startup. */
export function drawSpectrumDivider(svg) {
  const heights = [4, 9, 6, 22, 8, 5, 30, 12, 6, 4, 16, 7, 5, 24, 9, 4, 6, 11, 5, 3];
  const w = 400 / heights.length;
  heights.forEach((h, i) => {
    svg.appendChild(
      svgEl("rect", {
        x: i * w + 2,
        y: 34 - h,
        width: w - 3,
        height: h,
        fill: i === 6 ? COLORS.magenta : i === 13 ? COLORS.violet : COLORS.borderLight,
        opacity: i === 6 || i === 13 ? 0.9 : 0.5,
      })
    );
  });
}
