
/-- Claim `activity.total`: run the candidate permutation on two distinct inputs, with the
partial-round S-boxes at the positions of `candMask`. For every choice of round constants, the
full rounds and the partial rounds together contain at least the full-round bound of
`hades_activity` plus one S-box for each of the disjoint windows of consecutive partial rounds
that `partial_active` charges, here written `candPartialRounds / L` with `L` the window length.
Full rounds count every S-box, partial rounds the masked ones, so the two counts together are
every active S-box of the permutation. Uses `external_mds`, `internal_invertible`,
`power_bijective` and `partial_active` from this file. -/
theorem hades_total_activity :
    ∀ (constants : ℕ → Fin 3 → Poseidon2.BN254.F) (x y : Fin 3 → Poseidon2.BN254.F), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 4
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2 + candPartialRounds / {{OBS_LENGTH}}
          ≤ Hades.Design.outerActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              candMask constants x y
            + Hades.Design.partialActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              candMask constants x y :=
  -- The design is passed explicitly, as in `hades_activity`.
  fun constants _ _ hxy =>
    Hades.Design.total_activity
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      external_mds internal_invertible power_bijective partial_active.2 constants hxy
