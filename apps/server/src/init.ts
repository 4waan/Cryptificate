/**
 * `cryptificate init [dir]`: scaffold a project that checks its designs with
 * Cryptificate, locally and in GitHub Actions.
 *
 * Written files (paths relative to dir, the workflow relative to the git root):
 *   cryptificate.json                    inputs, policy and claim scope for `check`
 *   cryptificate/designs/<preset>.json   a starting design (a request with a circuit when asked)
 *   cryptificate/README.md               what the folder is
 *   cryptificate/.gitignore              keeps local evidence bundles out of git
 *   .github/workflows/cryptificate.yml   the reusable action with SARIF upload (--ci github)
 *
 * Nothing is written when one of these files exists, unless --force is given.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { FailOn } from './policy.js';
import { CONFIG_FILE, CONFIG_SCHEMA_URL } from './project.js';
import type { ProjectConfig } from './project.js';
import { MODEL_IDS, defaultClaims } from './presets.js';
import type { ModelChoice, Preset } from './presets.js';

export const DEFAULT_ACTION = '4waan/Cryptificate@main';

export type CiChoice = 'github' | 'none';

export interface InitChoices {
  /** Absolute directory the project files go to. */
  dir: string;
  model: ModelChoice;
  preset: Preset;
  circuit: boolean;
  failOn: FailOn;
  ci: CiChoice;
  /** `uses:` value of the workflow step, e.g. 4waan/Cryptificate@<sha>. */
  action: string;
}

export interface PlannedFile {
  /** Absolute path. */
  path: string;
  content: string;
  exists: boolean;
}

export interface InitPlan {
  files: PlannedFile[];
  /** The git repository root holding dir, or null when dir is not in one. */
  gitRoot: string | null;
  /** Path of the design file relative to dir (forward slashes). */
  designFile: string;
}

/** Forward-slash relative path, "." for the same directory. */
export function posixRelative(from: string, to: string): string {
  const r = relative(from, to);
  return r === '' ? '.' : r.split(sep).join('/');
}

/** The nearest directory at or above `dir` that holds a .git entry. */
export function findGitRoot(dir: string): string | null {
  let d = dir;
  for (;;) {
    if (existsSync(join(d, '.git'))) return d;
    const parent = dirname(d);
    if (parent === d) return null;
    d = parent;
  }
}

/** main, or master when the repository has a master branch and no main branch. */
export function defaultBranch(gitRoot: string | null): string {
  if (!gitRoot) return 'main';
  const git = join(gitRoot, '.git');
  try {
    if (!statSync(git).isDirectory()) return 'main';
  } catch {
    return 'main';
  }
  let packed = '';
  try {
    packed = readFileSync(join(git, 'packed-refs'), 'utf8');
  } catch {
    // no packed refs
  }
  const has = (b: string): boolean => existsSync(join(git, 'refs', 'heads', b)) || packed.includes(` refs/heads/${b}\n`);
  if (has('main')) return 'main';
  return has('master') ? 'master' : 'main';
}

function isScalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

/**
 * JSON with two-space indentation where arrays and objects that hold only
 * scalars (and fit in 80 columns) stay on one line, as the example designs
 * are written.
 */
