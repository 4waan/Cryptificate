//! Finite fields used by candidate designs and linear programs.
//!
//! Two fields are supported:
//!
//! * [`Gf256`]: GF(2)\[x\]/(x^8 + x^4 + x^3 + x + 1). The byte `02` is the
//!   element x. Canonical text form: two uppercase hex digits (`"1B"`);
//!   lowercase digits are accepted on input.
//! * [`Bn254`]: the BN254 scalar field Fr. Canonical text form: the decimal
//!   representative in `[0, p)` with no sign, whitespace or leading zeros.
//!
//! Both implement [`Field`], and both serialize with serde as their canonical
//! string.

use std::fmt;
use std::hash::Hash;
use std::ops::{Add, Mul, Neg, Sub};
use std::str::FromStr;
use std::sync::OnceLock;

use cryptificate_kernels::bn254::{Field as ArkField, Fr, PrimeField};
use cryptificate_kernels::gf256;
use num_bigint::BigUint;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Which field a design or program is defined over.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum FieldKind {
    /// GF(2^8) with polynomial 0x11B.
    #[serde(rename = "gf256")]
    Gf256,
    /// The BN254 scalar field.
    #[serde(rename = "bn254")]
    Bn254,
}

impl FieldKind {
    /// The JSON spelling (`"gf256"` or `"bn254"`).
    pub const fn as_str(self) -> &'static str {
        match self {
            FieldKind::Gf256 => "gf256",
            FieldKind::Bn254 => "bn254",
        }
    }

    /// Parses the JSON spelling.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "gf256" => Some(FieldKind::Gf256),
            "bn254" => Some(FieldKind::Bn254),
            _ => None,
        }
    }
}

impl fmt::Display for FieldKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Why a string is not a canonical field element.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
#[error("{reason}")]
pub struct DecodeError {
    /// Human-readable reason, suitable for an error message.
    pub reason: String,
}

impl DecodeError {
    fn new(reason: impl Into<String>) -> Self {
        DecodeError {
            reason: reason.into(),
        }
    }
}

/// Arithmetic and canonical encoding shared by every supported field.
///
/// Equality is the derived `Eq`; addition, subtraction, multiplication and
/// negation are the standard operator traits.
pub trait Field:
    Copy
    + Eq
    + Hash
    + fmt::Debug
    + fmt::Display
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
    + Neg<Output = Self>
    + Send
    + Sync
    + 'static
{
    /// The field this type implements.
    const KIND: FieldKind;

    /// The additive identity.
    fn zero() -> Self;

    /// The multiplicative identity.
    fn one() -> Self;

    /// Whether this is the additive identity.
    fn is_zero(&self) -> bool {
        *self == Self::zero()
    }

    /// Whether this is the multiplicative identity.
    fn is_one(&self) -> bool {
        *self == Self::one()
    }

    /// The multiplicative inverse, or `None` for zero.
    fn inverse(&self) -> Option<Self>;

    /// The element represented by the integer `n` (reduced into the field;
    /// for GF(2^8) only the low byte is used, as a polynomial bit pattern).
    fn from_u64(n: u64) -> Self;

    /// `self^e` by square-and-multiply.
    fn pow(&self, mut e: u64) -> Self {
        let mut base = *self;
        let mut acc = Self::one();
        while e > 0 {
            if e & 1 == 1 {
                acc = acc * base;
            }
            base = base * base;
            e >>= 1;
        }
        acc
    }

    /// The canonical string encoding (see the module documentation).
    fn encode(&self) -> String;

    /// Parses an element, accepting only the canonical encoding (plus
    /// lowercase hex digits for GF(2^8)).
    fn decode(s: &str) -> Result<Self, DecodeError>;
}

// ---------------------------------------------------------------------------
// GF(2^8)
// ---------------------------------------------------------------------------

/// An element of GF(2^8) = GF(2)\[x\]/(x^8 + x^4 + x^3 + x + 1).
///
/// The wrapped byte is the polynomial's coefficient bit pattern, so
/// `Gf256(0x02)` is x and `Gf256(0x01)` is one.
#[derive(Clone, Copy, Default, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Gf256(pub u8);

impl Gf256 {
    /// Multiplication by x (the byte `02`).
    #[inline]
    pub fn xtime(self) -> Self {
        Gf256(gf256::xtime(self.0))
    }
}

impl Add for Gf256 {
    type Output = Self;
    #[inline]
    fn add(self, rhs: Self) -> Self {
        Gf256(gf256::add(self.0, rhs.0))
    }
}

