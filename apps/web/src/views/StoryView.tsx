import { useMemo } from 'react';
import { ClaimCard } from '../components/ClaimCard';
import { CircuitEditor } from '../components/CircuitEditor';
import { IconDownload, IconPlay, IconRefresh } from '../components/icons';
import { MatrixView } from '../components/MatrixEditor';
import { ClaimChains, ExecutionProblems, exportRequest } from '../components/ResultsPanel';
import { RunProgress, isActive } from '../components/RunProgress';
import { WitnessView } from '../components/WitnessView';
import { isStale } from '../lib/canonical';
import { expressionOf } from '../lib/circuit';
import { previewDesign, previewEquivalence } from '../lib/preview';
import {
  WIRE_STEP_INSTRUCTION,
  WIRE_STEP_XTIME,
  aesDesign,
  aesSharedSum,
  hadesDesign,
  hadesSharedSum,
  identityDesign,
  identityProgram,
  miswiredSharedSum,
} from '../lib/presets';
import type { AnalysisReport, ClaimId, ExperimentReport, Program } from '../lib/types';
import {
  loadInputs,
  setHighlight,
  setProgram,
  setStoryRun,
  setStoryStep,
  setView,
  startRun,
  updateStory,
} from '../state/actions';
import { dataSource, getState, useAppState, type Run } from '../state/store';
import { CandidatesTable, MeasurementSection, SavingsCallout } from './ExperimentsView';
import { PreviewCard } from '../components/ClaimCard';

const STEPS = [
  { n: 1, title: 'Beat the reference' },
  { n: 2, title: 'One wire goes wrong' },
  { n: 3, title: 'Perfect implementation, weak diffusion' },
  { n: 4, title: 'Prime field' },
  { n: 5, title: 'Take it with you' },
];

function useStoryRun(slot: string): Run | undefined {
  const key = useAppState((s) => s.story.runs[slot]);
  return useAppState((s) => (key ? s.runs[key] : undefined));
}

function run(slot: string, kind: 'analysis' | 'experiment'): void {
  const key = startRun(kind, 'quick');
  setStoryRun(slot, key);
}

function useSource() {
  return useAppState(dataSource);
}

function StepHead({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <header className="story-step-head">
      <span className="eyebrow">{n <= 4 ? `Step ${n} of 4` : 'Finish'}</span>
      <h2 className="story-title" id="story-step-title" tabIndex={-1}>
        {title}
      </h2>
      <p className="lead">{children}</p>
    </header>
  );
}

/** Shared handling of a step's run: progress, unavailable recordings, execution problems. */
function RunArea({
  runState,
  children,
  preview,
}: {
  runState: Run | undefined;
  children: (report: AnalysisReport | ExperimentReport) => React.ReactNode;
  preview?: React.ReactNode;
}) {
  if (!runState) return null;
  const report = runState.report as AnalysisReport | ExperimentReport | null;
  return (
    <div className="stack" aria-live="polite">
      {isActive(runState) || runState.state !== 'completed' ? <RunProgress run={runState} /> : null}
      {runState.state === 'unavailable' ? (
        <div className="stack">
          <div className="banner banner-warn" role="status">
            <div className="banner-body">
              <strong>Unverified preview — export this design and check it locally.</strong> No recorded run matches
              these inputs, and nothing is proved or timed in this browser.
            </div>
            <button type="button" className="btn" onClick={() => exportRequest(runState.inputs)}>
              <IconDownload /> Export JSON
            </button>
          </div>
          {preview}
        </div>
      ) : null}
      <ExecutionProblems report={report} run={runState} />
      {report ? <div className="fade-in">{children(report)}</div> : null}
    </div>
  );
}

function StaleNote({ runState }: { runState: Run | undefined }) {
  const design = useAppState((s) => s.design);
  const program = useAppState((s) => s.program);
  const target = useAppState((s) => s.target);
  if (!runState?.report) return null;
  const stale = isStale({ design, program, target: program ? target : undefined }, runState.inputs);
  if (!stale) return null;
  return (
    <p className="stale-label" role="status">
      The workspace has changed since this result: it is from an earlier version of the inputs.
    </p>
  );
}

function claimOf(report: AnalysisReport | ExperimentReport, id: ClaimId) {
  return report.kind === 'analysis' ? report.claims.find((c) => c.id === id) : undefined;
}

