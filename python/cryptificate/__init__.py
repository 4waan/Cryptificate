"""Python client for the local Cryptificate service.

Cryptificate checks that a changed cryptographic component still implements
its design, which diffusion guarantees survive the change, and whether it
is faster. This package talks to `cryptificate serve` over HTTP.
"""

from .client import DEFAULT_URL, TERMINAL_STATES, Client, CryptificateError
from .designs import (
    AES_MIXCOLUMNS,
    BN254_MODULUS,
    POSEIDON2_EXTERNAL_3,
    POSEIDON2_INTERNAL_3,
    ProgramBuilder,
    aes_like_design,
    aes_shared_sum_program,
    bn,
    bn_shared_sum_program,
    gf,
    hades_design,
    identity_program,
)

__all__ = [
    "AES_MIXCOLUMNS",
    "BN254_MODULUS",
    "DEFAULT_URL",
    "POSEIDON2_EXTERNAL_3",
    "POSEIDON2_INTERNAL_3",
    "TERMINAL_STATES",
    "Client",
    "CryptificateError",
    "ProgramBuilder",
    "aes_like_design",
    "aes_shared_sum_program",
    "bn",
    "bn_shared_sum_program",
    "gf",
    "hades_design",
    "identity_program",
]

__version__ = "0.1.0"
