# Attributions & Licences

Empowerment Recursive Innovation OS v4 is an original Foster + Navi / Planetary Restoration Archive-oriented application. Versions 1–3 were conceived and implemented by Foster + Navi; the v4 upgrade was engineered with Claude (Anthropic). It adapts public concepts and documented APIs and does not copy proprietary application code. Maintainers remain responsible for review and release.

## Runtime dependencies (optional, consent-gated, pinned)
- **Trystero** 0.25.3: Dan Motzenbecker, MIT. Optional browser-to-browser rooms. Loaded from a pinned CDN URL only after the person consents. https://github.com/dmotz/trystero
- **WebLLM** 0.2.85: MLC AI project, Apache-2.0. Optional in-browser inference. Loaded only after the person consents; model weights carry their own licences. https://github.com/mlc-ai/web-llm

Neither library's source is copied into this bundle. The air-gapped edition (`strict/index.html`) contains no network code at all.

## Patterns and algorithms re-implemented (concepts only, original code)
- WAI-ARIA Authoring Practices (W3C): tabs, dialog, combobox/listbox keyboard patterns.
- mulberry32 PRNG and FNV-1a hash: short public-domain algorithms.
- Abramowitz & Stegun 7.1.26 error-function approximation (published formula), inverted by bisection for the sample-size calculator.
- Standard two-proportion, two-mean and survey sample-size formulas; design-effect adjustment for clustered samples.
- Token-bucket rate limiting; hash-chained append-only logs; multi-criteria decision analysis with weight perturbation; last-writer-wins with conflict forks.
- Web Crypto API (browser built-in): SHA-256, PBKDF2 (600,000 iterations, per OWASP password-storage guidance), AES-GCM, ECDSA P-256.

## Referenced data and frameworks
- Texas Broadband Development Office / Texas Comptroller and the FCC Broadband Data Collection: public program information used as factual reference (from v3).
- CARE Principles for Indigenous Data Governance (Global Indigenous Data Alliance, https://www.gida-global.org/care) and OCAP® (First Nations Information Governance Centre, https://fnigc.ca/ocap-training/): referenced in the field guide as community-led frameworks to learn from directly. OCAP® is a registered trademark of FNIGC and a specifically First Nations set of principles. Not reproduced.

## Language
Spanish and French interface strings were drafted for this build and should be reviewed by fluent speakers before public release. Research text remains in English.

Always review upstream licences and terms before redistributing vendored dependency code.
