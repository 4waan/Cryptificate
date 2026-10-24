
/-- The candidate's S-box is the AES S-box of FIPS 197, as WideTrail defines it: inversion in
`GF(2⁸)` followed by the affine map with constant `63`. -/
def candSboxTable : GF256 → GF256 := AES.sbox

#eval echoSboxAes "candSboxTable"
