
/-- Claim `activity.partial`, refuted: the design has at least one partial round, and a nonzero
difference passes all `candPartialRounds` of them with no active S-box. (With no partial rounds
every difference would pass them vacuously; the first conjunct rules that reading out.) For every
choice of round constants and every state `z` entering the first partial round, the runs from `z`
and from `z + v` feed equal inputs to every S-box at the positions of `candMask` in every partial
round. The witness `v` is `witnessBypass`, the first vector of `witnessBypassBasis`: the kernel
checks on the numerals that every basis vector is zero on every masked position and that
`candInternal` maps their span into itself with the coefficients `witnessBypassCoeffs`
(`Hades.invariant_of_check`), so every power of `candInternal` keeps `v` at zero on the mask
(`Hades.powers_zero_of_invariant`, `Hades.Design.bypass_of_powers`). -/
theorem partial_bypass :
    0 < candPartialRounds ∧
      ∃ v : Fin {{WIDTH}} → ZMod candModulus, v ≠ 0 ∧
        Hades.Design.Bypass
          { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
          candMask v := by
  obtain ⟨hM, hz⟩ : (∀ k, candInternal.mulVec (witnessBypassBasis k) =
      ∑ l, witnessBypassCoeffs k l • witnessBypassBasis l) ∧
      ∀ k, ∀ i ∈ candMask, witnessBypassBasis k i = 0 :=
    Hades.invariant_of_check (by decide +kernel)
  exact ⟨by decide, witnessBypass, NatMatrix.pfVecs_zero_ne_zero_of_check (by decide +kernel),
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (fun j _ => Hades.powers_zero_of_invariant candInternal candMask witnessBypassBasis
        witnessBypassCoeffs hM hz 0 j)⟩
