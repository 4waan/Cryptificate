//! Lean certificates built from the templates in `lean/templates`.
//!
//! A template set is a directory of fragments: `<name>.lean` holds Lean text
//! with `{{PLACEHOLDER}}` tokens and `<name>.json` (the sidecar) says what the
//! fragment is: `header`, `constant`, `claim` or `footer`, which claim and
//! status it certifies, the theorem it declares and that theorem's expected
//! statement, its placeholders, and the fragments it needs first.
//!
//! [`emit`] chooses fragments from the unchecked [`Diagnostics`] (a proof
//! fragment where the diagnostics say a property holds, a refutation with
//! its witness where they say it fails), fills in the placeholders, and
//! concatenates `header`, the constants, the claims and `footer`, followed by
//! one `#cryptificate_audit` line per claim theorem. Lean then checks the
//! result; nothing in this module is trusted.
//!
//! The only text the engine contributes is placeholder values, and every
//! value is generated from validated numbers: numerals, `0xHH` bytes and
//! instruction lists such as `.add 0 1, .mul 0x02 4`. Values are restricted to
//! `[A-Za-z0-9_ ,.]` (as `lean/scripts/instantiate.py` does), so no value can
//! end a term or open a comment. A program's display name never reaches the
//! certificate.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::design::{CandidateDesign, SboxSpec, Target};
use crate::diagnostics::{
    AesLikeDiagnostics, ClaimPrediction, Diagnostics, HadesDiagnostics, ModelDiagnostics,
    ProgramAnalysis, SboxSource,
};
use crate::field::{Field, FieldKind};
use crate::limits;
use crate::program::{Instruction, Program};
use crate::report::{claim_ids, Status, Witness};
use crate::request::AnalysisRequest;
use crate::AnyProgram;

/// Namespace of every generated certificate.
pub const NAMESPACE: &str = "CryptificateJob";

/// Relative location of the templates inside a Lean package directory.
pub const TEMPLATES_SUBDIR: &str = "templates";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/// What a fragment contributes to a certificate.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FragmentKind {
    Header,
    Constant,
    Claim,
    Footer,
}

/// A fragment's sidecar (`<name>.json`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FragmentMeta {
    pub name: String,
    pub kind: FragmentKind,
    /// The claim id a claim fragment certifies.
    pub claim: Option<String>,
    /// `proved` or `refuted` for claim fragments.
    pub status: Option<Status>,
    /// Fully qualified theorem name, e.g. `CryptificateJob.matrix_mds`.
    pub theorem: Option<String>,
    /// The theorem's statement exactly as `#cryptificate_audit` prints it.
    pub expected_type: Option<String>,
    #[serde(default)]
    pub placeholders: Vec<String>,
    /// Fragments that must appear earlier in the certificate.
    #[serde(default)]
    pub requires: Vec<String>,
    /// `gf256`, `bn254` or `any`.
    pub field: String,
}

impl FragmentMeta {
    fn field_matches(&self, field: FieldKind) -> bool {
        self.field == "any" || self.field == field.as_str()
    }
}

/// One fragment: its sidecar and its Lean text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Fragment {
    pub meta: FragmentMeta,
    pub text: String,
}

/// A problem with the template directory itself.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum TemplateError {
    #[error("cannot read the template directory {path}: {reason}")]
    Unreadable { path: String, reason: String },
    #[error("template sidecar {name}.json is invalid: {reason}")]
    BadSidecar { name: String, reason: String },
    #[error("the template set has no {0} fragment")]
    Missing(&'static str),
}

/// All fragments of a template directory, by name.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TemplateSet {
    fragments: BTreeMap<String, Fragment>,
}

fn valid_fragment_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

