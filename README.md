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


## Deploying

Push to GitHub and enable **GitHub Pages.** The site will be served at
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
