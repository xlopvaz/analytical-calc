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