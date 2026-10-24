import Cryptificate

/-!
# Example: the audit line needs the kernel's approval

`#cryptificate_audit` re-checks the audited theorem, and every declaration of the same file it
depends on, with the kernel before it prints anything. The option `debug.skipKernelTC` lets a
file add declarations the kernel never looked at, and `decide +kernel` leaves all of its work to
the kernel; together they produce a false theorem whose axiom list is empty. Below, such a
theorem is rejected with the kernel's own error, a genuine one is reported, and a definition is
refused because only theorems are audited.
-/

set_option debug.skipKernelTC true in
theorem unchecked : 2 + 2 = 5 := by decide +kernel

/--
error: #cryptificate_audit: the kernel rejects 'unchecked._proof_1_1': (kernel) application type mismatch
  id (Eq.refl true)
argument has type
  true = true
but function has type
  decide (2 + 2 = 5) = true → decide (2 + 2 = 5) = true
-/
#guard_msgs in
#cryptificate_audit unchecked

theorem checked : 2 + 2 = 4 := by decide +kernel

/-- info: CRYPTIFICATE_AUDIT {"theorem":"checked","type":"2 + 2 = 4","axioms":[]} -/
#guard_msgs in
#cryptificate_audit checked

def answer : Nat := 42

/-- error: #cryptificate_audit: 'answer' is not a theorem -/
#guard_msgs in
#cryptificate_audit answer
