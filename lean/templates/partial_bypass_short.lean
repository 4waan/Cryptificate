
/-- Claim `activity.partial`, refuted for a design with at most two partial rounds: a nonzero
difference passes them all with no active S-box. For every choice of round constants and every
state `z` entering the first partial round, the runs from `z` and from `z + v` feed equal inputs
to every S-box at the positions of `candMask` in every partial round. The witness `v` is
`witnessBypass`; with at most two partial rounds the kernel checks `v` and `candInternal *ᵥ v`
on the mask directly (`Hades.powers_zero_of_short`). -/
theorem partial_bypass_short :
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
      (Hades.powers_zero_of_short candInternal candMask witnessBypass candPartialRounds
        (by decide) (by decide) (by decide))⟩
