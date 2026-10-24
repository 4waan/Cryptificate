
/-- The candidate's `4 × 4` mixing matrix over `GF(2⁸)`, row-major as submitted. -/
def candMatrix : Matrix (Fin 4) (Fin 4) GF256 :=
  gfMat4 {{MATRIX}}

#eval Audit.echoInput "candMatrix" candMatrix
