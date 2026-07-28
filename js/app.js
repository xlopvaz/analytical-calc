// app.js
// Wires up the DOM: tabs, calibration form, samples table, history list.
// Calculation logic lives in math.js, drawing in chart.js, persistence in storage.js —
// this file is mostly event listeners and small render functions.
import { linreg, fmt, parseDilutionChain, parseNum, parseCSV, concentrationSE, tValue95, meanSD } from "./math.js";
import { loadHistory, persistHistory } from "./storage.js";
import { drawChart, drawSpectrumDivider } from "./chart.js";
import { COLORS } from "./colors.js";
import { TECHNIQUES, TECHNIQUE_ORDER, DEFAULT_TECHNIQUE } from "./techniques.js";

const technique = TECHNIQUES[DEFAULT_TECHNIQUE];
document.getElementById("unitInput").value = technique.defaultUnit;

function renderTechniqueStrip() {
  const strip = document.getElementById("techStrip");
  strip.innerHTML = "";
  TECHNIQUE_ORDER.forEach((id) => {
    const t = TECHNIQUES[id];
    const isAvailable = t.status === "available";
    const isSelected = id === state.activeTechId;
    const pill = el("span", {
      class: "tech-pill " + (isAvailable ? "available" : "soon") + (isSelected ? " selected" : ""),
      text: t.label,
    });
    pill.title = isAvailable ? t.fullName : t.fullName + " — coming soon";
    if (isAvailable) {
      pill.addEventListener("click", () => {
        state.activeTechId = id;
        renderTechniqueStrip();
        updateSamplesModeVisibility();
      });
    }
    strip.appendChild(pill);
  });
}

function updateSamplesModeVisibility() {
  const kind = TECHNIQUES[state.activeTechId].kind;
  document.getElementById("curveSamplesArea").style.display = kind === "curve" ? "block" : "none";
  document.getElementById("isotopeRatioArea").style.display = kind === "isotope-ratio" ? "block" : "none";
}
let idCounter = 1;
const newId = () => "id_" + Date.now() + "_" + idCounter++;

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

function colsFor(calType) {
  return calType === "internal" ? 3 : 2;
}
function calTypeLabel(t) {
  return { external: "external", internal: "internal standard", addition: "standard addition" }[t];
}

// ---------- application state ----------
const state = {
  calType: "external", // external | internal | addition
  entryMode: "manual",
  points: [],
  regression: null,
  samples: [],
  activeCal: null, // { analyte, unit, calType, regression }
  savedCals: [],
  uncertaintyMode: "se", // "se" | "ci95"
  activeTechId: DEFAULT_TECHNIQUE, // which pill is selected — controls what shows in the Samples tab
  ssbRows: [], // { id, label, type: "standard"|"sample", ratio }
};

// Multiplies a standard error into the currently selected display mode.
// Returns null when a 95% CI was requested but there aren't enough
// calibration points to compute one (df = n - 2 must be > 0).
function ciFactor(n) {
  if (state.uncertaintyMode !== "ci95") return 1;
  return tValue95(n ? n - 2 : 0);
}
function uncLabel(base) {
  return state.uncertaintyMode === "ci95" ? `95% CI ${base}` : `SE ${base}`;
}

document.getElementById("lodMethodSeg").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#lodMethodSeg button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("lodBlankRepsField").style.display = btn.dataset.val === "blankReps" ? "block" : "none";
});

document.getElementById("uncertaintySeg").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#uncertaintySeg button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.uncertaintyMode = btn.dataset.val;
  if (state.regression) renderResults(state.regression);
  updateBlankDisplay();
  document.querySelectorAll("#samplesRows .samples-row").forEach((row) => row.recompute && row.recompute());
  if (document.getElementById("panel-history").classList.contains("active")) renderHistory();
});

drawSpectrumDivider(document.querySelector(".divider svg"));

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "history") renderHistory();
    if (btn.dataset.tab === "samples") refreshCalSelect();
  });
});

// ---------- calibration type segmented control ----------
document.getElementById("calTypeSeg").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#calTypeSeg button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.calType = btn.dataset.val;
  document.getElementById("dilutionFinalField").style.display = state.calType === "addition" ? "flex" : "none";
  document.getElementById("calBlankSignalISInput").style.display = state.calType === "internal" ? "inline-block" : "none";
  document.getElementById("pointsLabel").textContent =
    state.calType === "addition" ? "Standard addition series points" : "Calibration points";
  document.getElementById("pasteHint").textContent =
    colsFor(state.calType) === 3
      ? "3 columns: conc, analyte signal, IS signal · separated by comma, tab or semicolon"
      : "2 columns: conc, signal · separated by comma, tab or semicolon";
  resetPointsTable();
  hideResults();
});

