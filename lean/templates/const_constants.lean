
/-- The candidate's round constants as submitted, one row of `{{WIDTH}}` numerals per round, the
rows concatenated in round order (row `r` holds positions `{{WIDTH}}·r` to `{{WIDTH}}·r + {{WIDTH}} - 1`).
Only claim `constants.grain` uses them: every other claim holds for all round constants. -/
def candConstants : List ℕ := [{{CONSTANTS}}]

#eval Grain.echoConstants "candConstants" {{WIDTH}} candConstants
