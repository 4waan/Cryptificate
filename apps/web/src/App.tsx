import { useCallback, useEffect, useMemo } from 'react';
import { Announcer } from './components/Announcer';
import { Header, type DisplayOrigin } from './components/Header';
import { CommandPalette, ShortcutsDialog } from './components/Overlays';
import { isStale } from './lib/canonical';
import { parseHash } from './lib/route';
import { titleWithMark } from './lib/signals';
import {
  activeRunKey,
  checkConnection,
  openShareLink,
  restorePrefs,
  setOverlay,
  setStoryStep,
  setView,
  startAutoCheck,
} from './state/actions';
import { handleAppKey } from './state/keys';
import { startSignals } from './state/signals';
import {
  dataSource,
  isTimingStep,
  setState,
  useAppState,
  type AppState,
  type Run,
  type Theme,
} from './state/store';
import { ExperimentsView } from './views/ExperimentsView';
import { StoryView } from './views/StoryView';
import { WorkspaceView } from './views/WorkspaceView';

const THEME_KEY = 'cryptificate.theme';

function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' || t === 'system' ? t : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    // Dark is the default, so "system" is stored explicitly to survive a reload.
    if (theme === 'dark') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage may be unavailable; the theme still applies for this visit.
  }
}

export { parseHash };

function displayedRun(s: AppState): Run | undefined {
  const key =
    s.view === 'workspace'
      ? s.current.analysis
      : s.view === 'experiments'
        ? s.current.experiment
        : s.storyStep === 1 || s.storyStep === 5
          ? s.story.runs.step1
          : s.storyStep === 4
            ? (s.story.runs.step4b ?? s.story.runs.step4a)
            : s.story.runs[`step${s.storyStep}`];
  return key ? s.runs[key] : undefined;
}

function originOf(s: AppState, run: Run | undefined): DisplayOrigin {
  if (!run) return dataSource(s) === 'live' ? 'none-live' : 'none-replay';
  if (run.state === 'unavailable') return 'preview';
  const stale = isStale({ design: s.design, program: s.program, target: s.program ? s.target : undefined }, run.inputs);
  if (run.source === 'replay' && stale && s.view !== 'story') return 'preview';
  const origin = run.report?.provenance?.origin;
  if (origin === 'cached') return 'cached';
  if (origin === 'recorded' || run.source === 'replay') return 'recorded';
  return 'live';
}

export function App() {
  const view = useAppState((s) => s.view);
  const theme = useAppState((s) => s.theme);
  const connection = useAppState((s) => s.connection);
  const origin = useAppState((s) => originOf(s, displayedRun(s)));
  const quiet = useAppState((s) => Object.values(s.runs).some(isTimingStep));
  const stale = useAppState((s) => {
    const run = displayedRun(s);
    if (!run?.report || s.view === 'story') return false;
    return isStale({ design: s.design, program: s.program, target: s.program ? s.target : undefined }, run.inputs);
  });

  useEffect(() => {
    const t = readTheme();
    setState({ theme: t });
    applyTheme(t);
    const sync = () => {
      const { view: v, step, share } = parseHash(window.location.hash);
      if (share) {
        // Drop the token from the address so a reload does not load it over later edits.
        window.history.replaceState(null, '', '#/workspace');
        void openShareLink(share);
      }
      setView(v);
      if (step) setStoryStep(step);
    };
    sync();
    window.addEventListener('hashchange', sync);
    void checkConnection();
    restorePrefs();
    const stopSignals = startSignals();
    const stopAuto = startAutoCheck();
    const onKey = (e: KeyboardEvent) =>
      handleAppKey(e, document.activeElement as HTMLElement | null, (target) => {
        window.location.hash = `#/${target}`;
        window.setTimeout(() => document.getElementById('main')?.focus(), 0);
      });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('keydown', onKey);
      stopSignals();
      stopAuto();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.quiet = quiet ? 'true' : 'false';
  }, [quiet]);

  const title = useMemo(
    () => ({ story: 'Guided story', workspace: 'Workspace', experiments: 'Experiments' })[view],
    [view],
  );
  const running = useAppState((s) => activeRunKey(s) !== undefined);
  const attention = useAppState((s) => s.attention);
  const overlay = useAppState((s) => s.overlay);
  useEffect(() => {
    document.title = titleWithMark(`${title} · Cryptificate`, running ? 'running' : attention);
  }, [title, running, attention]);
  const changeTheme = useCallback((t: Theme) => {
    setState({ theme: t });
    applyTheme(t);
  }, []);
  const closeOverlay = useCallback(() => setOverlay(null), []);

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <Header
        view={view}
        origin={origin}
        stale={stale}
        connection={connection}
        theme={theme}
        onTheme={changeTheme}
      />
      <main id="main" className="main" tabIndex={-1} style={{ outline: 'none' }}>
        {view === 'story' ? <StoryView /> : null}
        {view === 'workspace' ? <WorkspaceView /> : null}
        {view === 'experiments' ? <ExperimentsView /> : null}
      </main>
      <Announcer />
      <footer className="footer">
        Cryptificate checks circuits and diffusion claims with Lean on top of the WideTrail library, and measures
        generated Rust on your machine. Results describe the inputs shown; timings describe the machine that ran them.
        {quiet ? <span> Native timing in progress: animations are paused.</span> : null}{' '}
        <button type="button" className="linklike" onClick={() => setOverlay('help')} aria-keyshortcuts="?">
          Keyboard shortcuts (?)
        </button>
      </footer>
      {overlay === 'help' ? <ShortcutsDialog onClose={closeOverlay} /> : null}
      {overlay === 'palette' ? <CommandPalette onClose={closeOverlay} setTheme={changeTheme} /> : null}
    </div>
  );
}