impl Sub for Gf256 {
    type Output = Self;
    #[inline]
    fn sub(self, rhs: Self) -> Self {
        // Characteristic 2: subtraction is addition.
        Gf256(gf256::add(self.0, rhs.0))
    }
}

impl Mul for Gf256 {
    type Output = Self;
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        Gf256(gf256::mul(self.0, rhs.0))
    }
}

impl Neg for Gf256 {
    type Output = Self;
    #[inline]
    fn neg(self) -> Self {
        self
    }
}

impl Field for Gf256 {
    const KIND: FieldKind = FieldKind::Gf256;

    fn zero() -> Self {
        Gf256(0)
    }

    fn one() -> Self {
        Gf256(1)
    }

    fn inverse(&self) -> Option<Self> {
        if self.0 == 0 {
            None
        } else {
            // The multiplicative group has order 255, so a^-1 = a^254.
            Some(self.pow(254))
        }
    }

    fn from_u64(n: u64) -> Self {
        Gf256(n as u8)
    }

    fn encode(&self) -> String {
        format!("{:02X}", self.0)
    }

    fn decode(s: &str) -> Result<Self, DecodeError> {
        let bytes = s.as_bytes();
        if bytes.len() != 2 || !bytes.iter().all(u8::is_ascii_hexdigit) {
            return Err(DecodeError::new(format!(
                "expected a byte as exactly two hex digits (e.g. \"1B\"), got {s:?}"
            )));
        }
        u8::from_str_radix(s, 16)
            .map(Gf256)
            .map_err(|_| DecodeError::new(format!("invalid byte {s:?}")))
    }
}

impl fmt::Debug for Gf256 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Gf256({:02X})", self.0)
    }
}

impl fmt::Display for Gf256 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:02X}", self.0)
    }
}

impl From<u8> for Gf256 {
    fn from(b: u8) -> Self {
        Gf256(b)
    }
}

// ---------------------------------------------------------------------------
// BN254 scalar field
// ---------------------------------------------------------------------------

/// Decimal digits of the BN254 scalar field modulus.
pub const BN254_MODULUS_DECIMAL: &str =
    "21888242871839275222246405745257275088548364400416034343698204186575808495617";

/// The BN254 scalar field modulus p as a big integer.
pub fn bn254_modulus() -> &'static BigUint {
    static MODULUS: OnceLock<BigUint> = OnceLock::new();
    MODULUS.get_or_init(|| limbs_to_biguint(&<Fr as PrimeField>::MODULUS.0))
}

fn limbs_to_biguint(limbs: &[u64]) -> BigUint {
    let bytes: Vec<u8> = limbs.iter().flat_map(|l| l.to_le_bytes()).collect();
    BigUint::from_bytes_le(&bytes)
}

/// An element of the BN254 scalar field Fr (arkworks representation).
#[derive(Clone, Copy, Default, PartialEq, Eq, Hash)]
pub struct Bn254(pub Fr);

impl Bn254 {
    /// The canonical representative in `[0, p)` as a big integer.
    pub fn to_biguint(&self) -> BigUint {
        limbs_to_biguint(&self.0.into_bigint().0)
    }

    /// The element congruent to `n` modulo p.
    pub fn from_biguint(n: &BigUint) -> Self {
        let reduced = n % bn254_modulus();
        Bn254(Fr::from_le_bytes_mod_order(&reduced.to_bytes_le()))
    }
}

impl Add for Bn254 {
    type Output = Self;
    #[inline]
    fn add(self, rhs: Self) -> Self {
        Bn254(self.0 + rhs.0)
    }
}

impl Sub for Bn254 {
    type Output = Self;
    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Bn254(self.0 - rhs.0)
    }
}

impl Mul for Bn254 {
    type Output = Self;
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        Bn254(self.0 * rhs.0)
    }
}

impl Neg for Bn254 {
    type Output = Self;
    #[inline]
    fn neg(self) -> Self {
        Bn254(-self.0)
    }
}

impl Field for Bn254 {
    const KIND: FieldKind = FieldKind::Bn254;

    fn zero() -> Self {
        Bn254(Fr::from(0u64))
    }

    fn one() -> Self {
        Bn254(Fr::from(1u64))
    }

    fn inverse(&self) -> Option<Self> {
        ArkField::inverse(&self.0).map(Bn254)
    }

    fn from_u64(n: u64) -> Self {
        Bn254(Fr::from(n))
    }

    fn encode(&self) -> String {
        self.to_biguint().to_str_radix(10)
    }