impl TemplateSet {
    /// Loads every `<name>.lean` in `dir` that has a `<name>.json` sidecar.
    /// Other files (a manifest, notes, fragments without a sidecar) are
    /// ignored.
    pub fn load(dir: &Path) -> Result<Self, TemplateError> {
        let unreadable = |e: std::io::Error| TemplateError::Unreadable {
            path: dir.display().to_string(),
            reason: e.to_string(),
        };
        let mut set = TemplateSet::default();
        let mut paths: Vec<PathBuf> = fs::read_dir(dir)
            .map_err(unreadable)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|x| x == "lean"))
            .collect();
        paths.sort();
        for lean in paths {
            let Some(name) = lean.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let sidecar = lean.with_extension("json");
            if !valid_fragment_name(name) || !sidecar.is_file() {
                continue;
            }
            let name = name.to_string();
            let text = fs::read_to_string(&lean).map_err(unreadable)?;
            let meta_text = fs::read_to_string(&sidecar).map_err(unreadable)?;
            set.insert_parsed(&name, &meta_text, text)?;
        }
        Ok(set)
    }

    /// Adds a fragment from its sidecar text and Lean text (used by
    /// [`Self::load`], and by tests that build template sets in memory).
    pub fn insert_parsed(
        &mut self,
        name: &str,
        sidecar: &str,
        text: String,
    ) -> Result<(), TemplateError> {
        let bad = |reason: String| TemplateError::BadSidecar {
            name: name.to_string(),
            reason,
        };
        let meta: FragmentMeta = serde_json::from_str(sidecar).map_err(|e| bad(e.to_string()))?;
        if meta.name != name {
            return Err(bad(format!("its name is {:?}", meta.name)));
        }
        if meta.kind == FragmentKind::Claim
            && (meta.claim.is_none()
                || meta.status.is_none()
                || meta.theorem.is_none()
                || meta.expected_type.is_none())
        {
            return Err(bad(
                "a claim fragment needs claim, status, theorem and expectedType".into(),
            ));
        }
        self.fragments
            .insert(name.to_string(), Fragment { meta, text });
        Ok(())
    }

    pub fn get(&self, name: &str) -> Option<&Fragment> {
        self.fragments.get(name)
    }

    pub fn names(&self) -> impl Iterator<Item = &str> {
        self.fragments.keys().map(String::as_str)
    }

    pub fn is_empty(&self) -> bool {
        self.fragments.is_empty()
    }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/// One theorem the certificate must contain, as the checker will verify it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Expectation {
    pub claim: String,
    pub theorem: String,
    /// `proved` or `refuted`.
    pub status: Status,
    pub expected_type: String,
    /// The witness a refutation is built on.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub witness: Option<Witness>,
    pub fragment: String,
}

/// A claim of the model that the certificate does not cover, and why.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Skipped {
    pub claim: String,
    /// The diagnostic prediction for the claim.
    pub predicted: Status,
    pub reason: String,
}

/// The `emit-lean` document.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Emission {
    /// The complete certificate file.
    pub source: String,
    pub expect: Vec<Expectation>,
    /// For each `CRYPTIFICATE_INPUT` key the certificate prints, the value
    /// Lean must print, in the canonical request encoding.
    pub inputs_echo: Map<String, Value>,
    /// Fragment names in certificate order.
    pub fragments: Vec<String>,
    pub skipped: Vec<Skipped>,
    pub input_digest: String,
}

/// Failure to produce any certificate.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum EmitError {
    #[error(transparent)]
    Templates(#[from] TemplateError),
    #[error("fragment {fragment}: {reason}")]
    Fragment { fragment: String, reason: String },
}

// ---------------------------------------------------------------------------
// Placeholder values
// ---------------------------------------------------------------------------

/// The Lean literal of a field element: `0xHH` for a byte, the canonical
/// decimal for a BN254 element. Both are read by the `gf`/`bn` helpers.
pub fn lean_literal<F: Field>(x: &F) -> String {
    match F::KIND {
        FieldKind::Gf256 => format!("0x{}", x.encode()),
        FieldKind::Bn254 => x.encode(),
    }
}

/// Space-separated literals of a vector (or of a matrix, row-major).
pub fn lean_vector<F: Field>(v: &[F]) -> String {
    v.iter().map(lean_literal).collect::<Vec<_>>().join(" ")
}

fn lean_matrix<F: Field>(m: &[Vec<F>]) -> String {
    m.iter()
        .map(|r| lean_vector(r))
        .collect::<Vec<_>>()
        .join(" ")
}

fn numerals<T: fmt::Display>(xs: &[T]) -> String {
    xs.iter().map(T::to_string).collect::<Vec<_>>().join(" ")
}

