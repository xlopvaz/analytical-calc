// math.js
// Pure calculation helpers: linear regression, formatting, parsing.
// No DOM code lives here on purpose, so this file can be tested or reused on its own.

/**
 * Ordinary least-squares linear regression, y = slope*x + intercept.
 * Also returns R², residual standard deviation (Sy/x), and LOD/LOQ
 * estimated from the calibration curve (3.3*Sy/x/m and 10*Sy/x/m).
 */
export function linreg(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;

  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = my - slope * mx;

  let ssres = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssres += (ys[i] - pred) ** 2;
  }
const r2 = syy !== 0 ? 1 - ssres / syy : 1;
  const syx = n > 2 ? Math.sqrt(ssres / (n - 2)) : 0;
  const lod = slope !== 0 ? Math.abs((3.3 * syx) / slope) : null;
  const loq = slope !== 0 ? Math.abs((10 * syx) / slope) : null;

  // Standard errors of the fitted parameters (used to build the concentration
  // uncertainty below). See e.g. Miller & Miller, "Statistics for Analytical Chemistry".
  const seSlope = sxx !== 0 ? syx / Math.sqrt(sxx) : null;
  const seIntercept = syx * Math.sqrt(1 / n + (mx * mx) / sxx);

  return { slope, intercept, r2, syx, lod, loq, n, sxx, mx, seSlope, seIntercept };
}

/**
 * Standard error of a concentration x0 predicted from this calibration
 * (inverse prediction / "calibration error" formula).
 * @param {object} reg - result of linreg()
 * @param {number} x0 - the predicted concentration
 * @param {number} replicates - number of replicate measurements of the unknown
 *   that gave x0 (use 1 for a single reading). Pass Infinity for a value that
 *   comes from the regression itself rather than a new measurement (e.g. the
 *   standard-addition x-intercept), which drops that term.
 */
export function concentrationSE(reg, x0, replicates = 1) {
  if (!reg || !reg.slope || !reg.sxx) return null;
  const replicateTerm = replicates > 0 && Number.isFinite(replicates) ? 1 / replicates : 0;
  const inner = replicateTerm + 1 / reg.n + ((x0 - reg.mx) ** 2) / reg.sxx;
  return Math.abs(reg.syx / reg.slope) * Math.sqrt(inner);
}
/** Format a number for display, switching to scientific notation for very small/large values. */
export function fmt(num, digits = 4) {
  if (num === null || num === undefined || Number.isNaN(num)) return "—";
  if (num === 0) return "0";
  const abs = Math.abs(num);
  if (abs < 1e-4 || abs >= 1e6) return num.toExponential(3);
  return Number(num.toPrecision(digits)).toString();
}

/** Parses "10, 5" or "10 x 5" into a single multiplied dilution factor. Empty input = 1. */
export function parseDilutionChain(text) {
  if (!text || !text.trim()) return 1;
  const parts = text.split(/[,x×*]/).map((p) => parseFloat(p.trim()));
  const valid = parts.filter((p) => !Number.isNaN(p) && p > 0);
  if (valid.length === 0) return 1;
  return valid.reduce((a, b) => a * b, 1);
}

/** Locale-tolerant number parsing (accepts comma as decimal separator). */
export function parseNum(v) {
  if (v === "" || v === null || v === undefined) return NaN;
  return parseFloat(String(v).replace(",", "."));
}

/** Parses pasted/CSV text into rows of numbers, keeping only rows with `cols` valid numeric columns. */
export function parseCSV(text, cols) {
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(/[\t;,]+/).map((s) => parseNum(s.trim()));
    if (parts.length >= cols && parts.slice(0, cols).every((n) => !Number.isNaN(n))) {
      rows.push(parts.slice(0, cols));
    }
  }
  return rows;
}
