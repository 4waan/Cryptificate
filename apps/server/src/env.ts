/**
 * The pipeline environment of this checkout: paths, engine, Lean, toolchain.
 */
import { join } from 'node:path';
import type { PipelineEnv } from './context.js';
import { Engine } from './engine.js';
import { findLake, pathReplacements, resolvePaths } from './paths.js';
import { readToolchain } from './toolchain.js';
import type { ToolchainInfo } from './toolchain.js';

/**
 * Generated native variants are built under the state directory (kept
 * between runs so the kernels compile once), two cargo jobs at a time,
 * unless the caller chose otherwise.
 */
export function nativeBuildEnv(home: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!process.env['CRYPTIFICATE_NATIVE_WORK_DIR']) out['CRYPTIFICATE_NATIVE_WORK_DIR'] = join(home, 'native', 'work');
  if (!process.env['CRYPTIFICATE_NATIVE_TARGET_DIR']) out['CRYPTIFICATE_NATIVE_TARGET_DIR'] = join(home, 'native', 'target');
  if (!process.env['CRYPTIFICATE_NATIVE_JOBS']) out['CRYPTIFICATE_NATIVE_JOBS'] = '2';
  return out;
}

export function makeEnv(root?: string): PipelineEnv {
  const paths = resolvePaths(root);
  let tc: Promise<ToolchainInfo> | null = null;
  return {
    paths,
    engine: Engine.locate(paths.root, nativeBuildEnv(paths.home)),
    lake: findLake(),
    toolchain: () => (tc ??= readToolchain(paths)),
    replacements: pathReplacements(paths),
  };
}
