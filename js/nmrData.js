// nmrData.js
// Reference data for NMR interpretation help. These are general textbook
// ranges (approximate, with plenty of real-world overlap and exceptions) —
// meant to narrow down possibilities, not to give a definitive answer.

export const H_RANGES = [
  { min: 0.0, max: 1.8, label: "Alkyl C-H (CH₃/CH₂/CH, not adjacent to any electron-withdrawing group)" },
  { min: 1.6, max: 2.6, label: "Allylic C-H (C-H next to C=C) or C-H next to C≡C" },
  { min: 2.0, max: 2.7, label: "C-H alpha to a ketone/aldehyde/ester carbonyl" },
  { min: 2.2, max: 3.0, label: "Benzylic C-H (C-H directly attached to an aromatic ring)" },
  { min: 2.1, max: 3.0, label: "N-CH₃ / C-H alpha to nitrile" },
  { min: 2.3, max: 3.5, label: "C-H alpha to a halogen-bearing carbon, or adjacent to two carbonyls" },
  { min: 3.2, max: 4.0, label: "O-CH₃ (methoxy)" },
  { min: 3.3, max: 4.5, label: "C-H attached to O (ether/alcohol) or N (amine)" },
  { min: 3.6, max: 4.8, label: "O-CH₂- adjacent to an ester or acid carbonyl" },
  { min: 4.5, max: 6.5, label: "Vinyl =CH- / =CH₂ (alkene)" },
  { min: 6.0, max: 9.0, label: "Aromatic ring C-H" },
  { min: 9.0, max: 10.5, label: "Aldehyde C-H (-CHO)" },
  { min: 10.0, max: 13.0, label: "Carboxylic acid O-H (broad, often not a clean multiplet)" },
  { min: 0.5, max: 5.5, label: "Alcohol O-H (broad, position varies a lot with concentration/solvent/H-bonding)" },
  { min: 0.5, max: 8.5, label: "Amine/amide N-H (broad, position varies a lot)" },
];

export const C_RANGES = [
  { min: 0, max: 45, label: "sp³ alkyl carbon (C-C, C-H only)" },
  { min: 25, max: 65, label: "C-N (amine-type carbon)" },
  { min: 50, max: 90, label: "C-O sp³ (alcohol or ether carbon)" },
  { min: 65, max: 90, label: "sp carbon of an alkyne (C≡C)" },
  { min: 100, max: 150, label: "sp² carbon: alkene or aromatic ring" },
  { min: 115, max: 122, label: "Nitrile carbon (C≡N)" },
  { min: 155, max: 185, label: "Carbonyl of an ester, amide, or carboxylic acid (C=O attached to O or N)" },
  { min: 190, max: 222, label: "Carbonyl of a ketone or aldehyde" },
];

// Simple first-order multiplicities → number of equivalent coupling neighbors (n, from peaks = n+1).
// Compound patterns (dd, ddd, dt, m, br...) can't be reduced to a single neighbor count this way.
export const SIMPLE_MULTIPLICITIES = {
  s: { neighbors: 0, label: "singlet" },
  d: { neighbors: 1, label: "doublet" },
  t: { neighbors: 2, label: "triplet" },
  q: { neighbors: 3, label: "quartet" },
  p: { neighbors: 4, label: "quintet/pentet" },
  quint: { neighbors: 4, label: "quintet" },
  sext: { neighbors: 5, label: "sextet" },
  hept: { neighbors: 6, label: "septet" },
  sept: { neighbors: 6, label: "septet" },
};

export const COMPOUND_MULTIPLICITIES = new Set(["dd", "dt", "ddd", "dq", "td", "m", "br", "brs", "brd"]);

/** Returns every reference-table entry whose range contains the given shift. */
export function matchRanges(table, shift) {
  return table.filter((r) => shift >= r.min && shift <= r.max);
}

/** Parses a multiplicity string (case-insensitive, trimmed) into a neighbor-count result, or null if not a simple pattern. */
export function interpretMultiplicity(raw) {
  const key = (raw || "").trim().toLowerCase();
  if (!key) return null;
  if (SIMPLE_MULTIPLICITIES[key]) return SIMPLE_MULTIPLICITIES[key];
  if (COMPOUND_MULTIPLICITIES.has(key)) return { neighbors: null, label: key, compound: true };
  return { neighbors: null, label: key, unknown: true };
}

/**
 * Parses a molecular formula like "C8H10O2" into element counts.
 * Handles the common organic elements; anything else is still counted but
 * won't affect the degree-of-unsaturation calculation.
 */
export function parseFormula(formula) {
  const counts = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let match;
  let matchedAny = false;
  while ((match = re.exec(formula)) !== null) {
    const [, el, numStr] = match;
    if (!el) continue;
    matchedAny = true;
    const n = numStr ? parseInt(numStr, 10) : 1;
    counts[el] = (counts[el] || 0) + n;
  }
  return matchedAny ? counts : null;
}

/** Degree of unsaturation: C - (H+X)/2 + N/2 + 1. O, S and others don't affect it. */
export function degreeOfUnsaturation(counts) {
  if (!counts || !counts.C) return null;
  const C = counts.C || 0;
  const H = counts.H || 0;
  const N = counts.N || 0;
  const X = (counts.F || 0) + (counts.Cl || 0) + (counts.Br || 0) + (counts.I || 0);
  return C - (H + X) / 2 + N / 2 + 1;
}