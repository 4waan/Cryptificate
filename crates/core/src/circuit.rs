//! Evaluation and static analysis of linear programs.
//!
//! All functions here assume the program passed
//! [`Program::check_at`](crate::program::Program::check_at); they panic on
//! dangling register references or a wrong input length.

use serde::{Deserialize, Serialize};

use crate::canonical;
use crate::design::AnyMatrix;
use crate::field::{Field, FieldKind};
use crate::linalg::{basis, mat_vec, Matrix};
use crate::program::{AnyProgram, Instruction, Program};

/// Operation counts.
///
/// `add + mul` is the number of instructions. `xtime` counts the subset of
/// `mul` instructions whose constant is `02` over GF(2^8) (multiplication by
/// x, a shift and conditional XOR); it is always 0 over BN254.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct OpCounts {
    pub add: usize,
    pub mul: usize,
    #[serde(default)]
    pub xtime: usize,
}

/// Static cost measures of a program.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CircuitStats {
    pub ops: OpCounts,
    /// Longest chain of instructions from an input to an output
    /// (inputs have depth 0; every instruction adds 1).
    pub depth: usize,
    /// Largest number of temporaries (instruction results) that, after some
    /// instruction executes in program order, are still needed by a later
    /// instruction or as an output.
    pub temps: usize,
}

/// The first coefficient (row-major) where a program differs from a target matrix.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct CoefficientMismatch<F> {
    pub row: usize,
    pub col: usize,
    pub expected: F,
    pub actual: F,
}

/// A basis input on which a program and a target matrix disagree.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Distinguisher<F> {
    pub input: Vec<F>,
    pub expected: Vec<F>,
    pub actual: Vec<F>,
    /// Output coordinates where `expected` and `actual` differ.
    pub differing: Vec<usize>,
}

impl<F: Field> Program<F> {
    /// Values of every register (inputs first) on the given input.
    pub fn evaluate_registers(&self, inputs: &[F]) -> Vec<F> {
        assert_eq!(
            inputs.len(),
            self.width,
            "input length must equal the program width"
        );
        let mut regs = Vec::with_capacity(self.register_count());
        regs.extend_from_slice(inputs);
        for ins in &self.instructions {
            let v = match *ins {
                Instruction::Add { a, b } => regs[a] + regs[b],
                Instruction::Mul { k, a } => k * regs[a],
            };
            regs.push(v);
        }
        regs
    }

    /// The program's output on the given input.
    pub fn evaluate(&self, inputs: &[F]) -> Vec<F> {
        let regs = self.evaluate_registers(inputs);
        self.outputs.iter().map(|&r| regs[r]).collect()
    }

    /// For every register, its coefficients over the inputs: register `r`
    /// holds `sum_j forms[r][j] * x_j`.
    pub fn register_forms(&self) -> Vec<Vec<F>> {
        let w = self.width;
        let mut forms: Vec<Vec<F>> = (0..w).map(|i| basis(w, i)).collect();
        for ins in &self.instructions {
            let f = match *ins {
                Instruction::Add { a, b } => forms[a]
                    .iter()
                    .zip(&forms[b])
                    .map(|(&x, &y)| x + y)
                    .collect(),
                Instruction::Mul { k, a } => forms[a].iter().map(|&x| k * x).collect(),
            };
            forms.push(f);
        }
        forms
    }

    /// The matrix the program computes: row `j` is the form of `outputs[j]`.
    pub fn coefficient_matrix(&self) -> Matrix<F> {
        let forms = self.register_forms();
        self.outputs.iter().map(|&r| forms[r].clone()).collect()
    }

    /// The first row-major coefficient differing from `target`, if any.
    pub fn first_mismatch(&self, target: &[Vec<F>]) -> Option<CoefficientMismatch<F>> {
        let m = self.coefficient_matrix();
        for (row, (got, want)) in m.iter().zip(target).enumerate() {
            for (col, (&actual, &expected)) in got.iter().zip(want).enumerate() {
                if actual != expected {
                    return Some(CoefficientMismatch {
                        row,
                        col,
                        expected,
                        actual,
                    });
                }
            }
        }
        None
    }

