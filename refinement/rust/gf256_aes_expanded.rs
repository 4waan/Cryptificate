// Expansion of the gf256 crate, version 0.3.1, with features `no-tables` and
// `no-xmul`, and of the type `gf256_aes` declared in
// `refinement/gf256crate/src/lib.rs` with `#[gf(polynomial = 0x11b, generator = 0x3)]`.
// Produced by `refinement/gf256crate/expand.sh`; do not edit.
#![feature(prelude_import, coverage_attribute, derive_clone_copy_internals, derive_eq_internals, panic_internals, structural_match, trivial_clone)]
#![allow(unconditional_panic, overflowing_literals)]


// We don't really need std
#![no_std]

// Other assertions
#![deny(missing_debug_implementations)]
extern crate core;
extern crate self as gf256;
#[prelude_import]
use core::prelude::rust_2021::*;


pub mod traits {











    pub use core::convert::TryFrom;
    pub use core::convert::TryInto;
    pub trait FromLossy<T> {
        fn from_lossy(t: T)
        -> Self;
    }
    pub trait IntoLossy<T> {
        fn into_lossy(self)
        -> T;
    }
    impl<T, U> IntoLossy<T> for U where T: FromLossy<U> {
        #[inline]
        fn into_lossy(self) -> T { T::from_lossy(self) }
    }
    impl<T, U> FromLossy<T> for U where U: From<T> {
        #[inline]
        fn from_lossy(t: T) -> Self { Self::from(t) }
    }
}
pub mod p {
    pub use __p8_gen::p8;
    mod __p8_gen {
        use core::mem::size_of;
        use core::ops::*;
        use core::iter::*;
        use core::num::TryFromIntError;
        use core::num::ParseIntError;
        use core::fmt;
        use core::str::FromStr;
        use core::slice;
        use crate::traits::TryFrom;
        use crate::traits::FromLossy;
        #[allow(non_camel_case_types)]
        #[repr(transparent)]
        pub struct p8(pub super::__p8_u);
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::default::Default for p8 {
            #[inline]
            fn default() -> p8 { p8(::core::default::Default::default()) }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::Copy for p8 { }
        #[automatically_derived]
        #[doc(hidden)]
        #[allow(non_camel_case_types)]
        unsafe impl ::core::clone::TrivialClone for p8 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::clone::Clone for p8 {
            #[inline]
            fn clone(&self) -> p8 {
                let _: ::core::clone::AssertParamIsClone<super::__p8_u>;
                *self
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Eq for p8 {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_fields_are_eq(&self) {
                let _: ::core::cmp::AssertParamIsEq<super::__p8_u>;
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::StructuralPartialEq for p8 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialEq for p8 {
            #[inline]
            fn eq(&self, other: &p8) -> bool { self.0 == other.0 }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Ord for p8 {
            #[inline]
            fn cmp(&self, other: &p8) -> ::core::cmp::Ordering {
                ::core::cmp::Ord::cmp(&self.0, &other.0)
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialOrd for p8 {
            #[inline]
            fn partial_cmp(&self, other: &p8)
                -> ::core::option::Option<::core::cmp::Ordering> {
                ::core::option::Option::Some(::core::cmp::Ord::cmp(self,
                        other))
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::hash::Hash for p8 {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) {
                ::core::hash::Hash::hash(&self.0, state)
            }
        }
        impl p8 {
            #[inline]
            pub const fn new(x: super::__p8_u) -> p8 { p8(x) }
            #[inline]
            pub const fn get(self) -> super::__p8_u { self.0 }
            #[inline]
            pub const fn naive_add(self, other: p8) -> p8 {
                p8(self.0 ^ other.0)
            }
            #[inline]
            pub fn add(self, other: p8) -> p8 { p8(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_sub(self, other: p8) -> p8 {
                p8(self.0 ^ other.0)
            }
            #[inline]
            pub fn sub(self, other: p8) -> p8 { p8(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_widening_mul(self, other: p8) -> (p8, p8) {
                let a = self.0;
                let b = other.0;
                let mut lo = 0;
                let mut hi = 0;
                let mut i = 0;
                while i < 8 {
                    let mask =
                        (((a as super::__p8_i) << (8 - 1 - i)) >> (8 - 1)) as
                            super::__p8_u;
                    lo ^= mask & (b << i);
                    hi ^= mask & (b >> (8 - 1 - i));
                    i += 1;
                }
                (p8(lo), p8(hi >> 1))
            }
            #[inline]
            pub const fn naive_overflowing_mul(self, other: p8)
                -> (p8, bool) {
                let (lo, hi) = self.naive_widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub const fn naive_checked_mul(self, other: p8) -> Option<p8> {
                match self.naive_overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub const fn naive_wrapping_mul(self, other: p8) -> p8 {
                let a = self.0;
                let b = other.0;
                let mut x = 0;
                let mut i = 0;
                while i < 8 {
                    let mask =
                        (((a as super::__p8_i) << (8 - 1 - i)) >> (8 - 1)) as
                            super::__p8_u;
                    x ^= mask & (b << i);
                    i += 1;
                }
                p8(x)
            }
            #[inline]
            pub const fn naive_mul(self, other: p8) -> p8 {
                match self.naive_checked_mul(other) {
                    Some(x) => x,
                    None => p8(self.0 / 0),
                }
            }
            #[inline]
            pub fn widening_mul(self, other: p8) -> (p8, p8) {
                self.naive_widening_mul(other)
            }
            #[inline]
            pub fn overflowing_mul(self, other: p8) -> (p8, bool) {
                let (lo, hi) = self.widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub fn checked_mul(self, other: p8) -> Option<p8> {
                match self.overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub fn wrapping_mul(self, other: p8) -> p8 {
                self.naive_wrapping_mul(other)
            }
            #[inline]
            pub fn mul(self, other: p8) -> p8 {
                self.checked_mul(other).expect("overflow in polynomial multiply")
            }
            #[inline]
            pub const fn naive_overflowing_pow(self, exp: u32) -> (p8, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p8(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.naive_overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.naive_overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub const fn naive_checked_pow(self, exp: u32) -> Option<p8> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p8(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.naive_checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.naive_checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub const fn naive_wrapping_pow(self, exp: u32) -> p8 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p8(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_wrapping_mul(a);
                }
            }
            #[inline]
            pub const fn naive_pow(self, exp: u32) -> p8 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p8(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_mul(a);
                }
            }
            #[inline]
            pub fn overflowing_pow(self, exp: u32) -> (p8, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p8(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub fn checked_pow(self, exp: u32) -> Option<p8> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p8(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub fn wrapping_pow(self, exp: u32) -> p8 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p8(1);
                loop {
                    if exp & 1 != 0 { x = x.wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.wrapping_mul(a);
                }
            }
            #[inline]
            pub fn pow(self, exp: u32) -> p8 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p8(1);
                loop {
                    if exp & 1 != 0 { x = x.mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.mul(a);
                }
            }
            #[inline]
            pub const fn naive_checked_div(self, other: p8) -> Option<p8> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    let mut x = 0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        x ^= 1 << (b.leading_zeros() - a.leading_zeros());
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p8(x))
                }
            }
            #[inline]
            pub const fn naive_div(self, other: p8) -> p8 {
                match self.naive_checked_div(other) {
                    Some(x) => x,
                    None => p8(self.0 / 0),
                }
            }
            #[inline]
            pub const fn naive_checked_rem(self, other: p8) -> Option<p8> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p8(a))
                }
            }
            #[inline]
            pub const fn naive_rem(self, other: p8) -> p8 {
                match self.naive_checked_rem(other) {
                    Some(x) => x,
                    None => p8(self.0 / 0),
                }
            }
            #[inline]
            pub fn slice_from_slice(slice: &[super::__p8_u]) -> &[p8] {
                unsafe {
                    slice::from_raw_parts(slice.as_ptr() as *const p8,
                        slice.len())
                }
            }
            #[inline]
            pub fn slice_from_slice_mut(slice: &mut [super::__p8_u])
                -> &mut [p8] {
                unsafe {
                    slice::from_raw_parts_mut(slice.as_mut_ptr() as *mut p8,
                        slice.len())
                }
            }
        }
        impl From<super::__p8_u> for p8 {
            #[inline]
            fn from(x: super::__p8_u) -> p8 { p8(x) }
        }
        impl From<bool> for p8 {
            #[inline]
            fn from(x: bool) -> p8 { p8(super::__p8_u::from(x)) }
        }
        impl TryFrom<u16> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u16) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<u32> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u32) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<u64> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u64) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<u128> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u128) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<usize> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: usize) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<crate::p16> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p16) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::p32> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p32) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::p64> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p64) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::p128> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p128) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::psize> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::psize) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x.0)?))
            }
        }
        impl FromLossy<u16> for p8 {
            #[inline]
            fn from_lossy(x: u16) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<u32> for p8 {
            #[inline]
            fn from_lossy(x: u32) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<u64> for p8 {
            #[inline]
            fn from_lossy(x: u64) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<u128> for p8 {
            #[inline]
            fn from_lossy(x: u128) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<usize> for p8 {
            #[inline]
            fn from_lossy(x: usize) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<crate::p16> for p8 {
            #[inline]
            fn from_lossy(x: crate::p16) -> p8 { p8(x.0 as super::__p8_u) }
        }
        impl FromLossy<crate::p32> for p8 {
            #[inline]
            fn from_lossy(x: crate::p32) -> p8 { p8(x.0 as super::__p8_u) }
        }
        impl FromLossy<crate::p64> for p8 {
            #[inline]
            fn from_lossy(x: crate::p64) -> p8 { p8(x.0 as super::__p8_u) }
        }
        impl FromLossy<crate::p128> for p8 {
            #[inline]
            fn from_lossy(x: crate::p128) -> p8 { p8(x.0 as super::__p8_u) }
        }
        impl FromLossy<crate::psize> for p8 {
            #[inline]
            fn from_lossy(x: crate::psize) -> p8 { p8(x.0 as super::__p8_u) }
        }
        impl TryFrom<i8> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i8) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<i16> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i16) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<i32> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i32) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<i64> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i64) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<i128> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i128) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl TryFrom<isize> for p8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: isize) -> Result<p8, Self::Error> {
                Ok(p8(super::__p8_u::try_from(x)?))
            }
        }
        impl FromLossy<i8> for p8 {
            #[inline]
            fn from_lossy(x: i8) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<i16> for p8 {
            #[inline]
            fn from_lossy(x: i16) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<i32> for p8 {
            #[inline]
            fn from_lossy(x: i32) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<i64> for p8 {
            #[inline]
            fn from_lossy(x: i64) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<i128> for p8 {
            #[inline]
            fn from_lossy(x: i128) -> p8 { p8(x as super::__p8_u) }
        }
        impl FromLossy<isize> for p8 {
            #[inline]
            fn from_lossy(x: isize) -> p8 { p8(x as super::__p8_u) }
        }
        impl From<p8> for super::__p8_u {
            #[inline]
            fn from(x: p8) -> super::__p8_u { x.0 }
        }
        impl From<p8> for u16 {
            #[inline]
            fn from(x: p8) -> u16 { u16::from(x.0) }
        }
        impl From<p8> for u32 {
            #[inline]
            fn from(x: p8) -> u32 { u32::from(x.0) }
        }
        impl From<p8> for u64 {
            #[inline]
            fn from(x: p8) -> u64 { u64::from(x.0) }
        }
        impl From<p8> for u128 {
            #[inline]
            fn from(x: p8) -> u128 { u128::from(x.0) }
        }
        impl From<p8> for usize {
            #[inline]
            fn from(x: p8) -> usize { usize::from(x.0) }
        }
        impl From<p8> for i16 {
            #[inline]
            fn from(x: p8) -> i16 { i16::from(x.0) }
        }
        impl From<p8> for i32 {
            #[inline]
            fn from(x: p8) -> i32 { i32::from(x.0) }
        }
        impl From<p8> for i64 {
            #[inline]
            fn from(x: p8) -> i64 { i64::from(x.0) }
        }
        impl From<p8> for i128 {
            #[inline]
            fn from(x: p8) -> i128 { i128::from(x.0) }
        }
        impl From<p8> for isize {
            #[inline]
            fn from(x: p8) -> isize { isize::from(x.0) }
        }
        impl TryFrom<p8> for i8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p8) -> Result<i8, Self::Error> {
                i8::try_from(x.0)
            }
        }
        impl FromLossy<p8> for i8 {
            #[inline]
            fn from_lossy(x: p8) -> i8 { x.0 as i8 }
        }
        impl Neg for p8 {
            type Output = p8;
            #[inline]
            fn neg(self) -> p8 { self }
        }
        impl Neg for &p8 {
            type Output = p8;
            #[inline]
            fn neg(self) -> p8 { *self }
        }
        impl Add<p8> for p8 {
            type Output = p8;
            #[inline]
            fn add(self, other: p8) -> p8 { p8::add(self, other) }
        }
        impl Add<p8> for &p8 {
            type Output = p8;
            #[inline]
            fn add(self, other: p8) -> p8 { p8::add(*self, other) }
        }
        impl Add<&p8> for p8 {
            type Output = p8;
            #[inline]
            fn add(self, other: &p8) -> p8 { p8::add(self, *other) }
        }
        impl Add<&p8> for &p8 {
            type Output = p8;
            #[inline]
            fn add(self, other: &p8) -> p8 { p8::add(*self, *other) }
        }
        impl AddAssign<p8> for p8 {
            #[inline]
            fn add_assign(&mut self, other: p8) { *self = self.add(other) }
        }
        impl AddAssign<&p8> for p8 {
            #[inline]
            fn add_assign(&mut self, other: &p8) { *self = self.add(*other) }
        }
        impl Sum<p8> for p8 {
            #[inline]
            fn sum<I>(iter: I) -> p8 where I: Iterator<Item = p8> {
                iter.fold(p8(0), |a, x| a + x)
            }
        }
        impl<'a> Sum<&'a p8> for p8 {
            #[inline]
            fn sum<I>(iter: I) -> p8 where I: Iterator<Item = &'a p8> {
                iter.fold(p8(0), |a, x| a + *x)
            }
        }
        impl Sub for p8 {
            type Output = p8;
            #[inline]
            fn sub(self, other: p8) -> p8 { p8::sub(self, other) }
        }
        impl Sub<p8> for &p8 {
            type Output = p8;
            #[inline]
            fn sub(self, other: p8) -> p8 { p8::sub(*self, other) }
        }
        impl Sub<&p8> for p8 {
            type Output = p8;
            #[inline]
            fn sub(self, other: &p8) -> p8 { p8::sub(self, *other) }
        }
        impl Sub<&p8> for &p8 {
            type Output = p8;
            #[inline]
            fn sub(self, other: &p8) -> p8 { p8::sub(*self, *other) }
        }
        impl SubAssign<p8> for p8 {
            #[inline]
            fn sub_assign(&mut self, other: p8) { *self = self.sub(other) }
        }
        impl SubAssign<&p8> for p8 {
            #[inline]
            fn sub_assign(&mut self, other: &p8) { *self = self.sub(*other) }
        }
        impl Mul for p8 {
            type Output = p8;
            #[inline]
            fn mul(self, other: p8) -> p8 { p8::mul(self, other) }
        }
        impl Mul<p8> for &p8 {
            type Output = p8;
            #[inline]
            fn mul(self, other: p8) -> p8 { p8::mul(*self, other) }
        }
        impl Mul<&p8> for p8 {
            type Output = p8;
            #[inline]
            fn mul(self, other: &p8) -> p8 { p8::mul(self, *other) }
        }
        impl Mul<&p8> for &p8 {
            type Output = p8;
            #[inline]
            fn mul(self, other: &p8) -> p8 { p8::mul(*self, *other) }
        }
        impl MulAssign<p8> for p8 {
            #[inline]
            fn mul_assign(&mut self, other: p8) { *self = self.mul(other) }
        }
        impl MulAssign<&p8> for p8 {
            #[inline]
            fn mul_assign(&mut self, other: &p8) { *self = self.mul(*other) }
        }
        impl Product<p8> for p8 {
            #[inline]
            fn product<I>(iter: I) -> p8 where I: Iterator<Item = p8> {
                iter.fold(p8(0), |a, x| a * x)
            }
        }
        impl<'a> Product<&'a p8> for p8 {
            #[inline]
            fn product<I>(iter: I) -> p8 where I: Iterator<Item = &'a p8> {
                iter.fold(p8(0), |a, x| a * *x)
            }
        }
        impl Div for p8 {
            type Output = p8;
            #[inline]
            fn div(self, other: p8) -> p8 { p8::naive_div(self, other) }
        }
        impl Div<p8> for &p8 {
            type Output = p8;
            #[inline]
            fn div(self, other: p8) -> p8 { p8::naive_div(*self, other) }
        }
        impl Div<&p8> for p8 {
            type Output = p8;
            #[inline]
            fn div(self, other: &p8) -> p8 { p8::naive_div(self, *other) }
        }
        impl Div<&p8> for &p8 {
            type Output = p8;
            #[inline]
            fn div(self, other: &p8) -> p8 { p8::naive_div(*self, *other) }
        }
        impl DivAssign<p8> for p8 {
            #[inline]
            fn div_assign(&mut self, other: p8) { *self = self.div(other) }
        }
        impl DivAssign<&p8> for p8 {
            #[inline]
            fn div_assign(&mut self, other: &p8) { *self = self.div(*other) }
        }
        impl Rem for p8 {
            type Output = p8;
            #[inline]
            fn rem(self, other: p8) -> p8 { p8::naive_rem(self, other) }
        }
        impl Rem<p8> for &p8 {
            type Output = p8;
            #[inline]
            fn rem(self, other: p8) -> p8 { p8::naive_rem(*self, other) }
        }
        impl Rem<&p8> for p8 {
            type Output = p8;
            #[inline]
            fn rem(self, other: &p8) -> p8 { p8::naive_rem(self, *other) }
        }
        impl Rem<&p8> for &p8 {
            type Output = p8;
            #[inline]
            fn rem(self, other: &p8) -> p8 { p8::naive_rem(*self, *other) }
        }
        impl RemAssign<p8> for p8 {
            #[inline]
            fn rem_assign(&mut self, other: p8) { *self = self.rem(other) }
        }
        impl RemAssign<&p8> for p8 {
            #[inline]
            fn rem_assign(&mut self, other: &p8) { *self = self.rem(*other) }
        }
        impl Not for p8 {
            type Output = p8;
            #[inline]
            fn not(self) -> p8 { p8(!self.0) }
        }
        impl Not for &p8 {
            type Output = p8;
            #[inline]
            fn not(self) -> p8 { p8(!self.0) }
        }
        impl BitAnd<p8> for p8 {
            type Output = p8;
            #[inline]
            fn bitand(self, other: p8) -> p8 { p8(self.0 & other.0) }
        }
        impl BitAnd<p8> for &p8 {
            type Output = p8;
            #[inline]
            fn bitand(self, other: p8) -> p8 { p8(self.0 & other.0) }
        }
        impl BitAnd<&p8> for p8 {
            type Output = p8;
            #[inline]
            fn bitand(self, other: &p8) -> p8 { p8(self.0 & other.0) }
        }
        impl BitAnd<&p8> for &p8 {
            type Output = p8;
            #[inline]
            fn bitand(self, other: &p8) -> p8 { p8(self.0 & other.0) }
        }
        impl BitAndAssign<p8> for p8 {
            #[inline]
            fn bitand_assign(&mut self, other: p8) { *self = *self & other; }
        }
        impl BitAndAssign<&p8> for p8 {
            #[inline]
            fn bitand_assign(&mut self, other: &p8) {
                *self = *self & *other;
            }
        }
        impl BitAnd<p8> for super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitand(self, other: p8) -> p8 { p8(self & other.0) }
        }
        impl BitAnd<p8> for &super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitand(self, other: p8) -> p8 { p8(self & other.0) }
        }
        impl BitAnd<&p8> for super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitand(self, other: &p8) -> p8 { p8(self & other.0) }
        }
        impl BitAnd<&p8> for &super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitand(self, other: &p8) -> p8 { p8(self & other.0) }
        }
        impl BitAnd<super::__p8_u> for p8 {
            type Output = p8;
            #[inline]
            fn bitand(self, other: super::__p8_u) -> p8 { p8(self.0 & other) }
        }
        impl BitAnd<super::__p8_u> for &p8 {
            type Output = p8;
            #[inline]
            fn bitand(self, other: super::__p8_u) -> p8 { p8(self.0 & other) }
        }
        impl BitAnd<&super::__p8_u> for p8 {
            type Output = p8;
            #[inline]
            fn bitand(self, other: &super::__p8_u) -> p8 {
                p8(self.0 & other)
            }
        }
        impl BitAnd<&super::__p8_u> for &p8 {
            type Output = p8;
            #[inline]
            fn bitand(self, other: &super::__p8_u) -> p8 {
                p8(self.0 & other)
            }
        }
        impl BitAndAssign<super::__p8_u> for p8 {
            #[inline]
            fn bitand_assign(&mut self, other: super::__p8_u) {
                *self = *self & other;
            }
        }
        impl BitAndAssign<&super::__p8_u> for p8 {
            #[inline]
            fn bitand_assign(&mut self, other: &super::__p8_u) {
                *self = *self & *other;
            }
        }
        impl BitOr<p8> for p8 {
            type Output = p8;
            #[inline]
            fn bitor(self, other: p8) -> p8 { p8(self.0 | other.0) }
        }
        impl BitOr<p8> for &p8 {
            type Output = p8;
            #[inline]
            fn bitor(self, other: p8) -> p8 { p8(self.0 | other.0) }
        }
        impl BitOr<&p8> for p8 {
            type Output = p8;
            #[inline]
            fn bitor(self, other: &p8) -> p8 { p8(self.0 | other.0) }
        }
        impl BitOr<&p8> for &p8 {
            type Output = p8;
            #[inline]
            fn bitor(self, other: &p8) -> p8 { p8(self.0 | other.0) }
        }
        impl BitOrAssign<p8> for p8 {
            #[inline]
            fn bitor_assign(&mut self, other: p8) { *self = *self | other; }
        }
        impl BitOrAssign<&p8> for p8 {
            #[inline]
            fn bitor_assign(&mut self, other: &p8) { *self = *self | *other; }
        }
        impl BitOr<p8> for super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitor(self, other: p8) -> p8 { p8(self | other.0) }
        }
        impl BitOr<p8> for &super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitor(self, other: p8) -> p8 { p8(self | other.0) }
        }
        impl BitOr<&p8> for super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitor(self, other: &p8) -> p8 { p8(self | other.0) }
        }
        impl BitOr<&p8> for &super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitor(self, other: &p8) -> p8 { p8(self | other.0) }
        }
        impl BitOr<super::__p8_u> for p8 {
            type Output = p8;
            #[inline]
            fn bitor(self, other: super::__p8_u) -> p8 { p8(self.0 | other) }
        }
        impl BitOr<super::__p8_u> for &p8 {
            type Output = p8;
            #[inline]
            fn bitor(self, other: super::__p8_u) -> p8 { p8(self.0 | other) }
        }
        impl BitOr<&super::__p8_u> for p8 {
            type Output = p8;
            #[inline]
            fn bitor(self, other: &super::__p8_u) -> p8 { p8(self.0 | other) }
        }
        impl BitOr<&super::__p8_u> for &p8 {
            type Output = p8;
            #[inline]
            fn bitor(self, other: &super::__p8_u) -> p8 { p8(self.0 | other) }
        }
        impl BitOrAssign<super::__p8_u> for p8 {
            #[inline]
            fn bitor_assign(&mut self, other: super::__p8_u) {
                *self = *self | other;
            }
        }
        impl BitOrAssign<&super::__p8_u> for p8 {
            #[inline]
            fn bitor_assign(&mut self, other: &super::__p8_u) {
                *self = *self | *other;
            }
        }
        impl BitXor<p8> for p8 {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: p8) -> p8 { p8(self.0 ^ other.0) }
        }
        impl BitXor<p8> for &p8 {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: p8) -> p8 { p8(self.0 ^ other.0) }
        }
        impl BitXor<&p8> for p8 {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: &p8) -> p8 { p8(self.0 ^ other.0) }
        }
        impl BitXor<&p8> for &p8 {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: &p8) -> p8 { p8(self.0 ^ other.0) }
        }
        impl BitXorAssign<p8> for p8 {
            #[inline]
            fn bitxor_assign(&mut self, other: p8) { *self = *self ^ other; }
        }
        impl BitXorAssign<&p8> for p8 {
            #[inline]
            fn bitxor_assign(&mut self, other: &p8) {
                *self = *self ^ *other;
            }
        }
        impl BitXor<p8> for super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: p8) -> p8 { p8(self ^ other.0) }
        }
        impl BitXor<p8> for &super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: p8) -> p8 { p8(self ^ other.0) }
        }
        impl BitXor<&p8> for super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: &p8) -> p8 { p8(self ^ other.0) }
        }
        impl BitXor<&p8> for &super::__p8_u {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: &p8) -> p8 { p8(self ^ other.0) }
        }
        impl BitXor<super::__p8_u> for p8 {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: super::__p8_u) -> p8 { p8(self.0 ^ other) }
        }
        impl BitXor<super::__p8_u> for &p8 {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: super::__p8_u) -> p8 { p8(self.0 ^ other) }
        }
        impl BitXor<&super::__p8_u> for p8 {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: &super::__p8_u) -> p8 {
                p8(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p8_u> for &p8 {
            type Output = p8;
            #[inline]
            fn bitxor(self, other: &super::__p8_u) -> p8 {
                p8(self.0 ^ other)
            }
        }
        impl BitXorAssign<super::__p8_u> for p8 {
            #[inline]
            fn bitxor_assign(&mut self, other: super::__p8_u) {
                *self = *self ^ other;
            }
        }
        impl BitXorAssign<&super::__p8_u> for p8 {
            #[inline]
            fn bitxor_assign(&mut self, other: &super::__p8_u) {
                *self = *self ^ *other;
            }
        }
        impl p8 {
            #[inline]
            pub const fn swap_bytes(self) -> p8 { p8(self.0.swap_bytes()) }
            #[inline]
            pub const fn to_le(self) -> p8 { p8(self.0.to_le()) }
            #[inline]
            pub const fn from_le(self_: p8) -> p8 {
                p8(super::__p8_u::from_le(self_.0))
            }
            #[inline]
            pub const fn to_le_bytes(self) -> [u8; 8 / 8] {
                self.0.to_le_bytes()
            }
            #[inline]
            pub const fn from_le_bytes(bytes: [u8; 8 / 8]) -> p8 {
                p8(super::__p8_u::from_le_bytes(bytes))
            }
            #[inline]
            pub const fn to_be(self) -> p8 { p8(self.0.to_be()) }
            #[inline]
            pub const fn from_be(self_: p8) -> p8 {
                p8(super::__p8_u::from_be(self_.0))
            }
            #[inline]
            pub const fn to_be_bytes(self) -> [u8; 8 / 8] {
                self.0.to_be_bytes()
            }
            #[inline]
            pub const fn from_be_bytes(bytes: [u8; 8 / 8]) -> p8 {
                p8(super::__p8_u::from_be_bytes(bytes))
            }
            #[inline]
            pub const fn to_ne_bytes(self) -> [u8; 8 / 8] {
                self.0.to_ne_bytes()
            }
            #[inline]
            pub const fn from_ne_bytes(bytes: [u8; 8 / 8]) -> p8 {
                p8(super::__p8_u::from_ne_bytes(bytes))
            }
        }
        impl p8 {
            #[inline]
            pub const fn reverse_bits(self) -> p8 {
                p8(self.0.reverse_bits())
            }
            #[inline]
            pub const fn count_ones(self) -> u32 { self.0.count_ones() }
            #[inline]
            pub const fn count_zeros(self) -> u32 { self.0.count_zeros() }
            #[inline]
            pub const fn leading_ones(self) -> u32 { self.0.leading_ones() }
            #[inline]
            pub const fn leading_zeros(self) -> u32 { self.0.leading_zeros() }
            #[inline]
            pub const fn trailing_ones(self) -> u32 { self.0.trailing_ones() }
            #[inline]
            pub const fn trailing_zeros(self) -> u32 {
                self.0.trailing_zeros()
            }
        }
        impl p8 {
            #[inline]
            pub const fn checked_shl(self, other: u32) -> Option<p8> {
                match self.0.checked_shl(other) {
                    Some(x) => Some(p8(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn checked_shr(self, other: u32) -> Option<p8> {
                match self.0.checked_shr(other) {
                    Some(x) => Some(p8(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn overflowing_shl(self, other: u32) -> (p8, bool) {
                let (x, o) = self.0.overflowing_shl(other);
                (p8(x), o)
            }
            #[inline]
            pub const fn overflowing_shr(self, other: u32) -> (p8, bool) {
                let (x, o) = self.0.overflowing_shr(other);
                (p8(x), o)
            }
            #[inline]
            pub const fn wrapping_shl(self, other: u32) -> p8 {
                p8(self.0.wrapping_shl(other))
            }
            #[inline]
            pub const fn wrapping_shr(self, other: u32) -> p8 {
                p8(self.0.wrapping_shr(other))
            }
            #[inline]
            pub const fn rotate_left(self, other: u32) -> p8 {
                p8(self.0.rotate_left(other))
            }
            #[inline]
            pub const fn rotate_right(self, other: u32) -> p8 {
                p8(self.0.rotate_right(other))
            }
        }
        impl Shl<u8> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u8) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u8> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u8) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u8> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u8) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u8> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u8) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u16> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u16) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u16> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u16) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u16> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u16) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u16> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u16) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u32> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u32) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u32> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u32) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u32> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u32) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u32> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u32) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u64> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u64) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u64> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u64) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u64> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u64) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u64> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u64) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u128> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u128) -> p8 { p8(self.0 << other) }
        }
        impl Shl<u128> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: u128) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u128> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u128) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&u128> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &u128) -> p8 { p8(self.0 << other) }
        }
        impl Shl<usize> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: usize) -> p8 { p8(self.0 << other) }
        }
        impl Shl<usize> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: usize) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&usize> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &usize) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&usize> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &usize) -> p8 { p8(self.0 << other) }
        }
        impl ShlAssign<u8> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: u8) { *self = *self << other; }
        }
        impl ShlAssign<&u8> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &u8) { *self = *self << other; }
        }
        impl ShlAssign<u16> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: u16) { *self = *self << other; }
        }
        impl ShlAssign<&u16> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &u16) { *self = *self << other; }
        }
        impl ShlAssign<u32> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: u32) { *self = *self << other; }
        }
        impl ShlAssign<&u32> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &u32) { *self = *self << other; }
        }
        impl ShlAssign<u64> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: u64) { *self = *self << other; }
        }
        impl ShlAssign<&u64> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &u64) { *self = *self << other; }
        }
        impl ShlAssign<u128> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: u128) { *self = *self << other; }
        }
        impl ShlAssign<&u128> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &u128) { *self = *self << other; }
        }
        impl ShlAssign<usize> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: usize) { *self = *self << other; }
        }
        impl ShlAssign<&usize> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &usize) {
                *self = *self << other;
            }
        }
        impl Shr<u8> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u8) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u8> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u8) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u8> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u8) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u8> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u8) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u16> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u16) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u16> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u16) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u16> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u16) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u16> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u16) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u32> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u32) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u32> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u32) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u32> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u32) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u32> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u32) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u64> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u64) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u64> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u64) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u64> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u64) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u64> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u64) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u128> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u128) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<u128> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: u128) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u128> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u128) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&u128> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &u128) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<usize> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: usize) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<usize> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: usize) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&usize> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &usize) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&usize> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &usize) -> p8 { p8(self.0 >> other) }
        }
        impl ShrAssign<u8> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: u8) { *self = *self >> other; }
        }
        impl ShrAssign<&u8> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &u8) { *self = *self >> other; }
        }
        impl ShrAssign<u16> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: u16) { *self = *self >> other; }
        }
        impl ShrAssign<&u16> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &u16) { *self = *self >> other; }
        }
        impl ShrAssign<u32> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: u32) { *self = *self >> other; }
        }
        impl ShrAssign<&u32> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &u32) { *self = *self >> other; }
        }
        impl ShrAssign<u64> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: u64) { *self = *self >> other; }
        }
        impl ShrAssign<&u64> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &u64) { *self = *self >> other; }
        }
        impl ShrAssign<u128> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: u128) { *self = *self >> other; }
        }
        impl ShrAssign<&u128> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &u128) { *self = *self >> other; }
        }
        impl ShrAssign<usize> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: usize) { *self = *self >> other; }
        }
        impl ShrAssign<&usize> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &usize) {
                *self = *self >> other;
            }
        }
        impl Shl<i8> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i8) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i8> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i8) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i8> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i8) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i8> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i8) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i16> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i16) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i16> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i16) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i16> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i16) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i16> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i16) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i32> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i32) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i32> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i32) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i32> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i32) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i32> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i32) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i64> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i64) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i64> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i64) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i64> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i64) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i64> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i64) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i128> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i128) -> p8 { p8(self.0 << other) }
        }
        impl Shl<i128> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: i128) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i128> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i128) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&i128> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &i128) -> p8 { p8(self.0 << other) }
        }
        impl Shl<isize> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: isize) -> p8 { p8(self.0 << other) }
        }
        impl Shl<isize> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: isize) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&isize> for p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &isize) -> p8 { p8(self.0 << other) }
        }
        impl Shl<&isize> for &p8 {
            type Output = p8;
            #[inline]
            fn shl(self, other: &isize) -> p8 { p8(self.0 << other) }
        }
        impl ShlAssign<i8> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: i8) { *self = *self << other; }
        }
        impl ShlAssign<&i8> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &i8) { *self = *self << other; }
        }
        impl ShlAssign<i16> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: i16) { *self = *self << other; }
        }
        impl ShlAssign<&i16> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &i16) { *self = *self << other; }
        }
        impl ShlAssign<i32> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: i32) { *self = *self << other; }
        }
        impl ShlAssign<&i32> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &i32) { *self = *self << other; }
        }
        impl ShlAssign<i64> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: i64) { *self = *self << other; }
        }
        impl ShlAssign<&i64> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &i64) { *self = *self << other; }
        }
        impl ShlAssign<i128> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: i128) { *self = *self << other; }
        }
        impl ShlAssign<&i128> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &i128) { *self = *self << other; }
        }
        impl ShlAssign<isize> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: isize) { *self = *self << other; }
        }
        impl ShlAssign<&isize> for p8 {
            #[inline]
            fn shl_assign(&mut self, other: &isize) {
                *self = *self << other;
            }
        }
        impl Shr<i8> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i8) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i8> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i8) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i8> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i8) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i8> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i8) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i16> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i16) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i16> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i16) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i16> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i16) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i16> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i16) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i32> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i32) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i32> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i32) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i32> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i32) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i32> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i32) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i64> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i64) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i64> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i64) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i64> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i64) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i64> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i64) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i128> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i128) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<i128> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: i128) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i128> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i128) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&i128> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &i128) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<isize> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: isize) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<isize> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: isize) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&isize> for p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &isize) -> p8 { p8(self.0 >> other) }
        }
        impl Shr<&isize> for &p8 {
            type Output = p8;
            #[inline]
            fn shr(self, other: &isize) -> p8 { p8(self.0 >> other) }
        }
        impl ShrAssign<i8> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: i8) { *self = *self >> other; }
        }
        impl ShrAssign<&i8> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &i8) { *self = *self >> other; }
        }
        impl ShrAssign<i16> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: i16) { *self = *self >> other; }
        }
        impl ShrAssign<&i16> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &i16) { *self = *self >> other; }
        }
        impl ShrAssign<i32> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: i32) { *self = *self >> other; }
        }
        impl ShrAssign<&i32> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &i32) { *self = *self >> other; }
        }
        impl ShrAssign<i64> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: i64) { *self = *self >> other; }
        }
        impl ShrAssign<&i64> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &i64) { *self = *self >> other; }
        }
        impl ShrAssign<i128> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: i128) { *self = *self >> other; }
        }
        impl ShrAssign<&i128> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &i128) { *self = *self >> other; }
        }
        impl ShrAssign<isize> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: isize) { *self = *self >> other; }
        }
        impl ShrAssign<&isize> for p8 {
            #[inline]
            fn shr_assign(&mut self, other: &isize) {
                *self = *self >> other;
            }
        }
        impl fmt::Debug for p8 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("{0}(0x{1:x})", "p8", self.0))
            }
        }
        impl fmt::Display for p8 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("0x{0:x}", self.0))
            }
        }
        impl fmt::Binary for p8 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p8_u as fmt::Binary>::fmt(&self.0, f)
            }
        }
        impl fmt::Octal for p8 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p8_u as fmt::Octal>::fmt(&self.0, f)
            }
        }
        impl fmt::LowerHex for p8 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p8_u as fmt::LowerHex>::fmt(&self.0, f)
            }
        }
        impl fmt::UpperHex for p8 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p8_u as fmt::UpperHex>::fmt(&self.0, f)
            }
        }
        impl FromStr for p8 {
            type Err = ParseIntError;
            fn from_str(s: &str) -> Result<p8, ParseIntError> {
                if s.starts_with("0x") {
                    Ok(p8(super::__p8_u::from_str_radix(&s[2..], 16)?))
                } else {
                    "".parse::<super::__p8_u>()?;
                    ::core::panicking::panic("internal error: entered unreachable code")
                }
            }
        }
        impl p8 {
            pub fn from_str_radix(s: &str, radix: u32)
                -> Result<p8, ParseIntError> {
                Ok(p8(super::__p8_u::from_str_radix(s, radix)?))
            }
        }
    }
    use u8 as __p8_u;
    use i8 as __p8_i;
    pub use __p16_gen::p16;
    mod __p16_gen {
        use core::mem::size_of;
        use core::ops::*;
        use core::iter::*;
        use core::num::TryFromIntError;
        use core::num::ParseIntError;
        use core::fmt;
        use core::str::FromStr;
        use core::slice;
        use crate::traits::TryFrom;
        use crate::traits::FromLossy;
        #[allow(non_camel_case_types)]
        #[repr(transparent)]
        pub struct p16(pub super::__p16_u);
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::default::Default for p16 {
            #[inline]
            fn default() -> p16 { p16(::core::default::Default::default()) }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::Copy for p16 { }
        #[automatically_derived]
        #[doc(hidden)]
        #[allow(non_camel_case_types)]
        unsafe impl ::core::clone::TrivialClone for p16 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::clone::Clone for p16 {
            #[inline]
            fn clone(&self) -> p16 {
                let _: ::core::clone::AssertParamIsClone<super::__p16_u>;
                *self
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Eq for p16 {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_fields_are_eq(&self) {
                let _: ::core::cmp::AssertParamIsEq<super::__p16_u>;
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::StructuralPartialEq for p16 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialEq for p16 {
            #[inline]
            fn eq(&self, other: &p16) -> bool { self.0 == other.0 }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Ord for p16 {
            #[inline]
            fn cmp(&self, other: &p16) -> ::core::cmp::Ordering {
                ::core::cmp::Ord::cmp(&self.0, &other.0)
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialOrd for p16 {
            #[inline]
            fn partial_cmp(&self, other: &p16)
                -> ::core::option::Option<::core::cmp::Ordering> {
                ::core::option::Option::Some(::core::cmp::Ord::cmp(self,
                        other))
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::hash::Hash for p16 {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) {
                ::core::hash::Hash::hash(&self.0, state)
            }
        }
        impl p16 {
            #[inline]
            pub const fn new(x: super::__p16_u) -> p16 { p16(x) }
            #[inline]
            pub const fn get(self) -> super::__p16_u { self.0 }
            #[inline]
            pub const fn naive_add(self, other: p16) -> p16 {
                p16(self.0 ^ other.0)
            }
            #[inline]
            pub fn add(self, other: p16) -> p16 { p16(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_sub(self, other: p16) -> p16 {
                p16(self.0 ^ other.0)
            }
            #[inline]
            pub fn sub(self, other: p16) -> p16 { p16(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_widening_mul(self, other: p16) -> (p16, p16) {
                let a = self.0;
                let b = other.0;
                let mut lo = 0;
                let mut hi = 0;
                let mut i = 0;
                while i < 16 {
                    let mask =
                        (((a as super::__p16_i) << (16 - 1 - i)) >> (16 - 1)) as
                            super::__p16_u;
                    lo ^= mask & (b << i);
                    hi ^= mask & (b >> (16 - 1 - i));
                    i += 1;
                }
                (p16(lo), p16(hi >> 1))
            }
            #[inline]
            pub const fn naive_overflowing_mul(self, other: p16)
                -> (p16, bool) {
                let (lo, hi) = self.naive_widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub const fn naive_checked_mul(self, other: p16) -> Option<p16> {
                match self.naive_overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub const fn naive_wrapping_mul(self, other: p16) -> p16 {
                let a = self.0;
                let b = other.0;
                let mut x = 0;
                let mut i = 0;
                while i < 16 {
                    let mask =
                        (((a as super::__p16_i) << (16 - 1 - i)) >> (16 - 1)) as
                            super::__p16_u;
                    x ^= mask & (b << i);
                    i += 1;
                }
                p16(x)
            }
            #[inline]
            pub const fn naive_mul(self, other: p16) -> p16 {
                match self.naive_checked_mul(other) {
                    Some(x) => x,
                    None => p16(self.0 / 0),
                }
            }
            #[inline]
            pub fn widening_mul(self, other: p16) -> (p16, p16) {
                self.naive_widening_mul(other)
            }
            #[inline]
            pub fn overflowing_mul(self, other: p16) -> (p16, bool) {
                let (lo, hi) = self.widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub fn checked_mul(self, other: p16) -> Option<p16> {
                match self.overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub fn wrapping_mul(self, other: p16) -> p16 {
                self.naive_wrapping_mul(other)
            }
            #[inline]
            pub fn mul(self, other: p16) -> p16 {
                self.checked_mul(other).expect("overflow in polynomial multiply")
            }
            #[inline]
            pub const fn naive_overflowing_pow(self, exp: u32)
                -> (p16, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p16(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.naive_overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.naive_overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub const fn naive_checked_pow(self, exp: u32) -> Option<p16> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p16(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.naive_checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.naive_checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub const fn naive_wrapping_pow(self, exp: u32) -> p16 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p16(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_wrapping_mul(a);
                }
            }
            #[inline]
            pub const fn naive_pow(self, exp: u32) -> p16 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p16(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_mul(a);
                }
            }
            #[inline]
            pub fn overflowing_pow(self, exp: u32) -> (p16, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p16(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub fn checked_pow(self, exp: u32) -> Option<p16> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p16(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub fn wrapping_pow(self, exp: u32) -> p16 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p16(1);
                loop {
                    if exp & 1 != 0 { x = x.wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.wrapping_mul(a);
                }
            }
            #[inline]
            pub fn pow(self, exp: u32) -> p16 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p16(1);
                loop {
                    if exp & 1 != 0 { x = x.mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.mul(a);
                }
            }
            #[inline]
            pub const fn naive_checked_div(self, other: p16) -> Option<p16> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    let mut x = 0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        x ^= 1 << (b.leading_zeros() - a.leading_zeros());
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p16(x))
                }
            }
            #[inline]
            pub const fn naive_div(self, other: p16) -> p16 {
                match self.naive_checked_div(other) {
                    Some(x) => x,
                    None => p16(self.0 / 0),
                }
            }
            #[inline]
            pub const fn naive_checked_rem(self, other: p16) -> Option<p16> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p16(a))
                }
            }
            #[inline]
            pub const fn naive_rem(self, other: p16) -> p16 {
                match self.naive_checked_rem(other) {
                    Some(x) => x,
                    None => p16(self.0 / 0),
                }
            }
            #[inline]
            pub fn slice_from_slice(slice: &[super::__p16_u]) -> &[p16] {
                unsafe {
                    slice::from_raw_parts(slice.as_ptr() as *const p16,
                        slice.len())
                }
            }
            #[inline]
            pub fn slice_from_slice_mut(slice: &mut [super::__p16_u])
                -> &mut [p16] {
                unsafe {
                    slice::from_raw_parts_mut(slice.as_mut_ptr() as *mut p16,
                        slice.len())
                }
            }
        }
        impl From<super::__p16_u> for p16 {
            #[inline]
            fn from(x: super::__p16_u) -> p16 { p16(x) }
        }
        impl From<bool> for p16 {
            #[inline]
            fn from(x: bool) -> p16 { p16(super::__p16_u::from(x)) }
        }
        impl From<u8> for p16 {
            #[inline]
            fn from(x: u8) -> p16 { p16(super::__p16_u::from(x)) }
        }
        impl From<crate::p8> for p16 {
            #[inline]
            fn from(x: crate::p8) -> p16 { p16(super::__p16_u::from(x.0)) }
        }
        impl TryFrom<u32> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u32) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<u64> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u64) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<u128> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u128) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<usize> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: usize) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<crate::p32> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p32) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::p64> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p64) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::p128> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p128) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::psize> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::psize) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x.0)?))
            }
        }
        impl FromLossy<u32> for p16 {
            #[inline]
            fn from_lossy(x: u32) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<u64> for p16 {
            #[inline]
            fn from_lossy(x: u64) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<u128> for p16 {
            #[inline]
            fn from_lossy(x: u128) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<usize> for p16 {
            #[inline]
            fn from_lossy(x: usize) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<crate::p32> for p16 {
            #[inline]
            fn from_lossy(x: crate::p32) -> p16 { p16(x.0 as super::__p16_u) }
        }
        impl FromLossy<crate::p64> for p16 {
            #[inline]
            fn from_lossy(x: crate::p64) -> p16 { p16(x.0 as super::__p16_u) }
        }
        impl FromLossy<crate::p128> for p16 {
            #[inline]
            fn from_lossy(x: crate::p128) -> p16 {
                p16(x.0 as super::__p16_u)
            }
        }
        impl FromLossy<crate::psize> for p16 {
            #[inline]
            fn from_lossy(x: crate::psize) -> p16 {
                p16(x.0 as super::__p16_u)
            }
        }
        impl TryFrom<i8> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i8) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<i16> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i16) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<i32> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i32) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<i64> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i64) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<i128> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i128) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl TryFrom<isize> for p16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: isize) -> Result<p16, Self::Error> {
                Ok(p16(super::__p16_u::try_from(x)?))
            }
        }
        impl FromLossy<i8> for p16 {
            #[inline]
            fn from_lossy(x: i8) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<i16> for p16 {
            #[inline]
            fn from_lossy(x: i16) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<i32> for p16 {
            #[inline]
            fn from_lossy(x: i32) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<i64> for p16 {
            #[inline]
            fn from_lossy(x: i64) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<i128> for p16 {
            #[inline]
            fn from_lossy(x: i128) -> p16 { p16(x as super::__p16_u) }
        }
        impl FromLossy<isize> for p16 {
            #[inline]
            fn from_lossy(x: isize) -> p16 { p16(x as super::__p16_u) }
        }
        impl From<p16> for super::__p16_u {
            #[inline]
            fn from(x: p16) -> super::__p16_u { x.0 }
        }
        impl From<p16> for u32 {
            #[inline]
            fn from(x: p16) -> u32 { u32::from(x.0) }
        }
        impl From<p16> for u64 {
            #[inline]
            fn from(x: p16) -> u64 { u64::from(x.0) }
        }
        impl From<p16> for u128 {
            #[inline]
            fn from(x: p16) -> u128 { u128::from(x.0) }
        }
        impl From<p16> for usize {
            #[inline]
            fn from(x: p16) -> usize { usize::from(x.0) }
        }
        impl TryFrom<p16> for u8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p16) -> Result<u8, Self::Error> {
                u8::try_from(x.0)
            }
        }
        impl FromLossy<p16> for u8 {
            #[inline]
            fn from_lossy(x: p16) -> u8 { x.0 as u8 }
        }
        impl From<p16> for i32 {
            #[inline]
            fn from(x: p16) -> i32 { i32::from(x.0) }
        }
        impl From<p16> for i64 {
            #[inline]
            fn from(x: p16) -> i64 { i64::from(x.0) }
        }
        impl From<p16> for i128 {
            #[inline]
            fn from(x: p16) -> i128 { i128::from(x.0) }
        }
        impl TryFrom<p16> for i8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p16) -> Result<i8, Self::Error> {
                i8::try_from(x.0)
            }
        }
        impl TryFrom<p16> for i16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p16) -> Result<i16, Self::Error> {
                i16::try_from(x.0)
            }
        }
        impl TryFrom<p16> for isize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p16) -> Result<isize, Self::Error> {
                isize::try_from(x.0)
            }
        }
        impl FromLossy<p16> for i8 {
            #[inline]
            fn from_lossy(x: p16) -> i8 { x.0 as i8 }
        }
        impl FromLossy<p16> for i16 {
            #[inline]
            fn from_lossy(x: p16) -> i16 { x.0 as i16 }
        }
        impl FromLossy<p16> for isize {
            #[inline]
            fn from_lossy(x: p16) -> isize { x.0 as isize }
        }
        impl Neg for p16 {
            type Output = p16;
            #[inline]
            fn neg(self) -> p16 { self }
        }
        impl Neg for &p16 {
            type Output = p16;
            #[inline]
            fn neg(self) -> p16 { *self }
        }
        impl Add<p16> for p16 {
            type Output = p16;
            #[inline]
            fn add(self, other: p16) -> p16 { p16::add(self, other) }
        }
        impl Add<p16> for &p16 {
            type Output = p16;
            #[inline]
            fn add(self, other: p16) -> p16 { p16::add(*self, other) }
        }
        impl Add<&p16> for p16 {
            type Output = p16;
            #[inline]
            fn add(self, other: &p16) -> p16 { p16::add(self, *other) }
        }
        impl Add<&p16> for &p16 {
            type Output = p16;
            #[inline]
            fn add(self, other: &p16) -> p16 { p16::add(*self, *other) }
        }
        impl AddAssign<p16> for p16 {
            #[inline]
            fn add_assign(&mut self, other: p16) { *self = self.add(other) }
        }
        impl AddAssign<&p16> for p16 {
            #[inline]
            fn add_assign(&mut self, other: &p16) { *self = self.add(*other) }
        }
        impl Sum<p16> for p16 {
            #[inline]
            fn sum<I>(iter: I) -> p16 where I: Iterator<Item = p16> {
                iter.fold(p16(0), |a, x| a + x)
            }
        }
        impl<'a> Sum<&'a p16> for p16 {
            #[inline]
            fn sum<I>(iter: I) -> p16 where I: Iterator<Item = &'a p16> {
                iter.fold(p16(0), |a, x| a + *x)
            }
        }
        impl Sub for p16 {
            type Output = p16;
            #[inline]
            fn sub(self, other: p16) -> p16 { p16::sub(self, other) }
        }
        impl Sub<p16> for &p16 {
            type Output = p16;
            #[inline]
            fn sub(self, other: p16) -> p16 { p16::sub(*self, other) }
        }
        impl Sub<&p16> for p16 {
            type Output = p16;
            #[inline]
            fn sub(self, other: &p16) -> p16 { p16::sub(self, *other) }
        }
        impl Sub<&p16> for &p16 {
            type Output = p16;
            #[inline]
            fn sub(self, other: &p16) -> p16 { p16::sub(*self, *other) }
        }
        impl SubAssign<p16> for p16 {
            #[inline]
            fn sub_assign(&mut self, other: p16) { *self = self.sub(other) }
        }
        impl SubAssign<&p16> for p16 {
            #[inline]
            fn sub_assign(&mut self, other: &p16) { *self = self.sub(*other) }
        }
        impl Mul for p16 {
            type Output = p16;
            #[inline]
            fn mul(self, other: p16) -> p16 { p16::mul(self, other) }
        }
        impl Mul<p16> for &p16 {
            type Output = p16;
            #[inline]
            fn mul(self, other: p16) -> p16 { p16::mul(*self, other) }
        }
        impl Mul<&p16> for p16 {
            type Output = p16;
            #[inline]
            fn mul(self, other: &p16) -> p16 { p16::mul(self, *other) }
        }
        impl Mul<&p16> for &p16 {
            type Output = p16;
            #[inline]
            fn mul(self, other: &p16) -> p16 { p16::mul(*self, *other) }
        }
        impl MulAssign<p16> for p16 {
            #[inline]
            fn mul_assign(&mut self, other: p16) { *self = self.mul(other) }
        }
        impl MulAssign<&p16> for p16 {
            #[inline]
            fn mul_assign(&mut self, other: &p16) { *self = self.mul(*other) }
        }
        impl Product<p16> for p16 {
            #[inline]
            fn product<I>(iter: I) -> p16 where I: Iterator<Item = p16> {
                iter.fold(p16(0), |a, x| a * x)
            }
        }
        impl<'a> Product<&'a p16> for p16 {
            #[inline]
            fn product<I>(iter: I) -> p16 where I: Iterator<Item = &'a p16> {
                iter.fold(p16(0), |a, x| a * *x)
            }
        }
        impl Div for p16 {
            type Output = p16;
            #[inline]
            fn div(self, other: p16) -> p16 { p16::naive_div(self, other) }
        }
        impl Div<p16> for &p16 {
            type Output = p16;
            #[inline]
            fn div(self, other: p16) -> p16 { p16::naive_div(*self, other) }
        }
        impl Div<&p16> for p16 {
            type Output = p16;
            #[inline]
            fn div(self, other: &p16) -> p16 { p16::naive_div(self, *other) }
        }
        impl Div<&p16> for &p16 {
            type Output = p16;
            #[inline]
            fn div(self, other: &p16) -> p16 { p16::naive_div(*self, *other) }
        }
        impl DivAssign<p16> for p16 {
            #[inline]
            fn div_assign(&mut self, other: p16) { *self = self.div(other) }
        }
        impl DivAssign<&p16> for p16 {
            #[inline]
            fn div_assign(&mut self, other: &p16) { *self = self.div(*other) }
        }
        impl Rem for p16 {
            type Output = p16;
            #[inline]
            fn rem(self, other: p16) -> p16 { p16::naive_rem(self, other) }
        }
        impl Rem<p16> for &p16 {
            type Output = p16;
            #[inline]
            fn rem(self, other: p16) -> p16 { p16::naive_rem(*self, other) }
        }
        impl Rem<&p16> for p16 {
            type Output = p16;
            #[inline]
            fn rem(self, other: &p16) -> p16 { p16::naive_rem(self, *other) }
        }
        impl Rem<&p16> for &p16 {
            type Output = p16;
            #[inline]
            fn rem(self, other: &p16) -> p16 { p16::naive_rem(*self, *other) }
        }
        impl RemAssign<p16> for p16 {
            #[inline]
            fn rem_assign(&mut self, other: p16) { *self = self.rem(other) }
        }
        impl RemAssign<&p16> for p16 {
            #[inline]
            fn rem_assign(&mut self, other: &p16) { *self = self.rem(*other) }
        }
        impl Not for p16 {
            type Output = p16;
            #[inline]
            fn not(self) -> p16 { p16(!self.0) }
        }
        impl Not for &p16 {
            type Output = p16;
            #[inline]
            fn not(self) -> p16 { p16(!self.0) }
        }
        impl BitAnd<p16> for p16 {
            type Output = p16;
            #[inline]
            fn bitand(self, other: p16) -> p16 { p16(self.0 & other.0) }
        }
        impl BitAnd<p16> for &p16 {
            type Output = p16;
            #[inline]
            fn bitand(self, other: p16) -> p16 { p16(self.0 & other.0) }
        }
        impl BitAnd<&p16> for p16 {
            type Output = p16;
            #[inline]
            fn bitand(self, other: &p16) -> p16 { p16(self.0 & other.0) }
        }
        impl BitAnd<&p16> for &p16 {
            type Output = p16;
            #[inline]
            fn bitand(self, other: &p16) -> p16 { p16(self.0 & other.0) }
        }
        impl BitAndAssign<p16> for p16 {
            #[inline]
            fn bitand_assign(&mut self, other: p16) { *self = *self & other; }
        }
        impl BitAndAssign<&p16> for p16 {
            #[inline]
            fn bitand_assign(&mut self, other: &p16) {
                *self = *self & *other;
            }
        }
        impl BitAnd<p16> for super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitand(self, other: p16) -> p16 { p16(self & other.0) }
        }
        impl BitAnd<p16> for &super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitand(self, other: p16) -> p16 { p16(self & other.0) }
        }
        impl BitAnd<&p16> for super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitand(self, other: &p16) -> p16 { p16(self & other.0) }
        }
        impl BitAnd<&p16> for &super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitand(self, other: &p16) -> p16 { p16(self & other.0) }
        }
        impl BitAnd<super::__p16_u> for p16 {
            type Output = p16;
            #[inline]
            fn bitand(self, other: super::__p16_u) -> p16 {
                p16(self.0 & other)
            }
        }
        impl BitAnd<super::__p16_u> for &p16 {
            type Output = p16;
            #[inline]
            fn bitand(self, other: super::__p16_u) -> p16 {
                p16(self.0 & other)
            }
        }
        impl BitAnd<&super::__p16_u> for p16 {
            type Output = p16;
            #[inline]
            fn bitand(self, other: &super::__p16_u) -> p16 {
                p16(self.0 & other)
            }
        }
        impl BitAnd<&super::__p16_u> for &p16 {
            type Output = p16;
            #[inline]
            fn bitand(self, other: &super::__p16_u) -> p16 {
                p16(self.0 & other)
            }
        }
        impl BitAndAssign<super::__p16_u> for p16 {
            #[inline]
            fn bitand_assign(&mut self, other: super::__p16_u) {
                *self = *self & other;
            }
        }
        impl BitAndAssign<&super::__p16_u> for p16 {
            #[inline]
            fn bitand_assign(&mut self, other: &super::__p16_u) {
                *self = *self & *other;
            }
        }
        impl BitOr<p16> for p16 {
            type Output = p16;
            #[inline]
            fn bitor(self, other: p16) -> p16 { p16(self.0 | other.0) }
        }
        impl BitOr<p16> for &p16 {
            type Output = p16;
            #[inline]
            fn bitor(self, other: p16) -> p16 { p16(self.0 | other.0) }
        }
        impl BitOr<&p16> for p16 {
            type Output = p16;
            #[inline]
            fn bitor(self, other: &p16) -> p16 { p16(self.0 | other.0) }
        }
        impl BitOr<&p16> for &p16 {
            type Output = p16;
            #[inline]
            fn bitor(self, other: &p16) -> p16 { p16(self.0 | other.0) }
        }
        impl BitOrAssign<p16> for p16 {
            #[inline]
            fn bitor_assign(&mut self, other: p16) { *self = *self | other; }
        }
        impl BitOrAssign<&p16> for p16 {
            #[inline]
            fn bitor_assign(&mut self, other: &p16) {
                *self = *self | *other;
            }
        }
        impl BitOr<p16> for super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitor(self, other: p16) -> p16 { p16(self | other.0) }
        }
        impl BitOr<p16> for &super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitor(self, other: p16) -> p16 { p16(self | other.0) }
        }
        impl BitOr<&p16> for super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitor(self, other: &p16) -> p16 { p16(self | other.0) }
        }
        impl BitOr<&p16> for &super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitor(self, other: &p16) -> p16 { p16(self | other.0) }
        }
        impl BitOr<super::__p16_u> for p16 {
            type Output = p16;
            #[inline]
            fn bitor(self, other: super::__p16_u) -> p16 {
                p16(self.0 | other)
            }
        }
        impl BitOr<super::__p16_u> for &p16 {
            type Output = p16;
            #[inline]
            fn bitor(self, other: super::__p16_u) -> p16 {
                p16(self.0 | other)
            }
        }
        impl BitOr<&super::__p16_u> for p16 {
            type Output = p16;
            #[inline]
            fn bitor(self, other: &super::__p16_u) -> p16 {
                p16(self.0 | other)
            }
        }
        impl BitOr<&super::__p16_u> for &p16 {
            type Output = p16;
            #[inline]
            fn bitor(self, other: &super::__p16_u) -> p16 {
                p16(self.0 | other)
            }
        }
        impl BitOrAssign<super::__p16_u> for p16 {
            #[inline]
            fn bitor_assign(&mut self, other: super::__p16_u) {
                *self = *self | other;
            }
        }
        impl BitOrAssign<&super::__p16_u> for p16 {
            #[inline]
            fn bitor_assign(&mut self, other: &super::__p16_u) {
                *self = *self | *other;
            }
        }
        impl BitXor<p16> for p16 {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: p16) -> p16 { p16(self.0 ^ other.0) }
        }
        impl BitXor<p16> for &p16 {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: p16) -> p16 { p16(self.0 ^ other.0) }
        }
        impl BitXor<&p16> for p16 {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: &p16) -> p16 { p16(self.0 ^ other.0) }
        }
        impl BitXor<&p16> for &p16 {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: &p16) -> p16 { p16(self.0 ^ other.0) }
        }
        impl BitXorAssign<p16> for p16 {
            #[inline]
            fn bitxor_assign(&mut self, other: p16) { *self = *self ^ other; }
        }
        impl BitXorAssign<&p16> for p16 {
            #[inline]
            fn bitxor_assign(&mut self, other: &p16) {
                *self = *self ^ *other;
            }
        }
        impl BitXor<p16> for super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: p16) -> p16 { p16(self ^ other.0) }
        }
        impl BitXor<p16> for &super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: p16) -> p16 { p16(self ^ other.0) }
        }
        impl BitXor<&p16> for super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: &p16) -> p16 { p16(self ^ other.0) }
        }
        impl BitXor<&p16> for &super::__p16_u {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: &p16) -> p16 { p16(self ^ other.0) }
        }
        impl BitXor<super::__p16_u> for p16 {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: super::__p16_u) -> p16 {
                p16(self.0 ^ other)
            }
        }
        impl BitXor<super::__p16_u> for &p16 {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: super::__p16_u) -> p16 {
                p16(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p16_u> for p16 {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: &super::__p16_u) -> p16 {
                p16(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p16_u> for &p16 {
            type Output = p16;
            #[inline]
            fn bitxor(self, other: &super::__p16_u) -> p16 {
                p16(self.0 ^ other)
            }
        }
        impl BitXorAssign<super::__p16_u> for p16 {
            #[inline]
            fn bitxor_assign(&mut self, other: super::__p16_u) {
                *self = *self ^ other;
            }
        }
        impl BitXorAssign<&super::__p16_u> for p16 {
            #[inline]
            fn bitxor_assign(&mut self, other: &super::__p16_u) {
                *self = *self ^ *other;
            }
        }
        impl p16 {
            #[inline]
            pub const fn swap_bytes(self) -> p16 { p16(self.0.swap_bytes()) }
            #[inline]
            pub const fn to_le(self) -> p16 { p16(self.0.to_le()) }
            #[inline]
            pub const fn from_le(self_: p16) -> p16 {
                p16(super::__p16_u::from_le(self_.0))
            }
            #[inline]
            pub const fn to_le_bytes(self) -> [u8; 16 / 8] {
                self.0.to_le_bytes()
            }
            #[inline]
            pub const fn from_le_bytes(bytes: [u8; 16 / 8]) -> p16 {
                p16(super::__p16_u::from_le_bytes(bytes))
            }
            #[inline]
            pub const fn to_be(self) -> p16 { p16(self.0.to_be()) }
            #[inline]
            pub const fn from_be(self_: p16) -> p16 {
                p16(super::__p16_u::from_be(self_.0))
            }
            #[inline]
            pub const fn to_be_bytes(self) -> [u8; 16 / 8] {
                self.0.to_be_bytes()
            }
            #[inline]
            pub const fn from_be_bytes(bytes: [u8; 16 / 8]) -> p16 {
                p16(super::__p16_u::from_be_bytes(bytes))
            }
            #[inline]
            pub const fn to_ne_bytes(self) -> [u8; 16 / 8] {
                self.0.to_ne_bytes()
            }
            #[inline]
            pub const fn from_ne_bytes(bytes: [u8; 16 / 8]) -> p16 {
                p16(super::__p16_u::from_ne_bytes(bytes))
            }
        }
        impl p16 {
            #[inline]
            pub const fn reverse_bits(self) -> p16 {
                p16(self.0.reverse_bits())
            }
            #[inline]
            pub const fn count_ones(self) -> u32 { self.0.count_ones() }
            #[inline]
            pub const fn count_zeros(self) -> u32 { self.0.count_zeros() }
            #[inline]
            pub const fn leading_ones(self) -> u32 { self.0.leading_ones() }
            #[inline]
            pub const fn leading_zeros(self) -> u32 { self.0.leading_zeros() }
            #[inline]
            pub const fn trailing_ones(self) -> u32 { self.0.trailing_ones() }
            #[inline]
            pub const fn trailing_zeros(self) -> u32 {
                self.0.trailing_zeros()
            }
        }
        impl p16 {
            #[inline]
            pub const fn checked_shl(self, other: u32) -> Option<p16> {
                match self.0.checked_shl(other) {
                    Some(x) => Some(p16(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn checked_shr(self, other: u32) -> Option<p16> {
                match self.0.checked_shr(other) {
                    Some(x) => Some(p16(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn overflowing_shl(self, other: u32) -> (p16, bool) {
                let (x, o) = self.0.overflowing_shl(other);
                (p16(x), o)
            }
            #[inline]
            pub const fn overflowing_shr(self, other: u32) -> (p16, bool) {
                let (x, o) = self.0.overflowing_shr(other);
                (p16(x), o)
            }
            #[inline]
            pub const fn wrapping_shl(self, other: u32) -> p16 {
                p16(self.0.wrapping_shl(other))
            }
            #[inline]
            pub const fn wrapping_shr(self, other: u32) -> p16 {
                p16(self.0.wrapping_shr(other))
            }
            #[inline]
            pub const fn rotate_left(self, other: u32) -> p16 {
                p16(self.0.rotate_left(other))
            }
            #[inline]
            pub const fn rotate_right(self, other: u32) -> p16 {
                p16(self.0.rotate_right(other))
            }
        }
        impl Shl<u8> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u8) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u8> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u8) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u8> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u8) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u8> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u8) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u16> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u16) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u16> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u16) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u16> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u16) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u16> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u16) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u32> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u32) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u32> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u32) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u32> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u32) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u32> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u32) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u64> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u64) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u64> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u64) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u64> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u64) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u64> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u64) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u128> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u128) -> p16 { p16(self.0 << other) }
        }
        impl Shl<u128> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: u128) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u128> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u128) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&u128> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &u128) -> p16 { p16(self.0 << other) }
        }
        impl Shl<usize> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: usize) -> p16 { p16(self.0 << other) }
        }
        impl Shl<usize> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: usize) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&usize> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &usize) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&usize> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &usize) -> p16 { p16(self.0 << other) }
        }
        impl ShlAssign<u8> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: u8) { *self = *self << other; }
        }
        impl ShlAssign<&u8> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &u8) { *self = *self << other; }
        }
        impl ShlAssign<u16> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: u16) { *self = *self << other; }
        }
        impl ShlAssign<&u16> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &u16) { *self = *self << other; }
        }
        impl ShlAssign<u32> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: u32) { *self = *self << other; }
        }
        impl ShlAssign<&u32> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &u32) { *self = *self << other; }
        }
        impl ShlAssign<u64> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: u64) { *self = *self << other; }
        }
        impl ShlAssign<&u64> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &u64) { *self = *self << other; }
        }
        impl ShlAssign<u128> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: u128) { *self = *self << other; }
        }
        impl ShlAssign<&u128> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &u128) { *self = *self << other; }
        }
        impl ShlAssign<usize> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: usize) { *self = *self << other; }
        }
        impl ShlAssign<&usize> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &usize) {
                *self = *self << other;
            }
        }
        impl Shr<u8> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u8) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u8> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u8) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u8> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u8) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u8> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u8) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u16> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u16) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u16> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u16) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u16> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u16) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u16> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u16) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u32> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u32) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u32> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u32) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u32> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u32) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u32> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u32) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u64> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u64) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u64> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u64) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u64> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u64) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u64> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u64) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u128> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u128) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<u128> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: u128) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u128> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u128) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&u128> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &u128) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<usize> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: usize) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<usize> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: usize) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&usize> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &usize) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&usize> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &usize) -> p16 { p16(self.0 >> other) }
        }
        impl ShrAssign<u8> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: u8) { *self = *self >> other; }
        }
        impl ShrAssign<&u8> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &u8) { *self = *self >> other; }
        }
        impl ShrAssign<u16> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: u16) { *self = *self >> other; }
        }
        impl ShrAssign<&u16> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &u16) { *self = *self >> other; }
        }
        impl ShrAssign<u32> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: u32) { *self = *self >> other; }
        }
        impl ShrAssign<&u32> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &u32) { *self = *self >> other; }
        }
        impl ShrAssign<u64> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: u64) { *self = *self >> other; }
        }
        impl ShrAssign<&u64> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &u64) { *self = *self >> other; }
        }
        impl ShrAssign<u128> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: u128) { *self = *self >> other; }
        }
        impl ShrAssign<&u128> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &u128) { *self = *self >> other; }
        }
        impl ShrAssign<usize> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: usize) { *self = *self >> other; }
        }
        impl ShrAssign<&usize> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &usize) {
                *self = *self >> other;
            }
        }
        impl Shl<i8> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i8) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i8> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i8) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i8> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i8) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i8> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i8) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i16> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i16) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i16> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i16) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i16> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i16) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i16> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i16) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i32> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i32) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i32> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i32) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i32> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i32) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i32> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i32) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i64> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i64) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i64> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i64) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i64> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i64) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i64> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i64) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i128> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i128) -> p16 { p16(self.0 << other) }
        }
        impl Shl<i128> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: i128) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i128> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i128) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&i128> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &i128) -> p16 { p16(self.0 << other) }
        }
        impl Shl<isize> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: isize) -> p16 { p16(self.0 << other) }
        }
        impl Shl<isize> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: isize) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&isize> for p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &isize) -> p16 { p16(self.0 << other) }
        }
        impl Shl<&isize> for &p16 {
            type Output = p16;
            #[inline]
            fn shl(self, other: &isize) -> p16 { p16(self.0 << other) }
        }
        impl ShlAssign<i8> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: i8) { *self = *self << other; }
        }
        impl ShlAssign<&i8> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &i8) { *self = *self << other; }
        }
        impl ShlAssign<i16> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: i16) { *self = *self << other; }
        }
        impl ShlAssign<&i16> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &i16) { *self = *self << other; }
        }
        impl ShlAssign<i32> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: i32) { *self = *self << other; }
        }
        impl ShlAssign<&i32> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &i32) { *self = *self << other; }
        }
        impl ShlAssign<i64> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: i64) { *self = *self << other; }
        }
        impl ShlAssign<&i64> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &i64) { *self = *self << other; }
        }
        impl ShlAssign<i128> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: i128) { *self = *self << other; }
        }
        impl ShlAssign<&i128> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &i128) { *self = *self << other; }
        }
        impl ShlAssign<isize> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: isize) { *self = *self << other; }
        }
        impl ShlAssign<&isize> for p16 {
            #[inline]
            fn shl_assign(&mut self, other: &isize) {
                *self = *self << other;
            }
        }
        impl Shr<i8> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i8) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i8> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i8) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i8> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i8) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i8> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i8) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i16> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i16) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i16> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i16) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i16> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i16) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i16> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i16) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i32> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i32) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i32> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i32) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i32> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i32) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i32> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i32) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i64> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i64) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i64> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i64) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i64> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i64) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i64> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i64) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i128> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i128) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<i128> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: i128) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i128> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i128) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&i128> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &i128) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<isize> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: isize) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<isize> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: isize) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&isize> for p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &isize) -> p16 { p16(self.0 >> other) }
        }
        impl Shr<&isize> for &p16 {
            type Output = p16;
            #[inline]
            fn shr(self, other: &isize) -> p16 { p16(self.0 >> other) }
        }
        impl ShrAssign<i8> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: i8) { *self = *self >> other; }
        }
        impl ShrAssign<&i8> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &i8) { *self = *self >> other; }
        }
        impl ShrAssign<i16> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: i16) { *self = *self >> other; }
        }
        impl ShrAssign<&i16> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &i16) { *self = *self >> other; }
        }
        impl ShrAssign<i32> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: i32) { *self = *self >> other; }
        }
        impl ShrAssign<&i32> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &i32) { *self = *self >> other; }
        }
        impl ShrAssign<i64> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: i64) { *self = *self >> other; }
        }
        impl ShrAssign<&i64> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &i64) { *self = *self >> other; }
        }
        impl ShrAssign<i128> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: i128) { *self = *self >> other; }
        }
        impl ShrAssign<&i128> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &i128) { *self = *self >> other; }
        }
        impl ShrAssign<isize> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: isize) { *self = *self >> other; }
        }
        impl ShrAssign<&isize> for p16 {
            #[inline]
            fn shr_assign(&mut self, other: &isize) {
                *self = *self >> other;
            }
        }
        impl fmt::Debug for p16 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("{0}(0x{1:x})", "p16", self.0))
            }
        }
        impl fmt::Display for p16 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("0x{0:x}", self.0))
            }
        }
        impl fmt::Binary for p16 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p16_u as fmt::Binary>::fmt(&self.0, f)
            }
        }
        impl fmt::Octal for p16 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p16_u as fmt::Octal>::fmt(&self.0, f)
            }
        }
        impl fmt::LowerHex for p16 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p16_u as fmt::LowerHex>::fmt(&self.0, f)
            }
        }
        impl fmt::UpperHex for p16 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p16_u as fmt::UpperHex>::fmt(&self.0, f)
            }
        }
        impl FromStr for p16 {
            type Err = ParseIntError;
            fn from_str(s: &str) -> Result<p16, ParseIntError> {
                if s.starts_with("0x") {
                    Ok(p16(super::__p16_u::from_str_radix(&s[2..], 16)?))
                } else {
                    "".parse::<super::__p16_u>()?;
                    ::core::panicking::panic("internal error: entered unreachable code")
                }
            }
        }
        impl p16 {
            pub fn from_str_radix(s: &str, radix: u32)
                -> Result<p16, ParseIntError> {
                Ok(p16(super::__p16_u::from_str_radix(s, radix)?))
            }
        }
    }
    use u16 as __p16_u;
    use i16 as __p16_i;
    pub use __p32_gen::p32;
    mod __p32_gen {
        use core::mem::size_of;
        use core::ops::*;
        use core::iter::*;
        use core::num::TryFromIntError;
        use core::num::ParseIntError;
        use core::fmt;
        use core::str::FromStr;
        use core::slice;
        use crate::traits::TryFrom;
        use crate::traits::FromLossy;
        #[allow(non_camel_case_types)]
        #[repr(transparent)]
        pub struct p32(pub super::__p32_u);
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::default::Default for p32 {
            #[inline]
            fn default() -> p32 { p32(::core::default::Default::default()) }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::Copy for p32 { }
        #[automatically_derived]
        #[doc(hidden)]
        #[allow(non_camel_case_types)]
        unsafe impl ::core::clone::TrivialClone for p32 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::clone::Clone for p32 {
            #[inline]
            fn clone(&self) -> p32 {
                let _: ::core::clone::AssertParamIsClone<super::__p32_u>;
                *self
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Eq for p32 {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_fields_are_eq(&self) {
                let _: ::core::cmp::AssertParamIsEq<super::__p32_u>;
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::StructuralPartialEq for p32 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialEq for p32 {
            #[inline]
            fn eq(&self, other: &p32) -> bool { self.0 == other.0 }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Ord for p32 {
            #[inline]
            fn cmp(&self, other: &p32) -> ::core::cmp::Ordering {
                ::core::cmp::Ord::cmp(&self.0, &other.0)
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialOrd for p32 {
            #[inline]
            fn partial_cmp(&self, other: &p32)
                -> ::core::option::Option<::core::cmp::Ordering> {
                ::core::option::Option::Some(::core::cmp::Ord::cmp(self,
                        other))
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::hash::Hash for p32 {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) {
                ::core::hash::Hash::hash(&self.0, state)
            }
        }
        impl p32 {
            #[inline]
            pub const fn new(x: super::__p32_u) -> p32 { p32(x) }
            #[inline]
            pub const fn get(self) -> super::__p32_u { self.0 }
            #[inline]
            pub const fn naive_add(self, other: p32) -> p32 {
                p32(self.0 ^ other.0)
            }
            #[inline]
            pub fn add(self, other: p32) -> p32 { p32(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_sub(self, other: p32) -> p32 {
                p32(self.0 ^ other.0)
            }
            #[inline]
            pub fn sub(self, other: p32) -> p32 { p32(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_widening_mul(self, other: p32) -> (p32, p32) {
                let a = self.0;
                let b = other.0;
                let mut lo = 0;
                let mut hi = 0;
                let mut i = 0;
                while i < 32 {
                    let mask =
                        (((a as super::__p32_i) << (32 - 1 - i)) >> (32 - 1)) as
                            super::__p32_u;
                    lo ^= mask & (b << i);
                    hi ^= mask & (b >> (32 - 1 - i));
                    i += 1;
                }
                (p32(lo), p32(hi >> 1))
            }
            #[inline]
            pub const fn naive_overflowing_mul(self, other: p32)
                -> (p32, bool) {
                let (lo, hi) = self.naive_widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub const fn naive_checked_mul(self, other: p32) -> Option<p32> {
                match self.naive_overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub const fn naive_wrapping_mul(self, other: p32) -> p32 {
                let a = self.0;
                let b = other.0;
                let mut x = 0;
                let mut i = 0;
                while i < 32 {
                    let mask =
                        (((a as super::__p32_i) << (32 - 1 - i)) >> (32 - 1)) as
                            super::__p32_u;
                    x ^= mask & (b << i);
                    i += 1;
                }
                p32(x)
            }
            #[inline]
            pub const fn naive_mul(self, other: p32) -> p32 {
                match self.naive_checked_mul(other) {
                    Some(x) => x,
                    None => p32(self.0 / 0),
                }
            }
            #[inline]
            pub fn widening_mul(self, other: p32) -> (p32, p32) {
                self.naive_widening_mul(other)
            }
            #[inline]
            pub fn overflowing_mul(self, other: p32) -> (p32, bool) {
                let (lo, hi) = self.widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub fn checked_mul(self, other: p32) -> Option<p32> {
                match self.overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub fn wrapping_mul(self, other: p32) -> p32 {
                self.naive_wrapping_mul(other)
            }
            #[inline]
            pub fn mul(self, other: p32) -> p32 {
                self.checked_mul(other).expect("overflow in polynomial multiply")
            }
            #[inline]
            pub const fn naive_overflowing_pow(self, exp: u32)
                -> (p32, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p32(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.naive_overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.naive_overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub const fn naive_checked_pow(self, exp: u32) -> Option<p32> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p32(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.naive_checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.naive_checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub const fn naive_wrapping_pow(self, exp: u32) -> p32 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p32(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_wrapping_mul(a);
                }
            }
            #[inline]
            pub const fn naive_pow(self, exp: u32) -> p32 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p32(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_mul(a);
                }
            }
            #[inline]
            pub fn overflowing_pow(self, exp: u32) -> (p32, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p32(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub fn checked_pow(self, exp: u32) -> Option<p32> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p32(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub fn wrapping_pow(self, exp: u32) -> p32 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p32(1);
                loop {
                    if exp & 1 != 0 { x = x.wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.wrapping_mul(a);
                }
            }
            #[inline]
            pub fn pow(self, exp: u32) -> p32 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p32(1);
                loop {
                    if exp & 1 != 0 { x = x.mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.mul(a);
                }
            }
            #[inline]
            pub const fn naive_checked_div(self, other: p32) -> Option<p32> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    let mut x = 0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        x ^= 1 << (b.leading_zeros() - a.leading_zeros());
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p32(x))
                }
            }
            #[inline]
            pub const fn naive_div(self, other: p32) -> p32 {
                match self.naive_checked_div(other) {
                    Some(x) => x,
                    None => p32(self.0 / 0),
                }
            }
            #[inline]
            pub const fn naive_checked_rem(self, other: p32) -> Option<p32> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p32(a))
                }
            }
            #[inline]
            pub const fn naive_rem(self, other: p32) -> p32 {
                match self.naive_checked_rem(other) {
                    Some(x) => x,
                    None => p32(self.0 / 0),
                }
            }
            #[inline]
            pub fn slice_from_slice(slice: &[super::__p32_u]) -> &[p32] {
                unsafe {
                    slice::from_raw_parts(slice.as_ptr() as *const p32,
                        slice.len())
                }
            }
            #[inline]
            pub fn slice_from_slice_mut(slice: &mut [super::__p32_u])
                -> &mut [p32] {
                unsafe {
                    slice::from_raw_parts_mut(slice.as_mut_ptr() as *mut p32,
                        slice.len())
                }
            }
        }
        impl From<super::__p32_u> for p32 {
            #[inline]
            fn from(x: super::__p32_u) -> p32 { p32(x) }
        }
        impl From<bool> for p32 {
            #[inline]
            fn from(x: bool) -> p32 { p32(super::__p32_u::from(x)) }
        }
        impl From<char> for p32 {
            #[inline]
            fn from(x: char) -> p32 { p32(super::__p32_u::from(x)) }
        }
        impl From<u8> for p32 {
            #[inline]
            fn from(x: u8) -> p32 { p32(super::__p32_u::from(x)) }
        }
        impl From<u16> for p32 {
            #[inline]
            fn from(x: u16) -> p32 { p32(super::__p32_u::from(x)) }
        }
        impl From<crate::p8> for p32 {
            #[inline]
            fn from(x: crate::p8) -> p32 { p32(super::__p32_u::from(x.0)) }
        }
        impl From<crate::p16> for p32 {
            #[inline]
            fn from(x: crate::p16) -> p32 { p32(super::__p32_u::from(x.0)) }
        }
        impl TryFrom<u64> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u64) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl TryFrom<u128> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u128) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl TryFrom<usize> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: usize) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl TryFrom<crate::p64> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p64) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::p128> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p128) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::psize> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::psize) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x.0)?))
            }
        }
        impl FromLossy<u64> for p32 {
            #[inline]
            fn from_lossy(x: u64) -> p32 { p32(x as super::__p32_u) }
        }
        impl FromLossy<u128> for p32 {
            #[inline]
            fn from_lossy(x: u128) -> p32 { p32(x as super::__p32_u) }
        }
        impl FromLossy<usize> for p32 {
            #[inline]
            fn from_lossy(x: usize) -> p32 { p32(x as super::__p32_u) }
        }
        impl FromLossy<crate::p64> for p32 {
            #[inline]
            fn from_lossy(x: crate::p64) -> p32 { p32(x.0 as super::__p32_u) }
        }
        impl FromLossy<crate::p128> for p32 {
            #[inline]
            fn from_lossy(x: crate::p128) -> p32 {
                p32(x.0 as super::__p32_u)
            }
        }
        impl FromLossy<crate::psize> for p32 {
            #[inline]
            fn from_lossy(x: crate::psize) -> p32 {
                p32(x.0 as super::__p32_u)
            }
        }
        impl TryFrom<i8> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i8) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl TryFrom<i16> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i16) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl TryFrom<i32> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i32) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl TryFrom<i64> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i64) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl TryFrom<i128> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i128) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl TryFrom<isize> for p32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: isize) -> Result<p32, Self::Error> {
                Ok(p32(super::__p32_u::try_from(x)?))
            }
        }
        impl FromLossy<i8> for p32 {
            #[inline]
            fn from_lossy(x: i8) -> p32 { p32(x as super::__p32_u) }
        }
        impl FromLossy<i16> for p32 {
            #[inline]
            fn from_lossy(x: i16) -> p32 { p32(x as super::__p32_u) }
        }
        impl FromLossy<i32> for p32 {
            #[inline]
            fn from_lossy(x: i32) -> p32 { p32(x as super::__p32_u) }
        }
        impl FromLossy<i64> for p32 {
            #[inline]
            fn from_lossy(x: i64) -> p32 { p32(x as super::__p32_u) }
        }
        impl FromLossy<i128> for p32 {
            #[inline]
            fn from_lossy(x: i128) -> p32 { p32(x as super::__p32_u) }
        }
        impl FromLossy<isize> for p32 {
            #[inline]
            fn from_lossy(x: isize) -> p32 { p32(x as super::__p32_u) }
        }
        impl From<p32> for super::__p32_u {
            #[inline]
            fn from(x: p32) -> super::__p32_u { x.0 }
        }
        impl From<p32> for u64 {
            #[inline]
            fn from(x: p32) -> u64 { u64::from(x.0) }
        }
        impl From<p32> for u128 {
            #[inline]
            fn from(x: p32) -> u128 { u128::from(x.0) }
        }
        impl TryFrom<p32> for u8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p32) -> Result<u8, Self::Error> {
                u8::try_from(x.0)
            }
        }
        impl TryFrom<p32> for u16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p32) -> Result<u16, Self::Error> {
                u16::try_from(x.0)
            }
        }
        impl TryFrom<p32> for usize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p32) -> Result<usize, Self::Error> {
                usize::try_from(x.0)
            }
        }
        impl FromLossy<p32> for u8 {
            #[inline]
            fn from_lossy(x: p32) -> u8 { x.0 as u8 }
        }
        impl FromLossy<p32> for u16 {
            #[inline]
            fn from_lossy(x: p32) -> u16 { x.0 as u16 }
        }
        impl FromLossy<p32> for usize {
            #[inline]
            fn from_lossy(x: p32) -> usize { x.0 as usize }
        }
        impl From<p32> for i64 {
            #[inline]
            fn from(x: p32) -> i64 { i64::from(x.0) }
        }
        impl From<p32> for i128 {
            #[inline]
            fn from(x: p32) -> i128 { i128::from(x.0) }
        }
        impl TryFrom<p32> for i8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p32) -> Result<i8, Self::Error> {
                i8::try_from(x.0)
            }
        }
        impl TryFrom<p32> for i16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p32) -> Result<i16, Self::Error> {
                i16::try_from(x.0)
            }
        }
        impl TryFrom<p32> for i32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p32) -> Result<i32, Self::Error> {
                i32::try_from(x.0)
            }
        }
        impl TryFrom<p32> for isize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p32) -> Result<isize, Self::Error> {
                isize::try_from(x.0)
            }
        }
        impl FromLossy<p32> for i8 {
            #[inline]
            fn from_lossy(x: p32) -> i8 { x.0 as i8 }
        }
        impl FromLossy<p32> for i16 {
            #[inline]
            fn from_lossy(x: p32) -> i16 { x.0 as i16 }
        }
        impl FromLossy<p32> for i32 {
            #[inline]
            fn from_lossy(x: p32) -> i32 { x.0 as i32 }
        }
        impl FromLossy<p32> for isize {
            #[inline]
            fn from_lossy(x: p32) -> isize { x.0 as isize }
        }
        impl Neg for p32 {
            type Output = p32;
            #[inline]
            fn neg(self) -> p32 { self }
        }
        impl Neg for &p32 {
            type Output = p32;
            #[inline]
            fn neg(self) -> p32 { *self }
        }
        impl Add<p32> for p32 {
            type Output = p32;
            #[inline]
            fn add(self, other: p32) -> p32 { p32::add(self, other) }
        }
        impl Add<p32> for &p32 {
            type Output = p32;
            #[inline]
            fn add(self, other: p32) -> p32 { p32::add(*self, other) }
        }
        impl Add<&p32> for p32 {
            type Output = p32;
            #[inline]
            fn add(self, other: &p32) -> p32 { p32::add(self, *other) }
        }
        impl Add<&p32> for &p32 {
            type Output = p32;
            #[inline]
            fn add(self, other: &p32) -> p32 { p32::add(*self, *other) }
        }
        impl AddAssign<p32> for p32 {
            #[inline]
            fn add_assign(&mut self, other: p32) { *self = self.add(other) }
        }
        impl AddAssign<&p32> for p32 {
            #[inline]
            fn add_assign(&mut self, other: &p32) { *self = self.add(*other) }
        }
        impl Sum<p32> for p32 {
            #[inline]
            fn sum<I>(iter: I) -> p32 where I: Iterator<Item = p32> {
                iter.fold(p32(0), |a, x| a + x)
            }
        }
        impl<'a> Sum<&'a p32> for p32 {
            #[inline]
            fn sum<I>(iter: I) -> p32 where I: Iterator<Item = &'a p32> {
                iter.fold(p32(0), |a, x| a + *x)
            }
        }
        impl Sub for p32 {
            type Output = p32;
            #[inline]
            fn sub(self, other: p32) -> p32 { p32::sub(self, other) }
        }
        impl Sub<p32> for &p32 {
            type Output = p32;
            #[inline]
            fn sub(self, other: p32) -> p32 { p32::sub(*self, other) }
        }
        impl Sub<&p32> for p32 {
            type Output = p32;
            #[inline]
            fn sub(self, other: &p32) -> p32 { p32::sub(self, *other) }
        }
        impl Sub<&p32> for &p32 {
            type Output = p32;
            #[inline]
            fn sub(self, other: &p32) -> p32 { p32::sub(*self, *other) }
        }
        impl SubAssign<p32> for p32 {
            #[inline]
            fn sub_assign(&mut self, other: p32) { *self = self.sub(other) }
        }
        impl SubAssign<&p32> for p32 {
            #[inline]
            fn sub_assign(&mut self, other: &p32) { *self = self.sub(*other) }
        }
        impl Mul for p32 {
            type Output = p32;
            #[inline]
            fn mul(self, other: p32) -> p32 { p32::mul(self, other) }
        }
        impl Mul<p32> for &p32 {
            type Output = p32;
            #[inline]
            fn mul(self, other: p32) -> p32 { p32::mul(*self, other) }
        }
        impl Mul<&p32> for p32 {
            type Output = p32;
            #[inline]
            fn mul(self, other: &p32) -> p32 { p32::mul(self, *other) }
        }
        impl Mul<&p32> for &p32 {
            type Output = p32;
            #[inline]
            fn mul(self, other: &p32) -> p32 { p32::mul(*self, *other) }
        }
        impl MulAssign<p32> for p32 {
            #[inline]
            fn mul_assign(&mut self, other: p32) { *self = self.mul(other) }
        }
        impl MulAssign<&p32> for p32 {
            #[inline]
            fn mul_assign(&mut self, other: &p32) { *self = self.mul(*other) }
        }
        impl Product<p32> for p32 {
            #[inline]
            fn product<I>(iter: I) -> p32 where I: Iterator<Item = p32> {
                iter.fold(p32(0), |a, x| a * x)
            }
        }
        impl<'a> Product<&'a p32> for p32 {
            #[inline]
            fn product<I>(iter: I) -> p32 where I: Iterator<Item = &'a p32> {
                iter.fold(p32(0), |a, x| a * *x)
            }
        }
        impl Div for p32 {
            type Output = p32;
            #[inline]
            fn div(self, other: p32) -> p32 { p32::naive_div(self, other) }
        }
        impl Div<p32> for &p32 {
            type Output = p32;
            #[inline]
            fn div(self, other: p32) -> p32 { p32::naive_div(*self, other) }
        }
        impl Div<&p32> for p32 {
            type Output = p32;
            #[inline]
            fn div(self, other: &p32) -> p32 { p32::naive_div(self, *other) }
        }
        impl Div<&p32> for &p32 {
            type Output = p32;
            #[inline]
            fn div(self, other: &p32) -> p32 { p32::naive_div(*self, *other) }
        }
        impl DivAssign<p32> for p32 {
            #[inline]
            fn div_assign(&mut self, other: p32) { *self = self.div(other) }
        }
        impl DivAssign<&p32> for p32 {
            #[inline]
            fn div_assign(&mut self, other: &p32) { *self = self.div(*other) }
        }
        impl Rem for p32 {
            type Output = p32;
            #[inline]
            fn rem(self, other: p32) -> p32 { p32::naive_rem(self, other) }
        }
        impl Rem<p32> for &p32 {
            type Output = p32;
            #[inline]
            fn rem(self, other: p32) -> p32 { p32::naive_rem(*self, other) }
        }
        impl Rem<&p32> for p32 {
            type Output = p32;
            #[inline]
            fn rem(self, other: &p32) -> p32 { p32::naive_rem(self, *other) }
        }
        impl Rem<&p32> for &p32 {
            type Output = p32;
            #[inline]
            fn rem(self, other: &p32) -> p32 { p32::naive_rem(*self, *other) }
        }
        impl RemAssign<p32> for p32 {
            #[inline]
            fn rem_assign(&mut self, other: p32) { *self = self.rem(other) }
        }
        impl RemAssign<&p32> for p32 {
            #[inline]
            fn rem_assign(&mut self, other: &p32) { *self = self.rem(*other) }
        }
        impl Not for p32 {
            type Output = p32;
            #[inline]
            fn not(self) -> p32 { p32(!self.0) }
        }
        impl Not for &p32 {
            type Output = p32;
            #[inline]
            fn not(self) -> p32 { p32(!self.0) }
        }
        impl BitAnd<p32> for p32 {
            type Output = p32;
            #[inline]
            fn bitand(self, other: p32) -> p32 { p32(self.0 & other.0) }
        }
        impl BitAnd<p32> for &p32 {
            type Output = p32;
            #[inline]
            fn bitand(self, other: p32) -> p32 { p32(self.0 & other.0) }
        }
        impl BitAnd<&p32> for p32 {
            type Output = p32;
            #[inline]
            fn bitand(self, other: &p32) -> p32 { p32(self.0 & other.0) }
        }
        impl BitAnd<&p32> for &p32 {
            type Output = p32;
            #[inline]
            fn bitand(self, other: &p32) -> p32 { p32(self.0 & other.0) }
        }
        impl BitAndAssign<p32> for p32 {
            #[inline]
            fn bitand_assign(&mut self, other: p32) { *self = *self & other; }
        }
        impl BitAndAssign<&p32> for p32 {
            #[inline]
            fn bitand_assign(&mut self, other: &p32) {
                *self = *self & *other;
            }
        }
        impl BitAnd<p32> for super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitand(self, other: p32) -> p32 { p32(self & other.0) }
        }
        impl BitAnd<p32> for &super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitand(self, other: p32) -> p32 { p32(self & other.0) }
        }
        impl BitAnd<&p32> for super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitand(self, other: &p32) -> p32 { p32(self & other.0) }
        }
        impl BitAnd<&p32> for &super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitand(self, other: &p32) -> p32 { p32(self & other.0) }
        }
        impl BitAnd<super::__p32_u> for p32 {
            type Output = p32;
            #[inline]
            fn bitand(self, other: super::__p32_u) -> p32 {
                p32(self.0 & other)
            }
        }
        impl BitAnd<super::__p32_u> for &p32 {
            type Output = p32;
            #[inline]
            fn bitand(self, other: super::__p32_u) -> p32 {
                p32(self.0 & other)
            }
        }
        impl BitAnd<&super::__p32_u> for p32 {
            type Output = p32;
            #[inline]
            fn bitand(self, other: &super::__p32_u) -> p32 {
                p32(self.0 & other)
            }
        }
        impl BitAnd<&super::__p32_u> for &p32 {
            type Output = p32;
            #[inline]
            fn bitand(self, other: &super::__p32_u) -> p32 {
                p32(self.0 & other)
            }
        }
        impl BitAndAssign<super::__p32_u> for p32 {
            #[inline]
            fn bitand_assign(&mut self, other: super::__p32_u) {
                *self = *self & other;
            }
        }
        impl BitAndAssign<&super::__p32_u> for p32 {
            #[inline]
            fn bitand_assign(&mut self, other: &super::__p32_u) {
                *self = *self & *other;
            }
        }
        impl BitOr<p32> for p32 {
            type Output = p32;
            #[inline]
            fn bitor(self, other: p32) -> p32 { p32(self.0 | other.0) }
        }
        impl BitOr<p32> for &p32 {
            type Output = p32;
            #[inline]
            fn bitor(self, other: p32) -> p32 { p32(self.0 | other.0) }
        }
        impl BitOr<&p32> for p32 {
            type Output = p32;
            #[inline]
            fn bitor(self, other: &p32) -> p32 { p32(self.0 | other.0) }
        }
        impl BitOr<&p32> for &p32 {
            type Output = p32;
            #[inline]
            fn bitor(self, other: &p32) -> p32 { p32(self.0 | other.0) }
        }
        impl BitOrAssign<p32> for p32 {
            #[inline]
            fn bitor_assign(&mut self, other: p32) { *self = *self | other; }
        }
        impl BitOrAssign<&p32> for p32 {
            #[inline]
            fn bitor_assign(&mut self, other: &p32) {
                *self = *self | *other;
            }
        }
        impl BitOr<p32> for super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitor(self, other: p32) -> p32 { p32(self | other.0) }
        }
        impl BitOr<p32> for &super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitor(self, other: p32) -> p32 { p32(self | other.0) }
        }
        impl BitOr<&p32> for super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitor(self, other: &p32) -> p32 { p32(self | other.0) }
        }
        impl BitOr<&p32> for &super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitor(self, other: &p32) -> p32 { p32(self | other.0) }
        }
        impl BitOr<super::__p32_u> for p32 {
            type Output = p32;
            #[inline]
            fn bitor(self, other: super::__p32_u) -> p32 {
                p32(self.0 | other)
            }
        }
        impl BitOr<super::__p32_u> for &p32 {
            type Output = p32;
            #[inline]
            fn bitor(self, other: super::__p32_u) -> p32 {
                p32(self.0 | other)
            }
        }
        impl BitOr<&super::__p32_u> for p32 {
            type Output = p32;
            #[inline]
            fn bitor(self, other: &super::__p32_u) -> p32 {
                p32(self.0 | other)
            }
        }
        impl BitOr<&super::__p32_u> for &p32 {
            type Output = p32;
            #[inline]
            fn bitor(self, other: &super::__p32_u) -> p32 {
                p32(self.0 | other)
            }
        }
        impl BitOrAssign<super::__p32_u> for p32 {
            #[inline]
            fn bitor_assign(&mut self, other: super::__p32_u) {
                *self = *self | other;
            }
        }
        impl BitOrAssign<&super::__p32_u> for p32 {
            #[inline]
            fn bitor_assign(&mut self, other: &super::__p32_u) {
                *self = *self | *other;
            }
        }
        impl BitXor<p32> for p32 {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: p32) -> p32 { p32(self.0 ^ other.0) }
        }
        impl BitXor<p32> for &p32 {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: p32) -> p32 { p32(self.0 ^ other.0) }
        }
        impl BitXor<&p32> for p32 {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: &p32) -> p32 { p32(self.0 ^ other.0) }
        }
        impl BitXor<&p32> for &p32 {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: &p32) -> p32 { p32(self.0 ^ other.0) }
        }
        impl BitXorAssign<p32> for p32 {
            #[inline]
            fn bitxor_assign(&mut self, other: p32) { *self = *self ^ other; }
        }
        impl BitXorAssign<&p32> for p32 {
            #[inline]
            fn bitxor_assign(&mut self, other: &p32) {
                *self = *self ^ *other;
            }
        }
        impl BitXor<p32> for super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: p32) -> p32 { p32(self ^ other.0) }
        }
        impl BitXor<p32> for &super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: p32) -> p32 { p32(self ^ other.0) }
        }
        impl BitXor<&p32> for super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: &p32) -> p32 { p32(self ^ other.0) }
        }
        impl BitXor<&p32> for &super::__p32_u {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: &p32) -> p32 { p32(self ^ other.0) }
        }
        impl BitXor<super::__p32_u> for p32 {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: super::__p32_u) -> p32 {
                p32(self.0 ^ other)
            }
        }
        impl BitXor<super::__p32_u> for &p32 {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: super::__p32_u) -> p32 {
                p32(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p32_u> for p32 {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: &super::__p32_u) -> p32 {
                p32(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p32_u> for &p32 {
            type Output = p32;
            #[inline]
            fn bitxor(self, other: &super::__p32_u) -> p32 {
                p32(self.0 ^ other)
            }
        }
        impl BitXorAssign<super::__p32_u> for p32 {
            #[inline]
            fn bitxor_assign(&mut self, other: super::__p32_u) {
                *self = *self ^ other;
            }
        }
        impl BitXorAssign<&super::__p32_u> for p32 {
            #[inline]
            fn bitxor_assign(&mut self, other: &super::__p32_u) {
                *self = *self ^ *other;
            }
        }
        impl p32 {
            #[inline]
            pub const fn swap_bytes(self) -> p32 { p32(self.0.swap_bytes()) }
            #[inline]
            pub const fn to_le(self) -> p32 { p32(self.0.to_le()) }
            #[inline]
            pub const fn from_le(self_: p32) -> p32 {
                p32(super::__p32_u::from_le(self_.0))
            }
            #[inline]
            pub const fn to_le_bytes(self) -> [u8; 32 / 8] {
                self.0.to_le_bytes()
            }
            #[inline]
            pub const fn from_le_bytes(bytes: [u8; 32 / 8]) -> p32 {
                p32(super::__p32_u::from_le_bytes(bytes))
            }
            #[inline]
            pub const fn to_be(self) -> p32 { p32(self.0.to_be()) }
            #[inline]
            pub const fn from_be(self_: p32) -> p32 {
                p32(super::__p32_u::from_be(self_.0))
            }
            #[inline]
            pub const fn to_be_bytes(self) -> [u8; 32 / 8] {
                self.0.to_be_bytes()
            }
            #[inline]
            pub const fn from_be_bytes(bytes: [u8; 32 / 8]) -> p32 {
                p32(super::__p32_u::from_be_bytes(bytes))
            }
            #[inline]
            pub const fn to_ne_bytes(self) -> [u8; 32 / 8] {
                self.0.to_ne_bytes()
            }
            #[inline]
            pub const fn from_ne_bytes(bytes: [u8; 32 / 8]) -> p32 {
                p32(super::__p32_u::from_ne_bytes(bytes))
            }
        }
        impl p32 {
            #[inline]
            pub const fn reverse_bits(self) -> p32 {
                p32(self.0.reverse_bits())
            }
            #[inline]
            pub const fn count_ones(self) -> u32 { self.0.count_ones() }
            #[inline]
            pub const fn count_zeros(self) -> u32 { self.0.count_zeros() }
            #[inline]
            pub const fn leading_ones(self) -> u32 { self.0.leading_ones() }
            #[inline]
            pub const fn leading_zeros(self) -> u32 { self.0.leading_zeros() }
            #[inline]
            pub const fn trailing_ones(self) -> u32 { self.0.trailing_ones() }
            #[inline]
            pub const fn trailing_zeros(self) -> u32 {
                self.0.trailing_zeros()
            }
        }
        impl p32 {
            #[inline]
            pub const fn checked_shl(self, other: u32) -> Option<p32> {
                match self.0.checked_shl(other) {
                    Some(x) => Some(p32(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn checked_shr(self, other: u32) -> Option<p32> {
                match self.0.checked_shr(other) {
                    Some(x) => Some(p32(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn overflowing_shl(self, other: u32) -> (p32, bool) {
                let (x, o) = self.0.overflowing_shl(other);
                (p32(x), o)
            }
            #[inline]
            pub const fn overflowing_shr(self, other: u32) -> (p32, bool) {
                let (x, o) = self.0.overflowing_shr(other);
                (p32(x), o)
            }
            #[inline]
            pub const fn wrapping_shl(self, other: u32) -> p32 {
                p32(self.0.wrapping_shl(other))
            }
            #[inline]
            pub const fn wrapping_shr(self, other: u32) -> p32 {
                p32(self.0.wrapping_shr(other))
            }
            #[inline]
            pub const fn rotate_left(self, other: u32) -> p32 {
                p32(self.0.rotate_left(other))
            }
            #[inline]
            pub const fn rotate_right(self, other: u32) -> p32 {
                p32(self.0.rotate_right(other))
            }
        }
        impl Shl<u8> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u8) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u8> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u8) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u8> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u8) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u8> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u8) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u16> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u16) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u16> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u16) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u16> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u16) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u16> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u16) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u32> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u32) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u32> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u32) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u32> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u32) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u32> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u32) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u64> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u64) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u64> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u64) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u64> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u64) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u64> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u64) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u128> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u128) -> p32 { p32(self.0 << other) }
        }
        impl Shl<u128> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: u128) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u128> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u128) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&u128> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &u128) -> p32 { p32(self.0 << other) }
        }
        impl Shl<usize> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: usize) -> p32 { p32(self.0 << other) }
        }
        impl Shl<usize> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: usize) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&usize> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &usize) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&usize> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &usize) -> p32 { p32(self.0 << other) }
        }
        impl ShlAssign<u8> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: u8) { *self = *self << other; }
        }
        impl ShlAssign<&u8> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &u8) { *self = *self << other; }
        }
        impl ShlAssign<u16> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: u16) { *self = *self << other; }
        }
        impl ShlAssign<&u16> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &u16) { *self = *self << other; }
        }
        impl ShlAssign<u32> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: u32) { *self = *self << other; }
        }
        impl ShlAssign<&u32> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &u32) { *self = *self << other; }
        }
        impl ShlAssign<u64> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: u64) { *self = *self << other; }
        }
        impl ShlAssign<&u64> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &u64) { *self = *self << other; }
        }
        impl ShlAssign<u128> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: u128) { *self = *self << other; }
        }
        impl ShlAssign<&u128> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &u128) { *self = *self << other; }
        }
        impl ShlAssign<usize> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: usize) { *self = *self << other; }
        }
        impl ShlAssign<&usize> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &usize) {
                *self = *self << other;
            }
        }
        impl Shr<u8> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u8) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u8> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u8) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u8> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u8) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u8> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u8) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u16> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u16) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u16> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u16) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u16> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u16) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u16> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u16) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u32> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u32) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u32> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u32) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u32> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u32) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u32> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u32) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u64> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u64) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u64> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u64) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u64> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u64) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u64> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u64) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u128> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u128) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<u128> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: u128) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u128> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u128) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&u128> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &u128) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<usize> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: usize) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<usize> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: usize) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&usize> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &usize) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&usize> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &usize) -> p32 { p32(self.0 >> other) }
        }
        impl ShrAssign<u8> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: u8) { *self = *self >> other; }
        }
        impl ShrAssign<&u8> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &u8) { *self = *self >> other; }
        }
        impl ShrAssign<u16> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: u16) { *self = *self >> other; }
        }
        impl ShrAssign<&u16> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &u16) { *self = *self >> other; }
        }
        impl ShrAssign<u32> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: u32) { *self = *self >> other; }
        }
        impl ShrAssign<&u32> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &u32) { *self = *self >> other; }
        }
        impl ShrAssign<u64> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: u64) { *self = *self >> other; }
        }
        impl ShrAssign<&u64> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &u64) { *self = *self >> other; }
        }
        impl ShrAssign<u128> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: u128) { *self = *self >> other; }
        }
        impl ShrAssign<&u128> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &u128) { *self = *self >> other; }
        }
        impl ShrAssign<usize> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: usize) { *self = *self >> other; }
        }
        impl ShrAssign<&usize> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &usize) {
                *self = *self >> other;
            }
        }
        impl Shl<i8> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i8) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i8> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i8) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i8> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i8) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i8> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i8) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i16> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i16) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i16> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i16) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i16> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i16) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i16> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i16) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i32> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i32) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i32> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i32) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i32> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i32) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i32> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i32) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i64> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i64) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i64> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i64) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i64> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i64) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i64> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i64) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i128> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i128) -> p32 { p32(self.0 << other) }
        }
        impl Shl<i128> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: i128) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i128> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i128) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&i128> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &i128) -> p32 { p32(self.0 << other) }
        }
        impl Shl<isize> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: isize) -> p32 { p32(self.0 << other) }
        }
        impl Shl<isize> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: isize) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&isize> for p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &isize) -> p32 { p32(self.0 << other) }
        }
        impl Shl<&isize> for &p32 {
            type Output = p32;
            #[inline]
            fn shl(self, other: &isize) -> p32 { p32(self.0 << other) }
        }
        impl ShlAssign<i8> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: i8) { *self = *self << other; }
        }
        impl ShlAssign<&i8> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &i8) { *self = *self << other; }
        }
        impl ShlAssign<i16> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: i16) { *self = *self << other; }
        }
        impl ShlAssign<&i16> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &i16) { *self = *self << other; }
        }
        impl ShlAssign<i32> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: i32) { *self = *self << other; }
        }
        impl ShlAssign<&i32> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &i32) { *self = *self << other; }
        }
        impl ShlAssign<i64> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: i64) { *self = *self << other; }
        }
        impl ShlAssign<&i64> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &i64) { *self = *self << other; }
        }
        impl ShlAssign<i128> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: i128) { *self = *self << other; }
        }
        impl ShlAssign<&i128> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &i128) { *self = *self << other; }
        }
        impl ShlAssign<isize> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: isize) { *self = *self << other; }
        }
        impl ShlAssign<&isize> for p32 {
            #[inline]
            fn shl_assign(&mut self, other: &isize) {
                *self = *self << other;
            }
        }
        impl Shr<i8> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i8) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i8> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i8) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i8> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i8) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i8> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i8) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i16> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i16) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i16> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i16) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i16> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i16) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i16> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i16) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i32> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i32) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i32> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i32) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i32> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i32) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i32> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i32) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i64> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i64) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i64> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i64) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i64> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i64) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i64> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i64) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i128> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i128) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<i128> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: i128) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i128> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i128) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&i128> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &i128) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<isize> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: isize) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<isize> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: isize) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&isize> for p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &isize) -> p32 { p32(self.0 >> other) }
        }
        impl Shr<&isize> for &p32 {
            type Output = p32;
            #[inline]
            fn shr(self, other: &isize) -> p32 { p32(self.0 >> other) }
        }
        impl ShrAssign<i8> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: i8) { *self = *self >> other; }
        }
        impl ShrAssign<&i8> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &i8) { *self = *self >> other; }
        }
        impl ShrAssign<i16> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: i16) { *self = *self >> other; }
        }
        impl ShrAssign<&i16> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &i16) { *self = *self >> other; }
        }
        impl ShrAssign<i32> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: i32) { *self = *self >> other; }
        }
        impl ShrAssign<&i32> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &i32) { *self = *self >> other; }
        }
        impl ShrAssign<i64> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: i64) { *self = *self >> other; }
        }
        impl ShrAssign<&i64> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &i64) { *self = *self >> other; }
        }
        impl ShrAssign<i128> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: i128) { *self = *self >> other; }
        }
        impl ShrAssign<&i128> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &i128) { *self = *self >> other; }
        }
        impl ShrAssign<isize> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: isize) { *self = *self >> other; }
        }
        impl ShrAssign<&isize> for p32 {
            #[inline]
            fn shr_assign(&mut self, other: &isize) {
                *self = *self >> other;
            }
        }
        impl fmt::Debug for p32 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("{0}(0x{1:x})", "p32", self.0))
            }
        }
        impl fmt::Display for p32 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("0x{0:x}", self.0))
            }
        }
        impl fmt::Binary for p32 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p32_u as fmt::Binary>::fmt(&self.0, f)
            }
        }
        impl fmt::Octal for p32 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p32_u as fmt::Octal>::fmt(&self.0, f)
            }
        }
        impl fmt::LowerHex for p32 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p32_u as fmt::LowerHex>::fmt(&self.0, f)
            }
        }
        impl fmt::UpperHex for p32 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p32_u as fmt::UpperHex>::fmt(&self.0, f)
            }
        }
        impl FromStr for p32 {
            type Err = ParseIntError;
            fn from_str(s: &str) -> Result<p32, ParseIntError> {
                if s.starts_with("0x") {
                    Ok(p32(super::__p32_u::from_str_radix(&s[2..], 16)?))
                } else {
                    "".parse::<super::__p32_u>()?;
                    ::core::panicking::panic("internal error: entered unreachable code")
                }
            }
        }
        impl p32 {
            pub fn from_str_radix(s: &str, radix: u32)
                -> Result<p32, ParseIntError> {
                Ok(p32(super::__p32_u::from_str_radix(s, radix)?))
            }
        }
    }
    use u32 as __p32_u;
    use i32 as __p32_i;
    pub use __p64_gen::p64;
    mod __p64_gen {
        use core::mem::size_of;
        use core::ops::*;
        use core::iter::*;
        use core::num::TryFromIntError;
        use core::num::ParseIntError;
        use core::fmt;
        use core::str::FromStr;
        use core::slice;
        use crate::traits::TryFrom;
        use crate::traits::FromLossy;
        #[allow(non_camel_case_types)]
        #[repr(transparent)]
        pub struct p64(pub super::__p64_u);
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::default::Default for p64 {
            #[inline]
            fn default() -> p64 { p64(::core::default::Default::default()) }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::Copy for p64 { }
        #[automatically_derived]
        #[doc(hidden)]
        #[allow(non_camel_case_types)]
        unsafe impl ::core::clone::TrivialClone for p64 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::clone::Clone for p64 {
            #[inline]
            fn clone(&self) -> p64 {
                let _: ::core::clone::AssertParamIsClone<super::__p64_u>;
                *self
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Eq for p64 {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_fields_are_eq(&self) {
                let _: ::core::cmp::AssertParamIsEq<super::__p64_u>;
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::StructuralPartialEq for p64 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialEq for p64 {
            #[inline]
            fn eq(&self, other: &p64) -> bool { self.0 == other.0 }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Ord for p64 {
            #[inline]
            fn cmp(&self, other: &p64) -> ::core::cmp::Ordering {
                ::core::cmp::Ord::cmp(&self.0, &other.0)
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialOrd for p64 {
            #[inline]
            fn partial_cmp(&self, other: &p64)
                -> ::core::option::Option<::core::cmp::Ordering> {
                ::core::option::Option::Some(::core::cmp::Ord::cmp(self,
                        other))
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::hash::Hash for p64 {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) {
                ::core::hash::Hash::hash(&self.0, state)
            }
        }
        impl p64 {
            #[inline]
            pub const fn new(x: super::__p64_u) -> p64 { p64(x) }
            #[inline]
            pub const fn get(self) -> super::__p64_u { self.0 }
            #[inline]
            pub const fn naive_add(self, other: p64) -> p64 {
                p64(self.0 ^ other.0)
            }
            #[inline]
            pub fn add(self, other: p64) -> p64 { p64(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_sub(self, other: p64) -> p64 {
                p64(self.0 ^ other.0)
            }
            #[inline]
            pub fn sub(self, other: p64) -> p64 { p64(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_widening_mul(self, other: p64) -> (p64, p64) {
                let a = self.0;
                let b = other.0;
                let mut lo = 0;
                let mut hi = 0;
                let mut i = 0;
                while i < 64 {
                    let mask =
                        (((a as super::__p64_i) << (64 - 1 - i)) >> (64 - 1)) as
                            super::__p64_u;
                    lo ^= mask & (b << i);
                    hi ^= mask & (b >> (64 - 1 - i));
                    i += 1;
                }
                (p64(lo), p64(hi >> 1))
            }
            #[inline]
            pub const fn naive_overflowing_mul(self, other: p64)
                -> (p64, bool) {
                let (lo, hi) = self.naive_widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub const fn naive_checked_mul(self, other: p64) -> Option<p64> {
                match self.naive_overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub const fn naive_wrapping_mul(self, other: p64) -> p64 {
                let a = self.0;
                let b = other.0;
                let mut x = 0;
                let mut i = 0;
                while i < 64 {
                    let mask =
                        (((a as super::__p64_i) << (64 - 1 - i)) >> (64 - 1)) as
                            super::__p64_u;
                    x ^= mask & (b << i);
                    i += 1;
                }
                p64(x)
            }
            #[inline]
            pub const fn naive_mul(self, other: p64) -> p64 {
                match self.naive_checked_mul(other) {
                    Some(x) => x,
                    None => p64(self.0 / 0),
                }
            }
            #[inline]
            pub fn widening_mul(self, other: p64) -> (p64, p64) {
                self.naive_widening_mul(other)
            }
            #[inline]
            pub fn overflowing_mul(self, other: p64) -> (p64, bool) {
                let (lo, hi) = self.widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub fn checked_mul(self, other: p64) -> Option<p64> {
                match self.overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub fn wrapping_mul(self, other: p64) -> p64 {
                self.naive_wrapping_mul(other)
            }
            #[inline]
            pub fn mul(self, other: p64) -> p64 {
                self.checked_mul(other).expect("overflow in polynomial multiply")
            }
            #[inline]
            pub const fn naive_overflowing_pow(self, exp: u32)
                -> (p64, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p64(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.naive_overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.naive_overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub const fn naive_checked_pow(self, exp: u32) -> Option<p64> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p64(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.naive_checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.naive_checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub const fn naive_wrapping_pow(self, exp: u32) -> p64 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p64(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_wrapping_mul(a);
                }
            }
            #[inline]
            pub const fn naive_pow(self, exp: u32) -> p64 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p64(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_mul(a);
                }
            }
            #[inline]
            pub fn overflowing_pow(self, exp: u32) -> (p64, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p64(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub fn checked_pow(self, exp: u32) -> Option<p64> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p64(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub fn wrapping_pow(self, exp: u32) -> p64 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p64(1);
                loop {
                    if exp & 1 != 0 { x = x.wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.wrapping_mul(a);
                }
            }
            #[inline]
            pub fn pow(self, exp: u32) -> p64 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p64(1);
                loop {
                    if exp & 1 != 0 { x = x.mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.mul(a);
                }
            }
            #[inline]
            pub const fn naive_checked_div(self, other: p64) -> Option<p64> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    let mut x = 0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        x ^= 1 << (b.leading_zeros() - a.leading_zeros());
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p64(x))
                }
            }
            #[inline]
            pub const fn naive_div(self, other: p64) -> p64 {
                match self.naive_checked_div(other) {
                    Some(x) => x,
                    None => p64(self.0 / 0),
                }
            }
            #[inline]
            pub const fn naive_checked_rem(self, other: p64) -> Option<p64> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p64(a))
                }
            }
            #[inline]
            pub const fn naive_rem(self, other: p64) -> p64 {
                match self.naive_checked_rem(other) {
                    Some(x) => x,
                    None => p64(self.0 / 0),
                }
            }
            #[inline]
            pub fn slice_from_slice(slice: &[super::__p64_u]) -> &[p64] {
                unsafe {
                    slice::from_raw_parts(slice.as_ptr() as *const p64,
                        slice.len())
                }
            }
            #[inline]
            pub fn slice_from_slice_mut(slice: &mut [super::__p64_u])
                -> &mut [p64] {
                unsafe {
                    slice::from_raw_parts_mut(slice.as_mut_ptr() as *mut p64,
                        slice.len())
                }
            }
        }
        impl From<super::__p64_u> for p64 {
            #[inline]
            fn from(x: super::__p64_u) -> p64 { p64(x) }
        }
        impl From<bool> for p64 {
            #[inline]
            fn from(x: bool) -> p64 { p64(super::__p64_u::from(x)) }
        }
        impl From<char> for p64 {
            #[inline]
            fn from(x: char) -> p64 { p64(super::__p64_u::from(x)) }
        }
        impl From<u8> for p64 {
            #[inline]
            fn from(x: u8) -> p64 { p64(super::__p64_u::from(x)) }
        }
        impl From<u16> for p64 {
            #[inline]
            fn from(x: u16) -> p64 { p64(super::__p64_u::from(x)) }
        }
        impl From<u32> for p64 {
            #[inline]
            fn from(x: u32) -> p64 { p64(super::__p64_u::from(x)) }
        }
        impl From<crate::p8> for p64 {
            #[inline]
            fn from(x: crate::p8) -> p64 { p64(super::__p64_u::from(x.0)) }
        }
        impl From<crate::p16> for p64 {
            #[inline]
            fn from(x: crate::p16) -> p64 { p64(super::__p64_u::from(x.0)) }
        }
        impl From<crate::p32> for p64 {
            #[inline]
            fn from(x: crate::p32) -> p64 { p64(super::__p64_u::from(x.0)) }
        }
        impl TryFrom<u128> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u128) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x)?))
            }
        }
        impl TryFrom<usize> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: usize) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x)?))
            }
        }
        impl TryFrom<crate::p128> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p128) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::psize> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::psize) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x.0)?))
            }
        }
        impl FromLossy<u128> for p64 {
            #[inline]
            fn from_lossy(x: u128) -> p64 { p64(x as super::__p64_u) }
        }
        impl FromLossy<usize> for p64 {
            #[inline]
            fn from_lossy(x: usize) -> p64 { p64(x as super::__p64_u) }
        }
        impl FromLossy<crate::p128> for p64 {
            #[inline]
            fn from_lossy(x: crate::p128) -> p64 {
                p64(x.0 as super::__p64_u)
            }
        }
        impl FromLossy<crate::psize> for p64 {
            #[inline]
            fn from_lossy(x: crate::psize) -> p64 {
                p64(x.0 as super::__p64_u)
            }
        }
        impl TryFrom<i8> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i8) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x)?))
            }
        }
        impl TryFrom<i16> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i16) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x)?))
            }
        }
        impl TryFrom<i32> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i32) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x)?))
            }
        }
        impl TryFrom<i64> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i64) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x)?))
            }
        }
        impl TryFrom<i128> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i128) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x)?))
            }
        }
        impl TryFrom<isize> for p64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: isize) -> Result<p64, Self::Error> {
                Ok(p64(super::__p64_u::try_from(x)?))
            }
        }
        impl FromLossy<i8> for p64 {
            #[inline]
            fn from_lossy(x: i8) -> p64 { p64(x as super::__p64_u) }
        }
        impl FromLossy<i16> for p64 {
            #[inline]
            fn from_lossy(x: i16) -> p64 { p64(x as super::__p64_u) }
        }
        impl FromLossy<i32> for p64 {
            #[inline]
            fn from_lossy(x: i32) -> p64 { p64(x as super::__p64_u) }
        }
        impl FromLossy<i64> for p64 {
            #[inline]
            fn from_lossy(x: i64) -> p64 { p64(x as super::__p64_u) }
        }
        impl FromLossy<i128> for p64 {
            #[inline]
            fn from_lossy(x: i128) -> p64 { p64(x as super::__p64_u) }
        }
        impl FromLossy<isize> for p64 {
            #[inline]
            fn from_lossy(x: isize) -> p64 { p64(x as super::__p64_u) }
        }
        impl From<p64> for super::__p64_u {
            #[inline]
            fn from(x: p64) -> super::__p64_u { x.0 }
        }
        impl From<p64> for u128 {
            #[inline]
            fn from(x: p64) -> u128 { u128::from(x.0) }
        }
        impl TryFrom<p64> for u8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<u8, Self::Error> {
                u8::try_from(x.0)
            }
        }
        impl TryFrom<p64> for u16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<u16, Self::Error> {
                u16::try_from(x.0)
            }
        }
        impl TryFrom<p64> for u32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<u32, Self::Error> {
                u32::try_from(x.0)
            }
        }
        impl TryFrom<p64> for usize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<usize, Self::Error> {
                usize::try_from(x.0)
            }
        }
        impl FromLossy<p64> for u8 {
            #[inline]
            fn from_lossy(x: p64) -> u8 { x.0 as u8 }
        }
        impl FromLossy<p64> for u16 {
            #[inline]
            fn from_lossy(x: p64) -> u16 { x.0 as u16 }
        }
        impl FromLossy<p64> for u32 {
            #[inline]
            fn from_lossy(x: p64) -> u32 { x.0 as u32 }
        }
        impl FromLossy<p64> for usize {
            #[inline]
            fn from_lossy(x: p64) -> usize { x.0 as usize }
        }
        impl From<p64> for i128 {
            #[inline]
            fn from(x: p64) -> i128 { i128::from(x.0) }
        }
        impl TryFrom<p64> for i8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<i8, Self::Error> {
                i8::try_from(x.0)
            }
        }
        impl TryFrom<p64> for i16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<i16, Self::Error> {
                i16::try_from(x.0)
            }
        }
        impl TryFrom<p64> for i32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<i32, Self::Error> {
                i32::try_from(x.0)
            }
        }
        impl TryFrom<p64> for i64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<i64, Self::Error> {
                i64::try_from(x.0)
            }
        }
        impl TryFrom<p64> for isize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p64) -> Result<isize, Self::Error> {
                isize::try_from(x.0)
            }
        }
        impl FromLossy<p64> for i8 {
            #[inline]
            fn from_lossy(x: p64) -> i8 { x.0 as i8 }
        }
        impl FromLossy<p64> for i16 {
            #[inline]
            fn from_lossy(x: p64) -> i16 { x.0 as i16 }
        }
        impl FromLossy<p64> for i32 {
            #[inline]
            fn from_lossy(x: p64) -> i32 { x.0 as i32 }
        }
        impl FromLossy<p64> for i64 {
            #[inline]
            fn from_lossy(x: p64) -> i64 { x.0 as i64 }
        }
        impl FromLossy<p64> for isize {
            #[inline]
            fn from_lossy(x: p64) -> isize { x.0 as isize }
        }
        impl Neg for p64 {
            type Output = p64;
            #[inline]
            fn neg(self) -> p64 { self }
        }
        impl Neg for &p64 {
            type Output = p64;
            #[inline]
            fn neg(self) -> p64 { *self }
        }
        impl Add<p64> for p64 {
            type Output = p64;
            #[inline]
            fn add(self, other: p64) -> p64 { p64::add(self, other) }
        }
        impl Add<p64> for &p64 {
            type Output = p64;
            #[inline]
            fn add(self, other: p64) -> p64 { p64::add(*self, other) }
        }
        impl Add<&p64> for p64 {
            type Output = p64;
            #[inline]
            fn add(self, other: &p64) -> p64 { p64::add(self, *other) }
        }
        impl Add<&p64> for &p64 {
            type Output = p64;
            #[inline]
            fn add(self, other: &p64) -> p64 { p64::add(*self, *other) }
        }
        impl AddAssign<p64> for p64 {
            #[inline]
            fn add_assign(&mut self, other: p64) { *self = self.add(other) }
        }
        impl AddAssign<&p64> for p64 {
            #[inline]
            fn add_assign(&mut self, other: &p64) { *self = self.add(*other) }
        }
        impl Sum<p64> for p64 {
            #[inline]
            fn sum<I>(iter: I) -> p64 where I: Iterator<Item = p64> {
                iter.fold(p64(0), |a, x| a + x)
            }
        }
        impl<'a> Sum<&'a p64> for p64 {
            #[inline]
            fn sum<I>(iter: I) -> p64 where I: Iterator<Item = &'a p64> {
                iter.fold(p64(0), |a, x| a + *x)
            }
        }
        impl Sub for p64 {
            type Output = p64;
            #[inline]
            fn sub(self, other: p64) -> p64 { p64::sub(self, other) }
        }
        impl Sub<p64> for &p64 {
            type Output = p64;
            #[inline]
            fn sub(self, other: p64) -> p64 { p64::sub(*self, other) }
        }
        impl Sub<&p64> for p64 {
            type Output = p64;
            #[inline]
            fn sub(self, other: &p64) -> p64 { p64::sub(self, *other) }
        }
        impl Sub<&p64> for &p64 {
            type Output = p64;
            #[inline]
            fn sub(self, other: &p64) -> p64 { p64::sub(*self, *other) }
        }
        impl SubAssign<p64> for p64 {
            #[inline]
            fn sub_assign(&mut self, other: p64) { *self = self.sub(other) }
        }
        impl SubAssign<&p64> for p64 {
            #[inline]
            fn sub_assign(&mut self, other: &p64) { *self = self.sub(*other) }
        }
        impl Mul for p64 {
            type Output = p64;
            #[inline]
            fn mul(self, other: p64) -> p64 { p64::mul(self, other) }
        }
        impl Mul<p64> for &p64 {
            type Output = p64;
            #[inline]
            fn mul(self, other: p64) -> p64 { p64::mul(*self, other) }
        }
        impl Mul<&p64> for p64 {
            type Output = p64;
            #[inline]
            fn mul(self, other: &p64) -> p64 { p64::mul(self, *other) }
        }
        impl Mul<&p64> for &p64 {
            type Output = p64;
            #[inline]
            fn mul(self, other: &p64) -> p64 { p64::mul(*self, *other) }
        }
        impl MulAssign<p64> for p64 {
            #[inline]
            fn mul_assign(&mut self, other: p64) { *self = self.mul(other) }
        }
        impl MulAssign<&p64> for p64 {
            #[inline]
            fn mul_assign(&mut self, other: &p64) { *self = self.mul(*other) }
        }
        impl Product<p64> for p64 {
            #[inline]
            fn product<I>(iter: I) -> p64 where I: Iterator<Item = p64> {
                iter.fold(p64(0), |a, x| a * x)
            }
        }
        impl<'a> Product<&'a p64> for p64 {
            #[inline]
            fn product<I>(iter: I) -> p64 where I: Iterator<Item = &'a p64> {
                iter.fold(p64(0), |a, x| a * *x)
            }
        }
        impl Div for p64 {
            type Output = p64;
            #[inline]
            fn div(self, other: p64) -> p64 { p64::naive_div(self, other) }
        }
        impl Div<p64> for &p64 {
            type Output = p64;
            #[inline]
            fn div(self, other: p64) -> p64 { p64::naive_div(*self, other) }
        }
        impl Div<&p64> for p64 {
            type Output = p64;
            #[inline]
            fn div(self, other: &p64) -> p64 { p64::naive_div(self, *other) }
        }
        impl Div<&p64> for &p64 {
            type Output = p64;
            #[inline]
            fn div(self, other: &p64) -> p64 { p64::naive_div(*self, *other) }
        }
        impl DivAssign<p64> for p64 {
            #[inline]
            fn div_assign(&mut self, other: p64) { *self = self.div(other) }
        }
        impl DivAssign<&p64> for p64 {
            #[inline]
            fn div_assign(&mut self, other: &p64) { *self = self.div(*other) }
        }
        impl Rem for p64 {
            type Output = p64;
            #[inline]
            fn rem(self, other: p64) -> p64 { p64::naive_rem(self, other) }
        }
        impl Rem<p64> for &p64 {
            type Output = p64;
            #[inline]
            fn rem(self, other: p64) -> p64 { p64::naive_rem(*self, other) }
        }
        impl Rem<&p64> for p64 {
            type Output = p64;
            #[inline]
            fn rem(self, other: &p64) -> p64 { p64::naive_rem(self, *other) }
        }
        impl Rem<&p64> for &p64 {
            type Output = p64;
            #[inline]
            fn rem(self, other: &p64) -> p64 { p64::naive_rem(*self, *other) }
        }
        impl RemAssign<p64> for p64 {
            #[inline]
            fn rem_assign(&mut self, other: p64) { *self = self.rem(other) }
        }
        impl RemAssign<&p64> for p64 {
            #[inline]
            fn rem_assign(&mut self, other: &p64) { *self = self.rem(*other) }
        }
        impl Not for p64 {
            type Output = p64;
            #[inline]
            fn not(self) -> p64 { p64(!self.0) }
        }
        impl Not for &p64 {
            type Output = p64;
            #[inline]
            fn not(self) -> p64 { p64(!self.0) }
        }
        impl BitAnd<p64> for p64 {
            type Output = p64;
            #[inline]
            fn bitand(self, other: p64) -> p64 { p64(self.0 & other.0) }
        }
        impl BitAnd<p64> for &p64 {
            type Output = p64;
            #[inline]
            fn bitand(self, other: p64) -> p64 { p64(self.0 & other.0) }
        }
        impl BitAnd<&p64> for p64 {
            type Output = p64;
            #[inline]
            fn bitand(self, other: &p64) -> p64 { p64(self.0 & other.0) }
        }
        impl BitAnd<&p64> for &p64 {
            type Output = p64;
            #[inline]
            fn bitand(self, other: &p64) -> p64 { p64(self.0 & other.0) }
        }
        impl BitAndAssign<p64> for p64 {
            #[inline]
            fn bitand_assign(&mut self, other: p64) { *self = *self & other; }
        }
        impl BitAndAssign<&p64> for p64 {
            #[inline]
            fn bitand_assign(&mut self, other: &p64) {
                *self = *self & *other;
            }
        }
        impl BitAnd<p64> for super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitand(self, other: p64) -> p64 { p64(self & other.0) }
        }
        impl BitAnd<p64> for &super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitand(self, other: p64) -> p64 { p64(self & other.0) }
        }
        impl BitAnd<&p64> for super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitand(self, other: &p64) -> p64 { p64(self & other.0) }
        }
        impl BitAnd<&p64> for &super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitand(self, other: &p64) -> p64 { p64(self & other.0) }
        }
        impl BitAnd<super::__p64_u> for p64 {
            type Output = p64;
            #[inline]
            fn bitand(self, other: super::__p64_u) -> p64 {
                p64(self.0 & other)
            }
        }
        impl BitAnd<super::__p64_u> for &p64 {
            type Output = p64;
            #[inline]
            fn bitand(self, other: super::__p64_u) -> p64 {
                p64(self.0 & other)
            }
        }
        impl BitAnd<&super::__p64_u> for p64 {
            type Output = p64;
            #[inline]
            fn bitand(self, other: &super::__p64_u) -> p64 {
                p64(self.0 & other)
            }
        }
        impl BitAnd<&super::__p64_u> for &p64 {
            type Output = p64;
            #[inline]
            fn bitand(self, other: &super::__p64_u) -> p64 {
                p64(self.0 & other)
            }
        }
        impl BitAndAssign<super::__p64_u> for p64 {
            #[inline]
            fn bitand_assign(&mut self, other: super::__p64_u) {
                *self = *self & other;
            }
        }
        impl BitAndAssign<&super::__p64_u> for p64 {
            #[inline]
            fn bitand_assign(&mut self, other: &super::__p64_u) {
                *self = *self & *other;
            }
        }
        impl BitOr<p64> for p64 {
            type Output = p64;
            #[inline]
            fn bitor(self, other: p64) -> p64 { p64(self.0 | other.0) }
        }
        impl BitOr<p64> for &p64 {
            type Output = p64;
            #[inline]
            fn bitor(self, other: p64) -> p64 { p64(self.0 | other.0) }
        }
        impl BitOr<&p64> for p64 {
            type Output = p64;
            #[inline]
            fn bitor(self, other: &p64) -> p64 { p64(self.0 | other.0) }
        }
        impl BitOr<&p64> for &p64 {
            type Output = p64;
            #[inline]
            fn bitor(self, other: &p64) -> p64 { p64(self.0 | other.0) }
        }
        impl BitOrAssign<p64> for p64 {
            #[inline]
            fn bitor_assign(&mut self, other: p64) { *self = *self | other; }
        }
        impl BitOrAssign<&p64> for p64 {
            #[inline]
            fn bitor_assign(&mut self, other: &p64) {
                *self = *self | *other;
            }
        }
        impl BitOr<p64> for super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitor(self, other: p64) -> p64 { p64(self | other.0) }
        }
        impl BitOr<p64> for &super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitor(self, other: p64) -> p64 { p64(self | other.0) }
        }
        impl BitOr<&p64> for super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitor(self, other: &p64) -> p64 { p64(self | other.0) }
        }
        impl BitOr<&p64> for &super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitor(self, other: &p64) -> p64 { p64(self | other.0) }
        }
        impl BitOr<super::__p64_u> for p64 {
            type Output = p64;
            #[inline]
            fn bitor(self, other: super::__p64_u) -> p64 {
                p64(self.0 | other)
            }
        }
        impl BitOr<super::__p64_u> for &p64 {
            type Output = p64;
            #[inline]
            fn bitor(self, other: super::__p64_u) -> p64 {
                p64(self.0 | other)
            }
        }
        impl BitOr<&super::__p64_u> for p64 {
            type Output = p64;
            #[inline]
            fn bitor(self, other: &super::__p64_u) -> p64 {
                p64(self.0 | other)
            }
        }
        impl BitOr<&super::__p64_u> for &p64 {
            type Output = p64;
            #[inline]
            fn bitor(self, other: &super::__p64_u) -> p64 {
                p64(self.0 | other)
            }
        }
        impl BitOrAssign<super::__p64_u> for p64 {
            #[inline]
            fn bitor_assign(&mut self, other: super::__p64_u) {
                *self = *self | other;
            }
        }
        impl BitOrAssign<&super::__p64_u> for p64 {
            #[inline]
            fn bitor_assign(&mut self, other: &super::__p64_u) {
                *self = *self | *other;
            }
        }
        impl BitXor<p64> for p64 {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: p64) -> p64 { p64(self.0 ^ other.0) }
        }
        impl BitXor<p64> for &p64 {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: p64) -> p64 { p64(self.0 ^ other.0) }
        }
        impl BitXor<&p64> for p64 {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: &p64) -> p64 { p64(self.0 ^ other.0) }
        }
        impl BitXor<&p64> for &p64 {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: &p64) -> p64 { p64(self.0 ^ other.0) }
        }
        impl BitXorAssign<p64> for p64 {
            #[inline]
            fn bitxor_assign(&mut self, other: p64) { *self = *self ^ other; }
        }
        impl BitXorAssign<&p64> for p64 {
            #[inline]
            fn bitxor_assign(&mut self, other: &p64) {
                *self = *self ^ *other;
            }
        }
        impl BitXor<p64> for super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: p64) -> p64 { p64(self ^ other.0) }
        }
        impl BitXor<p64> for &super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: p64) -> p64 { p64(self ^ other.0) }
        }
        impl BitXor<&p64> for super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: &p64) -> p64 { p64(self ^ other.0) }
        }
        impl BitXor<&p64> for &super::__p64_u {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: &p64) -> p64 { p64(self ^ other.0) }
        }
        impl BitXor<super::__p64_u> for p64 {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: super::__p64_u) -> p64 {
                p64(self.0 ^ other)
            }
        }
        impl BitXor<super::__p64_u> for &p64 {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: super::__p64_u) -> p64 {
                p64(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p64_u> for p64 {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: &super::__p64_u) -> p64 {
                p64(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p64_u> for &p64 {
            type Output = p64;
            #[inline]
            fn bitxor(self, other: &super::__p64_u) -> p64 {
                p64(self.0 ^ other)
            }
        }
        impl BitXorAssign<super::__p64_u> for p64 {
            #[inline]
            fn bitxor_assign(&mut self, other: super::__p64_u) {
                *self = *self ^ other;
            }
        }
        impl BitXorAssign<&super::__p64_u> for p64 {
            #[inline]
            fn bitxor_assign(&mut self, other: &super::__p64_u) {
                *self = *self ^ *other;
            }
        }
        impl p64 {
            #[inline]
            pub const fn swap_bytes(self) -> p64 { p64(self.0.swap_bytes()) }
            #[inline]
            pub const fn to_le(self) -> p64 { p64(self.0.to_le()) }
            #[inline]
            pub const fn from_le(self_: p64) -> p64 {
                p64(super::__p64_u::from_le(self_.0))
            }
            #[inline]
            pub const fn to_le_bytes(self) -> [u8; 64 / 8] {
                self.0.to_le_bytes()
            }
            #[inline]
            pub const fn from_le_bytes(bytes: [u8; 64 / 8]) -> p64 {
                p64(super::__p64_u::from_le_bytes(bytes))
            }
            #[inline]
            pub const fn to_be(self) -> p64 { p64(self.0.to_be()) }
            #[inline]
            pub const fn from_be(self_: p64) -> p64 {
                p64(super::__p64_u::from_be(self_.0))
            }
            #[inline]
            pub const fn to_be_bytes(self) -> [u8; 64 / 8] {
                self.0.to_be_bytes()
            }
            #[inline]
            pub const fn from_be_bytes(bytes: [u8; 64 / 8]) -> p64 {
                p64(super::__p64_u::from_be_bytes(bytes))
            }
            #[inline]
            pub const fn to_ne_bytes(self) -> [u8; 64 / 8] {
                self.0.to_ne_bytes()
            }
            #[inline]
            pub const fn from_ne_bytes(bytes: [u8; 64 / 8]) -> p64 {
                p64(super::__p64_u::from_ne_bytes(bytes))
            }
        }
        impl p64 {
            #[inline]
            pub const fn reverse_bits(self) -> p64 {
                p64(self.0.reverse_bits())
            }
            #[inline]
            pub const fn count_ones(self) -> u32 { self.0.count_ones() }
            #[inline]
            pub const fn count_zeros(self) -> u32 { self.0.count_zeros() }
            #[inline]
            pub const fn leading_ones(self) -> u32 { self.0.leading_ones() }
            #[inline]
            pub const fn leading_zeros(self) -> u32 { self.0.leading_zeros() }
            #[inline]
            pub const fn trailing_ones(self) -> u32 { self.0.trailing_ones() }
            #[inline]
            pub const fn trailing_zeros(self) -> u32 {
                self.0.trailing_zeros()
            }
        }
        impl p64 {
            #[inline]
            pub const fn checked_shl(self, other: u32) -> Option<p64> {
                match self.0.checked_shl(other) {
                    Some(x) => Some(p64(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn checked_shr(self, other: u32) -> Option<p64> {
                match self.0.checked_shr(other) {
                    Some(x) => Some(p64(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn overflowing_shl(self, other: u32) -> (p64, bool) {
                let (x, o) = self.0.overflowing_shl(other);
                (p64(x), o)
            }
            #[inline]
            pub const fn overflowing_shr(self, other: u32) -> (p64, bool) {
                let (x, o) = self.0.overflowing_shr(other);
                (p64(x), o)
            }
            #[inline]
            pub const fn wrapping_shl(self, other: u32) -> p64 {
                p64(self.0.wrapping_shl(other))
            }
            #[inline]
            pub const fn wrapping_shr(self, other: u32) -> p64 {
                p64(self.0.wrapping_shr(other))
            }
            #[inline]
            pub const fn rotate_left(self, other: u32) -> p64 {
                p64(self.0.rotate_left(other))
            }
            #[inline]
            pub const fn rotate_right(self, other: u32) -> p64 {
                p64(self.0.rotate_right(other))
            }
        }
        impl Shl<u8> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u8) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u8> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u8) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u8> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u8) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u8> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u8) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u16> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u16) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u16> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u16) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u16> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u16) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u16> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u16) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u32> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u32) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u32> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u32) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u32> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u32) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u32> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u32) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u64> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u64) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u64> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u64) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u64> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u64) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u64> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u64) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u128> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u128) -> p64 { p64(self.0 << other) }
        }
        impl Shl<u128> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: u128) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u128> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u128) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&u128> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &u128) -> p64 { p64(self.0 << other) }
        }
        impl Shl<usize> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: usize) -> p64 { p64(self.0 << other) }
        }
        impl Shl<usize> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: usize) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&usize> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &usize) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&usize> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &usize) -> p64 { p64(self.0 << other) }
        }
        impl ShlAssign<u8> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: u8) { *self = *self << other; }
        }
        impl ShlAssign<&u8> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &u8) { *self = *self << other; }
        }
        impl ShlAssign<u16> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: u16) { *self = *self << other; }
        }
        impl ShlAssign<&u16> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &u16) { *self = *self << other; }
        }
        impl ShlAssign<u32> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: u32) { *self = *self << other; }
        }
        impl ShlAssign<&u32> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &u32) { *self = *self << other; }
        }
        impl ShlAssign<u64> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: u64) { *self = *self << other; }
        }
        impl ShlAssign<&u64> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &u64) { *self = *self << other; }
        }
        impl ShlAssign<u128> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: u128) { *self = *self << other; }
        }
        impl ShlAssign<&u128> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &u128) { *self = *self << other; }
        }
        impl ShlAssign<usize> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: usize) { *self = *self << other; }
        }
        impl ShlAssign<&usize> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &usize) {
                *self = *self << other;
            }
        }
        impl Shr<u8> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u8) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u8> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u8) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u8> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u8) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u8> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u8) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u16> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u16) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u16> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u16) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u16> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u16) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u16> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u16) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u32> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u32) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u32> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u32) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u32> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u32) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u32> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u32) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u64> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u64) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u64> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u64) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u64> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u64) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u64> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u64) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u128> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u128) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<u128> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: u128) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u128> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u128) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&u128> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &u128) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<usize> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: usize) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<usize> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: usize) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&usize> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &usize) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&usize> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &usize) -> p64 { p64(self.0 >> other) }
        }
        impl ShrAssign<u8> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: u8) { *self = *self >> other; }
        }
        impl ShrAssign<&u8> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &u8) { *self = *self >> other; }
        }
        impl ShrAssign<u16> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: u16) { *self = *self >> other; }
        }
        impl ShrAssign<&u16> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &u16) { *self = *self >> other; }
        }
        impl ShrAssign<u32> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: u32) { *self = *self >> other; }
        }
        impl ShrAssign<&u32> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &u32) { *self = *self >> other; }
        }
        impl ShrAssign<u64> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: u64) { *self = *self >> other; }
        }
        impl ShrAssign<&u64> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &u64) { *self = *self >> other; }
        }
        impl ShrAssign<u128> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: u128) { *self = *self >> other; }
        }
        impl ShrAssign<&u128> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &u128) { *self = *self >> other; }
        }
        impl ShrAssign<usize> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: usize) { *self = *self >> other; }
        }
        impl ShrAssign<&usize> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &usize) {
                *self = *self >> other;
            }
        }
        impl Shl<i8> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i8) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i8> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i8) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i8> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i8) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i8> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i8) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i16> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i16) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i16> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i16) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i16> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i16) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i16> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i16) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i32> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i32) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i32> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i32) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i32> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i32) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i32> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i32) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i64> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i64) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i64> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i64) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i64> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i64) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i64> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i64) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i128> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i128) -> p64 { p64(self.0 << other) }
        }
        impl Shl<i128> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: i128) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i128> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i128) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&i128> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &i128) -> p64 { p64(self.0 << other) }
        }
        impl Shl<isize> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: isize) -> p64 { p64(self.0 << other) }
        }
        impl Shl<isize> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: isize) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&isize> for p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &isize) -> p64 { p64(self.0 << other) }
        }
        impl Shl<&isize> for &p64 {
            type Output = p64;
            #[inline]
            fn shl(self, other: &isize) -> p64 { p64(self.0 << other) }
        }
        impl ShlAssign<i8> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: i8) { *self = *self << other; }
        }
        impl ShlAssign<&i8> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &i8) { *self = *self << other; }
        }
        impl ShlAssign<i16> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: i16) { *self = *self << other; }
        }
        impl ShlAssign<&i16> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &i16) { *self = *self << other; }
        }
        impl ShlAssign<i32> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: i32) { *self = *self << other; }
        }
        impl ShlAssign<&i32> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &i32) { *self = *self << other; }
        }
        impl ShlAssign<i64> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: i64) { *self = *self << other; }
        }
        impl ShlAssign<&i64> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &i64) { *self = *self << other; }
        }
        impl ShlAssign<i128> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: i128) { *self = *self << other; }
        }
        impl ShlAssign<&i128> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &i128) { *self = *self << other; }
        }
        impl ShlAssign<isize> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: isize) { *self = *self << other; }
        }
        impl ShlAssign<&isize> for p64 {
            #[inline]
            fn shl_assign(&mut self, other: &isize) {
                *self = *self << other;
            }
        }
        impl Shr<i8> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i8) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i8> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i8) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i8> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i8) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i8> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i8) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i16> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i16) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i16> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i16) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i16> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i16) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i16> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i16) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i32> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i32) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i32> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i32) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i32> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i32) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i32> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i32) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i64> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i64) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i64> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i64) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i64> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i64) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i64> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i64) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i128> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i128) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<i128> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: i128) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i128> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i128) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&i128> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &i128) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<isize> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: isize) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<isize> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: isize) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&isize> for p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &isize) -> p64 { p64(self.0 >> other) }
        }
        impl Shr<&isize> for &p64 {
            type Output = p64;
            #[inline]
            fn shr(self, other: &isize) -> p64 { p64(self.0 >> other) }
        }
        impl ShrAssign<i8> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: i8) { *self = *self >> other; }
        }
        impl ShrAssign<&i8> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &i8) { *self = *self >> other; }
        }
        impl ShrAssign<i16> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: i16) { *self = *self >> other; }
        }
        impl ShrAssign<&i16> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &i16) { *self = *self >> other; }
        }
        impl ShrAssign<i32> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: i32) { *self = *self >> other; }
        }
        impl ShrAssign<&i32> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &i32) { *self = *self >> other; }
        }
        impl ShrAssign<i64> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: i64) { *self = *self >> other; }
        }
        impl ShrAssign<&i64> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &i64) { *self = *self >> other; }
        }
        impl ShrAssign<i128> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: i128) { *self = *self >> other; }
        }
        impl ShrAssign<&i128> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &i128) { *self = *self >> other; }
        }
        impl ShrAssign<isize> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: isize) { *self = *self >> other; }
        }
        impl ShrAssign<&isize> for p64 {
            #[inline]
            fn shr_assign(&mut self, other: &isize) {
                *self = *self >> other;
            }
        }
        impl fmt::Debug for p64 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("{0}(0x{1:x})", "p64", self.0))
            }
        }
        impl fmt::Display for p64 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("0x{0:x}", self.0))
            }
        }
        impl fmt::Binary for p64 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p64_u as fmt::Binary>::fmt(&self.0, f)
            }
        }
        impl fmt::Octal for p64 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p64_u as fmt::Octal>::fmt(&self.0, f)
            }
        }
        impl fmt::LowerHex for p64 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p64_u as fmt::LowerHex>::fmt(&self.0, f)
            }
        }
        impl fmt::UpperHex for p64 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p64_u as fmt::UpperHex>::fmt(&self.0, f)
            }
        }
        impl FromStr for p64 {
            type Err = ParseIntError;
            fn from_str(s: &str) -> Result<p64, ParseIntError> {
                if s.starts_with("0x") {
                    Ok(p64(super::__p64_u::from_str_radix(&s[2..], 16)?))
                } else {
                    "".parse::<super::__p64_u>()?;
                    ::core::panicking::panic("internal error: entered unreachable code")
                }
            }
        }
        impl p64 {
            pub fn from_str_radix(s: &str, radix: u32)
                -> Result<p64, ParseIntError> {
                Ok(p64(super::__p64_u::from_str_radix(s, radix)?))
            }
        }
    }
    use u64 as __p64_u;
    use i64 as __p64_i;
    pub use __p128_gen::p128;
    mod __p128_gen {
        use core::mem::size_of;
        use core::ops::*;
        use core::iter::*;
        use core::num::TryFromIntError;
        use core::num::ParseIntError;
        use core::fmt;
        use core::str::FromStr;
        use core::slice;
        use crate::traits::TryFrom;
        use crate::traits::FromLossy;
        #[allow(non_camel_case_types)]
        #[repr(transparent)]
        pub struct p128(pub super::__p128_u);
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::default::Default for p128 {
            #[inline]
            fn default() -> p128 { p128(::core::default::Default::default()) }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::Copy for p128 { }
        #[automatically_derived]
        #[doc(hidden)]
        #[allow(non_camel_case_types)]
        unsafe impl ::core::clone::TrivialClone for p128 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::clone::Clone for p128 {
            #[inline]
            fn clone(&self) -> p128 {
                let _: ::core::clone::AssertParamIsClone<super::__p128_u>;
                *self
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Eq for p128 {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_fields_are_eq(&self) {
                let _: ::core::cmp::AssertParamIsEq<super::__p128_u>;
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::StructuralPartialEq for p128 { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialEq for p128 {
            #[inline]
            fn eq(&self, other: &p128) -> bool { self.0 == other.0 }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Ord for p128 {
            #[inline]
            fn cmp(&self, other: &p128) -> ::core::cmp::Ordering {
                ::core::cmp::Ord::cmp(&self.0, &other.0)
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialOrd for p128 {
            #[inline]
            fn partial_cmp(&self, other: &p128)
                -> ::core::option::Option<::core::cmp::Ordering> {
                ::core::option::Option::Some(::core::cmp::Ord::cmp(self,
                        other))
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::hash::Hash for p128 {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) {
                ::core::hash::Hash::hash(&self.0, state)
            }
        }
        impl p128 {
            #[inline]
            pub const fn new(x: super::__p128_u) -> p128 { p128(x) }
            #[inline]
            pub const fn get(self) -> super::__p128_u { self.0 }
            #[inline]
            pub const fn naive_add(self, other: p128) -> p128 {
                p128(self.0 ^ other.0)
            }
            #[inline]
            pub fn add(self, other: p128) -> p128 { p128(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_sub(self, other: p128) -> p128 {
                p128(self.0 ^ other.0)
            }
            #[inline]
            pub fn sub(self, other: p128) -> p128 { p128(self.0 ^ other.0) }
            #[inline]
            pub const fn naive_widening_mul(self, other: p128)
                -> (p128, p128) {
                let a = self.0;
                let b = other.0;
                let mut lo = 0;
                let mut hi = 0;
                let mut i = 0;
                while i < 128 {
                    let mask =
                        (((a as super::__p128_i) << (128 - 1 - i)) >> (128 - 1)) as
                            super::__p128_u;
                    lo ^= mask & (b << i);
                    hi ^= mask & (b >> (128 - 1 - i));
                    i += 1;
                }
                (p128(lo), p128(hi >> 1))
            }
            #[inline]
            pub const fn naive_overflowing_mul(self, other: p128)
                -> (p128, bool) {
                let (lo, hi) = self.naive_widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub const fn naive_checked_mul(self, other: p128)
                -> Option<p128> {
                match self.naive_overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub const fn naive_wrapping_mul(self, other: p128) -> p128 {
                let a = self.0;
                let b = other.0;
                let mut x = 0;
                let mut i = 0;
                while i < 128 {
                    let mask =
                        (((a as super::__p128_i) << (128 - 1 - i)) >> (128 - 1)) as
                            super::__p128_u;
                    x ^= mask & (b << i);
                    i += 1;
                }
                p128(x)
            }
            #[inline]
            pub const fn naive_mul(self, other: p128) -> p128 {
                match self.naive_checked_mul(other) {
                    Some(x) => x,
                    None => p128(self.0 / 0),
                }
            }
            #[inline]
            pub fn widening_mul(self, other: p128) -> (p128, p128) {
                self.naive_widening_mul(other)
            }
            #[inline]
            pub fn overflowing_mul(self, other: p128) -> (p128, bool) {
                let (lo, hi) = self.widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub fn checked_mul(self, other: p128) -> Option<p128> {
                match self.overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub fn wrapping_mul(self, other: p128) -> p128 {
                self.naive_wrapping_mul(other)
            }
            #[inline]
            pub fn mul(self, other: p128) -> p128 {
                self.checked_mul(other).expect("overflow in polynomial multiply")
            }
            #[inline]
            pub const fn naive_overflowing_pow(self, exp: u32)
                -> (p128, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p128(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.naive_overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.naive_overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub const fn naive_checked_pow(self, exp: u32) -> Option<p128> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p128(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.naive_checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.naive_checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub const fn naive_wrapping_pow(self, exp: u32) -> p128 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p128(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_wrapping_mul(a);
                }
            }
            #[inline]
            pub const fn naive_pow(self, exp: u32) -> p128 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p128(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_mul(a);
                }
            }
            #[inline]
            pub fn overflowing_pow(self, exp: u32) -> (p128, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = p128(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub fn checked_pow(self, exp: u32) -> Option<p128> {
                let mut a = self;
                let mut exp = exp;
                let mut x = p128(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub fn wrapping_pow(self, exp: u32) -> p128 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p128(1);
                loop {
                    if exp & 1 != 0 { x = x.wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.wrapping_mul(a);
                }
            }
            #[inline]
            pub fn pow(self, exp: u32) -> p128 {
                let mut a = self;
                let mut exp = exp;
                let mut x = p128(1);
                loop {
                    if exp & 1 != 0 { x = x.mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.mul(a);
                }
            }
            #[inline]
            pub const fn naive_checked_div(self, other: p128)
                -> Option<p128> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    let mut x = 0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        x ^= 1 << (b.leading_zeros() - a.leading_zeros());
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p128(x))
                }
            }
            #[inline]
            pub const fn naive_div(self, other: p128) -> p128 {
                match self.naive_checked_div(other) {
                    Some(x) => x,
                    None => p128(self.0 / 0),
                }
            }
            #[inline]
            pub const fn naive_checked_rem(self, other: p128)
                -> Option<p128> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(p128(a))
                }
            }
            #[inline]
            pub const fn naive_rem(self, other: p128) -> p128 {
                match self.naive_checked_rem(other) {
                    Some(x) => x,
                    None => p128(self.0 / 0),
                }
            }
            #[inline]
            pub fn slice_from_slice(slice: &[super::__p128_u]) -> &[p128] {
                unsafe {
                    slice::from_raw_parts(slice.as_ptr() as *const p128,
                        slice.len())
                }
            }
            #[inline]
            pub fn slice_from_slice_mut(slice: &mut [super::__p128_u])
                -> &mut [p128] {
                unsafe {
                    slice::from_raw_parts_mut(slice.as_mut_ptr() as *mut p128,
                        slice.len())
                }
            }
        }
        impl From<super::__p128_u> for p128 {
            #[inline]
            fn from(x: super::__p128_u) -> p128 { p128(x) }
        }
        impl From<bool> for p128 {
            #[inline]
            fn from(x: bool) -> p128 { p128(super::__p128_u::from(x)) }
        }
        impl From<char> for p128 {
            #[inline]
            fn from(x: char) -> p128 { p128(super::__p128_u::from(x)) }
        }
        impl From<u8> for p128 {
            #[inline]
            fn from(x: u8) -> p128 { p128(super::__p128_u::from(x)) }
        }
        impl From<u16> for p128 {
            #[inline]
            fn from(x: u16) -> p128 { p128(super::__p128_u::from(x)) }
        }
        impl From<u32> for p128 {
            #[inline]
            fn from(x: u32) -> p128 { p128(super::__p128_u::from(x)) }
        }
        impl From<u64> for p128 {
            #[inline]
            fn from(x: u64) -> p128 { p128(super::__p128_u::from(x)) }
        }
        impl From<crate::p8> for p128 {
            #[inline]
            fn from(x: crate::p8) -> p128 { p128(super::__p128_u::from(x.0)) }
        }
        impl From<crate::p16> for p128 {
            #[inline]
            fn from(x: crate::p16) -> p128 {
                p128(super::__p128_u::from(x.0))
            }
        }
        impl From<crate::p32> for p128 {
            #[inline]
            fn from(x: crate::p32) -> p128 {
                p128(super::__p128_u::from(x.0))
            }
        }
        impl From<crate::p64> for p128 {
            #[inline]
            fn from(x: crate::p64) -> p128 {
                p128(super::__p128_u::from(x.0))
            }
        }
        impl TryFrom<usize> for p128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: usize) -> Result<p128, Self::Error> {
                Ok(p128(super::__p128_u::try_from(x)?))
            }
        }
        impl TryFrom<crate::psize> for p128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::psize) -> Result<p128, Self::Error> {
                Ok(p128(super::__p128_u::try_from(x.0)?))
            }
        }
        impl FromLossy<usize> for p128 {
            #[inline]
            fn from_lossy(x: usize) -> p128 { p128(x as super::__p128_u) }
        }
        impl FromLossy<crate::psize> for p128 {
            #[inline]
            fn from_lossy(x: crate::psize) -> p128 {
                p128(x.0 as super::__p128_u)
            }
        }
        impl TryFrom<i8> for p128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i8) -> Result<p128, Self::Error> {
                Ok(p128(super::__p128_u::try_from(x)?))
            }
        }
        impl TryFrom<i16> for p128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i16) -> Result<p128, Self::Error> {
                Ok(p128(super::__p128_u::try_from(x)?))
            }
        }
        impl TryFrom<i32> for p128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i32) -> Result<p128, Self::Error> {
                Ok(p128(super::__p128_u::try_from(x)?))
            }
        }
        impl TryFrom<i64> for p128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i64) -> Result<p128, Self::Error> {
                Ok(p128(super::__p128_u::try_from(x)?))
            }
        }
        impl TryFrom<i128> for p128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i128) -> Result<p128, Self::Error> {
                Ok(p128(super::__p128_u::try_from(x)?))
            }
        }
        impl TryFrom<isize> for p128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: isize) -> Result<p128, Self::Error> {
                Ok(p128(super::__p128_u::try_from(x)?))
            }
        }
        impl FromLossy<i8> for p128 {
            #[inline]
            fn from_lossy(x: i8) -> p128 { p128(x as super::__p128_u) }
        }
        impl FromLossy<i16> for p128 {
            #[inline]
            fn from_lossy(x: i16) -> p128 { p128(x as super::__p128_u) }
        }
        impl FromLossy<i32> for p128 {
            #[inline]
            fn from_lossy(x: i32) -> p128 { p128(x as super::__p128_u) }
        }
        impl FromLossy<i64> for p128 {
            #[inline]
            fn from_lossy(x: i64) -> p128 { p128(x as super::__p128_u) }
        }
        impl FromLossy<i128> for p128 {
            #[inline]
            fn from_lossy(x: i128) -> p128 { p128(x as super::__p128_u) }
        }
        impl FromLossy<isize> for p128 {
            #[inline]
            fn from_lossy(x: isize) -> p128 { p128(x as super::__p128_u) }
        }
        impl From<p128> for super::__p128_u {
            #[inline]
            fn from(x: p128) -> super::__p128_u { x.0 }
        }
        impl TryFrom<p128> for u8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<u8, Self::Error> {
                u8::try_from(x.0)
            }
        }
        impl TryFrom<p128> for u16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<u16, Self::Error> {
                u16::try_from(x.0)
            }
        }
        impl TryFrom<p128> for u32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<u32, Self::Error> {
                u32::try_from(x.0)
            }
        }
        impl TryFrom<p128> for u64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<u64, Self::Error> {
                u64::try_from(x.0)
            }
        }
        impl TryFrom<p128> for usize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<usize, Self::Error> {
                usize::try_from(x.0)
            }
        }
        impl FromLossy<p128> for u8 {
            #[inline]
            fn from_lossy(x: p128) -> u8 { x.0 as u8 }
        }
        impl FromLossy<p128> for u16 {
            #[inline]
            fn from_lossy(x: p128) -> u16 { x.0 as u16 }
        }
        impl FromLossy<p128> for u32 {
            #[inline]
            fn from_lossy(x: p128) -> u32 { x.0 as u32 }
        }
        impl FromLossy<p128> for u64 {
            #[inline]
            fn from_lossy(x: p128) -> u64 { x.0 as u64 }
        }
        impl FromLossy<p128> for usize {
            #[inline]
            fn from_lossy(x: p128) -> usize { x.0 as usize }
        }
        impl TryFrom<p128> for i8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<i8, Self::Error> {
                i8::try_from(x.0)
            }
        }
        impl TryFrom<p128> for i16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<i16, Self::Error> {
                i16::try_from(x.0)
            }
        }
        impl TryFrom<p128> for i32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<i32, Self::Error> {
                i32::try_from(x.0)
            }
        }
        impl TryFrom<p128> for i64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<i64, Self::Error> {
                i64::try_from(x.0)
            }
        }
        impl TryFrom<p128> for i128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<i128, Self::Error> {
                i128::try_from(x.0)
            }
        }
        impl TryFrom<p128> for isize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: p128) -> Result<isize, Self::Error> {
                isize::try_from(x.0)
            }
        }
        impl FromLossy<p128> for i8 {
            #[inline]
            fn from_lossy(x: p128) -> i8 { x.0 as i8 }
        }
        impl FromLossy<p128> for i16 {
            #[inline]
            fn from_lossy(x: p128) -> i16 { x.0 as i16 }
        }
        impl FromLossy<p128> for i32 {
            #[inline]
            fn from_lossy(x: p128) -> i32 { x.0 as i32 }
        }
        impl FromLossy<p128> for i64 {
            #[inline]
            fn from_lossy(x: p128) -> i64 { x.0 as i64 }
        }
        impl FromLossy<p128> for i128 {
            #[inline]
            fn from_lossy(x: p128) -> i128 { x.0 as i128 }
        }
        impl FromLossy<p128> for isize {
            #[inline]
            fn from_lossy(x: p128) -> isize { x.0 as isize }
        }
        impl Neg for p128 {
            type Output = p128;
            #[inline]
            fn neg(self) -> p128 { self }
        }
        impl Neg for &p128 {
            type Output = p128;
            #[inline]
            fn neg(self) -> p128 { *self }
        }
        impl Add<p128> for p128 {
            type Output = p128;
            #[inline]
            fn add(self, other: p128) -> p128 { p128::add(self, other) }
        }
        impl Add<p128> for &p128 {
            type Output = p128;
            #[inline]
            fn add(self, other: p128) -> p128 { p128::add(*self, other) }
        }
        impl Add<&p128> for p128 {
            type Output = p128;
            #[inline]
            fn add(self, other: &p128) -> p128 { p128::add(self, *other) }
        }
        impl Add<&p128> for &p128 {
            type Output = p128;
            #[inline]
            fn add(self, other: &p128) -> p128 { p128::add(*self, *other) }
        }
        impl AddAssign<p128> for p128 {
            #[inline]
            fn add_assign(&mut self, other: p128) { *self = self.add(other) }
        }
        impl AddAssign<&p128> for p128 {
            #[inline]
            fn add_assign(&mut self, other: &p128) {
                *self = self.add(*other)
            }
        }
        impl Sum<p128> for p128 {
            #[inline]
            fn sum<I>(iter: I) -> p128 where I: Iterator<Item = p128> {
                iter.fold(p128(0), |a, x| a + x)
            }
        }
        impl<'a> Sum<&'a p128> for p128 {
            #[inline]
            fn sum<I>(iter: I) -> p128 where I: Iterator<Item = &'a p128> {
                iter.fold(p128(0), |a, x| a + *x)
            }
        }
        impl Sub for p128 {
            type Output = p128;
            #[inline]
            fn sub(self, other: p128) -> p128 { p128::sub(self, other) }
        }
        impl Sub<p128> for &p128 {
            type Output = p128;
            #[inline]
            fn sub(self, other: p128) -> p128 { p128::sub(*self, other) }
        }
        impl Sub<&p128> for p128 {
            type Output = p128;
            #[inline]
            fn sub(self, other: &p128) -> p128 { p128::sub(self, *other) }
        }
        impl Sub<&p128> for &p128 {
            type Output = p128;
            #[inline]
            fn sub(self, other: &p128) -> p128 { p128::sub(*self, *other) }
        }
        impl SubAssign<p128> for p128 {
            #[inline]
            fn sub_assign(&mut self, other: p128) { *self = self.sub(other) }
        }
        impl SubAssign<&p128> for p128 {
            #[inline]
            fn sub_assign(&mut self, other: &p128) {
                *self = self.sub(*other)
            }
        }
        impl Mul for p128 {
            type Output = p128;
            #[inline]
            fn mul(self, other: p128) -> p128 { p128::mul(self, other) }
        }
        impl Mul<p128> for &p128 {
            type Output = p128;
            #[inline]
            fn mul(self, other: p128) -> p128 { p128::mul(*self, other) }
        }
        impl Mul<&p128> for p128 {
            type Output = p128;
            #[inline]
            fn mul(self, other: &p128) -> p128 { p128::mul(self, *other) }
        }
        impl Mul<&p128> for &p128 {
            type Output = p128;
            #[inline]
            fn mul(self, other: &p128) -> p128 { p128::mul(*self, *other) }
        }
        impl MulAssign<p128> for p128 {
            #[inline]
            fn mul_assign(&mut self, other: p128) { *self = self.mul(other) }
        }
        impl MulAssign<&p128> for p128 {
            #[inline]
            fn mul_assign(&mut self, other: &p128) {
                *self = self.mul(*other)
            }
        }
        impl Product<p128> for p128 {
            #[inline]
            fn product<I>(iter: I) -> p128 where I: Iterator<Item = p128> {
                iter.fold(p128(0), |a, x| a * x)
            }
        }
        impl<'a> Product<&'a p128> for p128 {
            #[inline]
            fn product<I>(iter: I) -> p128 where
                I: Iterator<Item = &'a p128> {
                iter.fold(p128(0), |a, x| a * *x)
            }
        }
        impl Div for p128 {
            type Output = p128;
            #[inline]
            fn div(self, other: p128) -> p128 { p128::naive_div(self, other) }
        }
        impl Div<p128> for &p128 {
            type Output = p128;
            #[inline]
            fn div(self, other: p128) -> p128 {
                p128::naive_div(*self, other)
            }
        }
        impl Div<&p128> for p128 {
            type Output = p128;
            #[inline]
            fn div(self, other: &p128) -> p128 {
                p128::naive_div(self, *other)
            }
        }
        impl Div<&p128> for &p128 {
            type Output = p128;
            #[inline]
            fn div(self, other: &p128) -> p128 {
                p128::naive_div(*self, *other)
            }
        }
        impl DivAssign<p128> for p128 {
            #[inline]
            fn div_assign(&mut self, other: p128) { *self = self.div(other) }
        }
        impl DivAssign<&p128> for p128 {
            #[inline]
            fn div_assign(&mut self, other: &p128) {
                *self = self.div(*other)
            }
        }
        impl Rem for p128 {
            type Output = p128;
            #[inline]
            fn rem(self, other: p128) -> p128 { p128::naive_rem(self, other) }
        }
        impl Rem<p128> for &p128 {
            type Output = p128;
            #[inline]
            fn rem(self, other: p128) -> p128 {
                p128::naive_rem(*self, other)
            }
        }
        impl Rem<&p128> for p128 {
            type Output = p128;
            #[inline]
            fn rem(self, other: &p128) -> p128 {
                p128::naive_rem(self, *other)
            }
        }
        impl Rem<&p128> for &p128 {
            type Output = p128;
            #[inline]
            fn rem(self, other: &p128) -> p128 {
                p128::naive_rem(*self, *other)
            }
        }
        impl RemAssign<p128> for p128 {
            #[inline]
            fn rem_assign(&mut self, other: p128) { *self = self.rem(other) }
        }
        impl RemAssign<&p128> for p128 {
            #[inline]
            fn rem_assign(&mut self, other: &p128) {
                *self = self.rem(*other)
            }
        }
        impl Not for p128 {
            type Output = p128;
            #[inline]
            fn not(self) -> p128 { p128(!self.0) }
        }
        impl Not for &p128 {
            type Output = p128;
            #[inline]
            fn not(self) -> p128 { p128(!self.0) }
        }
        impl BitAnd<p128> for p128 {
            type Output = p128;
            #[inline]
            fn bitand(self, other: p128) -> p128 { p128(self.0 & other.0) }
        }
        impl BitAnd<p128> for &p128 {
            type Output = p128;
            #[inline]
            fn bitand(self, other: p128) -> p128 { p128(self.0 & other.0) }
        }
        impl BitAnd<&p128> for p128 {
            type Output = p128;
            #[inline]
            fn bitand(self, other: &p128) -> p128 { p128(self.0 & other.0) }
        }
        impl BitAnd<&p128> for &p128 {
            type Output = p128;
            #[inline]
            fn bitand(self, other: &p128) -> p128 { p128(self.0 & other.0) }
        }
        impl BitAndAssign<p128> for p128 {
            #[inline]
            fn bitand_assign(&mut self, other: p128) {
                *self = *self & other;
            }
        }
        impl BitAndAssign<&p128> for p128 {
            #[inline]
            fn bitand_assign(&mut self, other: &p128) {
                *self = *self & *other;
            }
        }
        impl BitAnd<p128> for super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitand(self, other: p128) -> p128 { p128(self & other.0) }
        }
        impl BitAnd<p128> for &super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitand(self, other: p128) -> p128 { p128(self & other.0) }
        }
        impl BitAnd<&p128> for super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitand(self, other: &p128) -> p128 { p128(self & other.0) }
        }
        impl BitAnd<&p128> for &super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitand(self, other: &p128) -> p128 { p128(self & other.0) }
        }
        impl BitAnd<super::__p128_u> for p128 {
            type Output = p128;
            #[inline]
            fn bitand(self, other: super::__p128_u) -> p128 {
                p128(self.0 & other)
            }
        }
        impl BitAnd<super::__p128_u> for &p128 {
            type Output = p128;
            #[inline]
            fn bitand(self, other: super::__p128_u) -> p128 {
                p128(self.0 & other)
            }
        }
        impl BitAnd<&super::__p128_u> for p128 {
            type Output = p128;
            #[inline]
            fn bitand(self, other: &super::__p128_u) -> p128 {
                p128(self.0 & other)
            }
        }
        impl BitAnd<&super::__p128_u> for &p128 {
            type Output = p128;
            #[inline]
            fn bitand(self, other: &super::__p128_u) -> p128 {
                p128(self.0 & other)
            }
        }
        impl BitAndAssign<super::__p128_u> for p128 {
            #[inline]
            fn bitand_assign(&mut self, other: super::__p128_u) {
                *self = *self & other;
            }
        }
        impl BitAndAssign<&super::__p128_u> for p128 {
            #[inline]
            fn bitand_assign(&mut self, other: &super::__p128_u) {
                *self = *self & *other;
            }
        }
        impl BitOr<p128> for p128 {
            type Output = p128;
            #[inline]
            fn bitor(self, other: p128) -> p128 { p128(self.0 | other.0) }
        }
        impl BitOr<p128> for &p128 {
            type Output = p128;
            #[inline]
            fn bitor(self, other: p128) -> p128 { p128(self.0 | other.0) }
        }
        impl BitOr<&p128> for p128 {
            type Output = p128;
            #[inline]
            fn bitor(self, other: &p128) -> p128 { p128(self.0 | other.0) }
        }
        impl BitOr<&p128> for &p128 {
            type Output = p128;
            #[inline]
            fn bitor(self, other: &p128) -> p128 { p128(self.0 | other.0) }
        }
        impl BitOrAssign<p128> for p128 {
            #[inline]
            fn bitor_assign(&mut self, other: p128) { *self = *self | other; }
        }
        impl BitOrAssign<&p128> for p128 {
            #[inline]
            fn bitor_assign(&mut self, other: &p128) {
                *self = *self | *other;
            }
        }
        impl BitOr<p128> for super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitor(self, other: p128) -> p128 { p128(self | other.0) }
        }
        impl BitOr<p128> for &super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitor(self, other: p128) -> p128 { p128(self | other.0) }
        }
        impl BitOr<&p128> for super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitor(self, other: &p128) -> p128 { p128(self | other.0) }
        }
        impl BitOr<&p128> for &super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitor(self, other: &p128) -> p128 { p128(self | other.0) }
        }
        impl BitOr<super::__p128_u> for p128 {
            type Output = p128;
            #[inline]
            fn bitor(self, other: super::__p128_u) -> p128 {
                p128(self.0 | other)
            }
        }
        impl BitOr<super::__p128_u> for &p128 {
            type Output = p128;
            #[inline]
            fn bitor(self, other: super::__p128_u) -> p128 {
                p128(self.0 | other)
            }
        }
        impl BitOr<&super::__p128_u> for p128 {
            type Output = p128;
            #[inline]
            fn bitor(self, other: &super::__p128_u) -> p128 {
                p128(self.0 | other)
            }
        }
        impl BitOr<&super::__p128_u> for &p128 {
            type Output = p128;
            #[inline]
            fn bitor(self, other: &super::__p128_u) -> p128 {
                p128(self.0 | other)
            }
        }
        impl BitOrAssign<super::__p128_u> for p128 {
            #[inline]
            fn bitor_assign(&mut self, other: super::__p128_u) {
                *self = *self | other;
            }
        }
        impl BitOrAssign<&super::__p128_u> for p128 {
            #[inline]
            fn bitor_assign(&mut self, other: &super::__p128_u) {
                *self = *self | *other;
            }
        }
        impl BitXor<p128> for p128 {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: p128) -> p128 { p128(self.0 ^ other.0) }
        }
        impl BitXor<p128> for &p128 {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: p128) -> p128 { p128(self.0 ^ other.0) }
        }
        impl BitXor<&p128> for p128 {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: &p128) -> p128 { p128(self.0 ^ other.0) }
        }
        impl BitXor<&p128> for &p128 {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: &p128) -> p128 { p128(self.0 ^ other.0) }
        }
        impl BitXorAssign<p128> for p128 {
            #[inline]
            fn bitxor_assign(&mut self, other: p128) {
                *self = *self ^ other;
            }
        }
        impl BitXorAssign<&p128> for p128 {
            #[inline]
            fn bitxor_assign(&mut self, other: &p128) {
                *self = *self ^ *other;
            }
        }
        impl BitXor<p128> for super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: p128) -> p128 { p128(self ^ other.0) }
        }
        impl BitXor<p128> for &super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: p128) -> p128 { p128(self ^ other.0) }
        }
        impl BitXor<&p128> for super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: &p128) -> p128 { p128(self ^ other.0) }
        }
        impl BitXor<&p128> for &super::__p128_u {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: &p128) -> p128 { p128(self ^ other.0) }
        }
        impl BitXor<super::__p128_u> for p128 {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: super::__p128_u) -> p128 {
                p128(self.0 ^ other)
            }
        }
        impl BitXor<super::__p128_u> for &p128 {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: super::__p128_u) -> p128 {
                p128(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p128_u> for p128 {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: &super::__p128_u) -> p128 {
                p128(self.0 ^ other)
            }
        }
        impl BitXor<&super::__p128_u> for &p128 {
            type Output = p128;
            #[inline]
            fn bitxor(self, other: &super::__p128_u) -> p128 {
                p128(self.0 ^ other)
            }
        }
        impl BitXorAssign<super::__p128_u> for p128 {
            #[inline]
            fn bitxor_assign(&mut self, other: super::__p128_u) {
                *self = *self ^ other;
            }
        }
        impl BitXorAssign<&super::__p128_u> for p128 {
            #[inline]
            fn bitxor_assign(&mut self, other: &super::__p128_u) {
                *self = *self ^ *other;
            }
        }
        impl p128 {
            #[inline]
            pub const fn swap_bytes(self) -> p128 {
                p128(self.0.swap_bytes())
            }
            #[inline]
            pub const fn to_le(self) -> p128 { p128(self.0.to_le()) }
            #[inline]
            pub const fn from_le(self_: p128) -> p128 {
                p128(super::__p128_u::from_le(self_.0))
            }
            #[inline]
            pub const fn to_le_bytes(self) -> [u8; 128 / 8] {
                self.0.to_le_bytes()
            }
            #[inline]
            pub const fn from_le_bytes(bytes: [u8; 128 / 8]) -> p128 {
                p128(super::__p128_u::from_le_bytes(bytes))
            }
            #[inline]
            pub const fn to_be(self) -> p128 { p128(self.0.to_be()) }
            #[inline]
            pub const fn from_be(self_: p128) -> p128 {
                p128(super::__p128_u::from_be(self_.0))
            }
            #[inline]
            pub const fn to_be_bytes(self) -> [u8; 128 / 8] {
                self.0.to_be_bytes()
            }
            #[inline]
            pub const fn from_be_bytes(bytes: [u8; 128 / 8]) -> p128 {
                p128(super::__p128_u::from_be_bytes(bytes))
            }
            #[inline]
            pub const fn to_ne_bytes(self) -> [u8; 128 / 8] {
                self.0.to_ne_bytes()
            }
            #[inline]
            pub const fn from_ne_bytes(bytes: [u8; 128 / 8]) -> p128 {
                p128(super::__p128_u::from_ne_bytes(bytes))
            }
        }
        impl p128 {
            #[inline]
            pub const fn reverse_bits(self) -> p128 {
                p128(self.0.reverse_bits())
            }
            #[inline]
            pub const fn count_ones(self) -> u32 { self.0.count_ones() }
            #[inline]
            pub const fn count_zeros(self) -> u32 { self.0.count_zeros() }
            #[inline]
            pub const fn leading_ones(self) -> u32 { self.0.leading_ones() }
            #[inline]
            pub const fn leading_zeros(self) -> u32 { self.0.leading_zeros() }
            #[inline]
            pub const fn trailing_ones(self) -> u32 { self.0.trailing_ones() }
            #[inline]
            pub const fn trailing_zeros(self) -> u32 {
                self.0.trailing_zeros()
            }
        }
        impl p128 {
            #[inline]
            pub const fn checked_shl(self, other: u32) -> Option<p128> {
                match self.0.checked_shl(other) {
                    Some(x) => Some(p128(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn checked_shr(self, other: u32) -> Option<p128> {
                match self.0.checked_shr(other) {
                    Some(x) => Some(p128(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn overflowing_shl(self, other: u32) -> (p128, bool) {
                let (x, o) = self.0.overflowing_shl(other);
                (p128(x), o)
            }
            #[inline]
            pub const fn overflowing_shr(self, other: u32) -> (p128, bool) {
                let (x, o) = self.0.overflowing_shr(other);
                (p128(x), o)
            }
            #[inline]
            pub const fn wrapping_shl(self, other: u32) -> p128 {
                p128(self.0.wrapping_shl(other))
            }
            #[inline]
            pub const fn wrapping_shr(self, other: u32) -> p128 {
                p128(self.0.wrapping_shr(other))
            }
            #[inline]
            pub const fn rotate_left(self, other: u32) -> p128 {
                p128(self.0.rotate_left(other))
            }
            #[inline]
            pub const fn rotate_right(self, other: u32) -> p128 {
                p128(self.0.rotate_right(other))
            }
        }
        impl Shl<u8> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u8) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u8> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u8) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u8> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u8) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u8> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u8) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u16> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u16) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u16> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u16) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u16> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u16) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u16> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u16) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u32> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u32) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u32> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u32) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u32> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u32) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u32> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u32) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u64> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u64) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u64> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u64) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u64> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u64) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u64> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u64) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u128> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u128) -> p128 { p128(self.0 << other) }
        }
        impl Shl<u128> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: u128) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u128> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u128) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&u128> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &u128) -> p128 { p128(self.0 << other) }
        }
        impl Shl<usize> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: usize) -> p128 { p128(self.0 << other) }
        }
        impl Shl<usize> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: usize) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&usize> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &usize) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&usize> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &usize) -> p128 { p128(self.0 << other) }
        }
        impl ShlAssign<u8> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: u8) { *self = *self << other; }
        }
        impl ShlAssign<&u8> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &u8) { *self = *self << other; }
        }
        impl ShlAssign<u16> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: u16) { *self = *self << other; }
        }
        impl ShlAssign<&u16> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &u16) { *self = *self << other; }
        }
        impl ShlAssign<u32> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: u32) { *self = *self << other; }
        }
        impl ShlAssign<&u32> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &u32) { *self = *self << other; }
        }
        impl ShlAssign<u64> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: u64) { *self = *self << other; }
        }
        impl ShlAssign<&u64> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &u64) { *self = *self << other; }
        }
        impl ShlAssign<u128> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: u128) { *self = *self << other; }
        }
        impl ShlAssign<&u128> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &u128) { *self = *self << other; }
        }
        impl ShlAssign<usize> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: usize) { *self = *self << other; }
        }
        impl ShlAssign<&usize> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &usize) {
                *self = *self << other;
            }
        }
        impl Shr<u8> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u8) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u8> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u8) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u8> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u8) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u8> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u8) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u16> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u16) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u16> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u16) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u16> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u16) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u16> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u16) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u32> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u32) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u32> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u32) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u32> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u32) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u32> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u32) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u64> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u64) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u64> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u64) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u64> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u64) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u64> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u64) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u128> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u128) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<u128> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: u128) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u128> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u128) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&u128> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &u128) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<usize> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: usize) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<usize> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: usize) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&usize> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &usize) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&usize> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &usize) -> p128 { p128(self.0 >> other) }
        }
        impl ShrAssign<u8> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: u8) { *self = *self >> other; }
        }
        impl ShrAssign<&u8> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &u8) { *self = *self >> other; }
        }
        impl ShrAssign<u16> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: u16) { *self = *self >> other; }
        }
        impl ShrAssign<&u16> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &u16) { *self = *self >> other; }
        }
        impl ShrAssign<u32> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: u32) { *self = *self >> other; }
        }
        impl ShrAssign<&u32> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &u32) { *self = *self >> other; }
        }
        impl ShrAssign<u64> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: u64) { *self = *self >> other; }
        }
        impl ShrAssign<&u64> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &u64) { *self = *self >> other; }
        }
        impl ShrAssign<u128> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: u128) { *self = *self >> other; }
        }
        impl ShrAssign<&u128> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &u128) { *self = *self >> other; }
        }
        impl ShrAssign<usize> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: usize) { *self = *self >> other; }
        }
        impl ShrAssign<&usize> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &usize) {
                *self = *self >> other;
            }
        }
        impl Shl<i8> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i8) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i8> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i8) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i8> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i8) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i8> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i8) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i16> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i16) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i16> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i16) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i16> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i16) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i16> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i16) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i32> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i32) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i32> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i32) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i32> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i32) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i32> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i32) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i64> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i64) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i64> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i64) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i64> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i64) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i64> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i64) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i128> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i128) -> p128 { p128(self.0 << other) }
        }
        impl Shl<i128> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: i128) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i128> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i128) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&i128> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &i128) -> p128 { p128(self.0 << other) }
        }
        impl Shl<isize> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: isize) -> p128 { p128(self.0 << other) }
        }
        impl Shl<isize> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: isize) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&isize> for p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &isize) -> p128 { p128(self.0 << other) }
        }
        impl Shl<&isize> for &p128 {
            type Output = p128;
            #[inline]
            fn shl(self, other: &isize) -> p128 { p128(self.0 << other) }
        }
        impl ShlAssign<i8> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: i8) { *self = *self << other; }
        }
        impl ShlAssign<&i8> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &i8) { *self = *self << other; }
        }
        impl ShlAssign<i16> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: i16) { *self = *self << other; }
        }
        impl ShlAssign<&i16> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &i16) { *self = *self << other; }
        }
        impl ShlAssign<i32> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: i32) { *self = *self << other; }
        }
        impl ShlAssign<&i32> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &i32) { *self = *self << other; }
        }
        impl ShlAssign<i64> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: i64) { *self = *self << other; }
        }
        impl ShlAssign<&i64> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &i64) { *self = *self << other; }
        }
        impl ShlAssign<i128> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: i128) { *self = *self << other; }
        }
        impl ShlAssign<&i128> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &i128) { *self = *self << other; }
        }
        impl ShlAssign<isize> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: isize) { *self = *self << other; }
        }
        impl ShlAssign<&isize> for p128 {
            #[inline]
            fn shl_assign(&mut self, other: &isize) {
                *self = *self << other;
            }
        }
        impl Shr<i8> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i8) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i8> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i8) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i8> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i8) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i8> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i8) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i16> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i16) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i16> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i16) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i16> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i16) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i16> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i16) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i32> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i32) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i32> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i32) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i32> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i32) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i32> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i32) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i64> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i64) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i64> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i64) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i64> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i64) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i64> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i64) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i128> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i128) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<i128> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: i128) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i128> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i128) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&i128> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &i128) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<isize> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: isize) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<isize> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: isize) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&isize> for p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &isize) -> p128 { p128(self.0 >> other) }
        }
        impl Shr<&isize> for &p128 {
            type Output = p128;
            #[inline]
            fn shr(self, other: &isize) -> p128 { p128(self.0 >> other) }
        }
        impl ShrAssign<i8> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: i8) { *self = *self >> other; }
        }
        impl ShrAssign<&i8> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &i8) { *self = *self >> other; }
        }
        impl ShrAssign<i16> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: i16) { *self = *self >> other; }
        }
        impl ShrAssign<&i16> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &i16) { *self = *self >> other; }
        }
        impl ShrAssign<i32> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: i32) { *self = *self >> other; }
        }
        impl ShrAssign<&i32> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &i32) { *self = *self >> other; }
        }
        impl ShrAssign<i64> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: i64) { *self = *self >> other; }
        }
        impl ShrAssign<&i64> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &i64) { *self = *self >> other; }
        }
        impl ShrAssign<i128> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: i128) { *self = *self >> other; }
        }
        impl ShrAssign<&i128> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &i128) { *self = *self >> other; }
        }
        impl ShrAssign<isize> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: isize) { *self = *self >> other; }
        }
        impl ShrAssign<&isize> for p128 {
            #[inline]
            fn shr_assign(&mut self, other: &isize) {
                *self = *self >> other;
            }
        }
        impl fmt::Debug for p128 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("{0}(0x{1:x})", "p128", self.0))
            }
        }
        impl fmt::Display for p128 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("0x{0:x}", self.0))
            }
        }
        impl fmt::Binary for p128 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p128_u as fmt::Binary>::fmt(&self.0, f)
            }
        }
        impl fmt::Octal for p128 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p128_u as fmt::Octal>::fmt(&self.0, f)
            }
        }
        impl fmt::LowerHex for p128 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p128_u as fmt::LowerHex>::fmt(&self.0, f)
            }
        }
        impl fmt::UpperHex for p128 {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__p128_u as fmt::UpperHex>::fmt(&self.0, f)
            }
        }
        impl FromStr for p128 {
            type Err = ParseIntError;
            fn from_str(s: &str) -> Result<p128, ParseIntError> {
                if s.starts_with("0x") {
                    Ok(p128(super::__p128_u::from_str_radix(&s[2..], 16)?))
                } else {
                    "".parse::<super::__p128_u>()?;
                    ::core::panicking::panic("internal error: entered unreachable code")
                }
            }
        }
        impl p128 {
            pub fn from_str_radix(s: &str, radix: u32)
                -> Result<p128, ParseIntError> {
                Ok(p128(super::__p128_u::from_str_radix(s, radix)?))
            }
        }
    }
    use u128 as __p128_u;
    use i128 as __p128_i;
    pub use __psize_gen::psize;
    mod __psize_gen {
        use core::mem::size_of;
        use core::ops::*;
        use core::iter::*;
        use core::num::TryFromIntError;
        use core::num::ParseIntError;
        use core::fmt;
        use core::str::FromStr;
        use core::slice;
        use crate::traits::TryFrom;
        use crate::traits::FromLossy;
        #[allow(non_camel_case_types)]
        #[repr(transparent)]
        pub struct psize(pub super::__psize_u);
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::default::Default for psize {
            #[inline]
            fn default() -> psize {
                psize(::core::default::Default::default())
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::Copy for psize { }
        #[automatically_derived]
        #[doc(hidden)]
        #[allow(non_camel_case_types)]
        unsafe impl ::core::clone::TrivialClone for psize { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::clone::Clone for psize {
            #[inline]
            fn clone(&self) -> psize {
                let _: ::core::clone::AssertParamIsClone<super::__psize_u>;
                *self
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Eq for psize {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_fields_are_eq(&self) {
                let _: ::core::cmp::AssertParamIsEq<super::__psize_u>;
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::marker::StructuralPartialEq for psize { }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialEq for psize {
            #[inline]
            fn eq(&self, other: &psize) -> bool { self.0 == other.0 }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::Ord for psize {
            #[inline]
            fn cmp(&self, other: &psize) -> ::core::cmp::Ordering {
                ::core::cmp::Ord::cmp(&self.0, &other.0)
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::cmp::PartialOrd for psize {
            #[inline]
            fn partial_cmp(&self, other: &psize)
                -> ::core::option::Option<::core::cmp::Ordering> {
                ::core::option::Option::Some(::core::cmp::Ord::cmp(self,
                        other))
            }
        }
        #[automatically_derived]
        #[allow(non_camel_case_types)]
        impl ::core::hash::Hash for psize {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) {
                ::core::hash::Hash::hash(&self.0, state)
            }
        }
        impl psize {
            #[inline]
            pub const fn new(x: super::__psize_u) -> psize { psize(x) }
            #[inline]
            pub const fn get(self) -> super::__psize_u { self.0 }
            #[inline]
            pub const fn naive_add(self, other: psize) -> psize {
                psize(self.0 ^ other.0)
            }
            #[inline]
            pub fn add(self, other: psize) -> psize {
                psize(self.0 ^ other.0)
            }
            #[inline]
            pub const fn naive_sub(self, other: psize) -> psize {
                psize(self.0 ^ other.0)
            }
            #[inline]
            pub fn sub(self, other: psize) -> psize {
                psize(self.0 ^ other.0)
            }
            #[inline]
            pub const fn naive_widening_mul(self, other: psize)
                -> (psize, psize) {
                let a = self.0;
                let b = other.0;
                let mut lo = 0;
                let mut hi = 0;
                let mut i = 0;
                while i < 64 {
                    let mask =
                        (((a as super::__psize_i) << (64 - 1 - i)) >> (64 - 1)) as
                            super::__psize_u;
                    lo ^= mask & (b << i);
                    hi ^= mask & (b >> (64 - 1 - i));
                    i += 1;
                }
                (psize(lo), psize(hi >> 1))
            }
            #[inline]
            pub const fn naive_overflowing_mul(self, other: psize)
                -> (psize, bool) {
                let (lo, hi) = self.naive_widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub const fn naive_checked_mul(self, other: psize)
                -> Option<psize> {
                match self.naive_overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub const fn naive_wrapping_mul(self, other: psize) -> psize {
                let a = self.0;
                let b = other.0;
                let mut x = 0;
                let mut i = 0;
                while i < 64 {
                    let mask =
                        (((a as super::__psize_i) << (64 - 1 - i)) >> (64 - 1)) as
                            super::__psize_u;
                    x ^= mask & (b << i);
                    i += 1;
                }
                psize(x)
            }
            #[inline]
            pub const fn naive_mul(self, other: psize) -> psize {
                match self.naive_checked_mul(other) {
                    Some(x) => x,
                    None => psize(self.0 / 0),
                }
            }
            #[inline]
            pub fn widening_mul(self, other: psize) -> (psize, psize) {
                self.naive_widening_mul(other)
            }
            #[inline]
            pub fn overflowing_mul(self, other: psize) -> (psize, bool) {
                let (lo, hi) = self.widening_mul(other);
                (lo, hi.0 != 0)
            }
            #[inline]
            pub fn checked_mul(self, other: psize) -> Option<psize> {
                match self.overflowing_mul(other) {
                    (_, true) => None,
                    (x, false) => Some(x),
                }
            }
            #[inline]
            pub fn wrapping_mul(self, other: psize) -> psize {
                self.naive_wrapping_mul(other)
            }
            #[inline]
            pub fn mul(self, other: psize) -> psize {
                self.checked_mul(other).expect("overflow in polynomial multiply")
            }
            #[inline]
            pub const fn naive_overflowing_pow(self, exp: u32)
                -> (psize, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = psize(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.naive_overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.naive_overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub const fn naive_checked_pow(self, exp: u32) -> Option<psize> {
                let mut a = self;
                let mut exp = exp;
                let mut x = psize(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.naive_checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.naive_checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub const fn naive_wrapping_pow(self, exp: u32) -> psize {
                let mut a = self;
                let mut exp = exp;
                let mut x = psize(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_wrapping_mul(a);
                }
            }
            #[inline]
            pub const fn naive_pow(self, exp: u32) -> psize {
                let mut a = self;
                let mut exp = exp;
                let mut x = psize(1);
                loop {
                    if exp & 1 != 0 { x = x.naive_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.naive_mul(a);
                }
            }
            #[inline]
            pub fn overflowing_pow(self, exp: u32) -> (psize, bool) {
                let mut a = self;
                let mut exp = exp;
                let mut x = psize(1);
                let mut o = false;
                loop {
                    if exp & 1 != 0 {
                        let (x_, o_) = x.overflowing_mul(a);
                        x = x_;
                        o = o || o_;
                    }
                    exp >>= 1;
                    if exp == 0 { return (x, o); }
                    let (a_, o_) = a.overflowing_mul(a);
                    a = a_;
                    o = o || o_;
                }
            }
            #[inline]
            pub fn checked_pow(self, exp: u32) -> Option<psize> {
                let mut a = self;
                let mut exp = exp;
                let mut x = psize(1);
                loop {
                    if exp & 1 != 0 {
                        x =
                            match x.checked_mul(a) {
                                Some(x) => x,
                                None => return None,
                            }
                    }
                    exp >>= 1;
                    if exp == 0 { return Some(x); }
                    a =
                        match a.checked_mul(a) {
                            Some(a) => a,
                            None => return None,
                        }
                }
            }
            #[inline]
            pub fn wrapping_pow(self, exp: u32) -> psize {
                let mut a = self;
                let mut exp = exp;
                let mut x = psize(1);
                loop {
                    if exp & 1 != 0 { x = x.wrapping_mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.wrapping_mul(a);
                }
            }
            #[inline]
            pub fn pow(self, exp: u32) -> psize {
                let mut a = self;
                let mut exp = exp;
                let mut x = psize(1);
                loop {
                    if exp & 1 != 0 { x = x.mul(a); }
                    exp >>= 1;
                    if exp == 0 { return x; }
                    a = a.mul(a);
                }
            }
            #[inline]
            pub const fn naive_checked_div(self, other: psize)
                -> Option<psize> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    let mut x = 0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        x ^= 1 << (b.leading_zeros() - a.leading_zeros());
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(psize(x))
                }
            }
            #[inline]
            pub const fn naive_div(self, other: psize) -> psize {
                match self.naive_checked_div(other) {
                    Some(x) => x,
                    None => psize(self.0 / 0),
                }
            }
            #[inline]
            pub const fn naive_checked_rem(self, other: psize)
                -> Option<psize> {
                if other.0 == 0 {
                    None
                } else {
                    let mut a = self.0;
                    let b = other.0;
                    while a.leading_zeros() <= b.leading_zeros() {
                        a ^= b << (b.leading_zeros() - a.leading_zeros());
                    }
                    Some(psize(a))
                }
            }
            #[inline]
            pub const fn naive_rem(self, other: psize) -> psize {
                match self.naive_checked_rem(other) {
                    Some(x) => x,
                    None => psize(self.0 / 0),
                }
            }
            #[inline]
            pub fn slice_from_slice(slice: &[super::__psize_u]) -> &[psize] {
                unsafe {
                    slice::from_raw_parts(slice.as_ptr() as *const psize,
                        slice.len())
                }
            }
            #[inline]
            pub fn slice_from_slice_mut(slice: &mut [super::__psize_u])
                -> &mut [psize] {
                unsafe {
                    slice::from_raw_parts_mut(slice.as_mut_ptr() as *mut psize,
                        slice.len())
                }
            }
        }
        impl From<super::__psize_u> for psize {
            #[inline]
            fn from(x: super::__psize_u) -> psize { psize(x) }
        }
        impl From<bool> for psize {
            #[inline]
            fn from(x: bool) -> psize { psize(super::__psize_u::from(x)) }
        }
        impl From<u8> for psize {
            #[inline]
            fn from(x: u8) -> psize { psize(super::__psize_u::from(x)) }
        }
        impl From<u16> for psize {
            #[inline]
            fn from(x: u16) -> psize { psize(super::__psize_u::from(x)) }
        }
        impl From<crate::p8> for psize {
            #[inline]
            fn from(x: crate::p8) -> psize {
                psize(super::__psize_u::from(x.0))
            }
        }
        impl From<crate::p16> for psize {
            #[inline]
            fn from(x: crate::p16) -> psize {
                psize(super::__psize_u::from(x.0))
            }
        }
        impl TryFrom<u32> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u32) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl TryFrom<u64> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u64) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl TryFrom<u128> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: u128) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl TryFrom<crate::p32> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p32) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::p64> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p64) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x.0)?))
            }
        }
        impl TryFrom<crate::p128> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: crate::p128) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x.0)?))
            }
        }
        impl FromLossy<u32> for psize {
            #[inline]
            fn from_lossy(x: u32) -> psize { psize(x as super::__psize_u) }
        }
        impl FromLossy<u64> for psize {
            #[inline]
            fn from_lossy(x: u64) -> psize { psize(x as super::__psize_u) }
        }
        impl FromLossy<u128> for psize {
            #[inline]
            fn from_lossy(x: u128) -> psize { psize(x as super::__psize_u) }
        }
        impl FromLossy<crate::p32> for psize {
            #[inline]
            fn from_lossy(x: crate::p32) -> psize {
                psize(x.0 as super::__psize_u)
            }
        }
        impl FromLossy<crate::p64> for psize {
            #[inline]
            fn from_lossy(x: crate::p64) -> psize {
                psize(x.0 as super::__psize_u)
            }
        }
        impl FromLossy<crate::p128> for psize {
            #[inline]
            fn from_lossy(x: crate::p128) -> psize {
                psize(x.0 as super::__psize_u)
            }
        }
        impl TryFrom<i8> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i8) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl TryFrom<i16> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i16) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl TryFrom<i32> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i32) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl TryFrom<i64> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i64) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl TryFrom<i128> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: i128) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl TryFrom<isize> for psize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: isize) -> Result<psize, Self::Error> {
                Ok(psize(super::__psize_u::try_from(x)?))
            }
        }
        impl FromLossy<i8> for psize {
            #[inline]
            fn from_lossy(x: i8) -> psize { psize(x as super::__psize_u) }
        }
        impl FromLossy<i16> for psize {
            #[inline]
            fn from_lossy(x: i16) -> psize { psize(x as super::__psize_u) }
        }
        impl FromLossy<i32> for psize {
            #[inline]
            fn from_lossy(x: i32) -> psize { psize(x as super::__psize_u) }
        }
        impl FromLossy<i64> for psize {
            #[inline]
            fn from_lossy(x: i64) -> psize { psize(x as super::__psize_u) }
        }
        impl FromLossy<i128> for psize {
            #[inline]
            fn from_lossy(x: i128) -> psize { psize(x as super::__psize_u) }
        }
        impl FromLossy<isize> for psize {
            #[inline]
            fn from_lossy(x: isize) -> psize { psize(x as super::__psize_u) }
        }
        impl From<psize> for super::__psize_u {
            #[inline]
            fn from(x: psize) -> super::__psize_u { x.0 }
        }
        impl TryFrom<psize> for u8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<u8, Self::Error> {
                u8::try_from(x.0)
            }
        }
        impl TryFrom<psize> for u16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<u16, Self::Error> {
                u16::try_from(x.0)
            }
        }
        impl TryFrom<psize> for u32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<u32, Self::Error> {
                u32::try_from(x.0)
            }
        }
        impl TryFrom<psize> for u64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<u64, Self::Error> {
                u64::try_from(x.0)
            }
        }
        impl FromLossy<psize> for u8 {
            #[inline]
            fn from_lossy(x: psize) -> u8 { x.0 as u8 }
        }
        impl FromLossy<psize> for u16 {
            #[inline]
            fn from_lossy(x: psize) -> u16 { x.0 as u16 }
        }
        impl FromLossy<psize> for u32 {
            #[inline]
            fn from_lossy(x: psize) -> u32 { x.0 as u32 }
        }
        impl FromLossy<psize> for u64 {
            #[inline]
            fn from_lossy(x: psize) -> u64 { x.0 as u64 }
        }
        impl TryFrom<psize> for i8 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<i8, Self::Error> {
                i8::try_from(x.0)
            }
        }
        impl TryFrom<psize> for i16 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<i16, Self::Error> {
                i16::try_from(x.0)
            }
        }
        impl TryFrom<psize> for i32 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<i32, Self::Error> {
                i32::try_from(x.0)
            }
        }
        impl TryFrom<psize> for i64 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<i64, Self::Error> {
                i64::try_from(x.0)
            }
        }
        impl TryFrom<psize> for i128 {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<i128, Self::Error> {
                i128::try_from(x.0)
            }
        }
        impl TryFrom<psize> for isize {
            type Error = TryFromIntError;
            #[inline]
            fn try_from(x: psize) -> Result<isize, Self::Error> {
                isize::try_from(x.0)
            }
        }
        impl FromLossy<psize> for i8 {
            #[inline]
            fn from_lossy(x: psize) -> i8 { x.0 as i8 }
        }
        impl FromLossy<psize> for i16 {
            #[inline]
            fn from_lossy(x: psize) -> i16 { x.0 as i16 }
        }
        impl FromLossy<psize> for i32 {
            #[inline]
            fn from_lossy(x: psize) -> i32 { x.0 as i32 }
        }
        impl FromLossy<psize> for i64 {
            #[inline]
            fn from_lossy(x: psize) -> i64 { x.0 as i64 }
        }
        impl FromLossy<psize> for i128 {
            #[inline]
            fn from_lossy(x: psize) -> i128 { x.0 as i128 }
        }
        impl FromLossy<psize> for isize {
            #[inline]
            fn from_lossy(x: psize) -> isize { x.0 as isize }
        }
        impl Neg for psize {
            type Output = psize;
            #[inline]
            fn neg(self) -> psize { self }
        }
        impl Neg for &psize {
            type Output = psize;
            #[inline]
            fn neg(self) -> psize { *self }
        }
        impl Add<psize> for psize {
            type Output = psize;
            #[inline]
            fn add(self, other: psize) -> psize { psize::add(self, other) }
        }
        impl Add<psize> for &psize {
            type Output = psize;
            #[inline]
            fn add(self, other: psize) -> psize { psize::add(*self, other) }
        }
        impl Add<&psize> for psize {
            type Output = psize;
            #[inline]
            fn add(self, other: &psize) -> psize { psize::add(self, *other) }
        }
        impl Add<&psize> for &psize {
            type Output = psize;
            #[inline]
            fn add(self, other: &psize) -> psize { psize::add(*self, *other) }
        }
        impl AddAssign<psize> for psize {
            #[inline]
            fn add_assign(&mut self, other: psize) { *self = self.add(other) }
        }
        impl AddAssign<&psize> for psize {
            #[inline]
            fn add_assign(&mut self, other: &psize) {
                *self = self.add(*other)
            }
        }
        impl Sum<psize> for psize {
            #[inline]
            fn sum<I>(iter: I) -> psize where I: Iterator<Item = psize> {
                iter.fold(psize(0), |a, x| a + x)
            }
        }
        impl<'a> Sum<&'a psize> for psize {
            #[inline]
            fn sum<I>(iter: I) -> psize where I: Iterator<Item = &'a psize> {
                iter.fold(psize(0), |a, x| a + *x)
            }
        }
        impl Sub for psize {
            type Output = psize;
            #[inline]
            fn sub(self, other: psize) -> psize { psize::sub(self, other) }
        }
        impl Sub<psize> for &psize {
            type Output = psize;
            #[inline]
            fn sub(self, other: psize) -> psize { psize::sub(*self, other) }
        }
        impl Sub<&psize> for psize {
            type Output = psize;
            #[inline]
            fn sub(self, other: &psize) -> psize { psize::sub(self, *other) }
        }
        impl Sub<&psize> for &psize {
            type Output = psize;
            #[inline]
            fn sub(self, other: &psize) -> psize { psize::sub(*self, *other) }
        }
        impl SubAssign<psize> for psize {
            #[inline]
            fn sub_assign(&mut self, other: psize) { *self = self.sub(other) }
        }
        impl SubAssign<&psize> for psize {
            #[inline]
            fn sub_assign(&mut self, other: &psize) {
                *self = self.sub(*other)
            }
        }
        impl Mul for psize {
            type Output = psize;
            #[inline]
            fn mul(self, other: psize) -> psize { psize::mul(self, other) }
        }
        impl Mul<psize> for &psize {
            type Output = psize;
            #[inline]
            fn mul(self, other: psize) -> psize { psize::mul(*self, other) }
        }
        impl Mul<&psize> for psize {
            type Output = psize;
            #[inline]
            fn mul(self, other: &psize) -> psize { psize::mul(self, *other) }
        }
        impl Mul<&psize> for &psize {
            type Output = psize;
            #[inline]
            fn mul(self, other: &psize) -> psize { psize::mul(*self, *other) }
        }
        impl MulAssign<psize> for psize {
            #[inline]
            fn mul_assign(&mut self, other: psize) { *self = self.mul(other) }
        }
        impl MulAssign<&psize> for psize {
            #[inline]
            fn mul_assign(&mut self, other: &psize) {
                *self = self.mul(*other)
            }
        }
        impl Product<psize> for psize {
            #[inline]
            fn product<I>(iter: I) -> psize where I: Iterator<Item = psize> {
                iter.fold(psize(0), |a, x| a * x)
            }
        }
        impl<'a> Product<&'a psize> for psize {
            #[inline]
            fn product<I>(iter: I) -> psize where
                I: Iterator<Item = &'a psize> {
                iter.fold(psize(0), |a, x| a * *x)
            }
        }
        impl Div for psize {
            type Output = psize;
            #[inline]
            fn div(self, other: psize) -> psize {
                psize::naive_div(self, other)
            }
        }
        impl Div<psize> for &psize {
            type Output = psize;
            #[inline]
            fn div(self, other: psize) -> psize {
                psize::naive_div(*self, other)
            }
        }
        impl Div<&psize> for psize {
            type Output = psize;
            #[inline]
            fn div(self, other: &psize) -> psize {
                psize::naive_div(self, *other)
            }
        }
        impl Div<&psize> for &psize {
            type Output = psize;
            #[inline]
            fn div(self, other: &psize) -> psize {
                psize::naive_div(*self, *other)
            }
        }
        impl DivAssign<psize> for psize {
            #[inline]
            fn div_assign(&mut self, other: psize) { *self = self.div(other) }
        }
        impl DivAssign<&psize> for psize {
            #[inline]
            fn div_assign(&mut self, other: &psize) {
                *self = self.div(*other)
            }
        }
        impl Rem for psize {
            type Output = psize;
            #[inline]
            fn rem(self, other: psize) -> psize {
                psize::naive_rem(self, other)
            }
        }
        impl Rem<psize> for &psize {
            type Output = psize;
            #[inline]
            fn rem(self, other: psize) -> psize {
                psize::naive_rem(*self, other)
            }
        }
        impl Rem<&psize> for psize {
            type Output = psize;
            #[inline]
            fn rem(self, other: &psize) -> psize {
                psize::naive_rem(self, *other)
            }
        }
        impl Rem<&psize> for &psize {
            type Output = psize;
            #[inline]
            fn rem(self, other: &psize) -> psize {
                psize::naive_rem(*self, *other)
            }
        }
        impl RemAssign<psize> for psize {
            #[inline]
            fn rem_assign(&mut self, other: psize) { *self = self.rem(other) }
        }
        impl RemAssign<&psize> for psize {
            #[inline]
            fn rem_assign(&mut self, other: &psize) {
                *self = self.rem(*other)
            }
        }
        impl Not for psize {
            type Output = psize;
            #[inline]
            fn not(self) -> psize { psize(!self.0) }
        }
        impl Not for &psize {
            type Output = psize;
            #[inline]
            fn not(self) -> psize { psize(!self.0) }
        }
        impl BitAnd<psize> for psize {
            type Output = psize;
            #[inline]
            fn bitand(self, other: psize) -> psize { psize(self.0 & other.0) }
        }
        impl BitAnd<psize> for &psize {
            type Output = psize;
            #[inline]
            fn bitand(self, other: psize) -> psize { psize(self.0 & other.0) }
        }
        impl BitAnd<&psize> for psize {
            type Output = psize;
            #[inline]
            fn bitand(self, other: &psize) -> psize {
                psize(self.0 & other.0)
            }
        }
        impl BitAnd<&psize> for &psize {
            type Output = psize;
            #[inline]
            fn bitand(self, other: &psize) -> psize {
                psize(self.0 & other.0)
            }
        }
        impl BitAndAssign<psize> for psize {
            #[inline]
            fn bitand_assign(&mut self, other: psize) {
                *self = *self & other;
            }
        }
        impl BitAndAssign<&psize> for psize {
            #[inline]
            fn bitand_assign(&mut self, other: &psize) {
                *self = *self & *other;
            }
        }
        impl BitAnd<psize> for super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitand(self, other: psize) -> psize { psize(self & other.0) }
        }
        impl BitAnd<psize> for &super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitand(self, other: psize) -> psize { psize(self & other.0) }
        }
        impl BitAnd<&psize> for super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitand(self, other: &psize) -> psize { psize(self & other.0) }
        }
        impl BitAnd<&psize> for &super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitand(self, other: &psize) -> psize { psize(self & other.0) }
        }
        impl BitAnd<super::__psize_u> for psize {
            type Output = psize;
            #[inline]
            fn bitand(self, other: super::__psize_u) -> psize {
                psize(self.0 & other)
            }
        }
        impl BitAnd<super::__psize_u> for &psize {
            type Output = psize;
            #[inline]
            fn bitand(self, other: super::__psize_u) -> psize {
                psize(self.0 & other)
            }
        }
        impl BitAnd<&super::__psize_u> for psize {
            type Output = psize;
            #[inline]
            fn bitand(self, other: &super::__psize_u) -> psize {
                psize(self.0 & other)
            }
        }
        impl BitAnd<&super::__psize_u> for &psize {
            type Output = psize;
            #[inline]
            fn bitand(self, other: &super::__psize_u) -> psize {
                psize(self.0 & other)
            }
        }
        impl BitAndAssign<super::__psize_u> for psize {
            #[inline]
            fn bitand_assign(&mut self, other: super::__psize_u) {
                *self = *self & other;
            }
        }
        impl BitAndAssign<&super::__psize_u> for psize {
            #[inline]
            fn bitand_assign(&mut self, other: &super::__psize_u) {
                *self = *self & *other;
            }
        }
        impl BitOr<psize> for psize {
            type Output = psize;
            #[inline]
            fn bitor(self, other: psize) -> psize { psize(self.0 | other.0) }
        }
        impl BitOr<psize> for &psize {
            type Output = psize;
            #[inline]
            fn bitor(self, other: psize) -> psize { psize(self.0 | other.0) }
        }
        impl BitOr<&psize> for psize {
            type Output = psize;
            #[inline]
            fn bitor(self, other: &psize) -> psize { psize(self.0 | other.0) }
        }
        impl BitOr<&psize> for &psize {
            type Output = psize;
            #[inline]
            fn bitor(self, other: &psize) -> psize { psize(self.0 | other.0) }
        }
        impl BitOrAssign<psize> for psize {
            #[inline]
            fn bitor_assign(&mut self, other: psize) {
                *self = *self | other;
            }
        }
        impl BitOrAssign<&psize> for psize {
            #[inline]
            fn bitor_assign(&mut self, other: &psize) {
                *self = *self | *other;
            }
        }
        impl BitOr<psize> for super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitor(self, other: psize) -> psize { psize(self | other.0) }
        }
        impl BitOr<psize> for &super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitor(self, other: psize) -> psize { psize(self | other.0) }
        }
        impl BitOr<&psize> for super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitor(self, other: &psize) -> psize { psize(self | other.0) }
        }
        impl BitOr<&psize> for &super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitor(self, other: &psize) -> psize { psize(self | other.0) }
        }
        impl BitOr<super::__psize_u> for psize {
            type Output = psize;
            #[inline]
            fn bitor(self, other: super::__psize_u) -> psize {
                psize(self.0 | other)
            }
        }
        impl BitOr<super::__psize_u> for &psize {
            type Output = psize;
            #[inline]
            fn bitor(self, other: super::__psize_u) -> psize {
                psize(self.0 | other)
            }
        }
        impl BitOr<&super::__psize_u> for psize {
            type Output = psize;
            #[inline]
            fn bitor(self, other: &super::__psize_u) -> psize {
                psize(self.0 | other)
            }
        }
        impl BitOr<&super::__psize_u> for &psize {
            type Output = psize;
            #[inline]
            fn bitor(self, other: &super::__psize_u) -> psize {
                psize(self.0 | other)
            }
        }
        impl BitOrAssign<super::__psize_u> for psize {
            #[inline]
            fn bitor_assign(&mut self, other: super::__psize_u) {
                *self = *self | other;
            }
        }
        impl BitOrAssign<&super::__psize_u> for psize {
            #[inline]
            fn bitor_assign(&mut self, other: &super::__psize_u) {
                *self = *self | *other;
            }
        }
        impl BitXor<psize> for psize {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: psize) -> psize { psize(self.0 ^ other.0) }
        }
        impl BitXor<psize> for &psize {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: psize) -> psize { psize(self.0 ^ other.0) }
        }
        impl BitXor<&psize> for psize {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: &psize) -> psize {
                psize(self.0 ^ other.0)
            }
        }
        impl BitXor<&psize> for &psize {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: &psize) -> psize {
                psize(self.0 ^ other.0)
            }
        }
        impl BitXorAssign<psize> for psize {
            #[inline]
            fn bitxor_assign(&mut self, other: psize) {
                *self = *self ^ other;
            }
        }
        impl BitXorAssign<&psize> for psize {
            #[inline]
            fn bitxor_assign(&mut self, other: &psize) {
                *self = *self ^ *other;
            }
        }
        impl BitXor<psize> for super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: psize) -> psize { psize(self ^ other.0) }
        }
        impl BitXor<psize> for &super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: psize) -> psize { psize(self ^ other.0) }
        }
        impl BitXor<&psize> for super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: &psize) -> psize { psize(self ^ other.0) }
        }
        impl BitXor<&psize> for &super::__psize_u {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: &psize) -> psize { psize(self ^ other.0) }
        }
        impl BitXor<super::__psize_u> for psize {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: super::__psize_u) -> psize {
                psize(self.0 ^ other)
            }
        }
        impl BitXor<super::__psize_u> for &psize {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: super::__psize_u) -> psize {
                psize(self.0 ^ other)
            }
        }
        impl BitXor<&super::__psize_u> for psize {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: &super::__psize_u) -> psize {
                psize(self.0 ^ other)
            }
        }
        impl BitXor<&super::__psize_u> for &psize {
            type Output = psize;
            #[inline]
            fn bitxor(self, other: &super::__psize_u) -> psize {
                psize(self.0 ^ other)
            }
        }
        impl BitXorAssign<super::__psize_u> for psize {
            #[inline]
            fn bitxor_assign(&mut self, other: super::__psize_u) {
                *self = *self ^ other;
            }
        }
        impl BitXorAssign<&super::__psize_u> for psize {
            #[inline]
            fn bitxor_assign(&mut self, other: &super::__psize_u) {
                *self = *self ^ *other;
            }
        }
        impl psize {
            #[inline]
            pub const fn swap_bytes(self) -> psize {
                psize(self.0.swap_bytes())
            }
            #[inline]
            pub const fn to_le(self) -> psize { psize(self.0.to_le()) }
            #[inline]
            pub const fn from_le(self_: psize) -> psize {
                psize(super::__psize_u::from_le(self_.0))
            }
            #[inline]
            pub const fn to_le_bytes(self) -> [u8; 64 / 8] {
                self.0.to_le_bytes()
            }
            #[inline]
            pub const fn from_le_bytes(bytes: [u8; 64 / 8]) -> psize {
                psize(super::__psize_u::from_le_bytes(bytes))
            }
            #[inline]
            pub const fn to_be(self) -> psize { psize(self.0.to_be()) }
            #[inline]
            pub const fn from_be(self_: psize) -> psize {
                psize(super::__psize_u::from_be(self_.0))
            }
            #[inline]
            pub const fn to_be_bytes(self) -> [u8; 64 / 8] {
                self.0.to_be_bytes()
            }
            #[inline]
            pub const fn from_be_bytes(bytes: [u8; 64 / 8]) -> psize {
                psize(super::__psize_u::from_be_bytes(bytes))
            }
            #[inline]
            pub const fn to_ne_bytes(self) -> [u8; 64 / 8] {
                self.0.to_ne_bytes()
            }
            #[inline]
            pub const fn from_ne_bytes(bytes: [u8; 64 / 8]) -> psize {
                psize(super::__psize_u::from_ne_bytes(bytes))
            }
        }
        impl psize {
            #[inline]
            pub const fn reverse_bits(self) -> psize {
                psize(self.0.reverse_bits())
            }
            #[inline]
            pub const fn count_ones(self) -> u32 { self.0.count_ones() }
            #[inline]
            pub const fn count_zeros(self) -> u32 { self.0.count_zeros() }
            #[inline]
            pub const fn leading_ones(self) -> u32 { self.0.leading_ones() }
            #[inline]
            pub const fn leading_zeros(self) -> u32 { self.0.leading_zeros() }
            #[inline]
            pub const fn trailing_ones(self) -> u32 { self.0.trailing_ones() }
            #[inline]
            pub const fn trailing_zeros(self) -> u32 {
                self.0.trailing_zeros()
            }
        }
        impl psize {
            #[inline]
            pub const fn checked_shl(self, other: u32) -> Option<psize> {
                match self.0.checked_shl(other) {
                    Some(x) => Some(psize(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn checked_shr(self, other: u32) -> Option<psize> {
                match self.0.checked_shr(other) {
                    Some(x) => Some(psize(x)),
                    None => None,
                }
            }
            #[inline]
            pub const fn overflowing_shl(self, other: u32) -> (psize, bool) {
                let (x, o) = self.0.overflowing_shl(other);
                (psize(x), o)
            }
            #[inline]
            pub const fn overflowing_shr(self, other: u32) -> (psize, bool) {
                let (x, o) = self.0.overflowing_shr(other);
                (psize(x), o)
            }
            #[inline]
            pub const fn wrapping_shl(self, other: u32) -> psize {
                psize(self.0.wrapping_shl(other))
            }
            #[inline]
            pub const fn wrapping_shr(self, other: u32) -> psize {
                psize(self.0.wrapping_shr(other))
            }
            #[inline]
            pub const fn rotate_left(self, other: u32) -> psize {
                psize(self.0.rotate_left(other))
            }
            #[inline]
            pub const fn rotate_right(self, other: u32) -> psize {
                psize(self.0.rotate_right(other))
            }
        }
        impl Shl<u8> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u8) -> psize { psize(self.0 << other) }
        }
        impl Shl<u8> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u8) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u8> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u8) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u8> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u8) -> psize { psize(self.0 << other) }
        }
        impl Shl<u16> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u16) -> psize { psize(self.0 << other) }
        }
        impl Shl<u16> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u16) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u16> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u16) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u16> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u16) -> psize { psize(self.0 << other) }
        }
        impl Shl<u32> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u32) -> psize { psize(self.0 << other) }
        }
        impl Shl<u32> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u32) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u32> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u32) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u32> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u32) -> psize { psize(self.0 << other) }
        }
        impl Shl<u64> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u64) -> psize { psize(self.0 << other) }
        }
        impl Shl<u64> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u64) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u64> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u64) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u64> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u64) -> psize { psize(self.0 << other) }
        }
        impl Shl<u128> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u128) -> psize { psize(self.0 << other) }
        }
        impl Shl<u128> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: u128) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u128> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u128) -> psize { psize(self.0 << other) }
        }
        impl Shl<&u128> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &u128) -> psize { psize(self.0 << other) }
        }
        impl Shl<usize> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: usize) -> psize { psize(self.0 << other) }
        }
        impl Shl<usize> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: usize) -> psize { psize(self.0 << other) }
        }
        impl Shl<&usize> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &usize) -> psize { psize(self.0 << other) }
        }
        impl Shl<&usize> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &usize) -> psize { psize(self.0 << other) }
        }
        impl ShlAssign<u8> for psize {
            #[inline]
            fn shl_assign(&mut self, other: u8) { *self = *self << other; }
        }
        impl ShlAssign<&u8> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &u8) { *self = *self << other; }
        }
        impl ShlAssign<u16> for psize {
            #[inline]
            fn shl_assign(&mut self, other: u16) { *self = *self << other; }
        }
        impl ShlAssign<&u16> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &u16) { *self = *self << other; }
        }
        impl ShlAssign<u32> for psize {
            #[inline]
            fn shl_assign(&mut self, other: u32) { *self = *self << other; }
        }
        impl ShlAssign<&u32> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &u32) { *self = *self << other; }
        }
        impl ShlAssign<u64> for psize {
            #[inline]
            fn shl_assign(&mut self, other: u64) { *self = *self << other; }
        }
        impl ShlAssign<&u64> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &u64) { *self = *self << other; }
        }
        impl ShlAssign<u128> for psize {
            #[inline]
            fn shl_assign(&mut self, other: u128) { *self = *self << other; }
        }
        impl ShlAssign<&u128> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &u128) { *self = *self << other; }
        }
        impl ShlAssign<usize> for psize {
            #[inline]
            fn shl_assign(&mut self, other: usize) { *self = *self << other; }
        }
        impl ShlAssign<&usize> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &usize) {
                *self = *self << other;
            }
        }
        impl Shr<u8> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u8) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u8> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u8) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u8> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u8) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u8> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u8) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u16> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u16) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u16> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u16) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u16> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u16) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u16> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u16) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u32> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u32) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u32> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u32) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u32> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u32) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u32> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u32) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u64> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u64) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u64> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u64) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u64> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u64) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u64> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u64) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u128> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u128) -> psize { psize(self.0 >> other) }
        }
        impl Shr<u128> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: u128) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u128> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u128) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&u128> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &u128) -> psize { psize(self.0 >> other) }
        }
        impl Shr<usize> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: usize) -> psize { psize(self.0 >> other) }
        }
        impl Shr<usize> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: usize) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&usize> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &usize) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&usize> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &usize) -> psize { psize(self.0 >> other) }
        }
        impl ShrAssign<u8> for psize {
            #[inline]
            fn shr_assign(&mut self, other: u8) { *self = *self >> other; }
        }
        impl ShrAssign<&u8> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &u8) { *self = *self >> other; }
        }
        impl ShrAssign<u16> for psize {
            #[inline]
            fn shr_assign(&mut self, other: u16) { *self = *self >> other; }
        }
        impl ShrAssign<&u16> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &u16) { *self = *self >> other; }
        }
        impl ShrAssign<u32> for psize {
            #[inline]
            fn shr_assign(&mut self, other: u32) { *self = *self >> other; }
        }
        impl ShrAssign<&u32> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &u32) { *self = *self >> other; }
        }
        impl ShrAssign<u64> for psize {
            #[inline]
            fn shr_assign(&mut self, other: u64) { *self = *self >> other; }
        }
        impl ShrAssign<&u64> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &u64) { *self = *self >> other; }
        }
        impl ShrAssign<u128> for psize {
            #[inline]
            fn shr_assign(&mut self, other: u128) { *self = *self >> other; }
        }
        impl ShrAssign<&u128> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &u128) { *self = *self >> other; }
        }
        impl ShrAssign<usize> for psize {
            #[inline]
            fn shr_assign(&mut self, other: usize) { *self = *self >> other; }
        }
        impl ShrAssign<&usize> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &usize) {
                *self = *self >> other;
            }
        }
        impl Shl<i8> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i8) -> psize { psize(self.0 << other) }
        }
        impl Shl<i8> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i8) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i8> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i8) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i8> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i8) -> psize { psize(self.0 << other) }
        }
        impl Shl<i16> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i16) -> psize { psize(self.0 << other) }
        }
        impl Shl<i16> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i16) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i16> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i16) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i16> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i16) -> psize { psize(self.0 << other) }
        }
        impl Shl<i32> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i32) -> psize { psize(self.0 << other) }
        }
        impl Shl<i32> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i32) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i32> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i32) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i32> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i32) -> psize { psize(self.0 << other) }
        }
        impl Shl<i64> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i64) -> psize { psize(self.0 << other) }
        }
        impl Shl<i64> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i64) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i64> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i64) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i64> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i64) -> psize { psize(self.0 << other) }
        }
        impl Shl<i128> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i128) -> psize { psize(self.0 << other) }
        }
        impl Shl<i128> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: i128) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i128> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i128) -> psize { psize(self.0 << other) }
        }
        impl Shl<&i128> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &i128) -> psize { psize(self.0 << other) }
        }
        impl Shl<isize> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: isize) -> psize { psize(self.0 << other) }
        }
        impl Shl<isize> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: isize) -> psize { psize(self.0 << other) }
        }
        impl Shl<&isize> for psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &isize) -> psize { psize(self.0 << other) }
        }
        impl Shl<&isize> for &psize {
            type Output = psize;
            #[inline]
            fn shl(self, other: &isize) -> psize { psize(self.0 << other) }
        }
        impl ShlAssign<i8> for psize {
            #[inline]
            fn shl_assign(&mut self, other: i8) { *self = *self << other; }
        }
        impl ShlAssign<&i8> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &i8) { *self = *self << other; }
        }
        impl ShlAssign<i16> for psize {
            #[inline]
            fn shl_assign(&mut self, other: i16) { *self = *self << other; }
        }
        impl ShlAssign<&i16> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &i16) { *self = *self << other; }
        }
        impl ShlAssign<i32> for psize {
            #[inline]
            fn shl_assign(&mut self, other: i32) { *self = *self << other; }
        }
        impl ShlAssign<&i32> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &i32) { *self = *self << other; }
        }
        impl ShlAssign<i64> for psize {
            #[inline]
            fn shl_assign(&mut self, other: i64) { *self = *self << other; }
        }
        impl ShlAssign<&i64> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &i64) { *self = *self << other; }
        }
        impl ShlAssign<i128> for psize {
            #[inline]
            fn shl_assign(&mut self, other: i128) { *self = *self << other; }
        }
        impl ShlAssign<&i128> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &i128) { *self = *self << other; }
        }
        impl ShlAssign<isize> for psize {
            #[inline]
            fn shl_assign(&mut self, other: isize) { *self = *self << other; }
        }
        impl ShlAssign<&isize> for psize {
            #[inline]
            fn shl_assign(&mut self, other: &isize) {
                *self = *self << other;
            }
        }
        impl Shr<i8> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i8) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i8> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i8) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i8> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i8) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i8> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i8) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i16> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i16) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i16> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i16) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i16> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i16) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i16> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i16) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i32> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i32) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i32> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i32) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i32> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i32) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i32> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i32) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i64> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i64) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i64> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i64) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i64> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i64) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i64> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i64) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i128> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i128) -> psize { psize(self.0 >> other) }
        }
        impl Shr<i128> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: i128) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i128> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i128) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&i128> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &i128) -> psize { psize(self.0 >> other) }
        }
        impl Shr<isize> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: isize) -> psize { psize(self.0 >> other) }
        }
        impl Shr<isize> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: isize) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&isize> for psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &isize) -> psize { psize(self.0 >> other) }
        }
        impl Shr<&isize> for &psize {
            type Output = psize;
            #[inline]
            fn shr(self, other: &isize) -> psize { psize(self.0 >> other) }
        }
        impl ShrAssign<i8> for psize {
            #[inline]
            fn shr_assign(&mut self, other: i8) { *self = *self >> other; }
        }
        impl ShrAssign<&i8> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &i8) { *self = *self >> other; }
        }
        impl ShrAssign<i16> for psize {
            #[inline]
            fn shr_assign(&mut self, other: i16) { *self = *self >> other; }
        }
        impl ShrAssign<&i16> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &i16) { *self = *self >> other; }
        }
        impl ShrAssign<i32> for psize {
            #[inline]
            fn shr_assign(&mut self, other: i32) { *self = *self >> other; }
        }
        impl ShrAssign<&i32> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &i32) { *self = *self >> other; }
        }
        impl ShrAssign<i64> for psize {
            #[inline]
            fn shr_assign(&mut self, other: i64) { *self = *self >> other; }
        }
        impl ShrAssign<&i64> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &i64) { *self = *self >> other; }
        }
        impl ShrAssign<i128> for psize {
            #[inline]
            fn shr_assign(&mut self, other: i128) { *self = *self >> other; }
        }
        impl ShrAssign<&i128> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &i128) { *self = *self >> other; }
        }
        impl ShrAssign<isize> for psize {
            #[inline]
            fn shr_assign(&mut self, other: isize) { *self = *self >> other; }
        }
        impl ShrAssign<&isize> for psize {
            #[inline]
            fn shr_assign(&mut self, other: &isize) {
                *self = *self >> other;
            }
        }
        impl fmt::Debug for psize {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("{0}(0x{1:x})", "psize", self.0))
            }
        }
        impl fmt::Display for psize {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                f.write_fmt(format_args!("0x{0:x}", self.0))
            }
        }
        impl fmt::Binary for psize {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__psize_u as fmt::Binary>::fmt(&self.0, f)
            }
        }
        impl fmt::Octal for psize {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__psize_u as fmt::Octal>::fmt(&self.0, f)
            }
        }
        impl fmt::LowerHex for psize {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__psize_u as fmt::LowerHex>::fmt(&self.0, f)
            }
        }
        impl fmt::UpperHex for psize {
            fn fmt(&self, f: &mut fmt::Formatter<'_>)
                -> Result<(), fmt::Error> {
                <super::__psize_u as fmt::UpperHex>::fmt(&self.0, f)
            }
        }
        impl FromStr for psize {
            type Err = ParseIntError;
            fn from_str(s: &str) -> Result<psize, ParseIntError> {
                if s.starts_with("0x") {
                    Ok(psize(super::__psize_u::from_str_radix(&s[2..], 16)?))
                } else {
                    "".parse::<super::__psize_u>()?;
                    ::core::panicking::panic("internal error: entered unreachable code")
                }
            }
        }
        impl psize {
            pub fn from_str_radix(s: &str, radix: u32)
                -> Result<psize, ParseIntError> {
                Ok(psize(super::__psize_u::from_str_radix(s, radix)?))
            }
        }
    }
    use usize as __psize_u;
    use i64 as __psize_i;
}
pub use p::*;
#[path = "."]
pub mod internal {
    pub mod xmul {
        pub const HAS_XMUL: bool = { false };
    }
}
pub use internal::xmul::HAS_XMUL;