/// The `{{INSTRS}}` value: `.add 0 1, .mul 0x02 4`.
pub fn lean_instructions<F: Field>(p: &Program<F>) -> String {
    p.instructions
        .iter()
        .map(|ins| match ins {
            Instruction::Add { a, b } => format!(".add {a} {b}"),
            Instruction::Mul { k, a } => format!(".mul {} {a}", lean_literal(k)),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn safe_value(v: &str) -> bool {
    v.bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b' ' | b',' | b'.'))
}

/// Which matrix a fragment speaks about, for placeholders shared between
/// the HADES matrices (`MATRIX3`, `VECTOR`).
#[derive(Clone, Copy, PartialEq, Eq)]
enum Role {
    External,
    Internal,
}

fn role(meta: &FragmentMeta, target: Target) -> Role {
    let claim = meta.claim.as_deref();
    if claim == Some(claim_ids::INTERNAL_INVERTIBLE) || meta.name.contains("internal") {
        Role::Internal
    } else if claim == Some(claim_ids::EXTERNAL_MDS) || meta.name.contains("external") {
        Role::External
    } else if target == Target::Internal {
        Role::Internal
    } else {
        Role::External
    }
}

/// Placeholder values for one request, looked up by name per fragment.
struct Values<'a> {
    req: &'a AnalysisRequest,
    diag: &'a Diagnostics,
}

impl Values<'_> {
    fn program_values<F: Field>(
        p: &Program<F>,
        a: Option<&ProgramAnalysis<F>>,
        name: &str,
    ) -> Option<String> {
        match name {
            "INSTRS" => Some(lean_instructions(p)),
            "OUTPUTS" => Some(numerals(&p.outputs)),
            "WITNESS_INPUT" => a?.distinguisher.as_ref().map(|d| lean_vector(&d.input)),
            "WITNESS_EXPECTED" => a?.distinguisher.as_ref().map(|d| lean_vector(&d.expected)),
            "WITNESS_ACTUAL" => a?.distinguisher.as_ref().map(|d| lean_vector(&d.actual)),
            _ => None,
        }
    }

    /// The value of placeholder `name` in the fragment described by `meta`.
    fn lookup(&self, name: &str, meta: &FragmentMeta) -> Result<String, String> {
        let v = self
            .value(name, meta)
            .ok_or_else(|| format!("no value for placeholder {{{{{name}}}}}"))?;
        if safe_value(&v) {
            Ok(v)
        } else {
            Err(format!(
                "the value of {{{{{name}}}}} is not a plain numeral list"
            ))
        }
    }

    fn value(&self, name: &str, meta: &FragmentMeta) -> Option<String> {
        if name == "WIDTH" {
            return Some(self.req.design.width().to_string());
        }
        match (&self.req.design, &self.diag.details, &self.req.program) {
            (CandidateDesign::AesLike(d), ModelDiagnostics::AesLike(a), program) => {
                let from_program = || match program {
                    Some(AnyProgram::Gf256(p)) => Self::program_values(p, a.program.as_ref(), name),
                    _ => None,
                };
                aes_value(d.rounds, &d.offsets, a, name).or_else(from_program)
            }
            (CandidateDesign::Hades(d), ModelDiagnostics::Hades(h), program) => {
                let from_program = || match program {
                    Some(AnyProgram::Bn254(p)) => Self::program_values(p, h.program.as_ref(), name),
                    _ => None,
                };
                hades_value(d, h, role(meta, self.req.target), name).or_else(from_program)
            }
            _ => None,
        }
    }
}

fn aes_value(rounds: u32, offsets: &[usize], a: &AesLikeDiagnostics, name: &str) -> Option<String> {
    let collision = a.sbox.collision;
    let offset_collision = a.offsets.collision;
    Some(match name {
        "MATRIX" => lean_matrix(&a.matrix.matrix),
        "OFFSETS" => numerals(offsets),
        "ROUNDS" => rounds.to_string(),
        "VECTOR" => lean_vector(&a.matrix.branch_witness.as_ref()?.input),
        "SBOX_TABLE" => lean_vector(&a.sbox.table),
        "SBOX_INV" => lean_vector(a.sbox.inverse.as_ref()?),
        "X1" => lean_literal(&collision?.x1),
        "X2" => lean_literal(&collision?.x2),
        "ROW_I" => offset_collision?.rows[0].to_string(),
        "ROW_J" => offset_collision?.rows[1].to_string(),
        _ => return None,
    })
}

