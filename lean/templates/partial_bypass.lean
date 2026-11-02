
/-- Claim `activity.partial`, refuted: a nonzero difference passes all `candPartialRounds` partial
rounds with no active S-box. For every choice of round constants and every state `z` entering the
first partial round, the runs from `z` and from `z + v` feed equal inputs to every S-box at the
positions of `candMask` in every partial round. The witness `v` is `witnessBypass`: it and
`witnessBypassSpan` are zero on every masked position and `candInternal` maps their span into
itself with the coefficients `witnessBypassCoeffs` (`Hades.powers_zero_of_invariant2`), so every
power of `candInternal` keeps `v` at zero on the mask (`Hades.Design.bypass_of_powers`). -/
theorem partial_bypass :
    ∃ v : Fin 3 → Poseidon2.BN254.F, v ≠ 0 ∧
      Hades.Design.Bypass
        { external := candExternal, internal := candInternal, exponent := candExponent,
          fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask v :=
  ⟨witnessBypass, by decide,
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (fun j _ => Hades.powers_zero_of_invariant2 candInternal candMask witnessBypass
        witnessBypassSpan (witnessBypassCoeffs 0) (witnessBypassCoeffs 1) (witnessBypassCoeffs 2)
        (witnessBypassCoeffs 3) (by decide) (by decide) (by decide) (by decide) j)⟩