/* ---------------- Step 1 ---------------- */

function Step1() {
  const source = useSource();
  const design = useAppState((s) => s.design);
  const program = useAppState((s) => s.program);
  const r = useStoryRun('step1');
  const onAes = design.model === 'aes-like/gf256/v1' && !isStale({ design }, { design: aesDesign(design.rounds) });
  const circuit = onAes && program && program.field === 'gf256' ? program : aesSharedSum();

  const go = () => {
    if (!onAes || !program || program.field !== 'gf256') loadInputs({ design: aesDesign(), program: aesSharedSum() });
    setHighlight([]);
    run('step1', 'experiment');
  };

  return (
    <div className="stack-lg">
      <StepHead n={1} title="Beat the reference">
        AES MixColumns multiplies each 4-byte column by a fixed matrix. The textbook circuit computes it with 15 XORs
        and 4 xtimes. A bounded search looks for cheaper circuits; each one counts only after Lean checks that it
        computes the same matrix and generated Rust passes its correctness cases. Then both are timed on this machine.
      </StepHead>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={go} disabled={isActive(r)}>
          <IconPlay size={12} /> {source === 'live' ? 'Run quick search' : 'Replay the recorded search'}
        </button>
        <span className="small muted">
          {source === 'live'
            ? 'Quick profile: a short search, Lean equivalence proofs, native correctness and timing on this machine.'
            : 'Shows a recorded run; nothing is searched, proved or timed in your browser.'}
        </span>
      </div>
      <div className="grid-story">
        <section className="panel" aria-label="Design matrix">
          <div className="stack">
            <MatrixView values={aesDesign().matrix} label="AES MixColumns matrix" field="gf256" />
            <p className="small muted">
              y = M·x over GF(2⁸) with x⁸ + x⁴ + x³ + x + 1; xtime(a) is multiplication by 02.
            </p>
          </div>
        </section>
        <CircuitEditor
          program={circuit}
          onChange={(p) => {
            if (!onAes) loadInputs({ design: aesDesign(), program: p });
            else setProgram(p);
          }}
          designWidth={4}
          compact
        />
      </div>
      <StaleNote runState={r} />
      <RunArea runState={r}>
        {(report) =>
          report.kind === 'experiment' ? (
            <div className="stack-lg">
              <section className="panel" aria-label="What changed">
                <SavingsCallout report={report} />
              </section>
              <section className="panel" aria-labelledby="s1-cands">
                <div className="panel-head">
                  <h3 id="s1-cands">Candidates</h3>
                  <button type="button" className="btn btn-sm btn-quiet" onClick={() => setView('experiments')}>
                    Open in Experiments
                  </button>
                </div>
                <CandidatesTable report={report} limit={8} />
              </section>
              <section className="panel" aria-label="Measurements">
                <MeasurementSection report={report} />
              </section>
            </div>
          ) : null
        }
      </RunArea>
    </div>
  );
}

/* ---------------- Step 2 ---------------- */