// ---------- entry mode segmented control ----------
document.getElementById("entryModeSeg").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#entryModeSeg button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.entryMode = btn.dataset.val;
  document.getElementById("manualEntry").style.display = state.entryMode === "manual" ? "block" : "none";
  document.getElementById("pasteEntry").style.display = state.entryMode === "paste" ? "block" : "none";
});

// ---------- calibration points table ----------
function pointRowTemplate(cols) {
  return cols === 3 ? { conc: "", signal: "", signalIS: "" } : { conc: "", signal: "" };
}

function addPointRow(data) {
  const cols = colsFor(state.calType);
  const id = newId();
  const rowData = Object.assign({ id }, data || pointRowTemplate(cols));
  state.points.push(rowData);

  const row = el("div", { class: "points-row cols" + cols });

  const concInput = el("input", { placeholder: "0", inputmode: "decimal" });
  concInput.value = rowData.conc;
  concInput.addEventListener("input", () => (rowData.conc = concInput.value));
  row.appendChild(concInput);

  const sigInput = el("input", { placeholder: "0", inputmode: "decimal" });
  sigInput.value = rowData.signal;
  sigInput.addEventListener("input", () => (rowData.signal = sigInput.value));
  row.appendChild(sigInput);

  if (cols === 3) {
    const isInput = el("input", { placeholder: "0", inputmode: "decimal" });
    isInput.value = rowData.signalIS || "";
    isInput.addEventListener("input", () => (rowData.signalIS = isInput.value));
    row.appendChild(isInput);
  }

  const rmBtn = el("button", {
    class: "remove-btn",
    text: "×",
    onclick: () => {
      state.points = state.points.filter((p) => p.id !== id);
      row.remove();
    },
  });
  row.appendChild(rmBtn);

  document.getElementById("pointsRows").appendChild(row);
}

function resetPointsTable() {
  state.points = [];
  document.getElementById("pointsRows").innerHTML = "";
  const cols = colsFor(state.calType);
  const head = document.getElementById("pointsHead");
  head.className = "points-head cols" + cols;
  head.innerHTML =
    cols === 3
      ? `<span>${state.calType === "addition" ? "Added conc." : "Concentration"}</span><span>Analyte signal</span><span>IS signal</span><span></span>`
      : `<span>${state.calType === "addition" ? "Added conc." : "Concentration"}</span><span>Signal</span><span></span>`;
  for (let i = 0; i < 3; i++) addPointRow();
}

document.getElementById("addRowBtn").addEventListener("click", () => addPointRow());

document.getElementById("applyPasteBtn").addEventListener("click", () => {
  const cols = colsFor(state.calType);
  const text = document.getElementById("pasteTextarea").value;
  const rows = parseCSV(text, cols);
  const errBox = document.getElementById("pasteError");
  if (rows.length < 2) {
    errBox.style.display = "block";
    errBox.textContent =
      cols === 3
        ? "Couldn't find at least 2 valid rows with 3 columns (conc, analyte signal, IS signal)."
        : "Couldn't find at least 2 valid rows with 2 columns (conc, signal).";
    return;
  }
  errBox.style.display = "none";
  state.points = [];
  document.getElementById("pointsRows").innerHTML = "";
  rows.forEach((r) => addPointRow(cols === 3 ? { conc: r[0], signal: r[1], signalIS: r[2] } : { conc: r[0], signal: r[1] }));
});

// ---------- compute + render regression results ----------
function hideResults() {
  document.getElementById("resultsBox").style.display = "none";
  document.getElementById("regressionError").style.display = "none";
  document.getElementById("saveCalBtn").style.display = "none";
  state.regression = null;
}