fn hades_value(
    d: &crate::design::HadesDesign,
    h: &HadesDiagnostics,
    role: Role,
    name: &str,
) -> Option<String> {
    let (m, analysis) = match role {
        Role::External => (&d.external, &h.external),
        Role::Internal => (&d.internal, &h.internal),
    };
    Some(match name {
        "MATRIX3" => lean_matrix(m),
        "EXTERNAL" => lean_matrix(&d.external),
        "INTERNAL" => lean_matrix(&d.internal),
        // The low-weight witness of the matrix the fragment is about.
        "VECTOR" => lean_vector(&analysis.branch_witness.as_ref()?.input),
        // A nonzero vector the internal matrix sends to zero.
        "KERNEL_VECTOR" => lean_vector(h.internal.kernel_vector.as_ref()?),
        "EXPONENT" => h.power.exponent.to_string(),
        "INV_EXPONENT" => h.power.inverse_exponent.as_ref()?.to_str_radix(10),
        "K" => h.power.k?.to_string(),
        "OMEGA" => lean_literal(&h.power.collision?.omega),
        "FULL_ROUNDS" => d.full_rounds.to_string(),
        "PARTIAL_ROUNDS" => d.partial_rounds.to_string(),
        _ => return None,
    })
}

/// Replaces every `{{NAME}}` token (uppercase letters, digits, `_`) in
/// `text` using `lookup`, stopping at the first error.
fn substitute(
    text: &str,
    mut lookup: impl FnMut(&str) -> Result<String, String>,
) -> Result<String, String> {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("{{") {
        let Some(len) = rest[start + 2..].find("}}") else {
            break;
        };
        let name = &rest[start + 2..start + 2 + len];
        let is_token = !name.is_empty()
            && name
                .bytes()
                .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_');
        out.push_str(&rest[..start]);
        if is_token {
            out.push_str(&lookup(name)?);
        } else {
            out.push_str(&rest[start..start + 4 + len]);
        }
        rest = &rest[start + 4 + len..];
    }
    out.push_str(rest);
    Ok(out)
}

// ---------------------------------------------------------------------------
// Echoed inputs
// ---------------------------------------------------------------------------

/// The keys a fragment's `#eval …echo… "key" …` lines print.
fn echo_keys(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim_start)
        .filter(|l| l.starts_with("#eval") && l.contains("echo"))
        .filter_map(|l| {
            let start = l.find('"')? + 1;
            let len = l[start..].find('"')?;
            Some(l[start..start + len].to_string())
        })
        .collect()
}

fn program_echo<F: Field + Serialize>(p: &Program<F>) -> Value {
    // The certificate echoes the circuit without its display name.
    let mut v = serde_json::to_value(p).expect("programs serialize");
    if let Value::Object(o) = &mut v {
        o.remove("name");
    }
    v
}

/// The value Lean must print for an echo key, when the engine knows it.
fn echo_value(req: &AnalysisRequest, diag: &Diagnostics, key: &str) -> Option<Value> {
    match (&req.design, &diag.details) {
        (CandidateDesign::AesLike(d), ModelDiagnostics::AesLike(a)) => Some(match key {
            "candMatrix" => to(&d.matrix),
            "candOffsets" => json!(d.offsets),
            "candRounds" => json!(d.rounds),
            "candSboxTable" => match &d.sbox {
                SboxSpec::Table { .. } => json!({"kind": "table", "table": a.sbox.table}),
                _ => json!({"kind": "aes"}),
            },
            "candSboxInv" => to(a.sbox.inverse.as_ref()?),
            "candProgram" => match &req.program {
                Some(AnyProgram::Gf256(p)) => program_echo(p),
                _ => return None,
            },
            "witnessVector" => to(&a.matrix.branch_witness.as_ref()?.input),
            "witnessInput" => to(&a.program.as_ref()?.distinguisher.as_ref()?.input),
            "witnessExpected" => to(&a.program.as_ref()?.distinguisher.as_ref()?.expected),
            "witnessActual" => to(&a.program.as_ref()?.distinguisher.as_ref()?.actual),
            _ => return None,
        }),
        (CandidateDesign::Hades(d), ModelDiagnostics::Hades(h)) => Some(match key {
            "candExternal" => to(&d.external),
            "candInternal" => to(&d.internal),
            "candExponent" => json!(h.power.exponent),
            "candFullRounds" => json!(d.full_rounds),
            "candPartialRounds" => json!(d.partial_rounds),
            "candPartialMask" => json!(d.partial_mask),
            "witnessVector" => to(&h.external.branch_witness.as_ref()?.input),
            "witnessKernel" => to(h.internal.kernel_vector.as_ref()?),
            "witnessRoot" => to(&h.power.collision?.omega),
            "candProgram" => match &req.program {
                Some(AnyProgram::Bn254(p)) => program_echo(p),
                _ => return None,
            },
            "witnessInput" => to(&h.program.as_ref()?.distinguisher.as_ref()?.input),
            "witnessExpected" => to(&h.program.as_ref()?.distinguisher.as_ref()?.expected),
            "witnessActual" => to(&h.program.as_ref()?.distinguisher.as_ref()?.actual),
            _ => return None,
        }),
        _ => None,
    }
}