function Step2() {
  const source = useSource();
  const program = useAppState((s) => s.program);
  const design = useAppState((s) => s.design);
  const story = useAppState((s) => s.story);
  const r = useStoryRun('step2');
  const loaded =
    design.model === 'aes-like/gf256/v1' &&
    !isStale({ design }, { design: aesDesign(design.rounds) }) &&
    program !== null &&
    program.field === 'gf256' &&
    program.instructions.length === aesSharedSum().instructions.length;
  const current: Program = loaded && program ? program : aesSharedSum();
  const xtimeReg = current.width + WIRE_STEP_XTIME;
  const before = expressionOf(aesSharedSum(), aesSharedSum().width + WIRE_STEP_XTIME);
  const after = expressionOf(miswiredSharedSum(), miswiredSharedSum().width + WIRE_STEP_XTIME);
  const report = r?.report && r.report.kind === 'analysis' ? (r.report as AnalysisReport) : null;
  const claim = report ? claimOf(report, 'circuit.equivalence') : undefined;
  const witness = claim?.witness && claim.witness.kind === 'distinguishing-input' ? claim.witness : null;
  const preview = useMemo(
    () => (r?.state === 'unavailable' ? previewEquivalence(aesDesign(), miswiredSharedSum()) : null),
    [r?.state],
  );
  const previewWitness = preview?.witness && preview.witness.kind === 'distinguishing-input' ? preview.witness : null;
  const shown = witness ?? previewWitness;

  const load = () => {
    loadInputs({ design: aesDesign(), program: aesSharedSum() });
    setHighlight([WIRE_STEP_INSTRUCTION, WIRE_STEP_XTIME]);
    updateStory({ rewired: false, prediction: null, revealed: false });
    setStoryRun('step2', null);
  };

  const rewire = () => {
    const base = loaded && program ? program : aesSharedSum();
    if (!loaded) loadInputs({ design: aesDesign(), program: base });
    setProgram(miswiredSharedSum(base));
    setHighlight([WIRE_STEP_INSTRUCTION, WIRE_STEP_XTIME]);
    updateStory({ rewired: true, prediction: null, revealed: false });
    run('step2', 'analysis');
  };

  const predicted = story.prediction;
  const ready = Boolean(shown) && predicted !== null;

  return (
    <div className="stack-lg">
      <StepHead n={2} title="One wire goes wrong">
        In the textbook circuit the first output is y0 = x0 ⊕ t ⊕ {before}. Move one wire so that it reads {after}{' '}
        instead. The circuit still looks reasonable. Does it still compute MixColumns?
      </StepHead>
      <div className="row">
        <button type="button" className="btn" onClick={load}>
          {loaded ? <IconRefresh size={14} /> : null}{' '}
          {loaded ? 'Reset to the textbook circuit' : 'Load the textbook circuit'}
        </button>
        <button type="button" className="btn btn-primary" onClick={rewire} disabled={story.rewired && isActive(r)}>
          Change {before} to {after}
        </button>
      </div>
      <CircuitEditor
        program={current}
        onChange={(p) => {
          if (!loaded) loadInputs({ design: aesDesign(), program: p });
          else setProgram(p);
        }}
        highlight={[WIRE_STEP_INSTRUCTION, WIRE_STEP_XTIME]}
        designWidth={4}
      />
      <p className="small muted">
        Highlighted: {`r${current.width + WIRE_STEP_INSTRUCTION}`} and r{xtimeReg}, which compute{' '}
        {expressionOf(current, xtimeReg)} for output y0.
      </p>

      {story.rewired ? (
        <section className="panel stack" aria-labelledby="predict-h">
          <h3 id="predict-h">Before you look: which output changes?</h3>
          <div className="predict" role="group" aria-labelledby="predict-h">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                type="button"
                className="btn"
                aria-pressed={predicted === i}
                disabled={story.revealed}
                onClick={() => updateStory({ prediction: i })}
              >
                y{i}
              </button>
            ))}
          </div>
          {r ? <RunProgress run={r} compact /> : null}
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready || story.revealed}
              onClick={() => updateStory({ revealed: true })}
            >
              Reveal the {witness ? 'checked ' : ''}witness
            </button>
            {predicted === null ? <span className="small muted">Choose an output first.</span> : null}
            {predicted !== null && !shown ? (
              <span className="small muted">
                {source === 'live' ? 'Waiting for the check to finish…' : 'Waiting for the recorded result…'}
              </span>
            ) : null}
          </div>
          {story.revealed && shown ? (
            <div className="stack fade-in">
              {predicted !== null ? (
                <p role="status">
                  <strong>
                    {shown.differing.includes(predicted)
                      ? `You predicted y${predicted}: right.`
                      : `You predicted y${predicted}; the witness shows ${shown.differing.map((d) => `y${d}`).join(', ')}.`}
                  </strong>{' '}
                  {shown.differing.length === 1 ? 'Only that output reads the moved wire.' : null}
                </p>
              ) : null}
              {claim && witness ? (
                <ClaimCard claim={claim} field="gf256" />
              ) : preview ? (
                <>
                  <p className="small">
                    This is an unchecked preview computed in your browser; no recorded run matches these inputs.
                  </p>
                  <WitnessView witness={shown} field="gf256" preview />
                </>
              ) : null}
            </div>
          ) : null}
          {r && r.state !== 'unavailable' ? <ExecutionProblems report={report} run={r} /> : null}
          {r?.state === 'completed' && report && !witness ? (
            <p className="muted small">
              This run did not report a distinguishing input for the circuit; see the workspace for every claim.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/* ---------------- Step 3 ---------------- */

function Step3() {
  const source = useSource();
  const r = useStoryRun('step3');
  const go = () => {
    loadInputs({ design: identityDesign(), program: identityProgram() });
    setHighlight([]);
    run('step3', 'analysis');
  };
  const preview = useMemo(() => {
    if (r?.state !== 'unavailable') return null;
    const items = previewDesign(identityDesign());
    const eq = previewEquivalence(identityDesign(), identityProgram());
    return [eq, items[0], items[3]].filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [r?.state]);
  return (
    <div className="stack-lg">
      <StepHead n={3} title="Perfect implementation, weak diffusion">
        Replace both the matrix and the circuit with the identity. The circuit implements its design exactly. Is the
        design still worth implementing?
      </StepHead>
      <div className="grid-2">
        <section className="panel">
          <MatrixView values={identityDesign().matrix} label="Identity matrix" field="gf256" />
        </section>
        <section className="panel stack">
          <h3 className="field-label">Identity circuit</h3>
          <p className="mono">y0 = x0, y1 = x1, y2 = x2, y3 = x3</p>
          <p className="small muted">No instructions: every output is its input.</p>
        </section>
      </div>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={go} disabled={isActive(r)}>
          <IconPlay size={12} /> Replace both with identity and {source === 'live' ? 'check' : 'replay the check'}
        </button>
      </div>
      <StaleNote runState={r} />
      <RunArea
        runState={r}
        preview={
          preview ? (
            <div className="grid-2">
              {preview.map((p) => (
                <PreviewCard key={p.id} item={p} field="gf256" />
              ))}
            </div>
          ) : null
        }
      >
        {(report) =>
          report.kind === 'analysis' ? (
            <div className="stack">
              <p className="hint">
                The implementation chain holds, the design chain does not: equivalence is proved, the matrix is not MDS,
                and without branch number 5 the activity bound is not established by this method. That is not a proof
                that the design is weak, only that this argument gives nothing.
              </p>
              <ClaimChains
                report={report}
                inputs={r!.inputs}
                only={['circuit.equivalence', 'matrix.mds', 'activity.bound', 'offsets.dispersion']}
              />
            </div>
          ) : null
        }
      </RunArea>
    </div>
  );
}

/* ---------------- Step 4 ---------------- */

function HadesResult({ slot, exponent }: { slot: string; exponent: number }) {
  const r = useStoryRun(slot);
  const preview = useMemo(() => {
    if (r?.state !== 'unavailable') return null;
    const items = previewDesign(hadesDesign(exponent));
    const eq = previewEquivalence(hadesDesign(exponent), hadesSharedSum());
    return [eq, ...items]
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .filter((x) => x.id !== 'internal.invertible');
  }, [r?.state, exponent]);
  if (!r) return null;
  return (
    <section className="stack" aria-label={`Exponent ${exponent}`}>
      <h3>x ↦ x^{exponent}</h3>
      <RunArea
        runState={r}
        preview={preview ? preview.map((p) => <PreviewCard key={p.id} item={p} field="bn254" />) : null}
      >
        {(report) =>
          report.kind === 'analysis' ? (
            <div className="stack">
              {(['circuit.equivalence', 'external.mds', 'sbox.bijective'] as ClaimId[]).map((id) => {
                const c = claimOf(report, id);
                return c ? <ClaimCard key={id} claim={c} field="bn254" /> : null;
              })}
            </div>
          ) : null
        }
      </RunArea>
    </section>
  );
}

function Step4() {
  const source = useSource();
  const r5 = useStoryRun('step4a');
  const r3 = useStoryRun('step4b');
  const load5 = () => {
    loadInputs({ design: hadesDesign(5), program: hadesSharedSum(), target: 'external' });
    setHighlight([]);
    run('step4a', 'analysis');
  };
  const load3 = () => {
    const s = getState();
    const base = s.design.model === 'hades/bn254/v1' ? s.design : hadesDesign(5);
    loadInputs({
      design: { ...base, sbox: { kind: 'power', exponent: 3 } },
      program: s.program ?? hadesSharedSum(),
      target: 'external',
    });
    run('step4b', 'analysis');
  };
  return (
    <div className="stack-lg">
      <StepHead n={4} title="Prime field">
        The same questions over the BN254 scalar field. A Poseidon2-style width-3 external matrix
        [[2,1,1],[1,2,1],[1,1,2]] is computed with one shared sum: s = x0 + x1 + x2, then y_i = s + x_i. The S-box is x
        ↦ x^e; it is a permutation exactly when gcd(e, p − 1) = 1.
      </StepHead>
      <div className="grid-2">
        <section className="panel">
          <MatrixView values={hadesDesign().external} label="External matrix" field="bn254" />
        </section>
        <section className="panel stack">
          <h3 className="field-label">Shared-sum circuit</h3>
          <p className="mono">s = x0 + x1 + x2; y0 = s + x0; y1 = s + x1; y2 = s + x2</p>
          <p className="small muted">5 additions, no multiplications.</p>
        </section>
      </div>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={load5} disabled={isActive(r5)}>
          <IconPlay size={12} /> Load the BN254 design and {source === 'live' ? 'check' : 'replay'} with e = 5
        </button>
        <button type="button" className="btn" onClick={load3} disabled={!r5 || isActive(r3)}>
          Try e = 3
        </button>
      </div>
      <div className="grid-2">
        <HadesResult slot="step4a" exponent={5} />
        <HadesResult slot="step4b" exponent={3} />
      </div>
    </div>
  );
}

/* ---------------- Finish ---------------- */

function Finish() {
  const runs = useAppState((s) => s.runs);
  const storyRuns = useAppState((s) => s.story.runs);
  const step1 = storyRuns.step1 ? runs[storyRuns.step1] : undefined;
  const withBundle = [step1, ...Object.values(runs).reverse()].find((x) => x?.bundleUrl && x.state === 'completed');
  return (
    <div className="stack-lg">
      <StepHead n={5} title="Take it with you">
        Every result here comes with its evidence: the inputs, the generated Lean sources and their audit lines, the
        witnesses, the generated Rust and the raw measurements. Anyone can check a bundle again with{' '}
        <code>cryptificate verify</code>, which regenerates the proofs from the inputs instead of trusting them.
      </StepHead>
      <div className="row">
        {withBundle?.bundleUrl ? (
          <a className="btn btn-primary" href={withBundle.bundleUrl} download>
            <IconDownload /> Download this experiment
          </a>
        ) : (
          <button type="button" className="btn btn-primary" aria-disabled="true" title="Run step 1 first">
            <IconDownload /> Download this experiment
          </button>
        )}
        <button type="button" className="btn" onClick={() => setView('workspace')}>
          Open the full workspace
        </button>
      </div>
      {!withBundle ? <p className="small muted">No bundle yet: run step 1 to produce one.</p> : null}
      <ul className="stack" style={{ paddingLeft: 18, margin: 0 }}>
        <li>Fewer operations count only after Lean checks the circuit against the matrix.</li>
        <li>A wrong wire produces a concrete input that tells the circuits apart.</li>
        <li>A correct implementation of a weak design keeps no diffusion promise.</li>
        <li>In a prime field, the S-box exponent decides whether the round is a permutation.</li>
      </ul>
    </div>
  );
}

export function StoryView() {
  const step = useAppState((s) => s.storyStep);
  const go = (n: number) => {
    setStoryStep(n);
    window.location.hash = `#/story/${n}`;
    window.setTimeout(() => document.getElementById('story-step-title')?.focus(), 0);
  };
  return (
    <div className="story">
      <nav className="story-nav" aria-label="Story steps">
        <h1 style={{ fontSize: '1.15rem' }}>Save operations. Keep the promise.</h1>
        <ol>
          {STEPS.map((s) => (
            <li key={s.n}>
              <button type="button" aria-current={step === s.n ? 'step' : undefined} onClick={() => go(s.n)}>
                <span className="story-num">{s.n <= 4 ? s.n : '✓'}</span>
                <span>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-sm" disabled={step <= 1} onClick={() => go(step - 1)}>
            Previous
          </button>
          <button type="button" className="btn btn-sm" disabled={step >= 5} onClick={() => go(step + 1)}>
            Next
          </button>
        </div>
      </nav>
      <div>
        {step === 1 ? <Step1 /> : null}
        {step === 2 ? <Step2 /> : null}
        {step === 3 ? <Step3 /> : null}
        {step === 4 ? <Step4 /> : null}
        {step === 5 ? <Finish /> : null}
      </div>
    </div>
  );
}
