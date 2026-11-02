
/-- Claim `activity.partial`, refuted: the design has at least one partial round, and a nonzero
difference passes all `candPartialRounds` of them with no active S-box. (With no partial rounds
every difference would pass them vacuously; the first conjunct rules that reading out.) For every choice of round constants and every state `z` entering the
first partial round, the runs from `z` and from `z + v` feed equal inputs to every S-box at the
positions of `candMask` in every partial round. The witness `v` is `witnessBypass`: it and
`witnessBypassSpan` are zero on every masked position and `candInternal` maps their span into
itself with the coefficients `witnessBypassCoeffs` (`Hades.powers_zero_of_invariant2`), so every
power of `candInternal` keeps `v` at zero on the mask (`Hades.Design.bypass_of_powers`). -/
theorem partial_bypass :
    0 < candPartialRounds ∧
      ∃ v : Fin 3 → Poseidon2.BN254.F, v ≠ 0 ∧
        Hades.Design.Bypass
          { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
          candMask v :=
  ⟨by decide, witnessBypass, by decide,
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (fun j _ => Hades.powers_zero_of_invariant2 candInternal candMask witnessBypass
        witnessBypassSpan (witnessBypassCoeffs 0) (witnessBypassCoeffs 1) (witnessBypassCoeffs 2)
        (witnessBypassCoeffs 3) (by decide) (by decide) (by decide) (by decide) j)⟩