document.getElementById("computeBtn").addEventListener("click", () => {
  const cols = colsFor(state.calType);
  const valid = state.points.filter((p) => {
    if (cols === 3) return p.conc !== "" && p.signal !== "" && p.signalIS !== "" && parseNum(p.signalIS) !== 0;
    return p.conc !== "" && p.signal !== "";
  });
  const calBlankRaw = document.getElementById("calBlankSignalInput").value;
  const calBlankIS = document.getElementById("calBlankSignalISInput").value;
  const calBlankSignal = calBlankRaw !== "" ? parseNum(calBlankRaw) : 0;

  const xs = valid.map((p) => parseNum(p.conc));
  const ys = cols === 3
    ? valid.map((p) => (parseNum(p.signal) - calBlankSignal) / parseNum(p.signalIS))
    : valid.map((p) => parseNum(p.signal) - calBlankSignal);
  const reg = linreg(xs, ys);
    const errBox = document.getElementById("regressionError");
  const blankBox = document.getElementById("blankWarningBox");
  if (!reg) {
    errBox.style.display = "block";
    errBox.textContent = "I need at least 2 valid points, not all at the same concentration.";
    document.getElementById("resultsBox").style.display = "none";
    document.getElementById("saveCalBtn").style.display = "none";
    blankBox.style.display = "none";
    return;
  }
errBox.style.display = "none";
  reg.xs = xs;
  reg.ys = ys;
  reg.calMin = Math.min(...xs);
  reg.calMax = Math.max(...xs);
  reg.sampleConc = null;
  reg.sampleConcSE = null;
  reg.totalDil = 1;

  const lodMethod = document.querySelector("#lodMethodSeg button.active").dataset.val;
  reg.lodMethod = lodMethod;
  if (lodMethod === "blankReps") {
    const repsRaw = document.getElementById("lodBlankRepsInput").value;
    const reps = repsRaw
      .split(/[\n,\t;]+/)
      .map((s) => parseNum(s.trim()))
      .filter((n) => !Number.isNaN(n));
    if (reps.length >= 2 && reg.slope) {
      const stats = meanSD(reps);
      reg.lod = Math.abs((3.3 * stats.sd) / reg.slope);
      reg.loq = Math.abs((10 * stats.sd) / reg.slope);
      reg.blankRepsN = stats.n;
      reg.blankRepsSD = stats.sd;
    } else {
      reg.lodMethod = "curve";
      reg.lodMethodFallback = true; // not enough blank replicates entered — kept the curve-based value
    }
  }
     if (state.calType === "addition") {
    const dil = parseDilutionChain(document.getElementById("dilutionFinalInput").value);
    reg.totalDil = dil;
    if (reg.slope !== 0) {
      const x0 = -reg.intercept / reg.slope;
      reg.sampleConc = x0 * dil;
      const se = concentrationSE(reg, x0, Infinity);
      reg.sampleConcSE = se !== null ? se * dil : null;
    }
  }

  // Blank (0-concentration point) sanity check: flag it if its residual from
  // the fitted line is unusually large compared to the overall scatter.
  const blankIdx = xs.indexOf(0);
  if (blankIdx !== -1 && reg.syx > 0) {
    const predicted = reg.intercept; // slope*0 + intercept
    const stdResidual = Math.abs((ys[blankIdx] - predicted) / reg.syx);
    if (stdResidual > 2.5) {
      blankBox.style.display = "block";
      blankBox.textContent =
        `The blank (0-concentration) point is ${fmt(stdResidual, 2)}× further from the fitted line than the typical scatter — check for contamination, evaporation, or a data-entry mistake.`;
    } else {
      blankBox.style.display = "none";
    }
  } else {
    blankBox.style.display = "none";
  }

  state.regression = reg;
  renderResults(reg);
  document.getElementById("saveCalBtn").style.display = "inline-block";
});
function statBlock(label, value, unit, color) {
  const wrap = el("div");
  wrap.appendChild(el("span", { class: "stat-label", text: label }));
  const v = el("span", { class: "stat-value", text: value + " " });
  if (color) v.style.color = color;
  if (unit) {
    const s = el("small");
    s.textContent = unit;
    v.appendChild(s);
  }
  wrap.appendChild(v);
  return wrap;
}

function renderResults(reg) {
  document.getElementById("resultsBox").style.display = "block";
  const grid = document.getElementById("statsGrid");
  grid.innerHTML = "";
  const unit = document.getElementById("unitInput").value;
  const isInternal = state.calType === "internal";
  grid.appendChild(statBlock("Slope", fmt(reg.slope)));
  grid.appendChild(statBlock("Intercept", fmt(reg.intercept)));
  grid.appendChild(statBlock("R²", fmt(reg.r2, 5), null, reg.r2 >= 0.995 ? COLORS.teal : COLORS.amber));
const lodLabel = reg.lodMethod === "blankReps" ? "LOD (blank reps)" : "LOD (curve)";
  const loqLabel = reg.lodMethod === "blankReps" ? "LOQ (blank reps)" : "LOQ (curve)";
  grid.appendChild(statBlock(lodLabel, fmt(reg.lod), isInternal ? "" : unit));
  grid.appendChild(statBlock(loqLabel, fmt(reg.loq), isInternal ? "" : unit));
  if (reg.lodMethodFallback) {
    grid.appendChild(statBlock("Note", "Not enough blank replicates (need ≥2) — used curve method instead"));
  }
    const factor = ciFactor(reg.n);
  grid.appendChild(statBlock(uncLabel("slope"), factor !== null ? fmt(reg.seSlope * factor) : "n/a"));
  grid.appendChild(statBlock(uncLabel("intercept"), factor !== null ? fmt(reg.seIntercept * factor) : "n/a"));
  if (state.calType === "addition") {
    let sampleText = fmt(reg.sampleConc);
    if (reg.sampleConcSE !== null && factor !== null) sampleText += ` ± ${fmt(reg.sampleConcSE * factor, 2)}`;
    grid.appendChild(statBlock("Sample concentration", sampleText, unit, COLORS.magenta));
  }
  const extraMinX = state.calType === "addition" && reg.slope ? -reg.intercept / reg.slope : null;
  drawChart(document.getElementById("calChart"), reg, isInternal, extraMinX);
}

