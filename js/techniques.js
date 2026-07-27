// techniques.js
// Registry of analytical techniques supported by the calculator.
// Today only ICP-MS is implemented, but keeping the metadata here (instead of
// hardcoded across the UI) means adding UV-Vis, HPLC, etc. later is mostly
// "add an entry here + reuse math.js", not a rewrite.
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
    notes:
      "Concentration by calibration curve — applies the same way whether the instrument is quadrupole, TOF, or sector-field/MC. Isotope-ratio measurements are a separate calculation, not covered here.",
  },
};

export const DEFAULT_TECHNIQUE = "icpms";