fn to(x: &impl Serialize) -> Value {
    serde_json::to_value(x).expect("value serializes")
}

// ---------------------------------------------------------------------------
// Fragment selection
// ---------------------------------------------------------------------------

/// The fragment names that certify a claim with the given outcome, in order
/// of preference.
fn fragment_candidates(
    req: &AnalysisRequest,
    diag: &Diagnostics,
    claim: &str,
    holds: bool,
) -> Vec<String> {
    let names: &[&str] = match (claim, holds) {
        (claim_ids::MATRIX_MDS, true) => &["matrix_mds"],
        (claim_ids::MATRIX_MDS, false) => &["matrix_not_mds"],
        (claim_ids::OFFSETS_DISPERSION, true) => &["offsets_optimal"],
        (claim_ids::OFFSETS_DISPERSION, false) => &["offsets_not_optimal"],
        (claim_ids::ACTIVITY_BOUND, _) => &["activity_bound"],
        (claim_ids::EXTERNAL_MDS, true) => &["external_mds"],
        (claim_ids::EXTERNAL_MDS, false) => &["external_not_mds"],
        (claim_ids::INTERNAL_INVERTIBLE, true) => &["internal_invertible"],
        (claim_ids::INTERNAL_INVERTIBLE, false) => &["internal_singular"],
        (claim_ids::ACTIVITY_OUTER, _) => &["hades_activity"],
        (claim_ids::SBOX_BIJECTIVE, holds) => {
            return match (&diag.details, holds) {
                (ModelDiagnostics::AesLike(a), true) if a.sbox.source == SboxSource::Aes => {
                    vec!["sbox_bijective_aes".into(), "sbox_bijective".into()]
                }
                (ModelDiagnostics::AesLike(_), true) => vec!["sbox_bijective".into()],
                (ModelDiagnostics::AesLike(_), false) => vec!["sbox_not_injective".into()],
                (ModelDiagnostics::Hades(_), true) => vec!["power_bijective".into()],
                (ModelDiagnostics::Hades(_), false) => vec!["power_not_injective".into()],
            };
        }
        (claim_ids::CIRCUIT_EQUIVALENCE, holds) => {
            let base = if holds {
                "circuit_equivalence"
            } else {
                "circuit_mismatch"
            };
            return match req.design.field() {
                FieldKind::Gf256 => vec![format!("{base}_gf256")],
                // The BN254 fragments are specific to the matrix they compare with.
                FieldKind::Bn254 => vec![format!("{base}_bn254_{}", req.target.as_str())],
            };
        }
        _ => &[],
    };
    names.iter().map(|s| s.to_string()).collect()
}

/// Constants included even when no selected claim needs them, so that the
/// certificate echoes every submitted value it can.
fn always_constants(req: &AnalysisRequest) -> Vec<&'static str> {
    match &req.design {
        CandidateDesign::AesLike(d) => {
            let sbox = match d.sbox {
                SboxSpec::Table { .. } => "const_sbox_table",
                _ => "const_sbox_aes",
            };
            let mut v = vec!["const_matrix_gf256", "const_offsets", "const_rounds", sbox];
            if req.program.is_some() {
                v.push("const_program_gf256");
            }
            v
        }
        CandidateDesign::Hades(_) => {
            let mut v = vec![
                "const_external_bn254",
                "const_internal_bn254",
                "const_exponent",
                "const_rounds_hades",
            ];
            if req.program.is_some() {
                v.push("const_program_bn254");
            }
            v
        }
    }
}

