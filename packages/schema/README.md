# @cryptificate/schema

TypeScript types for the public JSON documents (designs, programs, requests, claims, witnesses,
reports, jobs, capabilities), the exact evidence labels and status vocabularies, and shape
validators for requests. The JSON Schemas live in `schemas/` at the repository root.

```ts
import { validateAnalysisRequest, EVIDENCE_LABELS, type AnalysisReport } from '@cryptificate/schema';

const r = validateAnalysisRequest(body);
if (!r.ok) console.log(r.errors); // [{ path: '/design/matrix/0/1', code, message }]
```

Field elements are strings: GF(2^8) elements are two hex digits (`"1B"`), BN254 scalars are
canonical decimal strings below the modulus. The validators reject numbers in their place,
unknown members, out-of-range offsets, rounds and exponents, forward register references and
programs longer than 256 instructions. Semantic checks (MDS, equivalence) belong to the engine.

`npm run build` compiles to `dist/`; `npm test` runs the validator and schema tests.
