# @cryptificate/web

The Cryptificate workbench: a guided story, a full workspace for designs and circuits, and an experiments view. It answers one question: *I changed a cryptographic component. Does the implementation still match the design, which guarantees survive, and is it faster?*

The page never proves or measures anything itself. In live mode every result comes from the local service (`apps/server`), which runs the engine, Lean and the native harness on your machine. In replay mode results come from recorded runs.

## Run it

From the repository root:

```sh
npm install
npm run dev -w apps/web          # http://127.0.0.1:5173, proxies /api to the service
npm run build -w apps/web        # dist/, served by `cryptificate serve` at http://127.0.0.1:4173
npm run build:replay -w apps/web # dist-replay/, a static site that only shows recorded runs
npm run test -w apps/web
npm run typecheck -w apps/web
```

Start the service in another terminal with `cryptificate serve` (default `127.0.0.1:4173`). The dev server forwards `/api/...` there; set `CRYPTIFICATE_SERVICE=http://127.0.0.1:<port>` to use another port. Requests from the dev page are forwarded as same-origin requests; requests from any other origin are passed through unchanged and refused by the service.

`npm run dev:replay` runs the dev server in replay mode. Any build made with `VITE_REPLAY=1` (or `--mode replay`) never contacts the service. A normal build falls back to recorded runs when the service does not answer and says so in the header.

## Screens

- **Guided story** ("Save operations. Keep the promise."): four steps, each loading real inputs into the workspace and running (or replaying) the analysis. Workspace edits a step replaces are kept and can be restored.
  1. *Beat the reference*: AES MixColumns beside the editable textbook circuit (15 XORs, 4 xtimes); a quick search, Lean equivalence, native correctness and timing; structural savings are stated even when timing is inconclusive.
  2. *One wire goes wrong*: `xtime(x0 ⊕ x1)` becomes `xtime(x0 ⊕ x2)`; the reader predicts which output changes before the checked witness is revealed.
  3. *Perfect implementation, weak diffusion*: identity matrix and identity circuit; equivalence holds, MDS fails, the activity bound is not established by this method.
  4. *Prime field*: a BN254 width-3 shared-sum circuit; exponent 5 is a permutation, exponent 3 is not.
- **Workspace**: matrix editor (hex for GF(2⁸), decimal for BN254, arrow keys move between cells), row offsets, rounds, S-box (AES, imported table, or power map), the circuit editor with its wire diagram and text version, the computed matrix, JSON import and export, and the two result chains: *Design guarantees* and *Implementation correspondence*.

### Workspace tools

