
/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 3 → Bool :=
  maskBits3 {{PARTIAL_MASK}}

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 3) :=
  Finset.univ.filter fun i => candPartialMask i = true
