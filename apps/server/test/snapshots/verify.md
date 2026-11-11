## Cryptificate verify

**Result: error** (policy `--fail-on refuted`, exit 2)

### `examples/bundles/identity/identity.tar.gz`

analysis `9421acab267bd47776b29d832356e9f9`; inputs recorded `sha256:e55f3e07cf131691b0cd8aca16972ba3ea957bb50d043f3bd76de552b5171616`, recomputed `sha256:e55f3e07cf131691b0cd8aca16972ba3ea957bb50d043f3bd76de552b5171616`.

| Subject | Claim | Recorded | Recomputed | Result |
| --- | --- | --- | --- | --- |
| design | `matrix.mds` | refuted | refuted | match (fails policy) |
| design | `offsets.dispersion` | proved | proved | match |
| design | `activity.bound` | proved | not_established | **mismatch** |
| implementation | `native.correctness` | proved | - | not re-checked |
| implementation | `native.timing` | not_established | - | historical |

- Timings in the bundle are historical and were not re-measured.

Some claims do not match or could not be re-checked.

### `missing.tar.gz`

Error: cannot verify missing.tar.gz: ENOENT
