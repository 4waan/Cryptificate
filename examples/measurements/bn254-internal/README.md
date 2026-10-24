# BN254 internal layer: search and native timing

Poseidon2's width-3 internal matrix over the BN254 scalar field,

```text
[[2,1,1],
 [1,2,1],
 [1,1,3]]
```

measured with the engine's own pipeline: `search` (quick profile, seed `c0ffee`), `codegen`, then `native` in `protocol` mode (seed `5eed`).

| | Operations | Native correctness | Speed-up over the direct implementation at 64 KiB |
|---|---|---|---|
| `c1`, found by the search | 6 additions | 8,278 of 8,278 cases | session 1: 7.24× (95% CI 7.08–7.34) · session 2: 7.15× (7.08–7.37) · session 3: 7.16× (7.05–7.24) |
| `baseline-direct` | 6 additions, 3 multiplications | 8,278 of 8,278 cases | reference |

Verdict: **locally confirmed**. The search replaces the multiplications by 2 and 3 with additions; the lowest lower bound of the 95% interval across both confirmation sessions is 7.05, far above the 1.02 threshold.

`search.json` is the full search history and shortlist; `native.json` holds the generated sources' hashes, the machine description, the seeds, every raw sample, the bootstrap intervals and the checksums. Reproduce with:

```sh
E=target/release/cryptificate-engine
echo '{"field":"bn254","width":3,"matrix":[["2","1","1"],["1","2","1"],["1","1","3"]],"profile":"quick","seed":"c0ffee"}' | $E search > search.json
jq '{field,width,matrix,programs:([.candidates[] as $c|select(.shortlist|index($c.id))|{id:$c.id,origin:"search",program:$c.program}]+[.baselines[]|{id,origin,program}])}' search.json | $E codegen > codegen.json
jq '{mode:"protocol",field,width,matrix:(input.matrix),codegen:.,seed:"5eed"}' codegen.json search.json | $E native > native.json
```