/// Why the templates cannot speak about this request at all, if so.
fn out_of_scope(req: &AnalysisRequest) -> Option<String> {
    match &req.design {
        CandidateDesign::AesLike(d) if d.width != limits::GF256_WIDTH => Some(format!(
            "the certificate templates cover width {} only; width {} is experimental",
            limits::GF256_WIDTH,
            d.width
        )),
        _ => None,
    }
}

/// Collects `name` and, first, everything it requires. Header and footer are
/// placed by the caller. `Err` names a missing fragment.
fn visit(
    set: &TemplateSet,
    name: &str,
    field: FieldKind,
    done: &mut BTreeSet<String>,
    stack: &mut Vec<String>,
    order: &mut Vec<String>,
) -> Result<(), String> {
    if name == "header" || name == "footer" || done.contains(name) {
        return Ok(());
    }
    if stack.iter().any(|s| s == name) {
        return Err(format!("{name} (circular requirement)"));
    }
    let fragment = set.get(name).ok_or_else(|| name.to_string())?;
    if !fragment.meta.field_matches(field) {
        return Err(format!("{name} (for field {})", fragment.meta.field));
    }
    stack.push(name.to_string());
    for r in &fragment.meta.requires {
        visit(set, r, field, done, stack, order)?;
    }
    stack.pop();
    done.insert(name.to_string());
    order.push(name.to_string());
    Ok(())
}

