
/-- Claim `activity.partial`: the candidate's partial rounds cannot be passed by a nonzero
difference without an active S-box. Each partial round adds its round constants, applies
`x ↦ x ^ candExponent` at the positions of `candMask` and multiplies by `candInternal`. The
statement says that there are at least as many partial rounds as the window length, and that every
window of that many consecutive partial rounds is charged: for every choice of round constants,
every window inside the partial rounds and every two distinct states entering it, some S-box of
the window receives different inputs in the two runs. A bypass is therefore impossible
(`Hades.Design.not_bypass_of_windowActive`). The certificate is observability: the kernel computes
the rows of `candInternal ^ j` at the masked positions, for `j` below the window length, by
packed vector-matrix products, takes the rows listed in `witnessObsRows`, and checks that
`witnessObsInverse` is their inverse modulo `candModulus` (`Hades.observable_of_checkObsP`), so
they have full rank. -/
theorem partial_active :
    {{OBS_LENGTH}} ≤ candPartialRounds ∧
      Hades.Design.WindowActive
        { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask {{OBS_LENGTH}} :=
  ⟨by decide,
    Hades.Design.windowActive_of_observable
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      (Hades.observable_of_checkObsP (S := {{PACK_BITS}}) (sel := witnessObsRows)
        (Wr := witnessObsInverse) (by decide +kernel))⟩
