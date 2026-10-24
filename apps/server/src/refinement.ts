/**
 * Status of the Rust-source refinement proofs (refinement/, Charon + Aeneas).
 *
 * The proofs are checked once by `scripts/setup.sh --with-refinement`, which
 * records <state>/refinement.json. They are reported as proved only while
 * the kernel source still has the digest the extraction was made from.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FieldName } from '@cryptificate/schema';
import type { Paths } from './paths.js';
import { sha256Hex } from './toolchain.js';

export type RefinementStatus =
  | { status: 'proved'; note: string; theorem: string }
  | { status: 'not_established' | 'unsupported'; note: string };

const KERNEL = 'crates/kernels/src/gf256.rs';

function readText(p: string): string | null {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

interface CheckRecord {
  checked?: unknown;
  kernelsSha256?: unknown;
}

function readRecord(p: string): CheckRecord | null {
  try {
    const v = JSON.parse(readFileSync(p, 'utf8')) as unknown;
    return v && typeof v === 'object' ? (v as CheckRecord) : null;
  } catch {
    return null;
  }
}

export function refinementStatus(paths: Paths, field: FieldName): RefinementStatus {
  if (field !== 'gf256') {
    return { status: 'unsupported', note: 'Refinement proofs exist for the GF(2^8) kernels only; BN254 arithmetic is not covered.' };
  }
  const recorded = readText(join(paths.root, 'refinement', 'extract.sha256'));
  const kernel = readText(join(paths.root, KERNEL));
  if (!recorded || kernel === null) {
    return { status: 'unsupported', note: 'This checkout has no refinement proofs for the kernels.' };
  }
  const extractedFrom = recorded
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find((parts) => parts[1] === KERNEL)?.[0];
  const current = sha256Hex(kernel);
  if (extractedFrom !== current) {
    return { status: 'not_established', note: `${KERNEL} changed since the refinement was extracted; the proofs do not cover the current kernels.` };
  }
  const checked = readRecord(join(paths.home, 'refinement.json'));
  if (!checked || checked.checked !== true || checked.kernelsSha256 !== current) {
    return { status: 'not_established', note: 'The refinement proofs have not been checked on this machine (scripts/setup.sh --with-refinement).' };
  }
  return {
    status: 'proved',
    theorem: 'Cryptificate.Refinement.gf256_mul_refines',
    note:
      'The GF(2^8) primitives add, xtime and mul of crates/kernels, extracted with Charon and Aeneas, refine the Lean field operations; Lean checked these proofs on this machine. They cover the arithmetic primitives the generated code calls, not the generated circuit code itself, which native correctness tests.',
  };
}