- **Presets.** A search box above the editors lists designs, matrices, S-boxes and circuits, grouped by kind, each with a scope note (`src/lib/library.ts`). GF(2⁸) presets use the AES polynomial 0x11B only: AES MixColumns, InvMixColumns, row-scaled AES, circulants that are MDS (`circ(01,01,04,09)`, `circ(01,02,03,04)`) and circulants that are not (`circ(02,01,01,01)`, `circ(01,02,04,06)`, the binary `circ(00,01,01,01)`), plus the identity as a negative control. BN254 presets are the Poseidon2 t = 3 external and internal matrices, the deliberately weak internal `[[2,1,1],[1,2,1],[1,1,2]]` (invertible, so it passes the internal-matrix check, yet `v = (0,1,−1)` never reaches the partial-round S-box), and the power maps x⁵, x⁷ and x³ (not a permutation). S-boxes include the AES table, the identity (a permutation with no nonlinearity) and a non-injective table. Circuits include the AES shared-sum (15 XOR, 4 xtime), AES term by term, a miswired shared-sum, and the BN254 external and internal shared sums. The chips on each preset (MDS, invertible, permutation, circuit matches) are browser previews, not proofs; `library.test.ts` recomputes every one with `lib/preview.ts`.
- **Paste and copy matrices.** Paste a whole matrix into any cell, or open **Paste matrix…** for a preview first. Accepted: whitespace, comma or semicolon separated hex grids, C and Rust array literals (`{{0x02, 0x03, …}}`, `[[0x02u8, …]]`, with or without a declaration), Python, NumPy and Sage lists (`[[2, 3, 1, 1], …]`, `matrix(F, [[F(2), …]])`, `matrix(F, 4, 4, [ …16 values… ])`) and LaTeX matrices. Numbers with `0x` are hex; bare numbers are hex in a plain grid and decimal inside code, and the preview says which reading it used and lets you switch. Cells are normalized when you leave them (`1` becomes `01`, `0x1b` becomes `1B`; in BN254 `-1` becomes p − 1). **Copy as** exports the matrix as JSON, a C array, a Rust array, a Sage matrix over GF(2)[x]/(x⁸ + x⁴ + x³ + x + 1) or GF(p), or a plain grid.
- **Undo and redo.** <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> and <kbd>Shift</kbd>+<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> (or <kbd>Ctrl</kbd>+<kbd>Y</kbd>) step through workspace edits, also from the toolbar. Typing in one cell is one step; pastes, presets, imports and generated circuits are one step each. Text areas keep the browser's own undo.
- **Saved in this browser.** The design, circuit and target are saved to `localStorage` (`cryptificate.workspace.v1`) 300 ms after each change and restored on the next visit; saved data that does not parse is ignored. When a story step loads its own inputs over your edits, the edits are kept and the workspace offers **Restore my edits**.
- **Share links.** **Copy share link** encodes the canonical request (design, circuit and target) in the URL hash: `#/workspace?d=<token>`, compressed with deflate-raw and base64url where the browser supports it. Opening a link validates the request like an import and loads it as one undo step; a damaged link leaves the workspace unchanged and says why. The hash never reaches a server, so links work on the static replay build too.
- **Computed matrix.** Below the circuit, the matrix the circuit computes is shown beside its target (the design matrix, or the BN254 external or internal matrix), recomputed on every edit, with differing coefficients marked ◆ and listed. **Generate circuit from matrix** writes a term-by-term straight-line program (products k·x_j, each computed once, xtime for 02, then additions): a correct baseline, not an optimized circuit. **Search for cheaper circuits** starts the quick experiment on it. The comparison is labelled *Unchecked preview*; only **Check** gives the Lean equivalence proof.
- **Experiments**: candidates with operation counts, equivalence and native correctness; timing verdict with the machine description; speedup intervals against the 1.02 threshold; raw samples, medians and interquartile ranges per workload; the search history. Every chart has a table view.

Editing any input marks existing results as *from an earlier version*: the page compares a SHA-256 digest of the canonical JSON of the current inputs (normalized design, circuit without its display name, target) with the inputs of the result. In replay mode an edited design becomes an *unverified preview*: unchecked browser diagnostics with an export button, never a proof status.

Execution outcomes (failed, timeout, cancelled, invalid) are shown apart from mathematical status. A timeout is never shown as a refutation.

## Data

Live mode uses the service API: `GET /api/capabilities`, `POST /api/analyses`, `POST /api/experiments`, `GET /api/jobs/:id` (polled), `POST /api/jobs/:id/stop` and `GET /api/jobs/:id/bundle`. Types come from `packages/schema`.

Replay mode reads `public/recorded/index.json`:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "wrong-wire",
      "kind": "analysis",
      "title": "One wire goes wrong",
      "story": 2,
      "report": "wrong-wire/report.json",
      "bundle": "wrong-wire/bundle.tar.gz"
    }
  ]
}
```

Paths are relative to `recorded/`. A report is shown when its `inputs` equal the workspace inputs by the digest above, so any genuine report produced by the service can be added without further metadata. Recorded files must not contain wall-clock timestamps.

## Brand

`scripts/copy-brand.mjs` runs before `dev` and `build` and copies `assets/brand/logo.svg` and `assets/brand/mark.svg` into `public/brand/` when they exist; otherwise the header shows a text wordmark.

## Accessibility

Everything works from the keyboard. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, <kbd>W</kbd> and <kbd>E</kbd> open the story, the workspace and the experiments; in the workspace <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> undoes and <kbd>Shift</kbd>+<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> redoes. The presets search is a combobox (arrow keys, <kbd>Enter</kbd>, <kbd>Escape</kbd>) and **Copy as** is a menu with arrow-key navigation. Statuses always pair an icon with text, diagrams and charts have text or table equivalents, motion follows `prefers-reduced-motion`, and decorative motion pauses while a job is timing native code. Light and dark themes follow the system setting or the toggle in the header.
