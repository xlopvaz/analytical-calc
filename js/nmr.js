// nmr.js
// Wires up the NMR reference page: 1H and 13C peak tables matched against
// reference chemical-shift ranges, multiplicity → neighbor-count hints, and
// a small molecular-formula helper (degree of unsaturation + H-count check).
import { H_RANGES, C_RANGES, matchRanges, interpretMultiplicity, parseFormula, degreeOfUnsaturation } from "./nmrData.js";

function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
  }
  if (children) children.forEach((c) => c && e.appendChild(c));
  return e;
}

let idCounter = 1;
const newId = () => "nmr_" + Date.now() + "_" + idCounter++;

function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n.toFixed(digits)).toString();
}

// ---------- ¹H peaks ----------
const hPeaks = [];

function addHPeak(data) {
  const rowData = Object.assign({ id: newId(), shift: "", multiplicity: "", integral: "" }, data || {});
  hPeaks.push(rowData);

  const row = el("div", { class: "points-row", style: "grid-template-columns:1fr 1fr 1fr 28px;" });

  const shiftInput = el("input", { placeholder: "ppm", inputmode: "decimal" });
  shiftInput.value = rowData.shift;
  shiftInput.addEventListener("input", () => (rowData.shift = shiftInput.value));
  row.appendChild(shiftInput);

  const multInput = el("input", { placeholder: "s, d, t, q, m..." });
  multInput.value = rowData.multiplicity;
  multInput.addEventListener("input", () => (rowData.multiplicity = multInput.value));
  row.appendChild(multInput);

  const integralInput = el("input", { placeholder: "integral", inputmode: "decimal" });
  integralInput.value = rowData.integral;
  integralInput.addEventListener("input", () => (rowData.integral = integralInput.value));
  row.appendChild(integralInput);

  const rmBtn = el("button", { class: "remove-btn", text: "×" });
  rmBtn.addEventListener("click", () => {
    const idx = hPeaks.indexOf(rowData);
    if (idx !== -1) hPeaks.splice(idx, 1);
    row.remove();
  });
  row.appendChild(rmBtn);

  document.getElementById("hPeaksRows").appendChild(row);
}

document.getElementById("addHPeakBtn").addEventListener("click", () => addHPeak());
for (let i = 0; i < 4; i++) addHPeak();

document.getElementById("analyzeHBtn").addEventListener("click", () => {
  const box = document.getElementById("hResultsBox");
  box.innerHTML = "";
  const valid = hPeaks.filter((p) => p.shift !== "" && !Number.isNaN(parseFloat(p.shift)));
  if (valid.length === 0) {
    box.appendChild(el("span", { class: "empty-note", text: "Enter at least one chemical shift." }));
    return;
  }

  valid
    .slice()
    .sort((a, b) => parseFloat(b.shift) - parseFloat(a.shift))
    .forEach((p) => {
      const shift = parseFloat(p.shift);
      const matches = matchRanges(H_RANGES, shift);
      const multInfo = interpretMultiplicity(p.multiplicity);

      const item = el("div", { class: "hist-item" });
      const left = el("div");
      left.appendChild(el("span", { class: "name", text: `δ ${fmtNum(shift)} ppm` + (p.integral !== "" ? ` · integral ${p.integral}` : "") }));

      if (matches.length === 0) {
        left.appendChild(el("span", { class: "meta", text: "No reference range matched — outside the common tabulated ranges, or check the value." }));
      } else {
        matches.forEach((m) => left.appendChild(el("span", { class: "meta", text: `• ${m.label} (${m.min}–${m.max} ppm)` })));
      }

      if (multInfo) {
        if (multInfo.neighbors !== null && multInfo.neighbors !== undefined) {
          left.appendChild(
            el("span", {
              class: "meta",
              text: `Multiplicity "${p.multiplicity}" (${multInfo.label}) → suggests ${multInfo.neighbors} equivalent neighboring H (n+1 rule), assuming simple first-order coupling.`,
            })
          );
        } else if (multInfo.compound) {
          left.appendChild(
            el("span", { class: "meta", text: `Multiplicity "${p.multiplicity}" is a compound/complex pattern — can't reduce to a single neighbor count with the simple n+1 rule.` })
          );
        } else if (multInfo.unknown) {
          left.appendChild(el("span", { class: "meta", text: `Multiplicity "${p.multiplicity}" not recognized — expected s, d, t, q, p, sext, sept, or compound patterns like dd, m, br.` }));
        }
      }

      item.appendChild(left);
      box.appendChild(item);
    });

  renderIntegrationSummary(valid);
});

