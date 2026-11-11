
/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin {{WIDTH}} → Bool :=
  maskBits {{WIDTH}} [{{MASK_ENTRIES}}]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin {{WIDTH}}) :=
  Finset.univ.filter fun i => candPartialMask i = true
