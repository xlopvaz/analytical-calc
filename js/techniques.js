// techniques.js
// Registry of analytical techniques supported by the calculator.
// Only ICP-MS is implemented right now (status: "available"); the rest are
// listed with status: "coming-soon" so the UI can already show the roadmap
// without any calculation logic behind them yet. Adding a real technique
// later means flipping its status and reusing math.js, not rewriting the UI.
//
// Note on scope: this covers *concentration by calibration curve*
// (external / internal standard / standard addition), which is the same
// underlying math regardless of mass analyzer (quadrupole, TOF, sector-field
// / MC). Isotope-ratio work on MC-ICP-MS (e.g. delta values, ratio
// measurements) is a different calculation and is NOT covered by this tool.

export const TECHNIQUES = {
  icpms: {
    id: "icpms",
    label: "ICP-MS",
    fullName: "Inductively Coupled Plasma Mass Spectrometry",
    defaultUnit: "µg/L",
    signalLabel: "signal (cps)",
    status: "available",
    kind: "curve",
    notes:
      "Concentration by calibration curve — applies the same way whether the instrument is quadrupole, TOF, or sector-field/MC. Isotope-ratio measurements are a separate calculation, not covered here.",
  },
  mcicpms: {
    id: "mcicpms",
    label: "MC-ICP-MS",
    fullName: "Multi-Collector ICP-MS (isotope ratios)",
    defaultUnit: "",
    signalLabel: "isotope ratio",
    status: "available",
    kind: "isotope-ratio",
    notes:
      "Isotope-ratio precision (replicate statistics) and sample-standard bracketing (SSB) correction against a certified reference material. Not a calibration-curve concentration method — lives in its own section of the Samples tab.",
  },
    icpoes: {
    id: "icpoes",
    label: "ICP-OES",
    fullName: "ICP Optical Emission Spectrometry",
    defaultUnit: "mg/L",
    signalLabel: "emission intensity",
    status: "coming-soon",
  },
  aas: {
    id: "aas",
    label: "AAS",
    fullName: "Atomic Absorption Spectroscopy",
    defaultUnit: "mg/L",
    signalLabel: "absorbance",
    status: "coming-soon",
  },
uvvis: {
    id: "uvvis",
    label: "UV-Vis",
    fullName: "UV-Visible Spectrophotometry",
    defaultUnit: "mg/L",
    signalLabel: "absorbance",
    status: "available",
    kind: "curve",
    notes: "Concentration by calibration curve (external / internal standard / standard addition) — same engine as ICP-MS, with absorbance as the signal instead of counts.",
  },
    hplc: {
    id: "hplc",
    label: "HPLC",
    fullName: "High-Performance Liquid Chromatography",
    defaultUnit: "mg/L",
    signalLabel: "peak area",
    status: "coming-soon",
  },
  gc: {
    id: "gc",
    label: "GC",
    fullName: "Gas Chromatography",
    defaultUnit: "mg/L",
    signalLabel: "peak area",
    status: "coming-soon",
  },
  ic: {
    id: "ic",
    label: "IC",
    fullName: "Ion Chromatography",
    defaultUnit: "mg/L",
    signalLabel: "peak area",
    status: "coming-soon",
  },
};

// Controls the display order of the technique strip in the UI.
export const TECHNIQUE_ORDER = ["icpms", "mcicpms", "icpoes", "aas", "uvvis", "hplc", "gc", "ic"];
export const DEFAULT_TECHNIQUE = "icpms";