// ---------- save calibration / history ----------
document.getElementById("saveCalBtn").addEventListener("click", () => {
  if (!state.regression) return;
  const cols = colsFor(state.calType);
  const valid = state.points.filter((p) => {
    if (cols === 3) return p.conc !== "" && p.signal !== "" && p.signalIS !== "" && parseNum(p.signalIS) !== 0;
    return p.conc !== "" && p.signal !== "";
  });
const calBlankVal = document.getElementById("calBlankSignalInput").value;
  const record = {
    key: newId(),
    technique: technique.id,
    analyte: document.getElementById("analyteInput").value || "(unnamed)",
    unit: document.getElementById("unitInput").value,
    calType: state.calType,
    calBlankSignal: calBlankVal !== "" ? parseNum(calBlankVal) : null,
    points: valid,
regression: {
      slope: state.regression.slope,
      intercept: state.regression.intercept,
      r2: state.regression.r2,
      lod: state.regression.lod,
      loq: state.regression.loq,
      lodMethod: state.regression.lodMethod,
            sampleConc: state.regression.sampleConc,
      sampleConcSE: state.regression.sampleConcSE,
      syx: state.regression.syx,
      n: state.regression.n,
      sxx: state.regression.sxx,
      mx: state.regression.mx,
      seSlope: state.regression.seSlope,
      seIntercept: state.regression.seIntercept,
      calMin: state.regression.calMin,
      calMax: state.regression.calMax,
    },
        savedAt: Date.now(),
  };
  state.savedCals.unshift(record);
  persistHistory(state.savedCals);
  const msg = document.getElementById("saveMsg");
  msg.textContent = "Calibration saved.";
  setTimeout(() => (msg.textContent = ""), 2500);
  updateHistCount();
});

function updateHistCount() {
  document.getElementById("histCount").textContent = state.savedCals.length ? `(${state.savedCals.length})` : "";
}

function renderHistory() {
  const list = document.getElementById("historyList");
  list.innerHTML = "";
  if (state.savedCals.length === 0) {
    list.appendChild(
      el("span", {
        class: "empty-note",
        text: 'You haven\'t saved any calibrations yet. Calculate one in the Calibration tab and press "Save to history".',
      })
    );
    return;
  }
  state.savedCals.forEach((c) => {
    const item = el("div", { class: "hist-item" });
    const left = el("div");
    const nameLine = el("span", { class: "name" });
    nameLine.textContent = c.analyte + " ";
    const sub = el("span", { class: "sub" });
    sub.textContent = "· " + calTypeLabel(c.calType);
    nameLine.appendChild(sub);
    left.appendChild(nameLine);

let metaText = `m=${fmt(c.regression.slope)} · b=${fmt(c.regression.intercept)} · R²=${fmt(c.regression.r2, 5)}`;
const lodTag = c.regression.lodMethod === "blankReps" ? " (blank reps)" : " (curve)";
    metaText += ` · LOD=${fmt(c.regression.lod)}${lodTag} · LOQ=${fmt(c.regression.loq)}${lodTag} ${c.unit}`;
    if (c.regression.n) metaText += ` · n=${c.regression.n} pts`;
    if (c.calBlankSignal !== null && c.calBlankSignal !== undefined) metaText += ` · blank subtracted=${fmt(c.calBlankSignal)}`;
        if (c.calType === "addition" && c.regression.sampleConc !== null && c.regression.sampleConc !== undefined) {
      const seText = c.regression.sampleConcSE !== null && c.regression.sampleConcSE !== undefined ? ` ± ${fmt(c.regression.sampleConcSE, 2)}` : "";
      metaText += ` · sample=${fmt(c.regression.sampleConc)}${seText} ${c.unit}`;
    }
    left.appendChild(el("span", { class: "meta", text: metaText }));

if (c.regression.seSlope !== undefined && c.regression.seSlope !== null) {
      const hf = ciFactor(c.regression.n);
      const label = state.uncertaintyMode === "ci95" ? "95% CI" : "SE";
      left.appendChild(
        el("span", {
          class: "meta",
          text: hf !== null
            ? `${label} slope=${fmt(c.regression.seSlope * hf)} · ${label} intercept=${fmt(c.regression.seIntercept * hf)}`
            : `95% CI unavailable (n too small)`,
        })
      );
    }

    left.appendChild(el("span", { class: "date", text: new Date(c.savedAt).toLocaleString() }));

    if (c.points && c.points.length) {
      const det = el("details", { class: "hist-points" });
      det.appendChild(el("summary", { text: `${c.points.length} calibration points` }));
      const cols3 = c.calType === "internal";
      const tbl = el("div", { class: "hist-points-table" });
      c.points.forEach((p) => {
        tbl.appendChild(
          el("span", {
            text: cols3 ? `conc=${p.conc}, signal=${p.signal}, IS=${p.signalIS}` : `conc=${p.conc}, signal=${p.signal}`,
          })
        );
      });
      det.appendChild(tbl);
      left.appendChild(det);
    }

    item.appendChild(left);

    const actions = el("div", { class: "hist-actions" });
    if (c.calType !== "addition") {
      actions.appendChild(
        el("button", {
          class: "btn-ghost",
          text: "Use in samples",
          onclick: () => {
            document.querySelector('.tab-btn[data-tab="samples"]').click();
            document.getElementById("calSelect").value = c.key;
            onCalSelectChange();
          },
        })
      );
    }
    actions.appendChild(
      el("button", {
        class: "btn-ghost danger",
        text: "Delete",
        onclick: () => {
          state.savedCals = state.savedCals.filter((x) => x.key !== c.key);
          persistHistory(state.savedCals);
          renderHistory();
          updateHistCount();
        },
      })
    );
    item.appendChild(actions);
    list.appendChild(item);
  });
}