function renderIntegrationSummary(valid) {
  const withIntegral = valid.filter((p) => p.integral !== "" && !Number.isNaN(parseFloat(p.integral)));
  const summaryBox = document.getElementById("hIntegrationSummary");
  summaryBox.innerHTML = "";
  if (withIntegral.length === 0) return;

  const values = withIntegral.map((p) => parseFloat(p.integral));
  const minVal = Math.min(...values);
  const normalized = values.map((v) => v / minVal);
  const total = normalized.reduce((a, b) => a + b, 0);

  summaryBox.appendChild(el("span", { class: "label", text: "Normalized integration (relative to the smallest peak)" }));
  const line = withIntegral.map((p, i) => `δ${fmtNum(parseFloat(p.shift), 1)}: ${fmtNum(normalized[i], 2)}H`).join("   ·   ");
  summaryBox.appendChild(el("div", { class: "hint", text: line }));
  summaryBox.appendChild(el("div", { class: "hint", text: `Total relative H ≈ ${fmtNum(total, 2)}` }));

  const formula = document.getElementById("formulaInput").value.trim();
  if (formula) {
    const counts = parseFormula(formula);
    if (counts && counts.H !== undefined) {
      const diff = Math.abs(counts.H - total);
      const ok = diff < 0.5;
      summaryBox.appendChild(
        el("div", {
          class: "hint",
          style: `color: var(${ok ? "--teal" : "--amber"});`,
          text: `Formula ${formula} has ${counts.H} H total — ${ok ? "matches" : "does not closely match"} the normalized integration (≈${fmtNum(total, 2)}).`,
        })
      );
    }
  }
}

document.getElementById("applyHPasteBtn").addEventListener("click", () => {
  const text = document.getElementById("hPasteTextarea").value;
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(/[\t;,]+/).map((s) => s.trim());
    if (parts.length >= 1 && !Number.isNaN(parseFloat(parts[0]))) {
      rows.push({ shift: parts[0], multiplicity: parts[1] || "", integral: parts[2] || "" });
    }
  }
  if (rows.length === 0) return;
  hPeaks.length = 0;
  document.getElementById("hPeaksRows").innerHTML = "";
  rows.forEach((r) => addHPeak(r));
});

// ---------- ¹³C peaks ----------
const cPeaks = [];

function addCPeak(data) {
  const rowData = Object.assign({ id: newId(), shift: "" }, data || {});
  cPeaks.push(rowData);

  const row = el("div", { class: "points-row", style: "grid-template-columns:1fr 28px;" });

  const shiftInput = el("input", { placeholder: "ppm", inputmode: "decimal" });
  shiftInput.value = rowData.shift;
  shiftInput.addEventListener("input", () => (rowData.shift = shiftInput.value));
  row.appendChild(shiftInput);

  const rmBtn = el("button", { class: "remove-btn", text: "×" });
  rmBtn.addEventListener("click", () => {
    const idx = cPeaks.indexOf(rowData);
    if (idx !== -1) cPeaks.splice(idx, 1);
    row.remove();
  });
  row.appendChild(rmBtn);

  document.getElementById("cPeaksRows").appendChild(row);
}

document.getElementById("addCPeakBtn").addEventListener("click", () => addCPeak());
for (let i = 0; i < 4; i++) addCPeak();

document.getElementById("analyzeCBtn").addEventListener("click", () => {
  const box = document.getElementById("cResultsBox");
  box.innerHTML = "";
  const valid = cPeaks.filter((p) => p.shift !== "" && !Number.isNaN(parseFloat(p.shift)));
  if (valid.length === 0) {
    box.appendChild(el("span", { class: "empty-note", text: "Enter at least one chemical shift." }));
    return;
  }
  valid
    .slice()
    .sort((a, b) => parseFloat(b.shift) - parseFloat(a.shift))
    .forEach((p) => {
      const shift = parseFloat(p.shift);
      const matches = matchRanges(C_RANGES, shift);
      const item = el("div", { class: "hist-item" });
      const left = el("div");
      left.appendChild(el("span", { class: "name", text: `δ ${fmtNum(shift)} ppm` }));
      if (matches.length === 0) {
        left.appendChild(el("span", { class: "meta", text: "No reference range matched." }));
      } else {
        matches.forEach((m) => left.appendChild(el("span", { class: "meta", text: `• ${m.label} (${m.min}–${m.max} ppm)` })));
      }
      item.appendChild(left);
      box.appendChild(item);
    });
});

document.getElementById("applyCPasteBtn").addEventListener("click", () => {
  const text = document.getElementById("cPasteTextarea").value;
  const rows = text
    .trim()
    .split(/[\n,\t;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !Number.isNaN(parseFloat(s)));
  if (rows.length === 0) return;
  cPeaks.length = 0;
  document.getElementById("cPeaksRows").innerHTML = "";
  rows.forEach((r) => addCPeak({ shift: r }));
});

// ---------- molecular formula tools ----------
document.getElementById("computeFormulaBtn").addEventListener("click", () => {
  const formula = document.getElementById("formulaInput").value.trim();
  const box = document.getElementById("formulaResultsBox");
  box.innerHTML = "";
  const counts = parseFormula(formula);
  if (!counts) {
    box.appendChild(el("span", { class: "empty-note", text: "Enter a formula like C8H10O2." }));
    return;
  }
  const dou = degreeOfUnsaturation(counts);
  const elementsText = Object.keys(counts)
    .map((k) => `${k}${counts[k]}`)
    .join(" ");
  box.appendChild(el("span", { class: "hint", text: `Parsed: ${elementsText}` }));
  box.appendChild(
    el("div", {
      class: "hint",
      text:
        dou === null
          ? "Need at least a carbon count to compute degree of unsaturation."
          : `Degree of unsaturation ≈ ${fmtNum(dou, 1)} (rings + π bonds combined — e.g. a benzene ring alone accounts for 4).`,
    })
  );
});