    /// The basis input selecting the column of [`Self::first_mismatch`],
    /// with both outputs, or `None` if the program computes `target`.
    pub fn distinguishing_input(&self, target: &[Vec<F>]) -> Option<Distinguisher<F>> {
        let mismatch = self.first_mismatch(target)?;
        let input = basis(self.width, mismatch.col);
        let expected = mat_vec(target, &input);
        let actual = self.evaluate(&input);
        let differing = expected
            .iter()
            .zip(&actual)
            .enumerate()
            .filter(|(_, (e, a))| e != a)
            .map(|(i, _)| i)
            .collect();
        Some(Distinguisher {
            input,
            expected,
            actual,
            differing,
        })
    }

    /// Operation counts (see [`OpCounts`]).
    pub fn op_counts(&self) -> OpCounts {
        let two = F::from_u64(2);
        let mut ops = OpCounts::default();
        for ins in &self.instructions {
            match *ins {
                Instruction::Add { .. } => ops.add += 1,
                Instruction::Mul { k, .. } => {
                    ops.mul += 1;
                    if F::KIND == FieldKind::Gf256 && k == two {
                        ops.xtime += 1;
                    }
                }
            }
        }
        ops
    }

    /// Depth of every register (inputs 0).
    pub fn register_depths(&self) -> Vec<usize> {
        let mut depth = vec![0usize; self.width];
        for ins in &self.instructions {
            let d = ins.operands().map(|r| depth[r]).max().unwrap_or(0) + 1;
            depth.push(d);
        }
        depth
    }

    /// Maximum depth over the outputs.
    pub fn depth(&self) -> usize {
        let depth = self.register_depths();
        self.outputs.iter().map(|&r| depth[r]).max().unwrap_or(0)
    }

    /// See [`CircuitStats::temps`].
    pub fn max_live_temporaries(&self) -> usize {
        let w = self.width;
        let n = self.instructions.len();
        // last_use[t] = index of the last instruction reading temporary t,
        // or n if t is an output (needed after the last instruction).
        let mut last_use: Vec<Option<usize>> = vec![None; n];
        for (i, ins) in self.instructions.iter().enumerate() {
            for r in ins.operands() {
                if r >= w {
                    last_use[r - w] = Some(i);
                }
            }
        }
        for &r in &self.outputs {
            if r >= w {
                last_use[r - w] = Some(n);
            }
        }
        let mut live = 0usize;
        let mut max_live = 0usize;
        // dying[i] = number of temporaries whose last use is instruction i.
        let mut dying = vec![0usize; n + 1];
        for lu in last_use.iter().flatten() {
            dying[*lu] += 1;
        }
        for (i, lu) in last_use.iter().enumerate() {
            live -= dying[i];
            if let Some(lu) = lu {
                if *lu > i {
                    live += 1;
                }
            }
            max_live = max_live.max(live);
        }
        max_live
    }

    /// Operation counts, depth and live temporaries together.
    pub fn stats(&self) -> CircuitStats {
        CircuitStats {
            ops: self.op_counts(),
            depth: self.depth(),
            temps: self.max_live_temporaries(),
        }
    }

    /// `"sha256:<hex>"` identifying the circuit: field, width, instructions
    /// (with `add` operands in ascending order, since addition commutes) and
    /// outputs. The name does not contribute.
    pub fn identity_hash(&self) -> String {
        let instructions: Vec<serde_json::Value> = self
            .instructions
            .iter()
            .map(|ins| match *ins {
                Instruction::Add { a, b } => {
                    serde_json::json!({"op": "add", "a": a.min(b), "b": a.max(b)})
                }
                Instruction::Mul { k, a } => {
                    serde_json::json!({"op": "mul", "k": k.encode(), "a": a})
                }
            })
            .collect();
        canonical::digest_of(&serde_json::json!({
            "field": F::KIND,
            "width": self.width,
            "instructions": instructions,
            "outputs": self.outputs,
        }))
    }
}

impl AnyProgram {
    pub fn stats(&self) -> CircuitStats {
        match self {
            AnyProgram::Gf256(p) => p.stats(),
            AnyProgram::Bn254(p) => p.stats(),
        }
    }

    pub fn identity_hash(&self) -> String {
        match self {
            AnyProgram::Gf256(p) => p.identity_hash(),
            AnyProgram::Bn254(p) => p.identity_hash(),
        }
    }

    pub fn coefficient_matrix(&self) -> AnyMatrix {
        match self {
            AnyProgram::Gf256(p) => AnyMatrix::Gf256(p.coefficient_matrix()),
            AnyProgram::Bn254(p) => AnyMatrix::Bn254(p.coefficient_matrix()),
        }
    }
}