// ---------- samples tab ----------
function refreshCalSelect() {
  const sel = document.getElementById("calSelect");
  const prevVal = sel.value;
  sel.innerHTML = "";
  sel.appendChild(el("option", { value: "", text: "— select —" }));
  if (state.regression && state.calType !== "addition") {
    sel.appendChild(
      el("option", {
        value: "current",
        text: `Current (unsaved) · ${document.getElementById("analyteInput").value} (${calTypeLabel(state.calType)})`,
      })
    );
  }
  state.savedCals
    .filter((c) => c.calType !== "addition")
    .forEach((c) => {
      sel.appendChild(
        el("option", {
          value: c.key,
          text: `${c.analyte} · ${c.calType === "internal" ? "IS" : "external"} · ${new Date(c.savedAt).toLocaleDateString()}`,
        })
      );
    });
  document.getElementById("additionNote").style.display = state.calType === "addition" ? "block" : "none";
  if ([...sel.options].some((o) => o.value === prevVal)) sel.value = prevVal;
}

document.getElementById("calSelect").addEventListener("change", onCalSelectChange);

function onCalSelectChange() {
  const val = document.getElementById("calSelect").value;
  if (val === "") {
    state.activeCal = null;
  } else if (val === "current") {
    state.activeCal = {
      analyte: document.getElementById("analyteInput").value,
      unit: document.getElementById("unitInput").value,
      calType: state.calType,
      regression: state.regression,
    };
  } else {
    const found = state.savedCals.find((c) => c.key === val);
    state.activeCal = found ? { analyte: found.analyte, unit: found.unit, calType: found.calType, regression: found.regression } : null;
  }
  document.getElementById("samplesArea").style.display = state.activeCal ? "block" : "none";
  document.getElementById("blankField").style.display = state.activeCal ? "flex" : "none";
  document.getElementById("blankSignalISInput").style.display =
    state.activeCal && state.activeCal.calType === "internal" ? "inline-block" : "none";
  renderActiveCalInfo();
  buildSamplesHead();
  updateBlankDisplay();
  document.querySelectorAll("#samplesRows .samples-row").forEach((row) => row.recompute && row.recompute());
}

function renderActiveCalInfo() {
  const box = document.getElementById("activeCalInfo");
  if (!state.activeCal) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  const c = state.activeCal;
  const reg = c.regression;
  box.style.display = "block";
  const grid = el("div", { class: "stats-grid", style: "margin-bottom:0;" });
  grid.appendChild(statBlock("Analyte", c.analyte));
  grid.appendChild(statBlock("Type", calTypeLabel(c.calType)));
  grid.appendChild(statBlock("Slope", fmt(reg.slope)));
  grid.appendChild(statBlock("Intercept", fmt(reg.intercept)));
  grid.appendChild(statBlock("R²", fmt(reg.r2, 5), null, reg.r2 >= 0.995 ? COLORS.teal : COLORS.amber));
  grid.appendChild(statBlock("LOD", fmt(reg.lod), c.calType === "internal" ? "" : c.unit));
  grid.appendChild(statBlock("LOQ", fmt(reg.loq), c.calType === "internal" ? "" : c.unit));
if (reg.n) grid.appendChild(statBlock("n points", reg.n));
  if (reg.calMin !== undefined && reg.calMax !== undefined) {
    grid.appendChild(statBlock("Cal. range", `${fmt(reg.calMin)}–${fmt(reg.calMax)}`, c.unit));
  }
  box.innerHTML = "";
  box.appendChild(grid);
}

