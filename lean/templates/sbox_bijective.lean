
/-- Claim `sbox.bijective`: `candSboxInv` undoes `candSboxTable` on all `256` bytes, checked by
the kernel byte by byte, so `candSboxTable` is injective and hence a bijection of `GF(2⁸)`. -/
theorem sbox_bijective : Function.Bijective candSboxTable :=
  bijective_of_leftInverse (g := candSboxInv) (by decide +kernel)
