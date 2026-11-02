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

`SchemaRegistry` validates any document against the JSON Schemas in `schemas/` without a
third-party dependency. It implements the draft 2020-12 keywords those schemas and
`schemas/openapi.json` use (`$ref` across files, `type`, `enum`, `const`, object, array, number
and string bounds, `allOf`/`anyOf`/`oneOf`/`not`, `if`/`then`/`else`) and throws
`UnsupportedSchemaError` on any other keyword rather than ignoring it. `format` is an annotation
only. `assertSupported` walks a whole schema to check that every keyword is implemented and
every reference resolves.

```ts
import { SchemaRegistry } from '@cryptificate/schema';

const base = 'https://github.com/4waan/Cryptificate/schemas/';
const reg = new SchemaRegistry();
for (const file of files) reg.add(base + file, JSON.parse(read(file)));
reg.validate(base + 'job.schema.json', job); // [] when valid, else [{ path, schemaPath, message }]
```

`npm run build` compiles to `dist/`; `npm test` runs the validator and schema tests.