function computeBlankConc() {
  if (!state.activeCal) return { conc: 0, se: 0 };
  const reg = state.activeCal.regression;
  if (!reg || !reg.slope) return { conc: 0, se: 0 };
  const isInternal = state.activeCal.calType === "internal";
  const bSignal = document.getElementById("blankSignalInput").value;
  const bIS = document.getElementById("blankSignalISInput").value;
  if (bSignal === "") return { conc: 0, se: 0 };
  let conc;
  if (isInternal) {
    if (bIS === "" || parseNum(bIS) === 0) return { conc: 0, se: 0 };
    const ratio = parseNum(bSignal) / parseNum(bIS);
    conc = (ratio - reg.intercept) / reg.slope;
  } else {
    conc = (parseNum(bSignal) - reg.intercept) / reg.slope;
  }
const se = concentrationSE(reg, conc, 1); // may be null if the calibration lacks SE stats
  return { conc, se };
}
function updateBlankDisplay() {
  const label = document.getElementById("blankResultLabel");
  const { conc, se } = computeBlankConc();
  const unit = state.activeCal ? state.activeCal.unit : "";
  const factor = state.activeCal ? ciFactor(state.activeCal.regression.n) : 1;
  const seText = se !== null && factor !== null ? ` ± ${fmt(se * factor, 2)}` : "";
  label.textContent = conc !== 0 ? `Blank result: ${fmt(conc)}${seText} ${unit}` : "";
}

document.getElementById("blankSignalInput").addEventListener("input", () => {
  updateBlankDisplay();
  document.querySelectorAll("#samplesRows .samples-row").forEach((r) => r.recompute && r.recompute());
});
document.getElementById("blankSignalISInput").addEventListener("input", () => {
  updateBlankDisplay();
  document.querySelectorAll("#samplesRows .samples-row").forEach((r) => r.recompute && r.recompute());
});
function buildSamplesHead() {
  const isInternal = state.activeCal && state.activeCal.calType === "internal";
  const head = document.getElementById("samplesHead");
  head.className = "samples-head";
  head.style.gridTemplateColumns = isInternal ? "1.2fr 1fr 1fr 1fr 1fr 28px" : "1.2fr 1fr 1fr 1fr 28px";
  head.innerHTML =
    "<span>Sample</span><span>Signal</span>" +
    (isInternal ? "<span>IS signal</span>" : "") +
    "<span>Dilution (e.g. 10, 5)</span><span>Result</span><span></span>";
}

