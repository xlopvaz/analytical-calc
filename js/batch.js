// batch.js
// Self-contained multi-analyte calibration module (e.g. several HPLC/GC compounds
// from one injection). Kept separate from app.js so this larger feature can't
// break the single-analyte workflow if something here has a bug.
//
// Model: calibration points are "long format" — {analyte, conc, signal} rows,
// grouped by analyte name and regressed independently with the same linreg()
// used everywhere else. Each analyte gets its own slope/intercept/LOD/LOQ.
//
// v1 scope (deliberately limited): external calibration only (no internal
// standard / standard addition in batch mode), curve-based LOD/LOQ only (no
// blank-replicate method), no uncertainty (SE/95% CI), no blank subtraction,
// no per-analyte chart. All of these exist in the single-analyte workflow;
// they can be ported here later if needed.

import { linreg, fmt, parseNum, parseDilutionChain, concentrationSE } from "./math.js";
import { loadBatches, persistBatches, loadSampleRuns, persistSampleRuns } from "./storage.js";

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
const newId = () => "batch_" + Date.now() + "_" + idCounter++;

/**
 * @param {() => string} getActiveTechId - returns the currently selected technique id
 * @param {() => string} getUnit - returns the current unit string to tag saved batches with
 */
export function initBatchModule(getActiveTechId, getUnit, getCiFactor) {
      const state = {
    calPoints: [], // { id, analyte, conc, signal }
    regressions: null, // { [analyteName]: regression }
    savedBatches: loadBatches(),
    activeBatch: null, // { name, unit, analytes: { [name]: regressionSnapshot } }
    sampleRows: [], // { id, name, values: { [analyteName]: { signal, dilution } } }
  };

  // ---------- Calibration tab: single vs batch mode ----------
  document.getElementById("calModeSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#calModeSeg button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("singleAnalyteCalArea").style.display = btn.dataset.val === "single" ? "block" : "none";
    document.getElementById("batchCalArea").style.display = btn.dataset.val === "batch" ? "block" : "none";
  });

  // ---------- batch calibration points (manual) ----------
  function addBatchRow(data) {
    const rowData = Object.assign({ id: newId(), analyte: "", conc: "", signal: "" }, data || {});
    state.calPoints.push(rowData);

    const row = el("div", { class: "points-row", style: "grid-template-columns:1.2fr 1fr 1fr 28px;" });

    const analyteInput = el("input", { placeholder: "analyte name" });
    analyteInput.value = rowData.analyte;
    analyteInput.addEventListener("input", () => (rowData.analyte = analyteInput.value));
    row.appendChild(analyteInput);

    const concInput = el("input", { placeholder: "0", inputmode: "decimal" });
    concInput.value = rowData.conc;
    concInput.addEventListener("input", () => (rowData.conc = concInput.value));
    row.appendChild(concInput);

    const sigInput = el("input", { placeholder: "0", inputmode: "decimal" });
    sigInput.value = rowData.signal;
    sigInput.addEventListener("input", () => (rowData.signal = sigInput.value));
    row.appendChild(sigInput);

    const rmBtn = el("button", { class: "remove-btn", text: "×" });
    rmBtn.addEventListener("click", () => {
      state.calPoints = state.calPoints.filter((p) => p.id !== rowData.id);
      row.remove();
    });
    row.appendChild(rmBtn);

    document.getElementById("batchPointsRows").appendChild(row);
  }

  document.getElementById("addBatchRowBtn").addEventListener("click", () => addBatchRow());
  for (let i = 0; i < 6; i++) addBatchRow();

  document.getElementById("applyBatchPasteBtn").addEventListener("click", () => {
    const text = document.getElementById("batchPasteTextarea").value;
    const lines = text.trim().split(/\r?\n/);
    const rows = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(/[\t;,]+/).map((s) => s.trim());
      if (parts.length >= 3) {
        const conc = parseNum(parts[1]);
        const signal = parseNum(parts[2]);
        if (parts[0] && !Number.isNaN(conc) && !Number.isNaN(signal)) {
          rows.push({ analyte: parts[0], conc: parts[1], signal: parts[2] });
        }
      }
    }
    const errBox = document.getElementById("batchPasteError");
    if (rows.length < 2) {
      errBox.style.display = "block";
      errBox.textContent = "Couldn't find at least 2 valid rows with 3 columns (analyte, conc, signal).";
      return;
    }
    errBox.style.display = "none";
    state.calPoints = [];
    document.getElementById("batchPointsRows").innerHTML = "";
    rows.forEach((r) => addBatchRow(r));
  });

  // ---------- compute per-analyte regressions ----------
  document.getElementById("computeBatchBtn").addEventListener("click", () => {
    const groups = {};
    state.calPoints.forEach((p) => {
      if (!p.analyte || p.conc === "" || p.signal === "") return;
      const c = parseNum(p.conc);
      const s = parseNum(p.signal);
      if (Number.isNaN(c) || Number.isNaN(s)) return;
      const key = p.analyte.trim();
      if (!key) return;
      if (!groups[key]) groups[key] = { xs: [], ys: [] };
      groups[key].xs.push(c);
      groups[key].ys.push(s);
    });

    const results = {};
    const skipped = [];
    Object.keys(groups).forEach((name) => {
      const reg = linreg(groups[name].xs, groups[name].ys);
      if (!reg) {
        skipped.push(name);
        return;
      }
      reg.calMin = Math.min(...groups[name].xs);
      reg.calMax = Math.max(...groups[name].xs);
      results[name] = reg;
    });

    state.regressions = results;
    renderBatchResults(results, skipped);
    refreshBatchSelect();
  });

  function renderBatchResults(results, skipped) {
    const box = document.getElementById("batchResultsBox");
    box.innerHTML = "";
    const names = Object.keys(results);
    const saveBtn = document.getElementById("saveBatchBtn");
    if (names.length === 0) {
      box.appendChild(el("span", { class: "empty-note", text: "No valid analyte groups found — each analyte needs at least 2 points." }));
      saveBtn.style.display = "none";
      return;
    }
    const unit = getUnit();
    names.forEach((name) => {
      const reg = results[name];
      const row = el("div", { class: "hist-item" });
      const left = el("div");
      left.appendChild(el("span", { class: "name", text: name }));
      left.appendChild(
        el("span", {
          class: "meta",
          text: `m=${fmt(reg.slope)} · b=${fmt(reg.intercept)} · R²=${fmt(reg.r2, 5)} · LOD=${fmt(reg.lod)} · LOQ=${fmt(reg.loq)} ${unit} · n=${reg.n}`,
        })
      );
      row.appendChild(left);
      box.appendChild(row);
    });
    if (skipped.length) {
      box.appendChild(el("span", { class: "hint", text: `Skipped (fewer than 2 points): ${skipped.join(", ")}` }));
    }
    saveBtn.style.display = "inline-block";
  }

  document.getElementById("saveBatchBtn").addEventListener("click", () => {
    if (!state.regressions || Object.keys(state.regressions).length === 0) return;
    const name = document.getElementById("batchNameInput").value || "(unnamed batch)";
    const unit = getUnit();
    const analytes = {};
Object.keys(state.regressions).forEach((k) => {
      const r = state.regressions[k];
      analytes[k] = {
        slope: r.slope, intercept: r.intercept, r2: r.r2, lod: r.lod, loq: r.loq, n: r.n,
        calMin: r.calMin, calMax: r.calMax, sxx: r.sxx, mx: r.mx, syx: r.syx,
      };
    });
        const record = { key: newId(), technique: getActiveTechId(), name, unit, analytes, savedAt: Date.now() };
    state.savedBatches.unshift(record);
    persistBatches(state.savedBatches);
    const msg = document.getElementById("batchSaveMsg");
    msg.textContent = "Batch saved.";
    setTimeout(() => (msg.textContent = ""), 2500);
    refreshBatchSelect();
  });

  // ---------- Samples tab: single vs batch mode ----------
  document.getElementById("sampleModeSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#sampleModeSeg button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("singleCalSamplesWrap").style.display = btn.dataset.val === "single" ? "block" : "none";
    document.getElementById("batchSamplesArea").style.display = btn.dataset.val === "batch" ? "block" : "none";
  });

  function refreshBatchSelect() {
    const sel = document.getElementById("batchSelect");
    const prevVal = sel.value;
    sel.innerHTML = "";
    sel.appendChild(el("option", { value: "", text: "— select —" }));
    if (state.regressions && Object.keys(state.regressions).length) {
      sel.appendChild(el("option", { value: "current", text: "Current (unsaved) batch" }));
    }
    state.savedBatches
      .filter((b) => b.technique === getActiveTechId())
      .forEach((b) => {
        sel.appendChild(
          el("option", { value: b.key, text: `${b.name} · ${Object.keys(b.analytes).length} analytes · ${new Date(b.savedAt).toLocaleDateString()}` })
        );
      });
    if ([...sel.options].some((o) => o.value === prevVal)) sel.value = prevVal;
  }
  document.getElementById("batchSelect").addEventListener("change", onBatchSelectChange);

  function onBatchSelectChange() {
    const val = document.getElementById("batchSelect").value;
    if (val === "") {
      state.activeBatch = null;
    } else if (val === "current") {
      state.activeBatch = { name: "Current (unsaved)", unit: getUnit(), analytes: state.regressions };
    } else {
      state.activeBatch = state.savedBatches.find((b) => b.key === val) || null;
    }
    renderBatchSampleTable();
  }

  function renderBatchSampleTable() {
    const head = document.getElementById("batchSamplesHead");
    const rowsBox = document.getElementById("batchSamplesRows");
    rowsBox.innerHTML = "";
    document.getElementById("batchSamplesTableWrap").style.display = state.activeBatch ? "block" : "none";
    if (!state.activeBatch) return;

    const names = Object.keys(state.activeBatch.analytes);
    head.innerHTML = "";
    head.style.display = "grid";
    head.style.gridTemplateColumns = `1fr ${names.map(() => "0.8fr 0.7fr").join(" ")} 28px`;
    head.style.gap = "6px";
    head.appendChild(el("span", { text: "Sample" }));
    names.forEach((n) => {
      head.appendChild(el("span", { text: `${n} signal` }));
      head.appendChild(el("span", { text: `${n} dilution` }));
    });
    head.appendChild(el("span", { text: "" }));

    state.sampleRows.forEach((rowData) => rowsBox.appendChild(buildBatchSampleRow(rowData, names)));
  }

  function buildBatchSampleRow(rowData, names) {
    const wrapper = el("div");
    const row = el("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = `1fr ${names.map(() => "0.8fr 0.7fr").join(" ")} 28px`;
    row.style.gap = "6px";
    row.style.marginTop = "8px";
    row.style.alignItems = "center";

    const nameInput = el("input", { placeholder: "sample ID" });
    nameInput.value = rowData.name;
    nameInput.addEventListener("input", () => (rowData.name = nameInput.value));
    row.appendChild(nameInput);

    names.forEach((n) => {
      if (!rowData.values[n]) rowData.values[n] = { signal: "", dilution: "" };
      const sigInput = el("input", { placeholder: "0", inputmode: "decimal" });
      sigInput.value = rowData.values[n].signal;
      sigInput.addEventListener("input", () => {
        rowData.values[n].signal = sigInput.value;
        recomputeRow();
      });
      row.appendChild(sigInput);

      const dilInput = el("input", { placeholder: "1" });
      dilInput.value = rowData.values[n].dilution;
      dilInput.addEventListener("input", () => {
        rowData.values[n].dilution = dilInput.value;
        recomputeRow();
      });
      row.appendChild(dilInput);
    });

    const rmBtn = el("button", { class: "remove-btn", text: "×" });
    rmBtn.addEventListener("click", () => {
      state.sampleRows = state.sampleRows.filter((r) => r !== rowData);
      wrapper.remove();
    });
    row.appendChild(rmBtn);

    const resultsLine = el("div", { class: "hint", style: "margin-top:2px; margin-bottom:4px;" });
function recomputeRow() {
      const parts = names.map((n) => {
        const reg = state.activeBatch.analytes[n];
        const sigVal = parseNum(rowData.values[n].signal);
        if (!reg || !reg.slope || Number.isNaN(sigVal)) return `${n}: —`;
        const dil = parseDilutionChain(rowData.values[n].dilution);
        const rawConc = (sigVal - reg.intercept) / reg.slope;
        const conc = rawConc * dil;
        const belowLOQ = reg.loq !== null && reg.loq !== undefined && conc < reg.loq;

const factor = getCiFactor ? getCiFactor(reg.n) : 1;
        const seRaw = reg.sxx ? concentrationSE(reg, rawConc, 1) : null;
        const seText = seRaw !== null && factor !== null ? ` ± ${fmt(seRaw * dil * factor, 3)}` : "";

        return `${n}: ${fmt(conc)}${seText} ${state.activeBatch.unit}${belowLOQ ? " ⚠" : ""}`;
      });
      resultsLine.textContent = parts.join("   ·   ");
    }
        recomputeRow();

wrapper.appendChild(row);
    wrapper.appendChild(resultsLine);
    wrapper.recompute = recomputeRow;
    return wrapper;
  }

function addBatchSampleRow(prefill) {
    if (!state.activeBatch) return;
    const rowData = Object.assign(
      { id: newId(), name: "", values: {} },
      prefill ? { name: prefill.name, values: JSON.parse(JSON.stringify(prefill.values || {})) } : {}
    );
    state.sampleRows.push(rowData);
    const names = Object.keys(state.activeBatch.analytes);
    document.getElementById("batchSamplesRows").appendChild(buildBatchSampleRow(rowData, names));
  }
  document.getElementById("addBatchSampleBtn").addEventListener("click", () => addBatchSampleRow());

  document.getElementById("saveBatchRunBtn").addEventListener("click", () => {
    if (!state.activeBatch || state.sampleRows.length === 0) return;
    const name = document.getElementById("batchRunNameInput").value || `Batch run ${new Date().toLocaleString()}`;
    const runs = loadSampleRuns();
    const record = {
      key: newId(),
      technique: getActiveTechId(),
      kind: "batch",
      name,
      batchSnapshot: state.activeBatch,
      samples: state.sampleRows.map((r) => ({ name: r.name, values: JSON.parse(JSON.stringify(r.values)) })),
      savedAt: Date.now(),
    };
    runs.unshift(record);
    persistSampleRuns(runs);
    const msg = document.getElementById("batchRunSaveMsg");
    msg.textContent = "Results saved.";
    setTimeout(() => (msg.textContent = ""), 2500);
  });

  document.getElementById("copyBatchSamplesBtn").addEventListener("click", () => {
    if (!state.activeBatch) return;
    const names = Object.keys(state.activeBatch.analytes);
    const header = ["sample", ...names.map((n) => `${n} (${state.activeBatch.unit})`)].join("\t");
    const rows = state.sampleRows.map((rowData) => {
      const vals = names.map((n) => {
        const reg = state.activeBatch.analytes[n];
        const v = rowData.values[n];
        const sigVal = v ? parseNum(v.signal) : NaN;
        if (!reg || !reg.slope || Number.isNaN(sigVal)) return "—";
        const dil = parseDilutionChain(v.dilution);
        const conc = ((sigVal - reg.intercept) / reg.slope) * dil;
        return fmt(conc);
      });
      return [rowData.name || "(unnamed)", ...vals].join("\t");
    });
    const text = [header, ...rows].join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
  });

  refreshBatchSelect();

  return {
    loadRun(run) {
      document.querySelector('.tab-btn[data-tab="samples"]').click();
      document.getElementById("sampleModeSeg").querySelector('[data-val="batch"]').click();
      document.getElementById("batchSelect").value = "";
      state.activeBatch = run.batchSnapshot;
      renderBatchSampleTable();
      state.sampleRows = [];
      document.getElementById("batchSamplesRows").innerHTML = "";
      (run.samples || []).forEach((s) => addBatchSampleRow(s));
    },
  };
}