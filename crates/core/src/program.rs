//! Linear programs (straight-line circuits) over a field.
//!
//! Registers `0..width` hold the inputs; instruction `i` defines register
//! `width + i`. `add` adds two registers (XOR over GF(2^8)); `mul` multiplies
//! a register by a public constant `k`. `outputs[j]` names the register that
//! holds output coordinate `j`.

use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::error::{pointer_push as at, ErrorCode, ValidationError};
use crate::field::{Bn254, Field, FieldKind, Gf256};
use crate::limits;

/// One instruction, tagged by `op`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase", deny_unknown_fields)]
pub enum Instruction<F> {
    /// `r[a] + r[b]`.
    Add { a: usize, b: usize },
    /// `k * r[a]`.
    Mul { k: F, a: usize },
}

impl<F> Instruction<F> {
    /// Registers read by this instruction.
    pub fn operands(&self) -> impl Iterator<Item = usize> {
        let (first, second) = match *self {
            Instruction::Add { a, b } => (a, Some(b)),
            Instruction::Mul { a, .. } => (a, None),
        };
        std::iter::once(first).chain(second)
    }
}

/// A linear program over the field `F`.
///
/// Serializes with a `"field"` member derived from `F`; deserialization
/// rejects a mismatching `field`.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Program<F> {
    pub width: usize,
    /// Optional display name; not part of the circuit identity.
    pub name: Option<String>,
    pub instructions: Vec<Instruction<F>>,
    pub outputs: Vec<usize>,
}

impl<F: Field> Program<F> {
    /// The field of this program.
    pub fn field(&self) -> FieldKind {
        F::KIND
    }

    /// Number of registers (inputs plus one per instruction).
    pub fn register_count(&self) -> usize {
        self.width + self.instructions.len()
    }

    /// Checks the structural rules: supported width, at most
    /// [`limits::MAX_INSTRUCTIONS`] instructions, every operand refers to an
    /// earlier register, `outputs.len() == width` and every output exists.
    /// `base` is the JSON pointer of the program.
    pub fn check_at(&self, base: &str) -> Result<(), ValidationError> {
        let w = self.width;
        if limits::width_status(F::KIND, w).is_none() {
            return Err(ValidationError::new(
                ErrorCode::UnsupportedWidth,
                at(base, "width"),
                format!("width {w} is not supported for field {}", F::KIND),
            ));
        }
        if let Some(name) = &self.name {
            check_name(name, &at(base, "name"))?;
        }
        let instrs_path = at(base, "instructions");
        if self.instructions.len() > limits::MAX_INSTRUCTIONS {
            return Err(ValidationError::new(
                ErrorCode::TooManyInstructions,
                instrs_path,
                format!(
                    "at most {} instructions are allowed, got {}",
                    limits::MAX_INSTRUCTIONS,
                    self.instructions.len()
                ),
            ));
        }
        for (i, ins) in self.instructions.iter().enumerate() {
            let defined = w + i;
            let ins_path = at(&instrs_path, i);
            let refs: &[(&str, usize)] = match *ins {
                Instruction::Add { a, b } => &[("a", a), ("b", b)],
                Instruction::Mul { a, .. } => &[("a", a)],
            };
            for &(member, r) in refs {
                if r >= defined {
                    return Err(ValidationError::new(
                        ErrorCode::BadReference,
                        at(&ins_path, member),
                        format!(
                            "instruction {i} defines register {defined} and may only read registers 0..{}, got {r}",
                            defined - 1
                        ),
                    ));
                }
            }
        }
        let outputs_path = at(base, "outputs");
        if self.outputs.len() != w {
            return Err(ValidationError::new(
                ErrorCode::BadDimension,
                outputs_path,
                format!("expected {w} outputs, got {}", self.outputs.len()),
            ));
        }
        let regs = self.register_count();
        for (j, &r) in self.outputs.iter().enumerate() {
            if r >= regs {
                return Err(ValidationError::new(
                    ErrorCode::BadReference,
                    at(&outputs_path, j),
                    format!(
                        "output {j} refers to register {r}, but only 0..{} exist",
                        regs - 1
                    ),
                ));
            }
        }
        Ok(())
    }
}