function addSampleRow() {
  if (!state.activeCal) return;
  const isInternal = state.activeCal.calType === "internal";
  const data = { name: "", signal: "", signalIS: "", dilution: "" };
  const row = el("div", { class: "samples-row" });
  row.style.display = "grid";
  row.style.gridTemplateColumns = isInternal ? "1.2fr 1fr 1fr 1fr 1fr 28px" : "1.2fr 1fr 1fr 1fr 28px";
  row.style.gap = "8px";
  row.style.alignItems = "center";
  row.style.marginTop = "8px";

  const nameInput = el("input", { placeholder: "sample ID" });
  nameInput.addEventListener("input", () => (data.name = nameInput.value));
  row.appendChild(nameInput);

  const sigInput = el("input", { placeholder: "0", inputmode: "decimal" });
  sigInput.addEventListener("input", () => {
    data.signal = sigInput.value;
    recompute();
  });
  row.appendChild(sigInput);

  if (isInternal) {
    const isInput = el("input", { placeholder: "0", inputmode: "decimal" });
    isInput.addEventListener("input", () => {
      data.signalIS = isInput.value;
      recompute();
    });
    row.appendChild(isInput);
  }

  const dilInput = el("input", { placeholder: "1" });
  dilInput.addEventListener("input", () => {
    data.dilution = dilInput.value;
    recompute();
  });
  row.appendChild(dilInput);

  const resultSpan = el("span", { class: "result-cell", text: "—" });
  row.appendChild(resultSpan);

  const rmBtn = el("button", {
    class: "remove-btn",
    text: "×",
    onclick: () => {
      state.samples = state.samples.filter((s) => s !== data);
      row.remove();
    },
  });
  row.appendChild(rmBtn);

function recompute() {
    const reg = state.activeCal && state.activeCal.regression;
    if (!reg || !reg.slope) {
      resultSpan.textContent = "—";
      resultSpan.className = "result-cell";
      return;
    }
    let rawConc = null;
    if (isInternal) {
      if (data.signal !== "" && data.signalIS !== "" && parseNum(data.signalIS) !== 0) {
        const ratio = parseNum(data.signal) / parseNum(data.signalIS);
        rawConc = (ratio - reg.intercept) / reg.slope;
      }
    } else if (data.signal !== "") {
      rawConc = (parseNum(data.signal) - reg.intercept) / reg.slope;
    }
    if (rawConc === null || Number.isNaN(rawConc)) {
      resultSpan.textContent = "—";
      resultSpan.className = "result-cell";
      return;
    }
const dil = parseDilutionChain(data.dilution);
    const seRaw = concentrationSE(reg, rawConc, 1);
    const { conc: blankConc, se: blankSE } = computeBlankConc();
    const factor = ciFactor(reg.n);

    const conc = rawConc * dil - blankConc;
    const seAvailable = seRaw !== null && factor !== null;
    const se = seAvailable ? Math.sqrt((seRaw * dil) ** 2 + (blankSE || 0) ** 2) * factor : null;

    const unit = state.activeCal.unit;
    const belowLOQ = reg.loq !== null && reg.loq !== undefined && conc < reg.loq;
    // Range check uses rawConc: the concentration as read directly off the
    // curve, before dilution/blank adjustments, since that's what's
    // actually comparable to the calibration standards' range.
    const aboveRange = reg.calMax !== undefined && rawConc > reg.calMax;
    const belowRange = reg.calMin !== undefined && rawConc < reg.calMin;

    const seText = seAvailable ? ` ± ${fmt(se, 2)}` : "";
    let flag = "";
    let flagClass = "ok";
    let flagTitle = "";
    if (aboveRange) {
      flag = " ⚠ above cal. range";
      flagClass = "warn";
      flagTitle = `Above the highest calibration standard (${fmt(reg.calMax)} ${unit}) — this is an extrapolation. Consider diluting the sample and re-measuring.`;
    } else if (belowLOQ) {
      flag = " ⚠";
      flagClass = "warn";
      flagTitle = "Below the LOQ of this calibration";
    } else if (belowRange) {
      flag = " (below lowest standard)";
      flagTitle = `Below the lowest calibration standard (${fmt(reg.calMin)} ${unit}) — still an extrapolation, treat with caution.`;
    }

    resultSpan.textContent = `${fmt(conc)}${seText} ${unit}${flag}`;
    resultSpan.className = "result-cell " + flagClass;
    resultSpan.title = flagTitle || (seAvailable
      ? ""
      : factor === null
      ? "Not enough calibration points to compute a 95% CI (need n > 2)."
      : "Uncertainty unavailable — this calibration was saved before SE tracking was added. Recalculate and re-save it in the Calibration tab to get ±.");
  }
          row.recompute = recompute;

  state.samples.push(data);
  document.getElementById("samplesRows").appendChild(row);
}

document.getElementById("addSampleBtn").addEventListener("click", addSampleRow);

document.getElementById("copySamplesBtn").addEventListener("click", () => {
  if (!state.activeCal) return;
  const reg = state.activeCal.regression;
  const header = ["sample", "concentration", "unit", `above LOQ (${fmt(reg.loq)})`].join("\t");
  const rows = [];
  document.querySelectorAll("#samplesRows .samples-row").forEach((row, i) => {
    const data = state.samples[i];
    if (!data) return;
    const resultSpan = row.querySelector(".result-cell");
    rows.push([data.name || "(unnamed)", resultSpan.textContent, state.activeCal.unit, resultSpan.classList.contains("warn") ? "no" : "yes"].join("\t"));
  });
  const text = [header, ...rows].join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
});

// ---------- isotope ratio tools (MC-ICP-MS): replicate stats + SSB ----------
document.getElementById("repTypeSeg").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#repTypeSeg button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
});

let lastRepStats = null;

document.getElementById("computeRepBtn").addEventListener("click", () => {
  const raw = document.getElementById("repValuesInput").value;
  const values = raw
    .split(/[\n,\t;]+/)
    .map((s) => parseNum(s.trim()))
    .filter((n) => !Number.isNaN(n));
  const box = document.getElementById("repStatsOutput");
  box.innerHTML = "";
  const addBtn = document.getElementById("addToSequenceBtn");
  if (values.length < 2) {
    box.appendChild(el("span", { class: "empty-note", text: "Enter at least 2 replicate values." }));
    addBtn.style.display = "none";
    lastRepStats = null;
    return;
  }
  const stats = meanSD(values);
  lastRepStats = stats;
  box.appendChild(statBlock("N", stats.n));
  box.appendChild(statBlock("Mean", fmt(stats.mean, 6)));
  box.appendChild(statBlock("2SD", fmt(stats.twoSD, 4)));
  box.appendChild(statBlock("RSD", stats.rsd !== null ? fmt(stats.rsd, 3) : "—", "%"));
  addBtn.style.display = "inline-block";
});

