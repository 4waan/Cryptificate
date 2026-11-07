import Cryptificate.Grain.Generator
import Cryptificate.Grain.Bitwise
import Cryptificate.Grain.Vectors
import Cryptificate.Grain.BN254
import Cryptificate.Grain.Echo
import Cryptificate.Grain.Axioms

/-!
# Round constants from the Grain LFSR

Claim `constants.grain` says that a design's round constants are exactly those the Poseidon2
reference procedure generates for its field, width and round numbers. It is a statement about
provenance, not about security: it says where the constants come from, nothing about how good
they are.

* `Grain.Generator`: the procedure (seed, 160 warm-up clocks, self-shrinking generator, rejection
  sampling below `p`, Poseidon2 layout), transcribed from the reference scripts and written for
  kernel evaluation, with the sources pinned by commit.
* `Grain.Bitwise`: a clock-by-clock transcription, and tests that both agree.
* `Grain.Vectors`: tests against constants published by HorizenLabs/poseidon2 and Plonky3.
* `Grain.BN254`: the kernel reproduces WideTrail's pinned BN254 constants
  (`Grain.bn254_reference`).
* `Grain.Echo`: the echo of submitted constants.

A certificate proves `Grain.poseidon2Constants p t R_F R_P = some candConstants` by kernel
evaluation, or refutes it with the first position `i` where the submitted list differs:
`Grain.constantAt p t R_F R_P i = some e` and `candConstants[i]? ≠ some e`
(`Grain.ne_of_constantAt`). The trusted part is the transcription: that `poseidon2Constants` is
the reference procedure. The library tests it as described above; it is not derived from a
formal specification of the scripts.
-/