/// Builds the certificate for a validated request from its diagnostics.
///
/// Claims whose outcome the templates cannot certify (no fragment, a missing
/// requirement, a placeholder without a value, or a claim out of reach of
/// this method such as an activity bound without its preconditions) are
/// listed in [`Emission::skipped`]; they never make the whole call fail.
pub fn emit(
    req: &AnalysisRequest,
    diag: &Diagnostics,
    set: &TemplateSet,
) -> Result<Emission, EmitError> {
    let header = set.get("header").ok_or(TemplateError::Missing("header"))?;
    let footer = set.get("footer").ok_or(TemplateError::Missing("footer"))?;
    let field = req.design.field();
    let values = Values { req, diag };
    let fill = |fragment: &Fragment| -> Result<String, String> {
        substitute(&fragment.text, |name| values.lookup(name, &fragment.meta))
    };

    let mut skipped = Vec::new();
    let mut done = BTreeSet::new();
    let mut order: Vec<String> = Vec::new();
    let mut texts: BTreeMap<String, String> = BTreeMap::new();

    // Tries to add a fragment with all its requirements; on failure nothing
    // is added and the reason is returned.
    let mut try_add =
        |name: &str, done: &mut BTreeSet<String>, order: &mut Vec<String>| -> Result<(), String> {
            let mut local_done = done.clone();
            let mut local_order = Vec::new();
            visit(
                set,
                name,
                field,
                &mut local_done,
                &mut Vec::new(),
                &mut local_order,
            )
            .map_err(|missing| format!("no template fragment {missing}"))?;
            let mut local_texts = Vec::new();
            for n in &local_order {
                let fragment = set.get(n).expect("visited fragments exist");
                let text = fill(fragment).map_err(|e| format!("fragment {n}: {e}"))?;
                local_texts.push((n.clone(), text));
            }
            *done = local_done;
            order.extend(local_order);
            texts.extend(local_texts);
            Ok(())
        };

    let scope = out_of_scope(req);
    if scope.is_none() {
        for name in always_constants(req) {
            // A missing optional constant only means its value is not echoed.
            let _ = try_add(name, &mut done, &mut order);
        }
    }

    for prediction in &diag.claims {
        let ClaimPrediction {
            claim,
            predicted,
            holds,
            ..
        } = prediction;
        let skip = |reason: String| Skipped {
            claim: claim.to_string(),
            predicted: *predicted,
            reason,
        };
        if let Some(reason) = &scope {
            skipped.push(skip(reason.clone()));
            continue;
        }
        let Some(holds) = *holds else {
            skipped.push(skip(prediction.note.clone()));
            continue;
        };
        let candidates = fragment_candidates(req, diag, claim, holds);
        let wanted = if holds {
            Status::Proved
        } else {
            Status::Refuted
        };
        let usable: Vec<&String> = candidates
            .iter()
            .filter(|n| {
                set.get(n).is_some_and(|f| {
                    f.meta.kind == FragmentKind::Claim
                        && f.meta.claim.as_deref() == Some(claim)
                        && f.meta.status == Some(wanted)
                })
            })
            .collect();
        if usable.is_empty() {
            skipped.push(skip(format!(
                "no template fragment certifies {claim} as {} (looked for {})",
                if holds { "proved" } else { "refuted" },
                candidates.join(", ")
            )));
            continue;
        }
        let mut error = None;
        for name in &usable {
            match try_add(name, &mut done, &mut order) {
                Ok(()) => {
                    error = None;
                    break;
                }
                Err(e) => error = Some(e),
            }
        }
        if let Some(e) = error {
            skipped.push(skip(e));
        }
    }

    // Constants first, then claims, each group in dependency order.
    let kind_of = |n: &String| set.get(n).map(|f| f.meta.kind);
    let mut fragments = vec!["header".to_string()];
    fragments.extend(
        order
            .iter()
            .filter(|n| kind_of(n) != Some(FragmentKind::Claim))
            .cloned(),
    );
    fragments.extend(
        order
            .iter()
            .filter(|n| kind_of(n) == Some(FragmentKind::Claim))
            .cloned(),
    );
    fragments.push("footer".to_string());

    let mut source = String::new();
    let mut inputs_echo = Map::new();
    for name in &fragments {
        let text = match name.as_str() {
            "header" | "footer" => {
                let f = if name == "header" { header } else { footer };
                fill(f).map_err(|reason| EmitError::Fragment {
                    fragment: name.clone(),
                    reason,
                })?
            }
            other => texts[other].clone(),
        };
        for key in echo_keys(&text) {
            if let Some(v) = echo_value(req, diag, &key) {
                inputs_echo.insert(key, v);
            }
        }
        source.push_str(&text);
        if !text.ends_with('\n') {
            source.push('\n');
        }
    }

    // Every claim fragment in the file is audited, including claims pulled
    // in as requirements of others.
    let mut expect = Vec::new();
    for name in fragments
        .iter()
        .filter(|n| kind_of(n) == Some(FragmentKind::Claim))
    {
        let meta = &set.get(name).expect("selected fragments exist").meta;
        let theorem = meta.theorem.clone().expect("claim sidecars have a theorem");
        let theorem = if theorem.contains('.') {
            theorem
        } else {
            format!("{NAMESPACE}.{theorem}")
        };
        source.push_str(&format!("#cryptificate_audit {theorem}\n"));
        let claim = meta.claim.clone().expect("claim sidecars have a claim");
        let status = meta.status.expect("claim sidecars have a status");
        let expected_type = substitute(
            meta.expected_type
                .as_deref()
                .expect("claim sidecars have a type"),
            |p| values.lookup(p, meta),
        )
        .map_err(|reason| EmitError::Fragment {
            fragment: name.clone(),
            reason: format!("expectedType: {reason}"),
        })?;
        let witness = (status == Status::Refuted)
            .then(|| diag.claim(&claim).and_then(|c| c.witness.clone()))
            .flatten();
        expect.push(Expectation {
            claim,
            theorem,
            status,
            expected_type,
            witness,
            fragment: name.clone(),
        });
    }

    Ok(Emission {
        source,
        expect,
        inputs_echo,
        fragments,
        skipped,
        input_digest: req.input_digest(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn substitution() {
        let lookup = |n: &str| {
            if n == "A" {
                Ok("1".to_string())
            } else {
                Err(n.to_string())
            }
        };
        assert_eq!(substitute("x {{A}} y {{A}}", lookup), Ok("x 1 y 1".into()));
        assert_eq!(substitute("{{B}}", lookup), Err("B".into()));
        // Lean's own braces are left alone.
        assert_eq!(substitute("{{a}} {x}", lookup), Ok("{{a}} {x}".into()));
    }

    #[test]
    fn echo_key_scan() {
        let text = "def a := 1\n#eval Audit.echoInput \"candMatrix\" candMatrix\n\
                    #eval echoSboxAes \"candSboxTable\"\n#eval foo \"bar\"\n";
        assert_eq!(echo_keys(text), vec!["candMatrix", "candSboxTable"]);
    }

    #[test]
    fn safe_values() {
        assert!(safe_value(".add 0 1, .mul 0x02 4"));
        assert!(safe_value("0x02 0x03"));
        assert!(!safe_value("1 -/"));
        assert!(!safe_value("x)"));
    }
}
