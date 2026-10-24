/**
 * The pipeline environment of this checkout: paths, engine, Lean, toolchain.
 */
import type { PipelineEnv } from './context.js';
import { Engine } from './engine.js';
import { findLake, pathReplacements, resolvePaths } from './paths.js';
import { readToolchain } from './toolchain.js';
import type { ToolchainInfo } from './toolchain.js';

export function makeEnv(root?: string): PipelineEnv {
  const paths = resolvePaths(root);
  let tc: Promise<ToolchainInfo> | null = null;
  return {
    paths,
    engine: Engine.locate(paths.root),
    lake: findLake(),
    toolchain: () => (tc ??= readToolchain(paths)),
    replacements: pathReplacements(paths),
  };
}
