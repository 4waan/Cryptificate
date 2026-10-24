/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import WideTrail.Algebra.GF256
import WideTrail.Algebra.MDS
import WideTrail.Algebra.AESSbox
import WideTrail.Algebra.AESMix

/-!
# WideTrail modules used by the refinement

The refinement relates the extracted Rust to WideTrail's specification of `GF(2⁸)`
(`WideTrail.Algebra.GF256`), and the downstream connection to the design-level results goes
through the MDS branch-number bound (`WideTrail.Algebra.MDS`), the AES S-box
(`WideTrail.Algebra.AESSbox`) and the AES `MixColumns` instance (`WideTrail.Algebra.AESMix`).
Importing them here makes `lake build` check that these modules, taken unchanged from the
pinned WideTrail revision, compile against the Lean and Mathlib versions of this package.
-/
