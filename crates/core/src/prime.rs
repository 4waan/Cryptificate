//! Prime fields with a modulus below `2^64`, and Pratt certificates for
//! their moduli.
//!
//! The prime-field profile (`hades/prime/v1`) works over `Z/pZ` for one of
//! the named moduli ([`FieldKind::BabyBear`], [`FieldKind::KoalaBear`],
//! [`FieldKind::Mersenne31`], [`FieldKind::Goldilocks`]) or a custom prime
//! ([`FieldKind::Prime`]). Elements are [`Fp`] values: canonical residues in
//! `[0, p)` stored as `u64`, with plain modular arithmetic through `u128`.
//!
//! The modulus is chosen per request, so it cannot be a type parameter.
//! [`with_modulus`] sets it for the current thread while a closure runs; every
//! arithmetic operation, decoding and `from_u64` on [`Fp`] reads it there.
//! Using an [`Fp`] outside such a scope is a programming error and panics.
//! Encoding needs no modulus, so validated values can be serialized anywhere.
//!
//! Primality of a submitted modulus is decided here by Miller-Rabin with the
//! first twelve prime bases, which is exact below `3.3 * 10^24` and therefore
//! for every `u64`. That decision only gates validation: the certificate the
//! engine emits proves primality in Lean from a Pratt certificate
//! ([`pratt_certificate`]), and nothing in this module is trusted.
//!
//! [`FieldKind::BabyBear`]: crate::FieldKind::BabyBear
//! [`FieldKind::KoalaBear`]: crate::FieldKind::KoalaBear
//! [`FieldKind::Mersenne31`]: crate::FieldKind::Mersenne31
//! [`FieldKind::Goldilocks`]: crate::FieldKind::Goldilocks
//! [`FieldKind::Prime`]: crate::FieldKind::Prime

use std::cell::Cell;
use std::fmt;
use std::ops::{Add, Mul, Neg, Sub};

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::field::{DecodeError, Field, FieldKind};

thread_local! {
    static MODULUS: Cell<u64> = const { Cell::new(0) };
}

/// Runs `f` with `p` as the modulus of every [`Fp`] operation on this thread,
/// then restores the previous modulus (scopes nest).
pub fn with_modulus<R>(p: u64, f: impl FnOnce() -> R) -> R {
    struct Restore(u64);
    impl Drop for Restore {
        fn drop(&mut self) {
            MODULUS.with(|m| m.set(self.0));
        }
    }
    assert!(p >= 2, "a prime-field modulus is at least 2");
    let _restore = Restore(MODULUS.with(|m| m.replace(p)));
    f()
}

/// The modulus set by the innermost [`with_modulus`] scope, if any.
pub fn current_modulus() -> Option<u64> {
    let p = MODULUS.with(Cell::get);
    (p >= 2).then_some(p)
}

fn modulus() -> u64 {
    current_modulus().expect("an Fp value was used outside with_modulus")
}

#[inline]
fn mul_mod(a: u64, b: u64, m: u64) -> u64 {
    ((u128::from(a) * u128::from(b)) % u128::from(m)) as u64
}

/// `b^e mod m`.
pub fn pow_mod(mut b: u64, mut e: u64, m: u64) -> u64 {
    let mut acc = 1 % m;
    b %= m;
    while e > 0 {
        if e & 1 == 1 {
            acc = mul_mod(acc, b, m);
        }
        b = mul_mod(b, b, m);
        e >>= 1;
    }
    acc
}

/// An element of `Z/pZ` for the modulus of the current [`with_modulus`]
/// scope: the canonical residue in `[0, p)`.
#[derive(Clone, Copy, Default, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Fp(pub u64);

impl Add for Fp {
    type Output = Self;
    #[inline]
    fn add(self, rhs: Self) -> Self {
        let p = modulus();
        Fp(((u128::from(self.0) + u128::from(rhs.0)) % u128::from(p)) as u64)
    }
}

impl Sub for Fp {
    type Output = Self;
    #[inline]
    fn sub(self, rhs: Self) -> Self {
        let p = modulus();
        Fp(((u128::from(self.0) + u128::from(p) - u128::from(rhs.0)) % u128::from(p)) as u64)
    }
}

