"""Helpers to build candidate designs and linear programs in the request format.

Field elements are strings: GF(2^8) elements as two uppercase hex digits
("02", "1B"), elements of a prime field (BN254, BabyBear, KoalaBear,
Mersenne31, Goldilocks or a custom prime) as canonical decimal strings.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

BN254_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617

#: The named fields of the prime-field profile (`hades/prime/v1`) and their moduli.
PRIME_FIELDS = {
    "babybear": 2013265921,
    "koalabear": 2130706433,
    "mersenne31": 2147483647,
    "goldilocks": 18446744069414584321,
}

Element = Union[int, str]

AES_MIXCOLUMNS = [
    ["02", "03", "01", "01"],
    ["01", "02", "03", "01"],
    ["01", "01", "02", "03"],
    ["03", "01", "01", "02"],
]

POSEIDON2_EXTERNAL_3 = [["2", "1", "1"], ["1", "2", "1"], ["1", "1", "2"]]
POSEIDON2_INTERNAL_3 = [["2", "1", "1"], ["1", "2", "1"], ["1", "1", "3"]]


def gf(value: Element) -> str:
    """A GF(2^8) element as two uppercase hex digits (accepts 0..255, "1b", "0x1b")."""
    if isinstance(value, bool):
        raise TypeError("expected a byte, not a bool")
    if isinstance(value, int):
        if not 0 <= value <= 255:
            raise ValueError(f"byte out of range: {value}")
        return f"{value:02X}"
    text = value.strip().lower()
    if text.startswith("0x"):
        text = text[2:]
    if len(text) == 1:
        text = "0" + text
    if len(text) != 2 or any(c not in "0123456789abcdef" for c in text):
        raise ValueError(f"not a byte: {value!r}")
    return text.upper()


def bn(value: Element) -> str:
    """A BN254 scalar as a canonical decimal string (reduced mod p)."""
    if isinstance(value, bool):
        raise TypeError("expected an integer, not a bool")
    n = int(value) if isinstance(value, str) else value
    return str(n % BN254_MODULUS)


def _matrix(rows: Sequence[Sequence[Element]], conv) -> List[List[str]]:
    return [[conv(e) for e in row] for row in rows]


def aes_like_design(
    matrix: Sequence[Sequence[Element]] = AES_MIXCOLUMNS,
    offsets: Sequence[int] = (0, 1, 2, 3),
    rounds: int = 10,
    sbox: Optional[Sequence[Element]] = None,
) -> Dict[str, Any]:
    """An AES-like design over GF(2^8); `sbox=None` means the AES S-box."""
    width = len(matrix)
    design: Dict[str, Any] = {
        "model": "aes-like/gf256/v1",
        "field": "gf256",
        "width": width,
        "matrix": _matrix(matrix, gf),
        "offsets": [int(o) for o in offsets],
        "rounds": int(rounds),
        "sbox": {"kind": "aes"} if sbox is None else {"kind": "table", "table": [gf(x) for x in sbox]},
    }
    if width != 4:
        design["experimental"] = True
    return design


def hades_design(
    external: Sequence[Sequence[Element]] = POSEIDON2_EXTERNAL_3,
    internal: Sequence[Sequence[Element]] = POSEIDON2_INTERNAL_3,
    full_rounds: int = 8,
    partial_rounds: int = 56,
    exponent: int = 5,
    partial_mask: Sequence[bool] = (True, False, False),
    constants: Optional[Sequence[Sequence[Element]]] = None,
) -> Dict[str, Any]:
    """A HADES design over the BN254 scalar field; `constants=None` uses the reference constants."""
    return {
        "model": "hades/bn254/v1",
        "field": "bn254",
        "width": 3,
        "external": _matrix(external, bn),
        "internal": _matrix(internal, bn),
        "fullRounds": int(full_rounds),
        "partialRounds": int(partial_rounds),
        "sbox": {"kind": "power", "exponent": int(exponent)},
        "partialMask": [bool(m) for m in partial_mask],
        "constants": {"kind": "reference"} if constants is None else {"kind": "explicit", "values": _matrix(constants, bn)},
    }


def prime_design(
    field: str,
    external: Sequence[Sequence[Element]],
    internal: Sequence[Sequence[Element]],
    full_rounds: int,
    partial_rounds: int,
    exponent: int,
    partial_mask: Optional[Sequence[bool]] = None,
    modulus: Optional[int] = None,
    constants: Optional[Sequence[Sequence[Element]]] = None,
) -> Dict[str, Any]:
    """A HADES design over a prime field below 2^64 (`hades/prime/v1`).

    The width is that of `external`: 2, 3, 4, 8, 12, 16 or 24 (the Poseidon2
    widths). Above 4 the report checks `external.m4_mds` and
    `external.invertible` instead of enumerating the external matrix's minors;
    `poseidon2_external` and `one_plus_diagonal` build Poseidon2's matrices.

    `field` is one of PRIME_FIELDS, or "prime" with an explicit `modulus`. Elements
    are reduced modulo p. `partial_mask=None` puts the partial-round S-box on
    position 0; `constants=None` leaves the round constants unspecified (every
    claim holds for all round constants). Whether a custom modulus is prime is
    decided by the service, and proved in Lean in every report.
    """
    if field == "prime":
        if modulus is None:
            raise ValueError("field 'prime' needs a modulus")
        p = int(modulus)
    elif field in PRIME_FIELDS:
        p = PRIME_FIELDS[field]
        if modulus is not None and int(modulus) != p:
            raise ValueError(f"field {field!r} has modulus {p}")
    else:
        raise ValueError(f"field must be one of {', '.join(PRIME_FIELDS)} or 'prime'")
    if not 2 <= p < 2**64:
        raise ValueError("the modulus must be below 2^64")

    def fp(value: Element) -> str:
        if isinstance(value, bool):
            raise TypeError("expected an integer, not a bool")
        return str((int(value) if isinstance(value, str) else value) % p)

    width = len(external)
    design: Dict[str, Any] = {
        "model": "hades/prime/v1",
        "field": field,
        "modulus": str(p),
        "width": width,
        "external": _matrix(external, fp),
        "internal": _matrix(internal, fp),
        "fullRounds": int(full_rounds),
        "partialRounds": int(partial_rounds),
        "sbox": {"kind": "power", "exponent": int(exponent)},
        "partialMask": [bool(m) for m in partial_mask] if partial_mask is not None else [i == 0 for i in range(width)],
    }
    if constants is not None:
        design["constants"] = {"kind": "explicit", "values": _matrix(constants, fp)}
    return design


class ProgramBuilder:
    """Builds a linear program. Registers 0..width-1 are the inputs; each
    instruction defines the next register and its index is returned.

    >>> p = ProgramBuilder("gf256", 4)
    >>> s = p.add(0, 1)
    >>> t = p.xtime(s)
    """

    def __init__(self, field: str, width: int, name: Optional[str] = None):
        if field not in ("gf256", "bn254"):
            raise ValueError("field must be 'gf256' or 'bn254'")
        self.field = field
        self.width = width
        self.name = name
        self.instructions: List[Dict[str, Any]] = []

    @property
    def next_register(self) -> int:
        return self.width + len(self.instructions)

    def _check(self, *regs: int) -> None:
        for r in regs:
            if not 0 <= r < self.next_register:
                raise ValueError(f"register {r} is not defined yet")

    def add(self, a: int, b: int) -> int:
        """a + b (XOR over GF(2^8))."""
        self._check(a, b)
        self.instructions.append({"op": "add", "a": a, "b": b})
        return self.next_register - 1

    def mul(self, k: Element, a: int) -> int:
        """k * a for a public constant k."""
        self._check(a)
        coeff = gf(k) if self.field == "gf256" else bn(k)
        self.instructions.append({"op": "mul", "k": coeff, "a": a})
        return self.next_register - 1

    def xtime(self, a: int) -> int:
        """Multiplication by x (the byte 02) over GF(2^8)."""
        if self.field != "gf256":
            raise ValueError("xtime is defined over GF(2^8) only")
        return self.mul("02", a)

    def sum(self, regs: Iterable[int]) -> int:
        regs = list(regs)
        if not regs:
            raise ValueError("empty sum")
        acc = regs[0]
        for r in regs[1:]:
            acc = self.add(acc, r)
        return acc

    def build(self, outputs: Sequence[int]) -> Dict[str, Any]:
        if len(outputs) != self.width:
            raise ValueError(f"expected {self.width} outputs")
        self._check(*outputs)
        program: Dict[str, Any] = {
            "field": self.field,
            "width": self.width,
            "instructions": [dict(i) for i in self.instructions],
            "outputs": [int(o) for o in outputs],
        }
        if self.name is not None:
            program["name"] = self.name
        return program


def identity_program(field: str = "gf256", width: int = 4) -> Dict[str, Any]:
    """Outputs equal inputs (no instructions)."""
    return ProgramBuilder(field, width, "identity").build(list(range(width)))


def aes_shared_sum_program() -> Dict[str, Any]:
    """AES MixColumns with a shared sum: 4 xtime and 15 XOR.

    b_i = a_i + t + xtime(a_i + a_{i+1}) with t = a_0 + a_1 + a_2 + a_3.
    """
    p = ProgramBuilder("gf256", 4, "aes-shared-sum")
    t = p.sum([0, 1, 2, 3])
    outs = []
    for i in range(4):
        x = p.xtime(p.add(i, (i + 1) % 4))
        outs.append(p.add(p.add(x, t), i))
    return p.build(outs)


def bn_shared_sum_program() -> Dict[str, Any]:
    """[[2,1,1],[1,2,1],[1,1,2]] as s = x0 + x1 + x2, y_i = s + x_i."""
    p = ProgramBuilder("bn254", 3, "shared-sum")
    s = p.sum([0, 1, 2])
    return p.build([p.add(s, i) for i in range(3)])


# Plonky3's 4 x 4 block of the Poseidon2 external matrix (`MDSMat4`).
POSEIDON2_M4 = [[2, 3, 1, 1], [1, 2, 3, 1], [1, 1, 2, 3], [3, 1, 1, 2]]


def poseidon2_external(width: int, m4: Sequence[Sequence[int]] = POSEIDON2_M4) -> List[List[int]]:
    """The Poseidon2 external matrix: [[2, 1], [1, 2]] for width 2, and
    circ(2 M4, M4, ..., M4) for a multiple of 4 (2 M4 on the diagonal blocks,
    M4 elsewhere)."""
    if width == 2:
        return [[2, 1], [1, 2]]
    if width < 4 or width % 4:
        raise ValueError("the Poseidon2 external matrix has width 2 or a multiple of 4")
    return [[(2 if i // 4 == j // 4 else 1) * m4[i % 4][j % 4] for j in range(width)] for i in range(width)]


def one_plus_diagonal(diagonal: Sequence[int]) -> List[List[int]]:
    """The Poseidon2 internal matrix 1 * 1^T + diag(V); reduce it with `prime_design`."""
    n = len(diagonal)
    return [[1 + (diagonal[i] if i == j else 0) for j in range(n)] for i in range(n)]