export function prettyJson(value: unknown, indent = ''): string {
  if (isScalar(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(isScalar)) {
      const line = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      if (indent.length + line.length <= 80) return line;
    }
    return `[\n${value.map((v) => `${inner}${prettyJson(v, inner)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  if (entries.every(([, v]) => isScalar(v))) {
    const line = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
    if (indent.length + line.length <= 80) return line;
  }
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${prettyJson(v, inner)}`).join(',\n')}\n${indent}}`;
}

export function configFor(c: InitChoices): ProjectConfig & { $schema: string } {
  return {
    $schema: CONFIG_SCHEMA_URL,
    inputs: ['cryptificate/designs/*.json'],
    failOn: c.failOn,
    claims: defaultClaims(c.model, c.circuit),
    bundleDir: 'cryptificate/evidence',
  };
}

export function workflowFor(c: InitChoices, gitRoot: string | null): string {
  const sub = gitRoot ? posixRelative(gitRoot, c.dir) : '.';
  const prefix = sub === '.' ? '' : `${sub}/`;
  const branch = defaultBranch(gitRoot);
  const lines = [
    '# Written by cryptificate init. The check reads cryptificate.json: edit the inputs,',
    '# the policy (failOn) and the claim scope (claims) there. When inputs outside',
    '# cryptificate/ are added, add them to the paths below as well.',
    'name: cryptificate',
    '',
    'on:',
    '  pull_request:',
    '    paths:',
    `      - "${prefix}cryptificate.json"`,
    `      - "${prefix}cryptificate/**"`,
    '      - ".github/workflows/cryptificate.yml"',
    '  push:',
    `    branches: [${branch}]`,
    '  workflow_dispatch:',
    '',
    'permissions:',
    '  contents: read',
    '  security-events: write   # SARIF upload to code scanning',
    '  actions: read            # needed by the SARIF upload in private repositories',
    '',
    'jobs:',
    '  check:',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 60',
    '    steps:',
    '      - uses: actions/checkout@v4',
    `      - uses: ${c.action}${/@[0-9a-f]{40}$/.test(c.action) ? '' : '   # pin a commit SHA for reproducible gates'}`,
    '        with:',
    '          upload-sarif: "true"',
  ];
  if (sub !== '.') lines.push(`          working-directory: ${sub}`);
  return `${lines.join('\n')}\n`;
}

function readmeFor(c: InitChoices, designFile: string): string {
  const circuit = c.circuit
    ? ' It is a request file: `design` holds the design and `program` a circuit that computes its ' +
      (c.model === 'hades' ? 'external matrix' : 'matrix') +
      '; replace the circuit with your own to check it.'
    : '';
  return [
    '# Cryptificate',
    '',
    `This folder holds the designs that \`cryptificate check\` checks, as listed in \`../${CONFIG_FILE}\`.`,
    '',
    `- \`${designFile.replace(/^cryptificate\//, '')}\`: ${c.preset.title} (\`${MODEL_IDS[c.model]}\`), the starting point. Edit the values to describe your design.${circuit}`,
    '- `evidence/`: one evidence bundle per design, written by a local `cryptificate check` and ignored by git.',
    '',
    `\`../${CONFIG_FILE}\` sets the policy: \`failOn: "${c.failOn}"\` over the claims listed in \`claims\`. Run \`cryptificate check\` without arguments to apply it here; exit status 0 means the policy held, 1 that it failed and 2 that a design could not be checked.${
      c.ci === 'github' ? ' The workflow `.github/workflows/cryptificate.yml` runs the same check on pull requests and uploads the result to code scanning.' : ''
    }`,
    '',
    'A claim is proved or refuted only by a Lean theorem Cryptificate accepted; anything else is reported as not established. What each status and evidence label covers: https://github.com/4waan/Cryptificate/blob/main/docs/evidence-model.md',
    '',
  ].join('\n');
}

export function planInit(c: InitChoices): InitPlan {
  const gitRoot = findGitRoot(c.dir);
  const designFile = `cryptificate/designs/${c.preset.id}.json`;
  const design = c.circuit && c.preset.program ? { design: c.preset.design, program: c.preset.program } : c.preset.design;
  const files: Array<[string, string]> = [
    [join(c.dir, CONFIG_FILE), `${prettyJson(configFor(c))}\n`],
    [join(c.dir, ...designFile.split('/')), `${prettyJson(design)}\n`],
    [join(c.dir, 'cryptificate', 'README.md'), readmeFor(c, designFile)],
    [join(c.dir, 'cryptificate', '.gitignore'), 'evidence/\n'],
  ];
  if (c.ci === 'github') files.push([join(gitRoot ?? c.dir, '.github', 'workflows', 'cryptificate.yml'), workflowFor(c, gitRoot)]);
  return { files: files.map(([path, content]) => ({ path, content, exists: existsSync(path) })), gitRoot, designFile };
}

export function writePlan(plan: InitPlan): void {
  for (const f of plan.files) {
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, f.content);
  }
}
