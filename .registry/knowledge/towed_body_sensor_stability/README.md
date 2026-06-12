# towed_body_sensor_stability

`towed_body_sensor_stability` is a public-safe registry knowledge entry for towed-body attitude stability and internally isolated sensor-axis quieting.

It registers the reusable source map behind questions such as:

- how tow point, CG, CB, hydrodynamic force, added mass, and damping should be separated;
- why external body motion and internal sensor reference motion can be two different layers;
- why internal liquid, annular geometry, baffles, cap, gap, bypass, and restricted flow can matter;
- why cable vibration and body vibration can become acoustic or pointing-performance risks;
- why pointing, boresight, timebase, and latency need explicit error budgets.

## Boundary

- This entry is not a SONAR2093 design-intent proof.
- This entry is not a P26-014 requirement or acceptance baseline.
- It does not include private reports, raw PDFs, NotebookLM answers, project mail, vendor payloads, or numerical reverse-engineering values.
- It supports sourcebound review and RAG routing only. Real design closure still requires source packets, measured data, CFD/tank/FEM results, or owner/vendor source truth.

## Source Posture

The source list in `knowledge.yaml` uses public institutional and public literature references, including NASA/NTRS, NREL, ITTC, OSTI, NAVSEA/Navy public records, NOAA, NIST, USGS, and supporting open technical sources. Detailed project projections and claim-ceiling evidence remain in `_workmeta/P26-014`.