impl Mul for Fp {
    type Output = Self;
    #[inline]
    fn mul(self, rhs: Self) -> Self {
        Fp(mul_mod(self.0, rhs.0, modulus()))
    }
}

impl Neg for Fp {
    type Output = Self;
    #[inline]
    fn neg(self) -> Self {
        if self.0 == 0 {
            self
        } else {
            Fp(modulus() - self.0)
        }
    }
}

impl Field for Fp {
    const KIND: FieldKind = FieldKind::Prime;

    fn zero() -> Self {
        Fp(0)
    }

    fn one() -> Self {
        Fp(1)
    }

    fn inverse(&self) -> Option<Self> {
        // Fermat: a^(p-2) for a prime modulus.
        (self.0 != 0).then(|| {
            let p = modulus();
            Fp(pow_mod(self.0, p - 2, p))
        })
    }

    fn from_u64(n: u64) -> Self {
        Fp(n % modulus())
    }

    fn encode(&self) -> String {
        self.0.to_string()
    }

    fn decode(s: &str) -> Result<Self, DecodeError> {
        let p = current_modulus()
            .ok_or_else(|| DecodeError::new("no prime modulus is in scope for this element"))?;
        let n = decode_decimal_u64(s)?;
        if n >= p {
            return Err(DecodeError::new(format!(
                "value is not below the field modulus {p}"
            )));
        }
        Ok(Fp(n))
    }
}

/// Parses a canonical decimal (digits only, no leading zeros) that fits a
/// `u64`.
pub fn decode_decimal_u64(s: &str) -> Result<u64, DecodeError> {
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
    s.parse::<u64>()
        .map_err(|_| DecodeError::new(format!("{s} does not fit in 64 bits")))
}

impl fmt::Debug for Fp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Fp({})", self.0)
    }
}

impl fmt::Display for Fp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl Serialize for Fp {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.encode())
    }
}

/// Deserializes under the modulus of the current [`with_modulus`] scope and
/// fails outside one.
impl<'de> Deserialize<'de> for Fp {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Fp::decode(&s).map_err(serde::de::Error::custom)
    }
}

/// A prime modulus below `2^64`, serialized as its decimal string (a 64-bit
/// modulus such as Goldilocks does not fit a JSON number that every reader
/// parses exactly).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Modulus(pub u64);

impl Serialize for Modulus {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0.to_string())
    }
}

impl<'de> Deserialize<'de> for Modulus {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        decode_decimal_u64(&s)
            .map(Modulus)
            .map_err(serde::de::Error::custom)
    }
}

impl fmt::Display for Modulus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

// ---------------------------------------------------------------------------
// Primality and factorization of 64-bit integers
// ---------------------------------------------------------------------------

const SMALL_PRIMES: [u64; 12] = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];

/// Whether `n` is prime: Miller-Rabin with the bases 2, 3, …, 37, which is
/// deterministic for every `u64`.
pub fn is_prime_u64(n: u64) -> bool {
    if n < 2 {
        return false;
    }
    for p in SMALL_PRIMES {
        if n.is_multiple_of(p) {
            return n == p;
        }
    }
    let s = (n - 1).trailing_zeros();
    let d = (n - 1) >> s;
    'bases: for a in SMALL_PRIMES {
        let mut x = pow_mod(a, d, n);
        if x == 1 || x == n - 1 {
            continue;
        }
        for _ in 1..s {
            x = mul_mod(x, x, n);
            if x == n - 1 {
                continue 'bases;
            }
        }
        return false;
    }
    true
}