document.getElementById("addToSequenceBtn").addEventListener("click", () => {
  if (!lastRepStats) return;
  const label = document.getElementById("repLabelInput").value || "(unnamed)";
  const type = document.querySelector("#repTypeSeg button.active").dataset.val;
  addSsbRow({ label, type, ratio: lastRepStats.mean });
});

function addSsbRow(data) {
  const rowData = Object.assign({ id: newId(), label: "", type: "sample", ratio: "" }, data || {});
  state.ssbRows.push(rowData);
  renderSsbRows();
}

function renderSsbRows() {
  const container = document.getElementById("ssbRows");
  container.innerHTML = "";
  state.ssbRows.forEach((rowData, idx) => {
    const row = el("div", { class: "samples-row" });
    row.style.display = "grid";
    row.style.gridTemplateColumns = "28px 1.4fr 1fr 1fr 28px";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    row.style.marginTop = "8px";

    row.appendChild(el("span", { class: "hint", text: String(idx + 1) }));

    const labelInput = el("input", { placeholder: "label" });
    labelInput.value = rowData.label;
    labelInput.addEventListener("input", () => (rowData.label = labelInput.value));
    row.appendChild(labelInput);

    const typeSelect = el("select", {});
    ["standard", "sample"].forEach((v) => {
      const opt = el("option", { value: v, text: v === "standard" ? "Standard" : "Sample" });
      if (rowData.type === v) opt.setAttribute("selected", "selected");
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener("change", () => (rowData.type = typeSelect.value));
    row.appendChild(typeSelect);

    const ratioInput = el("input", { placeholder: "0", inputmode: "decimal" });
    ratioInput.value = rowData.ratio;
    ratioInput.addEventListener("input", () => (rowData.ratio = ratioInput.value));
    row.appendChild(ratioInput);

    const rmBtn = el("button", {
      class: "remove-btn",
      text: "×",
      onclick: () => {
        state.ssbRows = state.ssbRows.filter((r) => r.id !== rowData.id);
        renderSsbRows();
      },
    });
    row.appendChild(rmBtn);

    container.appendChild(row);
  });
}

document.getElementById("addSsbRowBtn").addEventListener("click", () => addSsbRow());

document.getElementById("computeSsbBtn").addEventListener("click", () => {
  const certified = parseNum(document.getElementById("certifiedValueInput").value);
  const resultsBox = document.getElementById("ssbResults");
  resultsBox.innerHTML = "";
  if (Number.isNaN(certified)) {
    resultsBox.appendChild(el("span", { class: "empty-note", text: "Enter the certified reference value first." }));
    return;
  }
  const rows = state.ssbRows.map((r) => ({ ...r, ratio: parseNum(r.ratio) })).filter((r) => !Number.isNaN(r.ratio));
  if (rows.length === 0) {
    resultsBox.appendChild(el("span", { class: "empty-note", text: "Add at least one row to the sequence." }));
    return;
  }

  rows.forEach((r, i) => {
    const line = el("div", { class: "hist-item" });
    const left = el("div");
    left.appendChild(el("span", { class: "name", text: `${r.label} · ${r.type}` }));

    if (r.type === "standard") {
      const dev = ((r.ratio - certified) / certified) * 100;
      left.appendChild(el("span", { class: "meta", text: `raw = ${fmt(r.ratio, 6)} · deviation from certified = ${fmt(dev, 3)}%` }));
    } else {
      // find nearest standard before and after this row in the sequence
      let before = null, after = null;
      for (let j = i - 1; j >= 0; j--) if (rows[j].type === "standard") { before = rows[j]; break; }
      for (let j = i + 1; j < rows.length; j++) if (rows[j].type === "standard") { after = rows[j]; break; }

      if (before && after) {
        const bracketAvg = (before.ratio + after.ratio) / 2;
        const corrected = r.ratio * (certified / bracketAvg);
        left.appendChild(
          el("span", {
            class: "meta",
            text: `raw = ${fmt(r.ratio, 6)} · bracket avg = ${fmt(bracketAvg, 6)} · corrected = ${fmt(corrected, 6)}`,
          })
        );
      } else if (before || after) {
        const single = before || after;
        const corrected = r.ratio * (certified / single.ratio);
        left.appendChild(
          el("span", {
            class: "meta",
            text: `raw = ${fmt(r.ratio, 6)} · only one bracketing standard found (${single.label}) · corrected = ${fmt(corrected, 6)} ⚠`,
          })
        );
      } else {
        left.appendChild(el("span", { class: "meta", text: `raw = ${fmt(r.ratio, 6)} · no bracketing standards found — cannot correct ⚠` }));
      }
    }
    line.appendChild(left);
    resultsBox.appendChild(line);
  });
});

// ---------- init ----------
state.savedCals = loadHistory();
updateHistCount();
resetPointsTable();
refreshCalSelect();
renderTechniqueStrip();
updateSamplesModeVisibility();