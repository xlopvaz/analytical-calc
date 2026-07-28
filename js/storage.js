// storage.js
// Wraps localStorage so the rest of the app doesn't need to know the storage key
// or handle JSON parsing / missing-data edge cases directly.
const STORAGE_KEY = "icpms_calibrations_v1";

/** Returns the saved calibrations array (empty array if none, or if storage is unavailable). */
export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Could not read calibration history from localStorage:", e);
    return [];
  }
}

/** Persists the full calibrations array. Call this after any add/delete. */
export function persistHistory(savedCals) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCals));
    return true;
  } catch (e) {
    console.warn("Could not save calibration history to localStorage:", e);
    return false;
  }
}
const BATCH_KEY = "icpms_batches_v1";

/** Returns the saved multi-analyte batches array. */
export function loadBatches() {
  try {
    const raw = localStorage.getItem(BATCH_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Could not read batches from localStorage:", e);
    return [];
  }
}

/** Persists the full batches array. */
export function persistBatches(batches) {
  try {
    localStorage.setItem(BATCH_KEY, JSON.stringify(batches));
    return true;
  } catch (e) {
    console.warn("Could not save batches to localStorage:", e);
    return false;
  }
}
const RUNS_KEY = "icpms_sample_runs_v1";

/** Returns saved sample-result runs (both single-analyte and batch). */
export function loadSampleRuns() {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Could not read sample runs from localStorage:", e);
    return [];
  }
}

/** Persists the full sample runs array. */
export function persistSampleRuns(runs) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
    return true;
  } catch (e) {
    console.warn("Could not save sample runs to localStorage:", e);
    return false;
  }
}