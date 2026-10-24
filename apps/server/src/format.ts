/**
 * Terminal output: plain tables, colors only on a TTY (and not with NO_COLOR).
 */
import type { AnalysisReport, Claim, ExperimentReport, Step } from '@cryptificate/schema';

export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  status(status: string, text?: string): string;
}

export function makeStyle(stream: NodeJS.WriteStream): Style {
  const color = Boolean(stream.isTTY) && !process.env['NO_COLOR'] && process.env['TERM'] !== 'dumb';
  const wrap = (code: string, s: string): string => (color ? `\u001b[${code}m${s}\u001b[0m` : s);
  return {
    bold: (s) => wrap('1', s),
    dim: (s) => wrap('2', s),
    status: (status, text = status) => {
      switch (status) {
        case 'proved':
        case 'completed':
        case 'match':
          return wrap('32', text);
        case 'refuted':
        case 'failed':
        case 'mismatch':
        case 'invalid':
          return wrap('31', text);
        case 'not_established':
        case 'timeout':
        case 'cancelled':
          return wrap('33', text);
        default:
          return text;
      }
    },
  };
}

/** Visible width (ignores color escapes). */
function width(s: string): number {
  return s.replace(/\u001b\[[0-9;]*m/g, '').length;
}

export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i] ?? ''))));
  const line = (cells: string[]): string =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c + ' '.repeat(Math.max(0, (widths[i] ?? 0) - width(c)))))
      .join('  ')
      .trimEnd();
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

export function stepLine(step: Step): string {
  const ms = step.ms !== undefined ? ` ${(step.ms / 1000).toFixed(1)} s` : '';
  return `${step.name}: ${step.state}${ms}${step.detail ? ` (${step.detail})` : ''}`;
}

function witnessText(c: Claim): string {
  const w = c.witness;
  if (!w) return '';
  switch (w.kind) {
    case 'branch':
      return `input [${w.input.join(',')}] -> [${w.output.join(',')}], weight ${w.inputWeight}+${w.outputWeight} < ${w.bound}`;
    case 'offset-collision':
      return `rows ${w.rows.join(',')} share offset ${w.offset}`;
    case 'distinguishing-input':
      return `input [${w.input.join(',')}]: expected [${w.expected.join(',')}], got [${w.actual.join(',')}]`;
    case 'sbox-collision':
      return `S(${w.x1}) = S(${w.x2}) = ${w.y}`;
    case 'power-collision':
      return `${w.x1}^${w.exponent} = ${w.x2}^${w.exponent}${w.note ? ` (${w.note})` : ''}`;
    default:
      return '';
  }
}

export function formatClaims(claims: readonly Claim[], style: Style): string {
  const rows = claims.map((c) => [c.chain, c.id, style.status(c.status), c.evidence.label]);
  const details = claims
    .filter((c) => c.note || c.witness)
    .map((c) => {
      const w = witnessText(c);
      return `  ${c.id}: ${c.note}${w ? `\n    witness: ${w}` : ''}`;
    });
  return `${table(['chain', 'claim', 'status', 'evidence'], rows)}\n\n${style.bold('Notes')}\n${details.join('\n')}`;
}

export function formatAnalysis(r: AnalysisReport, style: Style): string {
  const lines = [
    `${style.bold('Cryptificate analysis')} ${r.id}`,
    `inputs   ${r.inputDigest}`,
    `origin   ${r.provenance.origin}${r.provenance.cachedFrom ? ` (proof cache of run ${r.provenance.cachedFrom})` : ''}`,
    `checker  ${r.provenance.checker}; Lean ${r.provenance.toolchain.lean}; WideTrail ${r.provenance.toolchain.widetrail.slice(0, 12)}`,
    `run      ${style.status(r.execution.state)}`,
    '',
    formatClaims(r.claims, style),
  ];
  return lines.join('\n');
}

export function formatExperiment(r: ExperimentReport, style: Style): string {
  const lines = [
    `${style.bold('Cryptificate experiment')} ${r.id} (${r.profile})`,
    `inputs   ${r.inputDigest}`,
    `run      ${style.status(r.execution?.state ?? 'completed')}`,
  ];
  if (r.search) lines.push(`search   seed ${r.search.seed}, ${r.search.generated} generated, shortlist ${r.search.shortlist.join(', ') || '(none)'}`);
  lines.push('');
  lines.push(
    table(
      ['candidate', 'origin', 'ops', 'equivalence', 'native'],
      r.candidates.map((c) => {
        const adds = c.program.instructions.filter((i) => i.op === 'add').length;
        const muls = c.program.instructions.length - adds;
        return [
          c.id,
          c.origin,
          `${adds} add, ${muls} mul`,
          style.status(c.equivalence.status),
          c.native ? (c.native.passed ? `passed ${c.native.cases}` : `failed`) : 'not run',
        ];
      }),
    ),
  );
  if (r.measurements) {
    lines.push('');
    lines.push(
      table(
        ['session', 'candidate', 'baseline', 'ratio', '95% CI'],
        r.measurements.comparisons.map((c) => [
          String(c.session),
          c.candidate,
          c.baseline,
          c.ratio.toFixed(3),
          `[${c.ci95[0].toFixed(3)}, ${c.ci95[1].toFixed(3)}]`,
        ]),
      ),
    );
    lines.push('', `verdict  ${style.bold(r.measurements.verdict)} (native timing measured on this machine)`);
  } else {
    lines.push('', 'No measurements were taken.');
  }
  lines.push('', style.bold('Checkpoints'), ...r.checkpoints.map((s) => `  ${stepLine(s)}`));
  return lines.join('\n');
}
