// dataTransfer.js
// Export/import everything saved (calibrations + multi-analyte batches) as
// either JSON or Excel — both formats are full round-trip: export, then
// import later (same browser or a different one) and get the same data back.
//
// Excel support uses SheetJS's global `XLSX` object, loaded via a plain
// <script> tag in index.html (not an ES module) before this file runs.

import { loadHistory, persistHistory, loadBatches, persistBatches, loadSampleRuns, persistSampleRuns } from "./storage.js";

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- export ----------
function exportJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    calibrations: loadHistory(),
    batches: loadBatches(),
    sampleRuns: loadSampleRuns(),
  };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  download(`analytical-calculator-backup-${Date.now()}.json`, blob);
}

function exportXLSX() {
  if (typeof XLSX === "undefined") {
    alert("Excel export library failed to load. Check your internet connection and reload the page.");
    return;
  }
  const calibrations = loadHistory();
  const batches = loadBatches();

  const calMeta = calibrations.map((c) => ({
    key: c.key,
    technique: c.technique,
    analyte: c.analyte,
    unit: c.unit,
    calType: c.calType,
    calBlankSignal: c.calBlankSignal ?? "",
    lodMethod: c.regression?.lodMethod ?? "",
    savedAt: new Date(c.savedAt).toISOString(),
    slope: c.regression?.slope,
    intercept: c.regression?.intercept,
    r2: c.regression?.r2,
    lod: c.regression?.lod,
    loq: c.regression?.loq,
    n: c.regression?.n,
    sxx: c.regression?.sxx,
    mx: c.regression?.mx,
    syx: c.regression?.syx,
    seSlope: c.regression?.seSlope,
    seIntercept: c.regression?.seIntercept,
    sampleConc: c.regression?.sampleConc,
    sampleConcSE: c.regression?.sampleConcSE,
    calMin: c.regression?.calMin,
    calMax: c.regression?.calMax,
  }));
  const calPoints = [];
  calibrations.forEach((c) => {
    (c.points || []).forEach((p) => {
      calPoints.push({ calibrationKey: c.key, conc: p.conc, signal: p.signal, signalIS: p.signalIS ?? "" });
    });
  });

  const batchMeta = batches.map((b) => ({
    key: b.key,
    technique: b.technique,
    name: b.name,
    unit: b.unit,
    savedAt: new Date(b.savedAt).toISOString(),
  }));
  const batchAnalytes = [];
  batches.forEach((b) => {
    Object.keys(b.analytes || {}).forEach((name) => {
      const a = b.analytes[name];
      batchAnalytes.push({
        batchKey: b.key,
        analyte: name,
        slope: a.slope,
        intercept: a.intercept,
        r2: a.r2,
        lod: a.lod,
        loq: a.loq,
        n: a.n,
        calMin: a.calMin,
        calMax: a.calMax,
        sxx: a.sxx ?? "",
        mx: a.mx ?? "",
        syx: a.syx ?? "",
      });
    });
  });

const runs = loadSampleRuns();
  const runMeta = runs.map((r) => ({
    key: r.key,
    technique: r.technique,
    kind: r.kind,
    name: r.name,
    savedAt: new Date(r.savedAt).toISOString(),
  }));
  const runResults = [];
  runs.forEach((r) => {
    if (r.kind === "batch") {
      const analyteNames = Object.keys(r.batchSnapshot?.analytes || {});
      (r.samples || []).forEach((s) => {
        analyteNames.forEach((n) => {
          const v = s.values?.[n] || {};
          runResults.push({ runKey: r.key, sample: s.name, analyte: n, signal: v.signal ?? "", dilution: v.dilution ?? "" });
        });
      });
    } else {
      (r.samples || []).forEach((s) => {
        runResults.push({
          runKey: r.key,
          sample: s.name,
          analyte: r.calSnapshot?.analyte ?? "",
          signal: s.signal ?? "",
          signalIS: s.signalIS ?? "",
          dilution: s.dilution ?? "",
        });
      });
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(calMeta), "Calibrations");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(calPoints), "Calibration_Points");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(batchMeta), "Batches");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(batchAnalytes), "Batch_Analytes");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(runMeta), "Sample_Runs");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(runResults), "Sample_Run_Results");
  XLSX.writeFile(wb, `analytical-calculator-backup-${Date.now()}.xlsx`);
}

