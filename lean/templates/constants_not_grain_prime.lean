
/-- Claim `constants.grain`, refuted: the Poseidon2 reference procedure for modulus
`candModulus`, width `{{WIDTH}}`, `candFullRounds` full and `candPartialRounds` partial rounds
runs to completion and generates `{{EXPECTED}}` at position `{{INDEX}}` of the flat list (round
`{{INDEX}} / {{WIDTH}}`, position `{{INDEX}} % {{WIDTH}}`), and the submitted constants have
something else there. So `candConstants` is not the generated list (`Grain.ne_of_constantAt`). -/
theorem constants_not_grain :
    Grain.constantAt candModulus {{WIDTH}} candFullRounds candPartialRounds {{INDEX}} =
        some {{EXPECTED}} ∧
      candConstants[{{INDEX}}]? ≠ some {{EXPECTED}} :=
  ⟨by decide +kernel, by decide +kernel⟩
