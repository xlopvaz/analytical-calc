# Analytical Concentration Calculator

A personal tool to go from raw instrument signal to final concentration,
across different analytical instrumental techniques: calibration curve,
internal standard correction, standard addition, dilution factors, and
LOD/LOQ — all in the browser, no server, no build step.


**ICP-MS is the first technique implemented**; more are planned (see
Roadmap below).

**Live site:** https://xlopvaz.github.io/analytical-calc/

## Features

- **Three calibration modes**: external simple, internal standard (analyte/IS
  ratio), and standard addition (x-intercept extrapolation).
- **Manual or pasted data entry**: type points in one by one, or paste a
  table copied from Excel / a CSV.
- **Dilution factors in chain**: enter e.g. `10, 5` and they multiply
  automatically.
- **LOD / LOQ** estimated from the calibration curve (3.3·Sy/x/m and
  10·Sy/x/m).
- **Samples tab**: apply a saved (or just-computed) calibration to a batch
  of samples, flagging anything below the LOQ.
- **History**: calibrations are saved in the browser (`localStorage`) so
  they're still there next time you open the page.

## Project structure

```
icpms-calculator/
├── index.html          # page structure, links css + js
├── css/
│   └── styles.css      # all styling
└── js/
    ├── math.js          # pure calculation functions (regression, formatting, parsing)
    ├── storage.js       # localStorage read/write for the calibration history
    ├── chart.js         # hand-drawn SVG calibration chart
    ├── techniques.js     # registry of analytical techniques (today: ICP-MS only)
    └── app.js           # DOM wiring: tabs, forms, tables, event listeners
```

`techniques.js` exists so that adding a new technique later (UV-Vis, HPLC,
...) means adding an entry there and reusing `math.js`, rather than
rewriting the calibration logic. Saved calibrations already carry a
`technique` field for this reason, even though only `"icpms"` exists today.

No npm, no dependencies, no build step. `app.js` is loaded as an ES module
(`<script type="module">`), so `index.html` needs to be served over
`http://`, not opened directly as a `file://` path — see "Running it
locally" below.

## Running it locally

Because the JS is split into ES modules, opening `index.html` by double
clicking it will fail in most browsers (module loading is blocked over
`file://`). Easiest fix in VS Code:

1. Install the **Live Server** extension (Extensions panel → search "Live
   Server" by Ritwick Dey → Install).
2. Right-click `index.html` in the file explorer → **"Open with Live
   Server"**.
3. It opens in your browser at `http://127.0.0.1:5500/` and reloads
   automatically whenever you save a file.

## Deploying

Push to GitHub and enable **GitHub Pages** (Settings → Pages → Deploy from
branch → `main` → `/root`). The site will be served at
`https://<username>.github.io/icpms-calculator/`.

## Calculation notes

- Regression is ordinary least squares, `signal = slope · concentration +
  intercept` (or `ratio = slope · concentration + intercept` for internal
  standard).
- LOD/LOQ use the residual standard deviation of the calibration curve
  (Sy/x), not repeated-blank statistics. If you calibrate LOD/LOQ from
  blanks instead, that would need a different input (blank replicate
  signals) — open an issue / ask if you want that added.
- Standard addition assumes the series was spiked into aliquots of the same
  sample; the reported concentration is the (negative) x-intercept, times
  any final dilution factor entered.

## Roadmap ideas

Planned next techniques (same calibration math, different signal label/
units — see `techniques.js`): UV-Vis, HPLC, GC/GC-MS, ion chromatography,
ICP-OES, AAS.

Techniques that would need a different calculation engine, for later:
- Potentiometry / ISE (Nernstian, semi-log response).
- ELISA / immunoassays (4-parameter logistic / sigmoidal fit).
- Titrations, gravimetry (not a calibration curve at all).
- MC-ICP-MS isotope-ratio measurements (different quantity entirely from
  concentration).

Other ideas:
- A technique selector in the UI once there's more than one entry in
  `techniques.js`.
- Export results as CSV/PDF instead of copy-to-clipboard.
- Blank-based LOD/LOQ as an alternative to curve-based.
- Optional: propagate measurement uncertainty through the dilution chain.

## License

Personal project — no license chosen yet. Add one (MIT is a common,
permissive choice) before sharing this more widely.
