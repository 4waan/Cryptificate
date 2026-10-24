"""Helpers to build candidate designs and linear programs in the request format.

Field elements are strings: GF(2^8) elements as two uppercase hex digits
("02", "1B"), BN254 scalars as canonical decimal strings.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

BN254_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617

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