fn gcd(mut a: u64, mut b: u64) -> u64 {
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

/// A nontrivial factor of the odd composite `n` (Pollard's rho with Brent's
/// cycle detection; the increment `c` is tried in order, so the result is
/// deterministic).
fn rho(n: u64) -> u64 {
    for c in 1u64.. {
        let f = |x: u64| ((u128::from(x) * u128::from(x) + u128::from(c)) % u128::from(n)) as u64;
        let (mut x, mut y, mut g) = (2u64, 2u64, 1u64);
        let mut power = 1u64;
        let mut lam = 1u64;
        while g == 1 {
            if power == lam {
                x = y;
                power *= 2;
                lam = 0;
            }
            y = f(y);
            lam += 1;
            g = gcd(x.abs_diff(y), n);
        }
        if g != n {
            return g;
        }
    }
    unreachable!("some increment splits every odd composite")
}

/// The prime factorization of `n >= 1` as `(prime, exponent)` pairs in
/// increasing order of the prime.
pub fn factorize(n: u64) -> Vec<(u64, u32)> {
    let mut primes = Vec::new();
    let mut stack = vec![n];
    while let Some(m) = stack.pop() {
        if m == 1 {
            continue;
        }
        if is_prime_u64(m) {
            primes.push(m);
            continue;
        }
        if let Some(&p) = SMALL_PRIMES.iter().find(|&&p| m.is_multiple_of(p)) {
            stack.push(p);
            stack.push(m / p);
            continue;
        }
        let d = rho(m);
        stack.push(d);
        stack.push(m / d);
    }
    primes.sort_unstable();
    let mut out: Vec<(u64, u32)> = Vec::new();
    for p in primes {
        match out.last_mut() {
            Some((q, k)) if *q == p => *k += 1,
            _ => out.push((p, 1)),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Pratt certificates
// ---------------------------------------------------------------------------

/// One step of a Pratt certificate: `n` is prime because `a` has order
/// `n - 1` modulo `n`, where `n - 1 = prod q^k` over `factors`, every `q`
/// proved prime by an earlier step.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct PrattStep {
    #[serde(serialize_with = "ser_decimal")]
    pub n: u64,
    pub a: u64,
    pub factors: Vec<(PrattFactor, u32)>,
}

/// A prime factor of `n - 1` in a [`PrattStep`], serialized as a decimal string.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PrattFactor(pub u64);

impl Serialize for PrattFactor {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0.to_string())
    }
}

fn ser_decimal<S: Serializer>(n: &u64, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&n.to_string())
}

/// The smallest primitive root modulo the prime `n`, given the prime factors
/// of `n - 1`.
fn primitive_root(n: u64, factors: &[(u64, u32)]) -> u64 {
    if n == 2 {
        return 1;
    }
    (2..n)
        .find(|&a| {
            factors
                .iter()
                .all(|&(q, _)| pow_mod(a, (n - 1) / q, n) != 1)
        })
        .expect("a prime modulus has a primitive root")
}

/// A Pratt certificate for the prime `p`: one step per prime in the
/// factorization tree of `p - 1`, each after the steps of its factors, the
/// last one for `p`. `None` if `p` is not prime.
pub fn pratt_certificate(p: u64) -> Option<Vec<PrattStep>> {
    if !is_prime_u64(p) {
        return None;
    }
    fn visit(n: u64, steps: &mut Vec<PrattStep>) {
        if steps.iter().any(|s| s.n == n) {
            return;
        }
        let factors = factorize(n - 1);
        for &(q, _) in &factors {
            visit(q, steps);
        }
        let a = primitive_root(n, &factors);
        steps.push(PrattStep {
            n,
            a,
            factors: factors
                .into_iter()
                .map(|(q, k)| (PrattFactor(q), k))
                .collect(),
        });
    }
    let mut steps = Vec::new();
    visit(p, &mut steps);
    Some(steps)
}

/// The flat numeral list `n, a, m, q1, k1, …` that the Lean checker
/// `Cryptificate.Pratt.checkFlat` reads.
pub fn pratt_flat(steps: &[PrattStep]) -> Vec<u64> {
    let mut out = Vec::new();
    for s in steps {
        out.extend([s.n, s.a, s.factors.len() as u64]);
        for &(PrattFactor(q), k) in &s.factors {
            out.extend([q, u64::from(k)]);
        }
    }
    out
}

