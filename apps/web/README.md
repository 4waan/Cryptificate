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

- **Guided story** ("Save operations. Keep the promise."): four steps, each loading real inputs into the workspace and running (or replaying) the analysis.
  1. *Beat the reference*: AES MixColumns beside the editable textbook circuit (15 XORs, 4 xtimes); a quick search, Lean equivalence, native correctness and timing; structural savings are stated even when timing is inconclusive.
  2. *One wire goes wrong*: `xtime(x0 ⊕ x1)` becomes `xtime(x0 ⊕ x2)`; the reader predicts which output changes before the checked witness is revealed.
  3. *Perfect implementation, weak diffusion*: identity matrix and identity circuit; equivalence holds, MDS fails, the activity bound is not established by this method.
  4. *Prime field*: a BN254 width-3 shared-sum circuit; exponent 5 is a permutation, exponent 3 is not.
- **Workspace**: matrix editor (hex for GF(2⁸), decimal for BN254, arrow keys move between cells), row offsets, rounds, S-box (AES, imported table, or power map), the circuit editor with its wire diagram and text version, JSON import and export, and the two result chains: *Design guarantees* and *Implementation correspondence*.
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

Everything works from the keyboard. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, <kbd>W</kbd> and <kbd>E</kbd> open the story, the workspace and the experiments. Statuses always pair an icon with text, diagrams and charts have text or table equivalents, motion follows `prefers-reduced-motion`, and decorative motion pauses while a job is timing native code. Light and dark themes follow the system setting or the toggle in the header.
