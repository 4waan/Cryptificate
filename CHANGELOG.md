# Changelog

## v0.2.0

Every package (the Rust workspace, `@cryptificate/schema`, the server, the web workbench and
the Python client) and the OpenAPI description now carry version 0.2.0; `cryptificate
--version` prints `cryptificate 0.2.0 (<revision>)`.

### Design claims

- **Prime-field HADES profile** `hades/prime/v1`: BabyBear, KoalaBear, Mersenne31, Goldilocks
  or a custom 64-bit prime, at widths 2, 3, 4, 8, 12, 16 and 24. The claim `field.prime` is a
  Pratt certificate checked by kernel evaluation. Wide widths add `external.m4_mds` and
  `external.invertible`; a singular matrix is refuted with a kernel-vector witness. Circuits,
  native correctness, timing and Rust refinement do not cover this profile.
- **Partial-round claims** `activity.partial` and `activity.total` for HADES designs, with the
  `partial-bypass` witness. Designs with fewer partial rounds than their width (for example
  the wide Plonky3 instances `babybear-t16` and `koalabear-t24`) refute `activity.partial`, as
  expected: see [docs/research-directions.md](docs/research-directions.md).
- **Round constants** `constants.grain`: the Grain LFSR procedure in Lean and in the engine,
  with the first differing position as a `constant-mismatch` witness. `cryptificate import`
  reads Plonky3 split arrays, HorizenLabs instances, printed lists, JSON and CSV into a design.
- **S-box quality** `sbox.differential` and `sbox.linearity`: exact differential uniformity
  and linearity of byte S-box tables.
- **AES final round**: the execution model and the Rust kernels include the round without
  MixColumns, with the activity bound and its refinement proof.
- **BN254 Montgomery kernel** on four 64-bit limbs, extracted with Charon and Aeneas and proved
  against `ZMod p` (recorded in `refinement/claims.json`; the `rust.refinement` claim still
  covers GF(2^8) circuits only).

### Tooling

- `check` and `verify` gate on claim statuses (`--fail-on`, `--claims`) and write text, JSON,
  SARIF, JUnit, Markdown or a self-contained HTML evidence report (`--format html`); bundles
  carry `report.html`. A reusable GitHub Action gates a workflow on the claims.
- `cryptificate init` scaffolds `cryptificate.json`, a design and a workflow;
  `cryptificate doctor` checks the machine and prints fixes; `check` reads its inputs from
  `cryptificate.json`.
- OpenAPI 3.1 description of the HTTP API (`schemas/openapi.json`, `GET /api/openapi.json`),
  `GET /api/jobs/{id}/report.html`, and a Python client method for every operation.
- A container image (see [docs/docker.md](docs/docker.md)).
- Web workbench: prime-field and Plonky3 presets, experimental AES-like widths 3 and 2
  (browser preview only), instant browser diagnostics, auto-check, command palette and
  shortcuts, undo and redo, share links, matrix import and export, and the Export report
  button.

### Changes that affect recorded results

- New claims appear in fresh reports. `verify` lists claims a bundle recorded before they
  existed as "not recorded" instead of failing (see
  [docs/adopter-guide.md](docs/adopter-guide.md)).
- A refuted `native.correctness` claim is labelled "Generated Rust failed F of N correctness
  cases". Reports recorded before 0.2.0 keep "Generated Rust passed N correctness cases" with
  N the passing cases; the schema accepts both labels.
