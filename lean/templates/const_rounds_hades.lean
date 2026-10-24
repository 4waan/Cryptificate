
/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := {{FULL_ROUNDS}}

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := {{PARTIAL_ROUNDS}}

#eval Audit.echoInput "candPartialRounds" candPartialRounds