/// The checks the Lean checker performs, run in Rust (used by tests, never
/// as evidence).
pub fn pratt_verify(steps: &[PrattStep], p: u64) -> bool {
    let mut known: Vec<u64> = Vec::new();
    for s in steps {
        let n = s.n;
        let product = s
            .factors
            .iter()
            .try_fold(1u64, |acc, &(PrattFactor(q), k)| {
                q.checked_pow(k).and_then(|x| acc.checked_mul(x))
            });
        let ok = n >= 2
            && product == Some(n - 1)
            && s.factors.iter().all(|(q, _)| known.contains(&q.0))
            && pow_mod(s.a, n - 1, n) == 1
            && s.factors
                .iter()
                .all(|&(PrattFactor(q), _)| pow_mod(s.a, (n - 1) / q, n) != 1);
        if !ok {
            return false;
        }
        known.push(n);
    }
    known.contains(&p)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRESETS: [u64; 4] = [2013265921, 2130706433, 2147483647, 18446744069414584321];

    #[test]
    fn miller_rabin_agrees_with_trial_division() {
        let trial = |n: u64| {
            n >= 2
                && (2..)
                    .take_while(|d| d * d <= n)
                    .all(|d| !n.is_multiple_of(d))
        };
        for n in 0..5000 {
            assert_eq!(is_prime_u64(n), trial(n), "{n}");
        }
        for p in PRESETS {
            assert!(is_prime_u64(p), "{p}");
        }
        // Strong pseudoprimes to several small bases, and composites near 2^64.
        for n in [3215031751, 3825123056546413051, 318665857834031151167461, 0]
            .into_iter()
            .filter_map(|n: u128| u64::try_from(n).ok())
        {
            assert!(!is_prime_u64(n), "{n}");
        }
        assert!(!is_prime_u64(u64::MAX));
        assert!(is_prime_u64(18446744073709551557)); // the largest u64 prime
    }

    #[test]
    fn factorizations() {
        assert_eq!(factorize(1), vec![]);
        assert_eq!(factorize(2013265920), vec![(2, 27), (3, 1), (5, 1)]);
        assert_eq!(factorize(2130706432), vec![(2, 24), (127, 1)]);
        assert_eq!(
            factorize(18446744069414584320),
            vec![(2, 32), (3, 1), (5, 1), (17, 1), (257, 1), (65537, 1)]
        );
        let n = 4294967291u64 * 4294967279; // two 32-bit primes
        assert_eq!(factorize(n), vec![(4294967279, 1), (4294967291, 1)]);
    }

    #[test]
    fn pratt_certificates_verify() {
        for p in PRESETS
            .into_iter()
            .chain([2, 3, 5, 65537, 18446744073709551557])
        {
            let c = pratt_certificate(p).unwrap();
            assert_eq!(c.last().unwrap().n, p);
            assert!(pratt_verify(&c, p), "{p}");
        }
        assert_eq!(pratt_certificate(1), None);
        assert_eq!(pratt_certificate(2013265923), None);
        // The flat form of the BabyBear certificate, as the Lean library
        // writes it in `PrimeField.Presets`.
        assert_eq!(
            pratt_flat(&pratt_certificate(2013265921).unwrap()),
            vec![2, 1, 0, 3, 2, 1, 2, 1, 5, 2, 1, 2, 2, 2013265921, 31, 3, 2, 27, 3, 1, 5, 1]
        );
    }

    #[test]
    fn pratt_verify_rejects_tampering() {
        let mut c = pratt_certificate(2130706433).unwrap();
        let last = c.last_mut().unwrap();
        last.a = 1;
        assert!(!pratt_verify(&c, 2130706433));
    }

    #[test]
    fn arithmetic_under_a_modulus() {
        with_modulus(18446744069414584321, || {
            let m1 = -Fp::one();
            assert_eq!(m1.0, 18446744069414584320);
            assert_eq!(m1 * m1, Fp::one());
            assert_eq!(m1 + Fp::one(), Fp::zero());
            assert_eq!(Fp::zero() - Fp::one(), m1);
            let x = Fp(123456789);
            assert_eq!(x * x.inverse().unwrap(), Fp::one());
            assert_eq!(Fp::decode("18446744069414584320").unwrap(), m1);
            assert!(Fp::decode("18446744069414584321").is_err());
            assert!(Fp::decode("01").is_err());
            // Nested scopes restore the outer modulus.
            with_modulus(7, || assert_eq!(Fp(5) + Fp(4), Fp(2)));
            assert_eq!(current_modulus(), Some(18446744069414584321));
        });
        assert_eq!(current_modulus(), None);
        assert!(Fp::decode("1").is_err());
    }
}
