
/-- Claim `activity.partial`, refuted for a design with one or two partial rounds: there is at
least one partial round (with none, every difference would pass them vacuously), and a nonzero
difference passes them all with no active S-box. For every choice of round constants and every
state `z` entering the first partial round, the runs from `z` and from `z + v` feed equal inputs
to every S-box at the positions of `candMask` in every partial round. The witness `v` is
`witnessBypass`; with at most two partial rounds the kernel checks `v` and `candInternal *ᵥ v`
on the mask directly (`Hades.powers_zero_of_short`). -/
theorem partial_bypass_short :
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
      (Hades.powers_zero_of_short candInternal candMask witnessBypass candPartialRounds
        (by decide) (by decide) (by decide))⟩
