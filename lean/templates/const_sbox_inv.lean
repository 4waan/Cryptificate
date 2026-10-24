
/-- The inverse of `candSboxTable`, supplied with the certificate rather than with the
candidate; `sbox_bijective` checks it on every byte. -/
def candSboxInv : GF256 → GF256 :=
  tableSbox byteTable![{{SBOX_INV}}]

#eval echoSboxEntries "candSboxInv" candSboxInv