pub(crate) fn check_name(name: &str, path: &str) -> Result<(), ValidationError> {
    if name.chars().count() > limits::MAX_NAME_CHARS || name.chars().any(char::is_control) {
        return Err(ValidationError::new(
            ErrorCode::BadName,
            path,
            format!(
                "name must be at most {} characters without control characters",
                limits::MAX_NAME_CHARS
            ),
        ));
    }
    Ok(())
}

#[derive(Serialize)]
struct ProgramRef<'a, F> {
    field: FieldKind,
    width: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'a str>,
    instructions: &'a [Instruction<F>],
    outputs: &'a [usize],
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProgramOwned<F> {
    field: FieldKind,
    width: usize,
    #[serde(default)]
    name: Option<String>,
    instructions: Vec<Instruction<F>>,
    outputs: Vec<usize>,
}

impl<F: Field + Serialize> Serialize for Program<F> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        ProgramRef {
            field: F::KIND,
            width: self.width,
            name: self.name.as_deref(),
            instructions: &self.instructions,
            outputs: &self.outputs,
        }
        .serialize(serializer)
    }
}

impl<'de, F: Field + Deserialize<'de>> Deserialize<'de> for Program<F> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let p = ProgramOwned::<F>::deserialize(deserializer)?;
        if p.field != F::KIND {
            return Err(D::Error::custom(format!(
                "expected a {} program, got field {}",
                F::KIND,
                p.field
            )));
        }
        Ok(Program {
            width: p.width,
            name: p.name,
            instructions: p.instructions,
            outputs: p.outputs,
        })
    }
}

/// A program over either field, dispatched on its `"field"` member.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum AnyProgram {
    Gf256(Program<Gf256>),
    Bn254(Program<Bn254>),
}

impl AnyProgram {
    pub fn field(&self) -> FieldKind {
        match self {
            AnyProgram::Gf256(_) => FieldKind::Gf256,
            AnyProgram::Bn254(_) => FieldKind::Bn254,
        }
    }

    pub fn width(&self) -> usize {
        match self {
            AnyProgram::Gf256(p) => p.width,
            AnyProgram::Bn254(p) => p.width,
        }
    }

    pub fn name(&self) -> Option<&str> {
        match self {
            AnyProgram::Gf256(p) => p.name.as_deref(),
            AnyProgram::Bn254(p) => p.name.as_deref(),
        }
    }

    pub fn check_at(&self, base: &str) -> Result<(), ValidationError> {
        match self {
            AnyProgram::Gf256(p) => p.check_at(base),
            AnyProgram::Bn254(p) => p.check_at(base),
        }
    }
}

impl From<Program<Gf256>> for AnyProgram {
    fn from(p: Program<Gf256>) -> Self {
        AnyProgram::Gf256(p)
    }
}

impl From<Program<Bn254>> for AnyProgram {
    fn from(p: Program<Bn254>) -> Self {
        AnyProgram::Bn254(p)
    }
}

impl Serialize for AnyProgram {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            AnyProgram::Gf256(p) => p.serialize(serializer),
            AnyProgram::Bn254(p) => p.serialize(serializer),
        }
    }
}

impl<'de> Deserialize<'de> for AnyProgram {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let v = serde_json::Value::deserialize(deserializer)?;
        let field = v
            .get("field")
            .and_then(|f| f.as_str())
            .and_then(FieldKind::parse)
            .ok_or_else(|| D::Error::custom("program needs \"field\": \"gf256\" or \"bn254\""))?;
        match field {
            FieldKind::Gf256 => serde_json::from_value(v).map(AnyProgram::Gf256),
            FieldKind::Bn254 => serde_json::from_value(v).map(AnyProgram::Bn254),
        }
        .map_err(D::Error::custom)
    }
}