    fn decode(s: &str) -> Result<Self, DecodeError> {
        if s.is_empty() {
            return Err(DecodeError::new(
                "expected a decimal field element, got an empty string",
            ));
        }
        if !s.bytes().all(|b| b.is_ascii_digit()) {
            return Err(DecodeError::new(format!(
                "expected only decimal digits (no sign, whitespace or prefix), got {s:?}"
            )));
        }
        if s.len() > 1 && s.starts_with('0') {
            return Err(DecodeError::new(format!(
                "leading zeros are not canonical: {s:?}"
            )));
        }
        if s.len() > BN254_MODULUS_DECIMAL.len() {
            return Err(DecodeError::new(
                "value is not below the BN254 scalar field modulus",
            ));
        }
        let n =
            BigUint::from_str(s).map_err(|_| DecodeError::new(format!("invalid number {s:?}")))?;
        if &n >= bn254_modulus() {
            return Err(DecodeError::new(
                "value is not below the BN254 scalar field modulus",
            ));
        }
        Ok(Bn254::from_biguint(&n))
    }
}

impl fmt::Debug for Bn254 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Bn254({})", self.encode())
    }
}

impl fmt::Display for Bn254 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.encode())
    }
}

impl From<u64> for Bn254 {
    fn from(n: u64) -> Self {
        Bn254(Fr::from(n))
    }
}

// ---------------------------------------------------------------------------
// serde: every element travels as its canonical string
// ---------------------------------------------------------------------------

macro_rules! serde_via_string {
    ($t:ty) => {
        impl Serialize for $t {
            fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.serialize_str(&self.encode())
            }
        }

        impl<'de> Deserialize<'de> for $t {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let s = String::deserialize(deserializer)?;
                <$t as Field>::decode(&s).map_err(serde::de::Error::custom)
            }
        }
    };
}

serde_via_string!(Gf256);
serde_via_string!(Bn254);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gf256_encoding_is_uppercase_and_accepts_lowercase() {
        assert_eq!(Gf256(0x1b).encode(), "1B");
        assert_eq!(Gf256(0x02).encode(), "02");
        assert_eq!(Gf256::decode("1b").unwrap(), Gf256(0x1B));
        assert_eq!(Gf256::decode("Ff").unwrap(), Gf256(0xFF));
    }

    #[test]
    fn gf256_rejects_malformed_bytes() {
        for bad in ["", "1", "123", "0x1", "G0", " 1", "1 ", "+1", "-1", "１２"] {
            assert!(Gf256::decode(bad).is_err(), "{bad:?} must be rejected");
        }
    }

    #[test]
    fn gf256_inverse() {
        assert_eq!(Gf256(0).inverse(), None);
        for a in 1..=255u8 {
            let inv = Gf256(a).inverse().unwrap();
            assert_eq!(Gf256(a) * inv, Gf256(1), "{a:02X}");
        }
    }

    #[test]
    fn modulus_matches_decimal_constant() {
        assert_eq!(bn254_modulus().to_str_radix(10), BN254_MODULUS_DECIMAL);
    }

    #[test]
    fn bn254_canonical_strings() {
        let p_minus_1 =
            "21888242871839275222246405745257275088548364400416034343698204186575808495616";
        assert_eq!(Bn254::decode("0").unwrap(), Bn254::zero());
        assert_eq!(Bn254::decode("1").unwrap(), Bn254::one());
        assert_eq!(Bn254::decode(p_minus_1).unwrap(), -Bn254::one());
        assert_eq!((-Bn254::one()).encode(), p_minus_1);
        assert_eq!(Bn254::zero().encode(), "0");
        for bad in [
            "",
            "00",
            "01",
            "+1",
            "-1",
            " 1",
            "1 ",
            "1.0",
            "1e3",
            "0x10",
            BN254_MODULUS_DECIMAL,
            "21888242871839275222246405745257275088548364400416034343698204186575808495618",
            "999999999999999999999999999999999999999999999999999999999999999999999999999999",
        ] {
            assert!(Bn254::decode(bad).is_err(), "{bad:?} must be rejected");
        }
    }

    #[test]
    fn serde_round_trip() {
        let v = vec![Gf256(0x0A), Gf256(0xFF)];
        let s = serde_json::to_string(&v).unwrap();
        assert_eq!(s, r#"["0A","FF"]"#);
        let back: Vec<Gf256> = serde_json::from_str(r#"["0a","ff"]"#).unwrap();
        assert_eq!(back, v);
        let b: Bn254 = serde_json::from_str(r#""12345""#).unwrap();
        assert_eq!(serde_json::to_string(&b).unwrap(), r#""12345""#);
        assert!(serde_json::from_str::<Bn254>("12345").is_err());
    }
}
