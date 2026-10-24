
/-- The candidate's S-box: entry `x` of the submitted table is the image of the byte `x`. -/
def candSboxTable : GF256 → GF256 :=
  tableSbox byteTable![{{SBOX_TABLE}}]

#eval echoSboxTable "candSboxTable" candSboxTable