pub use __gf256_aes_gen::gf256_aes;
mod __gf256_aes_gen {
    use core::ops::*;
    use core::iter::*;
    use core::fmt;
    use core::str::FromStr;
    use core::num::TryFromIntError;
    use core::num::ParseIntError;
    use core::mem::size_of;
    use core::slice;
    use ::gf256::traits::TryFrom;
    use ::gf256::traits::FromLossy;
    #[allow(non_camel_case_types)]
    #[repr(transparent)]
    pub struct gf256_aes(pub super::__gf256_aes_u);
    #[automatically_derived]
    #[allow(non_camel_case_types)]
    impl ::core::default::Default for gf256_aes {
        #[inline]
        fn default() -> gf256_aes {
            gf256_aes(::core::default::Default::default())
        }
    }
    #[automatically_derived]
    #[allow(non_camel_case_types)]
    impl ::core::marker::Copy for gf256_aes { }
    #[automatically_derived]
    #[doc(hidden)]
    #[allow(non_camel_case_types)]
    unsafe impl ::core::clone::TrivialClone for gf256_aes { }
    #[automatically_derived]
    #[allow(non_camel_case_types)]
    impl ::core::clone::Clone for gf256_aes {
        #[inline]
        fn clone(&self) -> gf256_aes {
            let _: ::core::clone::AssertParamIsClone<super::__gf256_aes_u>;
            *self
        }
    }
    #[automatically_derived]
    #[allow(non_camel_case_types)]
    impl ::core::cmp::Eq for gf256_aes {
        #[inline]
        #[doc(hidden)]
        #[coverage(off)]
        fn assert_fields_are_eq(&self) {
            let _: ::core::cmp::AssertParamIsEq<super::__gf256_aes_u>;
        }
    }
    #[automatically_derived]
    #[allow(non_camel_case_types)]
    impl ::core::marker::StructuralPartialEq for gf256_aes { }
    #[automatically_derived]
    #[allow(non_camel_case_types)]
    impl ::core::cmp::PartialEq for gf256_aes {
        #[inline]
        fn eq(&self, other: &gf256_aes) -> bool { self.0 == other.0 }
    }
    #[automatically_derived]
    #[allow(non_camel_case_types)]
    impl ::core::hash::Hash for gf256_aes {
        #[inline]
        fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) {
            ::core::hash::Hash::hash(&self.0, state)
        }
    }
    impl gf256_aes {
        pub const POLYNOMIAL: super::__gf256_aes_p2 =
            super::__gf256_aes_p2(283);
        pub const GENERATOR: gf256_aes = gf256_aes(3);
        pub const NONZEROS: super::__gf256_aes_u = 255;
        const BARRET_CONSTANT: super::__gf256_aes_p =
            {
                super::__gf256_aes_p(super::__gf256_aes_p2((283 & 255) <<
                                        ((8 * size_of::<super::__gf256_aes_u>() - 8) +
                                                8 *
                                                    size_of::<super::__gf256_aes_u>())).naive_div(super::__gf256_aes_p2(283
                                        << (8 * size_of::<super::__gf256_aes_u>() - 8))).0 as
                        super::__gf256_aes_u)
            };
        #[inline]
        pub const fn new(x: super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(x)
        }
        #[inline]
        pub const unsafe fn new_unchecked(x: super::__gf256_aes_u)
            -> gf256_aes {
            gf256_aes(x)
        }
        #[inline]
        pub const fn get(self) -> super::__gf256_aes_u { self.0 }
        #[inline]
        pub const fn naive_add(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 ^ other.0)
        }
        #[inline]
        pub fn add(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 ^ other.0)
        }
        #[inline]
        pub const fn naive_sub(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 ^ other.0)
        }
        #[inline]
        pub fn sub(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 ^ other.0)
        }
        #[inline]
        pub const fn naive_mul(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(super::__gf256_aes_p2(self.0 as
                                        _).naive_mul(super::__gf256_aes_p2(other.0 as
                                        _)).naive_rem(super::__gf256_aes_p2(283)).0 as
                    super::__gf256_aes_u)
        }
        #[inline]
        pub const fn naive_pow(self, exp: super::__gf256_aes_u) -> gf256_aes {
            let mut a = self;
            let mut exp = exp;
            let mut x = gf256_aes(1);
            loop {
                if exp & 1 != 0 { x = x.naive_mul(a); }
                exp >>= 1;
                if exp == 0 { return x; }
                a = a.naive_mul(a);
            }
        }
        #[inline]
        pub const fn naive_checked_recip(self) -> Option<gf256_aes> {
            if self.0 == 0 { return None; }
            Some(self.naive_pow(255 - 1))
        }
        #[inline]
        pub const fn naive_recip(self) -> gf256_aes {
            match self.naive_checked_recip() {
                Some(x) => x,
                None => gf256_aes(1 / 0),
            }
        }
        #[inline]
        pub const fn naive_checked_div(self, other: gf256_aes)
            -> Option<gf256_aes> {
            match other.naive_checked_recip() {
                Some(other_recip) => Some(self.naive_mul(other_recip)),
                None => None,
            }
        }
        #[inline]
        pub const fn naive_div(self, other: gf256_aes) -> gf256_aes {
            match self.naive_checked_div(other) {
                Some(x) => x,
                None => gf256_aes(self.0 / 0),
            }
        }
        #[inline]
        pub fn mul(self, other: gf256_aes) -> gf256_aes {
            let (lo, hi) =
                super::__gf256_aes_p(self.0 <<
                            (8 * size_of::<super::__gf256_aes_u>() -
                                    8)).widening_mul(super::__gf256_aes_p(other.0));
            let x =
                lo +
                    (hi.widening_mul(Self::BARRET_CONSTANT).1 +
                                hi).wrapping_mul(super::__gf256_aes_p((283 & 255) <<
                                (8 * size_of::<super::__gf256_aes_u>() - 8)));
            gf256_aes(x.0 >> (8 * size_of::<super::__gf256_aes_u>() - 8))
        }
        #[inline]
        pub fn pow(self, exp: super::__gf256_aes_u) -> gf256_aes {
            let mut a = self;
            let mut exp = exp;
            let mut x = gf256_aes(1);
            loop {
                if exp & 1 != 0 { x = x.mul(a); }
                exp >>= 1;
                if exp == 0 { return x; }
                a = a.mul(a);
            }
        }
        #[inline]
        pub fn checked_recip(self) -> Option<gf256_aes> {
            if self.0 == 0 { return None; }
            Some(self.pow(255 - 1))
        }
        #[inline]
        pub fn recip(self) -> gf256_aes {
            self.checked_recip().expect("gf division by zero")
        }
        #[inline]
        pub fn checked_div(self, other: gf256_aes) -> Option<gf256_aes> {
            if other.0 == 0 { return None; }
            Some(self * other.recip())
        }
        #[inline]
        pub fn div(self, other: gf256_aes) -> gf256_aes {
            self.checked_div(other).expect("gf division by zero")
        }
        #[inline]
        pub fn slice_from_slice(slice: &[super::__gf256_aes_u])
            -> &[gf256_aes] {
            unsafe {
                slice::from_raw_parts(slice.as_ptr() as *const gf256_aes,
                    slice.len())
            }
        }
        #[inline]
        pub fn slice_from_slice_mut(slice: &mut [super::__gf256_aes_u])
            -> &mut [gf256_aes] {
            unsafe {
                slice::from_raw_parts_mut(slice.as_mut_ptr() as
                        *mut gf256_aes, slice.len())
            }
        }
        #[inline]
        pub unsafe fn slice_from_slice_unchecked(slice:
                &[super::__gf256_aes_u]) -> &[gf256_aes] {
            unsafe {
                slice::from_raw_parts(slice.as_ptr() as *const gf256_aes,
                    slice.len())
            }
        }
        #[inline]
        pub unsafe fn slice_from_slice_mut_unchecked(slice:
                &mut [super::__gf256_aes_u]) -> &mut [gf256_aes] {
            unsafe {
                slice::from_raw_parts_mut(slice.as_mut_ptr() as
                        *mut gf256_aes, slice.len())
            }
        }
    }
    impl From<super::__gf256_aes_p> for gf256_aes {
        #[inline]
        fn from(x: super::__gf256_aes_p) -> gf256_aes { gf256_aes(x.0) }
    }
    impl From<super::__gf256_aes_u> for gf256_aes {
        #[inline]
        fn from(x: super::__gf256_aes_u) -> gf256_aes { gf256_aes(x) }
    }
    impl From<bool> for gf256_aes {
        #[inline]
        fn from(x: bool) -> gf256_aes {
            gf256_aes(super::__gf256_aes_u::from(x))
        }
    }
    impl TryFrom<u16> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: u16) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<u32> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: u32) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<u64> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: u64) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<u128> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: u128) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<usize> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: usize) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<::gf256::p::p16> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: ::gf256::p::p16) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x.0)?))
        }
    }
    impl TryFrom<::gf256::p::p32> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: ::gf256::p::p32) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x.0)?))
        }
    }
    impl TryFrom<::gf256::p::p64> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: ::gf256::p::p64) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x.0)?))
        }
    }
    impl TryFrom<::gf256::p::p128> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: ::gf256::p::p128) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x.0)?))
        }
    }
    impl TryFrom<::gf256::p::psize> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: ::gf256::p::psize) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x.0)?))
        }
    }
    impl FromLossy<u16> for gf256_aes {
        #[inline]
        fn from_lossy(x: u16) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<u32> for gf256_aes {
        #[inline]
        fn from_lossy(x: u32) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<u64> for gf256_aes {
        #[inline]
        fn from_lossy(x: u64) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<u128> for gf256_aes {
        #[inline]
        fn from_lossy(x: u128) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<usize> for gf256_aes {
        #[inline]
        fn from_lossy(x: usize) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<::gf256::p::p16> for gf256_aes {
        #[inline]
        fn from_lossy(x: ::gf256::p::p16) -> gf256_aes {
            gf256_aes(x.0 as super::__gf256_aes_u)
        }
    }
    impl FromLossy<::gf256::p::p32> for gf256_aes {
        #[inline]
        fn from_lossy(x: ::gf256::p::p32) -> gf256_aes {
            gf256_aes(x.0 as super::__gf256_aes_u)
        }
    }
    impl FromLossy<::gf256::p::p64> for gf256_aes {
        #[inline]
        fn from_lossy(x: ::gf256::p::p64) -> gf256_aes {
            gf256_aes(x.0 as super::__gf256_aes_u)
        }
    }
    impl FromLossy<::gf256::p::p128> for gf256_aes {
        #[inline]
        fn from_lossy(x: ::gf256::p::p128) -> gf256_aes {
            gf256_aes(x.0 as super::__gf256_aes_u)
        }
    }
    impl FromLossy<::gf256::p::psize> for gf256_aes {
        #[inline]
        fn from_lossy(x: ::gf256::p::psize) -> gf256_aes {
            gf256_aes(x.0 as super::__gf256_aes_u)
        }
    }
    impl TryFrom<i8> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: i8) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<i16> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: i16) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<i32> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: i32) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<i64> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: i64) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<i128> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: i128) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl TryFrom<isize> for gf256_aes {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: isize) -> Result<gf256_aes, Self::Error> {
            Ok(gf256_aes(super::__gf256_aes_u::try_from(x)?))
        }
    }
    impl FromLossy<i8> for gf256_aes {
        #[inline]
        fn from_lossy(x: i8) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<i16> for gf256_aes {
        #[inline]
        fn from_lossy(x: i16) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<i32> for gf256_aes {
        #[inline]
        fn from_lossy(x: i32) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<i64> for gf256_aes {
        #[inline]
        fn from_lossy(x: i64) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<i128> for gf256_aes {
        #[inline]
        fn from_lossy(x: i128) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl FromLossy<isize> for gf256_aes {
        #[inline]
        fn from_lossy(x: isize) -> gf256_aes {
            gf256_aes(x as super::__gf256_aes_u)
        }
    }
    impl From<gf256_aes> for super::__gf256_aes_p {
        #[inline]
        fn from(x: gf256_aes) -> super::__gf256_aes_p {
            super::__gf256_aes_p(x.0)
        }
    }
    impl From<gf256_aes> for super::__gf256_aes_u {
        #[inline]
        fn from(x: gf256_aes) -> super::__gf256_aes_u { x.0 }
    }
    impl From<gf256_aes> for u16 {
        #[inline]
        fn from(x: gf256_aes) -> u16 { u16::from(x.0) }
    }
    impl From<gf256_aes> for u32 {
        #[inline]
        fn from(x: gf256_aes) -> u32 { u32::from(x.0) }
    }
    impl From<gf256_aes> for u64 {
        #[inline]
        fn from(x: gf256_aes) -> u64 { u64::from(x.0) }
    }
    impl From<gf256_aes> for u128 {
        #[inline]
        fn from(x: gf256_aes) -> u128 { u128::from(x.0) }
    }
    impl From<gf256_aes> for usize {
        #[inline]
        fn from(x: gf256_aes) -> usize { usize::from(x.0) }
    }
    impl From<gf256_aes> for ::gf256::p::p16 {
        #[inline]
        fn from(x: gf256_aes) -> ::gf256::p::p16 {
            ::gf256::p::p16(u16::from(x.0))
        }
    }
    impl From<gf256_aes> for ::gf256::p::p32 {
        #[inline]
        fn from(x: gf256_aes) -> ::gf256::p::p32 {
            ::gf256::p::p32(u32::from(x.0))
        }
    }
    impl From<gf256_aes> for ::gf256::p::p64 {
        #[inline]
        fn from(x: gf256_aes) -> ::gf256::p::p64 {
            ::gf256::p::p64(u64::from(x.0))
        }
    }
    impl From<gf256_aes> for ::gf256::p::p128 {
        #[inline]
        fn from(x: gf256_aes) -> ::gf256::p::p128 {
            ::gf256::p::p128(u128::from(x.0))
        }
    }
    impl From<gf256_aes> for ::gf256::p::psize {
        #[inline]
        fn from(x: gf256_aes) -> ::gf256::p::psize {
            ::gf256::p::psize(usize::from(x.0))
        }
    }
    impl From<gf256_aes> for i16 {
        #[inline]
        fn from(x: gf256_aes) -> i16 { x.0 as i16 }
    }
    impl From<gf256_aes> for i32 {
        #[inline]
        fn from(x: gf256_aes) -> i32 { x.0 as i32 }
    }
    impl From<gf256_aes> for i64 {
        #[inline]
        fn from(x: gf256_aes) -> i64 { x.0 as i64 }
    }
    impl From<gf256_aes> for i128 {
        #[inline]
        fn from(x: gf256_aes) -> i128 { x.0 as i128 }
    }
    impl From<gf256_aes> for isize {
        #[inline]
        fn from(x: gf256_aes) -> isize { x.0 as isize }
    }
    impl TryFrom<gf256_aes> for i8 {
        type Error = TryFromIntError;
        #[inline]
        fn try_from(x: gf256_aes) -> Result<i8, Self::Error> {
            i8::try_from(x.0)
        }
    }
    impl FromLossy<gf256_aes> for i8 {
        #[inline]
        fn from_lossy(x: gf256_aes) -> i8 { x.0 as i8 }
    }
    impl Neg for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn neg(self) -> gf256_aes { self }
    }
    impl Neg for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn neg(self) -> gf256_aes { *self }
    }
    impl Add<gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn add(self, other: gf256_aes) -> gf256_aes {
            gf256_aes::add(self, other)
        }
    }
    impl Add<gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn add(self, other: gf256_aes) -> gf256_aes {
            gf256_aes::add(*self, other)
        }
    }
    impl Add<&gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn add(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes::add(self, *other)
        }
    }
    impl Add<&gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn add(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes::add(*self, *other)
        }
    }
    impl AddAssign<gf256_aes> for gf256_aes {
        #[inline]
        fn add_assign(&mut self, other: gf256_aes) { *self = self.add(other) }
    }
    impl AddAssign<&gf256_aes> for gf256_aes {
        #[inline]
        fn add_assign(&mut self, other: &gf256_aes) {
            *self = self.add(*other)
        }
    }
    impl Sum<gf256_aes> for gf256_aes {
        #[inline]
        fn sum<I>(iter: I) -> gf256_aes where I: Iterator<Item = gf256_aes> {
            iter.fold(gf256_aes(0), |a, x| a + x)
        }
    }
    impl<'a> Sum<&'a gf256_aes> for gf256_aes {
        #[inline]
        fn sum<I>(iter: I) -> gf256_aes where
            I: Iterator<Item = &'a gf256_aes> {
            iter.fold(gf256_aes(0), |a, x| a + *x)
        }
    }
    impl Sub for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn sub(self, other: gf256_aes) -> gf256_aes {
            gf256_aes::sub(self, other)
        }
    }
    impl Sub<gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn sub(self, other: gf256_aes) -> gf256_aes {
            gf256_aes::sub(*self, other)
        }
    }
    impl Sub<&gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn sub(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes::sub(self, *other)
        }
    }
    impl Sub<&gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn sub(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes::sub(*self, *other)
        }
    }
    impl SubAssign<gf256_aes> for gf256_aes {
        #[inline]
        fn sub_assign(&mut self, other: gf256_aes) { *self = self.sub(other) }
    }
    impl SubAssign<&gf256_aes> for gf256_aes {
        #[inline]
        fn sub_assign(&mut self, other: &gf256_aes) {
            *self = self.sub(*other)
        }
    }
    impl Mul for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn mul(self, other: gf256_aes) -> gf256_aes {
            gf256_aes::mul(self, other)
        }
    }
    impl Mul<gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn mul(self, other: gf256_aes) -> gf256_aes {
            gf256_aes::mul(*self, other)
        }
    }
    impl Mul<&gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn mul(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes::mul(self, *other)
        }
    }
    impl Mul<&gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn mul(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes::mul(*self, *other)
        }
    }
    impl MulAssign<gf256_aes> for gf256_aes {
        #[inline]
        fn mul_assign(&mut self, other: gf256_aes) { *self = self.mul(other) }
    }
    impl MulAssign<&gf256_aes> for gf256_aes {
        #[inline]
        fn mul_assign(&mut self, other: &gf256_aes) {
            *self = self.mul(*other)
        }
    }
    impl Product<gf256_aes> for gf256_aes {
        #[inline]
        fn product<I>(iter: I) -> gf256_aes where
            I: Iterator<Item = gf256_aes> {
            iter.fold(gf256_aes(0), |a, x| a * x)
        }
    }
    impl<'a> Product<&'a gf256_aes> for gf256_aes {
        #[inline]
        fn product<I>(iter: I) -> gf256_aes where
            I: Iterator<Item = &'a gf256_aes> {
            iter.fold(gf256_aes(0), |a, x| a * *x)
        }
    }
    impl Div for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn div(self, other: gf256_aes) -> gf256_aes {
            gf256_aes::div(self, other)
        }
    }
    impl Div<gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn div(self, other: gf256_aes) -> gf256_aes {
            gf256_aes::div(*self, other)
        }
    }
    impl Div<&gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn div(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes::div(self, *other)
        }
    }
    impl Div<&gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn div(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes::div(*self, *other)
        }
    }
    impl DivAssign<gf256_aes> for gf256_aes {
        #[inline]
        fn div_assign(&mut self, other: gf256_aes) { *self = self.div(other) }
    }
    impl DivAssign<&gf256_aes> for gf256_aes {
        #[inline]
        fn div_assign(&mut self, other: &gf256_aes) {
            *self = self.div(*other)
        }
    }
    impl Not for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn not(self) -> gf256_aes { gf256_aes(!self.0) }
    }
    impl Not for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn not(self) -> gf256_aes { gf256_aes(!self.0) }
    }
    impl BitAnd<gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 & other.0)
        }
    }
    impl BitAnd<gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 & other.0)
        }
    }
    impl BitAnd<&gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self.0 & other.0)
        }
    }
    impl BitAnd<&gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self.0 & other.0)
        }
    }
    impl BitAndAssign<gf256_aes> for gf256_aes {
        #[inline]
        fn bitand_assign(&mut self, other: gf256_aes) {
            *self = *self & other;
        }
    }
    impl BitAndAssign<&gf256_aes> for gf256_aes {
        #[inline]
        fn bitand_assign(&mut self, other: &gf256_aes) {
            *self = *self & *other;
        }
    }
    impl BitAnd<gf256_aes> for super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self & other.0)
        }
    }
    impl BitAnd<gf256_aes> for &super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self & other.0)
        }
    }
    impl BitAnd<&gf256_aes> for super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self & other.0)
        }
    }
    impl BitAnd<&gf256_aes> for &super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self & other.0)
        }
    }
    impl BitAnd<super::__gf256_aes_u> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 & other)
        }
    }
    impl BitAnd<super::__gf256_aes_u> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 & other)
        }
    }
    impl BitAnd<&super::__gf256_aes_u> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: &super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 & other)
        }
    }
    impl BitAnd<&super::__gf256_aes_u> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitand(self, other: &super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 & other)
        }
    }
    impl BitAndAssign<super::__gf256_aes_u> for gf256_aes {
        #[inline]
        fn bitand_assign(&mut self, other: super::__gf256_aes_u) {
            *self = *self & other;
        }
    }
    impl BitAndAssign<&super::__gf256_aes_u> for gf256_aes {
        #[inline]
        fn bitand_assign(&mut self, other: &super::__gf256_aes_u) {
            *self = *self & *other;
        }
    }
    impl BitOr<gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 | other.0)
        }
    }
    impl BitOr<gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 | other.0)
        }
    }
    impl BitOr<&gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self.0 | other.0)
        }
    }
    impl BitOr<&gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self.0 | other.0)
        }
    }
    impl BitOrAssign<gf256_aes> for gf256_aes {
        #[inline]
        fn bitor_assign(&mut self, other: gf256_aes) {
            *self = *self | other;
        }
    }
    impl BitOrAssign<&gf256_aes> for gf256_aes {
        #[inline]
        fn bitor_assign(&mut self, other: &gf256_aes) {
            *self = *self | *other;
        }
    }
    impl BitOr<gf256_aes> for super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self | other.0)
        }
    }
    impl BitOr<gf256_aes> for &super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self | other.0)
        }
    }
    impl BitOr<&gf256_aes> for super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self | other.0)
        }
    }
    impl BitOr<&gf256_aes> for &super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self | other.0)
        }
    }
    impl BitOr<super::__gf256_aes_u> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 | other)
        }
    }
    impl BitOr<super::__gf256_aes_u> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 | other)
        }
    }
    impl BitOr<&super::__gf256_aes_u> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: &super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 | other)
        }
    }
    impl BitOr<&super::__gf256_aes_u> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitor(self, other: &super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 | other)
        }
    }
    impl BitOrAssign<super::__gf256_aes_u> for gf256_aes {
        #[inline]
        fn bitor_assign(&mut self, other: super::__gf256_aes_u) {
            *self = *self | other;
        }
    }
    impl BitOrAssign<&super::__gf256_aes_u> for gf256_aes {
        #[inline]
        fn bitor_assign(&mut self, other: &super::__gf256_aes_u) {
            *self = *self | *other;
        }
    }
    impl BitXor<gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 ^ other.0)
        }
    }
    impl BitXor<gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self.0 ^ other.0)
        }
    }
    impl BitXor<&gf256_aes> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self.0 ^ other.0)
        }
    }
    impl BitXor<&gf256_aes> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self.0 ^ other.0)
        }
    }
    impl BitXorAssign<gf256_aes> for gf256_aes {
        #[inline]
        fn bitxor_assign(&mut self, other: gf256_aes) {
            *self = *self ^ other;
        }
    }
    impl BitXorAssign<&gf256_aes> for gf256_aes {
        #[inline]
        fn bitxor_assign(&mut self, other: &gf256_aes) {
            *self = *self ^ *other;
        }
    }
    impl BitXor<gf256_aes> for super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self ^ other.0)
        }
    }
    impl BitXor<gf256_aes> for &super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: gf256_aes) -> gf256_aes {
            gf256_aes(self ^ other.0)
        }
    }
    impl BitXor<&gf256_aes> for super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self ^ other.0)
        }
    }
    impl BitXor<&gf256_aes> for &super::__gf256_aes_u {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: &gf256_aes) -> gf256_aes {
            gf256_aes(self ^ other.0)
        }
    }
    impl BitXor<super::__gf256_aes_u> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 ^ other)
        }
    }
    impl BitXor<super::__gf256_aes_u> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 ^ other)
        }
    }
    impl BitXor<&super::__gf256_aes_u> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: &super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 ^ other)
        }
    }
    impl BitXor<&super::__gf256_aes_u> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn bitxor(self, other: &super::__gf256_aes_u) -> gf256_aes {
            gf256_aes(self.0 ^ other)
        }
    }
    impl BitXorAssign<super::__gf256_aes_u> for gf256_aes {
        #[inline]
        fn bitxor_assign(&mut self, other: super::__gf256_aes_u) {
            *self = *self ^ other;
        }
    }
    impl BitXorAssign<&super::__gf256_aes_u> for gf256_aes {
        #[inline]
        fn bitxor_assign(&mut self, other: &super::__gf256_aes_u) {
            *self = *self ^ *other;
        }
    }
    impl gf256_aes {
        #[inline]
        pub const fn swap_bytes(self) -> gf256_aes {
            gf256_aes(self.0.swap_bytes())
        }
        #[inline]
        pub const fn to_le(self) -> gf256_aes { gf256_aes(self.0.to_le()) }
        #[inline]
        pub const fn from_le(self_: gf256_aes) -> gf256_aes {
            gf256_aes(super::__gf256_aes_u::from_le(self_.0))
        }
        #[inline]
        pub const fn to_le_bytes(self)
            -> [u8; size_of::<super::__gf256_aes_u>()] {
            self.0.to_le_bytes()
        }
        #[inline]
        pub const fn from_le_bytes(bytes:
                [u8; size_of::<super::__gf256_aes_u>()]) -> gf256_aes {
            gf256_aes(super::__gf256_aes_u::from_le_bytes(bytes))
        }
        #[inline]
        pub const fn to_be(self) -> gf256_aes { gf256_aes(self.0.to_be()) }
        #[inline]
        pub const fn from_be(self_: gf256_aes) -> gf256_aes {
            gf256_aes(super::__gf256_aes_u::from_be(self_.0))
        }
        #[inline]
        pub const fn to_be_bytes(self)
            -> [u8; size_of::<super::__gf256_aes_u>()] {
            self.0.to_be_bytes()
        }
        #[inline]
        pub const fn from_be_bytes(bytes:
                [u8; size_of::<super::__gf256_aes_u>()]) -> gf256_aes {
            gf256_aes(super::__gf256_aes_u::from_be_bytes(bytes))
        }
        #[inline]
        pub const fn to_ne_bytes(self)
            -> [u8; size_of::<super::__gf256_aes_u>()] {
            self.0.to_ne_bytes()
        }
        #[inline]
        pub const fn from_ne_bytes(bytes:
                [u8; size_of::<super::__gf256_aes_u>()]) -> gf256_aes {
            gf256_aes(super::__gf256_aes_u::from_ne_bytes(bytes))
        }
    }
    impl gf256_aes {
        #[inline]
        pub const fn reverse_bits(self) -> gf256_aes {
            gf256_aes(self.0.reverse_bits())
        }
        #[inline]
        pub const fn count_ones(self) -> u32 { self.0.count_ones() }
        #[inline]
        pub const fn count_zeros(self) -> u32 { self.0.count_zeros() }
        #[inline]
        pub const fn leading_ones(self) -> u32 { self.0.leading_ones() }
        #[inline]
        pub const fn leading_zeros(self) -> u32 { self.0.leading_zeros() }
        #[inline]
        pub const fn trailing_ones(self) -> u32 { self.0.trailing_ones() }
        #[inline]
        pub const fn trailing_zeros(self) -> u32 { self.0.trailing_zeros() }
    }
    impl gf256_aes {
        #[inline]
        pub const fn checked_shl(self, other: u32) -> Option<gf256_aes> {
            match self.0.checked_shl(other) {
                Some(x) => Some(gf256_aes(x)),
                None => None,
            }
        }
        #[inline]
        pub const fn checked_shr(self, other: u32) -> Option<gf256_aes> {
            match self.0.checked_shr(other) {
                Some(x) => Some(gf256_aes(x)),
                None => None,
            }
        }
        #[inline]
        pub const fn overflowing_shl(self, other: u32) -> (gf256_aes, bool) {
            let (x, o) = self.0.overflowing_shl(other);
            (gf256_aes(x), o)
        }
        #[inline]
        pub const fn overflowing_shr(self, other: u32) -> (gf256_aes, bool) {
            let (x, o) = self.0.overflowing_shr(other);
            (gf256_aes(x), o)
        }
        #[inline]
        pub const fn wrapping_shl(self, other: u32) -> gf256_aes {
            gf256_aes(self.0.wrapping_shl(other))
        }
        #[inline]
        pub const fn wrapping_shr(self, other: u32) -> gf256_aes {
            gf256_aes(self.0.wrapping_shr(other))
        }
        #[inline]
        pub const fn rotate_left(self, other: u32) -> gf256_aes {
            gf256_aes(self.0.rotate_left(other))
        }
        #[inline]
        pub const fn rotate_right(self, other: u32) -> gf256_aes {
            gf256_aes(self.0.rotate_right(other))
        }
    }
    impl Shl<u8> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u8) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u8> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u8) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u8> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u8) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u8> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u8) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u16> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u16) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u16> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u16) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u16> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u16) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u16> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u16) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u32> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u32) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u32> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u32) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u32> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u32) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u32> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u32) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u64> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u64) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u64> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u64) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u64> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u64) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u64> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u64) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u128> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u128) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<u128> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: u128) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u128> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u128) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&u128> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &u128) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<usize> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: usize) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<usize> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: usize) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&usize> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &usize) -> gf256_aes {
            gf256_aes(self.0 << other)
        }
    }
    impl Shl<&usize> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &usize) -> gf256_aes {
            gf256_aes(self.0 << other)
        }
    }
    impl ShlAssign<u8> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: u8) { *self = *self << other; }
    }
    impl ShlAssign<&u8> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &u8) { *self = *self << other; }
    }
    impl ShlAssign<u16> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: u16) { *self = *self << other; }
    }
    impl ShlAssign<&u16> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &u16) { *self = *self << other; }
    }
    impl ShlAssign<u32> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: u32) { *self = *self << other; }
    }
    impl ShlAssign<&u32> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &u32) { *self = *self << other; }
    }
    impl ShlAssign<u64> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: u64) { *self = *self << other; }
    }
    impl ShlAssign<&u64> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &u64) { *self = *self << other; }
    }
    impl ShlAssign<u128> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: u128) { *self = *self << other; }
    }
    impl ShlAssign<&u128> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &u128) { *self = *self << other; }
    }
    impl ShlAssign<usize> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: usize) { *self = *self << other; }
    }
    impl ShlAssign<&usize> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &usize) { *self = *self << other; }
    }
    impl Shr<u8> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u8) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u8> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u8) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u8> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u8) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u8> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u8) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u16> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u16) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u16> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u16) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u16> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u16) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u16> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u16) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u32> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u32) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u32> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u32) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u32> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u32) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u32> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u32) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u64> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u64) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u64> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u64) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u64> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u64) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u64> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u64) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u128> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u128) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<u128> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: u128) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u128> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u128) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&u128> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &u128) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<usize> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: usize) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<usize> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: usize) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&usize> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &usize) -> gf256_aes {
            gf256_aes(self.0 >> other)
        }
    }
    impl Shr<&usize> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &usize) -> gf256_aes {
            gf256_aes(self.0 >> other)
        }
    }
    impl ShrAssign<u8> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: u8) { *self = *self >> other; }
    }
    impl ShrAssign<&u8> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &u8) { *self = *self >> other; }
    }
    impl ShrAssign<u16> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: u16) { *self = *self >> other; }
    }
    impl ShrAssign<&u16> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &u16) { *self = *self >> other; }
    }
    impl ShrAssign<u32> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: u32) { *self = *self >> other; }
    }
    impl ShrAssign<&u32> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &u32) { *self = *self >> other; }
    }
    impl ShrAssign<u64> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: u64) { *self = *self >> other; }
    }
    impl ShrAssign<&u64> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &u64) { *self = *self >> other; }
    }
    impl ShrAssign<u128> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: u128) { *self = *self >> other; }
    }
    impl ShrAssign<&u128> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &u128) { *self = *self >> other; }
    }
    impl ShrAssign<usize> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: usize) { *self = *self >> other; }
    }
    impl ShrAssign<&usize> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &usize) { *self = *self >> other; }
    }
    impl Shl<i8> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i8) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i8> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i8) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i8> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i8) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i8> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i8) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i16> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i16) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i16> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i16) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i16> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i16) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i16> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i16) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i32> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i32) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i32> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i32) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i32> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i32) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i32> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i32) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i64> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i64) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i64> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i64) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i64> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i64) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i64> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i64) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i128> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i128) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<i128> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: i128) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i128> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i128) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&i128> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &i128) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<isize> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: isize) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<isize> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: isize) -> gf256_aes { gf256_aes(self.0 << other) }
    }
    impl Shl<&isize> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &isize) -> gf256_aes {
            gf256_aes(self.0 << other)
        }
    }
    impl Shl<&isize> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shl(self, other: &isize) -> gf256_aes {
            gf256_aes(self.0 << other)
        }
    }
    impl ShlAssign<i8> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: i8) { *self = *self << other; }
    }
    impl ShlAssign<&i8> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &i8) { *self = *self << other; }
    }
    impl ShlAssign<i16> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: i16) { *self = *self << other; }
    }
    impl ShlAssign<&i16> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &i16) { *self = *self << other; }
    }
    impl ShlAssign<i32> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: i32) { *self = *self << other; }
    }
    impl ShlAssign<&i32> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &i32) { *self = *self << other; }
    }
    impl ShlAssign<i64> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: i64) { *self = *self << other; }
    }
    impl ShlAssign<&i64> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &i64) { *self = *self << other; }
    }
    impl ShlAssign<i128> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: i128) { *self = *self << other; }
    }
    impl ShlAssign<&i128> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &i128) { *self = *self << other; }
    }
    impl ShlAssign<isize> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: isize) { *self = *self << other; }
    }
    impl ShlAssign<&isize> for gf256_aes {
        #[inline]
        fn shl_assign(&mut self, other: &isize) { *self = *self << other; }
    }
    impl Shr<i8> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i8) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i8> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i8) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i8> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i8) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i8> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i8) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i16> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i16) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i16> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i16) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i16> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i16) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i16> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i16) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i32> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i32) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i32> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i32) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i32> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i32) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i32> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i32) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i64> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i64) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i64> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i64) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i64> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i64) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i64> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i64) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i128> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i128) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<i128> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: i128) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i128> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i128) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&i128> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &i128) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<isize> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: isize) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<isize> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: isize) -> gf256_aes { gf256_aes(self.0 >> other) }
    }
    impl Shr<&isize> for gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &isize) -> gf256_aes {
            gf256_aes(self.0 >> other)
        }
    }
    impl Shr<&isize> for &gf256_aes {
        type Output = gf256_aes;
        #[inline]
        fn shr(self, other: &isize) -> gf256_aes {
            gf256_aes(self.0 >> other)
        }
    }
    impl ShrAssign<i8> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: i8) { *self = *self >> other; }
    }
    impl ShrAssign<&i8> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &i8) { *self = *self >> other; }
    }
    impl ShrAssign<i16> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: i16) { *self = *self >> other; }
    }
    impl ShrAssign<&i16> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &i16) { *self = *self >> other; }
    }
    impl ShrAssign<i32> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: i32) { *self = *self >> other; }
    }
    impl ShrAssign<&i32> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &i32) { *self = *self >> other; }
    }
    impl ShrAssign<i64> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: i64) { *self = *self >> other; }
    }
    impl ShrAssign<&i64> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &i64) { *self = *self >> other; }
    }
    impl ShrAssign<i128> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: i128) { *self = *self >> other; }
    }
    impl ShrAssign<&i128> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &i128) { *self = *self >> other; }
    }
    impl ShrAssign<isize> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: isize) { *self = *self >> other; }
    }
    impl ShrAssign<&isize> for gf256_aes {
        #[inline]
        fn shr_assign(&mut self, other: &isize) { *self = *self >> other; }
    }
    impl fmt::Debug for gf256_aes {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
            f.write_fmt(format_args!("{0}(0x{1:02$x})", "gf256_aes", self.0,
                    8 / 4))
        }
    }
    impl fmt::Display for gf256_aes {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
            f.write_fmt(format_args!("0x{0:01$x}", self.0, 8 / 4))
        }
    }
    impl fmt::Binary for gf256_aes {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
            <super::__gf256_aes_u as fmt::Binary>::fmt(&self.0, f)
        }
    }
    impl fmt::Octal for gf256_aes {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
            <super::__gf256_aes_u as fmt::Octal>::fmt(&self.0, f)
        }
    }
    impl fmt::LowerHex for gf256_aes {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
            <super::__gf256_aes_u as fmt::LowerHex>::fmt(&self.0, f)
        }
    }
    impl fmt::UpperHex for gf256_aes {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
            <super::__gf256_aes_u as fmt::UpperHex>::fmt(&self.0, f)
        }
    }
    impl FromStr for gf256_aes {
        type Err = ParseIntError;
        fn from_str(s: &str) -> Result<gf256_aes, ParseIntError> {
            if s.starts_with("0x") {
                Ok(gf256_aes(super::__gf256_aes_u::from_str_radix(&s[2..],
                                16)?))
            } else {
                "".parse::<super::__gf256_aes_u>()?;
                ::core::panicking::panic("internal error: entered unreachable code")
            }
        }
    }
    impl gf256_aes {
        pub fn from_str_radix(s: &str, radix: u32)
            -> Result<gf256_aes, ParseIntError> {
            Ok(gf256_aes(super::__gf256_aes_u::from_str_radix(s, radix)?))
        }
    }
}
use u8 as __gf256_aes_u;
use u16 as __gf256_aes_u2;
use ::gf256::p::p8 as __gf256_aes_p;
use ::gf256::p::p16 as __gf256_aes_p2;
