
/-- The candidate's row offsets: `out[r][c] = in[r][(c + candOffsets r) mod 4]`, row `r`
rotated left by `candOffsets r`. -/
def candOffsets : Fin 4 → Fin 4 :=
  offsets4 {{OFFSETS}}

#eval Audit.echoInput "candOffsets" candOffsets