// ---------- import ----------
function mergeArrays(existing, incoming) {
  const existingKeys = new Set(existing.map((x) => x.key));
  const toAdd = incoming.filter((x) => !existingKeys.has(x.key));
  return [...toAdd, ...existing];
}

function finishImport(statusEl, nCals, nBatches) {
  statusEl.style.color = "var(--teal)";
  statusEl.textContent = `Imported ${nCals} calibration(s) and ${nBatches} batch(es). Reloading…`;
  setTimeout(() => location.reload(), 1200);
}

function importJSONText(text, statusEl) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    statusEl.textContent = "Invalid JSON file.";
    statusEl.style.color = "var(--red)";
    return;
  }
  const cals = Array.isArray(data.calibrations) ? data.calibrations : [];
  const batches = Array.isArray(data.batches) ? data.batches : [];
  persistHistory(mergeArrays(loadHistory(), cals));
  persistBatches(mergeArrays(loadBatches(), batches));
  finishImport(statusEl, cals.length, batches.length);
}

function importXLSXBuffer(buffer, statusEl) {
  if (typeof XLSX === "undefined") {
    statusEl.textContent = "Excel import library failed to load.";
    statusEl.style.color = "var(--red)";
    return;
  }
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name]) : []);
  const calMeta = sheet("Calibrations");
  const calPoints = sheet("Calibration_Points");
  const batchMeta = sheet("Batches");
  const batchAnalytes = sheet("Batch_Analytes");

  const cals = calMeta.map((m) => ({
    key: String(m.key),
    technique: m.technique,
    analyte: m.analyte,
    unit: m.unit,
    calType: m.calType,
    calBlankSignal: m.calBlankSignal === "" || m.calBlankSignal === undefined ? null : m.calBlankSignal,
    points: calPoints
      .filter((p) => String(p.calibrationKey) === String(m.key))
      .map((p) => ({ conc: p.conc, signal: p.signal, signalIS: p.signalIS === "" ? undefined : p.signalIS })),
    regression: {
      slope: m.slope,
      intercept: m.intercept,
      r2: m.r2,
      lod: m.lod,
      loq: m.loq,
      n: m.n,
      sxx: m.sxx,
      mx: m.mx,
      syx: m.syx,
      seSlope: m.seSlope,
      seIntercept: m.seIntercept,
      sampleConc: m.sampleConc,
      sampleConcSE: m.sampleConcSE,
      calMin: m.calMin,
      calMax: m.calMax,
      lodMethod: m.lodMethod || "curve",
    },
    savedAt: m.savedAt ? Date.parse(m.savedAt) : Date.now(),
  }));

  const batches = batchMeta.map((m) => {
    const analytes = {};
    batchAnalytes
      .filter((a) => String(a.batchKey) === String(m.key))
      .forEach((a) => {
        analytes[a.analyte] = {
          slope: a.slope,
          intercept: a.intercept,
          r2: a.r2,
          lod: a.lod,
          loq: a.loq,
          n: a.n,
          calMin: a.calMin,
          calMax: a.calMax,
          sxx: a.sxx === "" ? undefined : a.sxx,
          mx: a.mx === "" ? undefined : a.mx,
          syx: a.syx === "" ? undefined : a.syx,
        };
      });
    return {
      key: String(m.key),
      technique: m.technique,
      name: m.name,
      unit: m.unit,
      analytes,
      savedAt: m.savedAt ? Date.parse(m.savedAt) : Date.now(),
    };
  });

  persistHistory(mergeArrays(loadHistory(), cals));
  persistBatches(mergeArrays(loadBatches(), batches));
  finishImport(statusEl, cals.length, batches.length);
}

export function initDataTransfer() {
  document.getElementById("exportFormatSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#exportFormatSeg button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const format = document.querySelector("#exportFormatSeg button.active").dataset.val;
    if (format === "json") exportJSON();
    else exportXLSX();
  });

  document.getElementById("importFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById("importStatus");
    statusEl.style.color = "var(--textMuted)";
    statusEl.textContent = "Reading file…";
    const isExcel = /\.xlsx$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (isExcel) importXLSXBuffer(new Uint8Array(reader.result), statusEl);
      else importJSONText(reader.result, statusEl);
    };
    reader.onerror = () => {
      statusEl.textContent = "Could not read the file.";
      statusEl.style.color = "var(--red)";
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    e.target.value = "";
  });
}