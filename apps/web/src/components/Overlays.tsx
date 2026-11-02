import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { filterCommands, type Command } from '../lib/commands';
import { FIELD_LABELS, KIND_LABELS, PRESETS } from '../lib/library';
import { isMacPlatform } from '../lib/shortcuts';
import {
  activeRunKey,
  announce,
  applyPreset,
  canCheck,
  checkNow,
  inputProblems,
  makeShareLink,
  redo,
  setOverlay,
  setPrefs,
  setStoryStep,
  startRun,
  stopRun,
  undo,
} from '../state/actions';
import { getState, useAppState, workspaceInputs, type AppState, type Theme } from '../state/store';
import { IconKeyboard, IconSearch } from './icons';
import { exportRequest } from './ResultsPanel';

export function modLabel(): string {
  return typeof navigator !== 'undefined' && isMacPlatform(navigator.platform ?? '') ? '⌘' : 'Ctrl';
}

/** A modal native dialog that opens when mounted and returns focus to where it was on close. */
function Modal({
  labelledBy,
  className,
  onClose,
  children,
  initialFocus,
}: {
  labelledBy: string;
  className: string;
  onClose: () => void;
  children: React.ReactNode;
  initialFocus?: React.RefObject<HTMLElement>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    initialFocus?.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      if (before && document.contains(before)) before.focus();
    };
  }, [initialFocus]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        // A click on the backdrop (the dialog element itself, outside its content) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export interface ShortcutRow {
  keys: string[][];
  what: string;
}

export function shortcutRows(mod: string): { group: string; rows: ShortcutRow[] }[] {
  return [
    {
      group: 'Run',
      rows: [
        { keys: [[mod, 'Enter']], what: 'Check the design and circuit (also from inside a field)' },
        { keys: [[mod, 'Shift', 'Enter']], what: 'Run a quick experiment' },
        { keys: [['Esc']], what: 'Stop the running check or experiment (outside text fields)' },
      ],
    },
    {
      group: 'Find',
      rows: [
        { keys: [[mod, 'K']], what: 'Command palette: views, presets, theme, export' },
        { keys: [['?']], what: 'This list of shortcuts' },
      ],
    },
    {
      group: 'Edit',
      rows: [
        { keys: [[mod, 'Z']], what: 'Undo a workspace edit' },
        { keys: [['Shift', mod, 'Z']], what: 'Redo' },
        { keys: [['←'], ['↑'], ['→'], ['↓']], what: 'Move between matrix cells' },
      ],
    },
    {
      group: 'Go to',
      rows: [
        { keys: [['Alt', 'Shift', 'S']], what: 'Guided story' },
        { keys: [['Alt', 'Shift', 'W']], what: 'Workspace' },
        { keys: [['Alt', 'Shift', 'E']], what: 'Experiments' },
      ],
    },
  ];
}

export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="keys">
      {keys.map((k, i) => (
        <span key={i}>
          {i ? <span aria-hidden="true">+</span> : null}
          <kbd>{k}</kbd>
        </span>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const mod = modLabel();
  return (
    <Modal labelledBy={`${id}-title`} className="dialog-help" onClose={onClose} initialFocus={closeRef}>
      <div className="dialog-head">
        <h2 id={`${id}-title`}>
          <IconKeyboard size={16} /> Keyboard shortcuts
        </h2>
        <button ref={closeRef} type="button" className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="dialog-body shortcut-groups">
        {shortcutRows(mod).map((g) => (
          <section key={g.group} aria-label={g.group}>
            <h3 className="field-label">{g.group}</h3>
            <dl className="shortcut-list">
              {g.rows.map((r) => (
                <div key={r.what} className="shortcut">
                  <dt>
                    {r.keys.map((k, i) => (
                      <span key={i}>
                        {i ? ' ' : null}
                        <Keys keys={k} />
                      </span>
                    ))}
                  </dt>
                  <dd>{r.what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="dialog-foot small muted">
        Shortcuts without {mod} never fire while you type in a field. Press <kbd>Esc</kbd> to close.
      </p>
    </Modal>
  );
}

const KIND_ONE = { design: 'Design', matrix: 'Matrix', sbox: 'S-box', circuit: 'Circuit' } as const;
const STORY_STEPS = ['Beat the reference', 'One wire goes wrong', 'Perfect implementation, weak diffusion', 'Prime field'];
const THEME_TEXT: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'Follow the system' };

function go(hash: string) {
  window.location.hash = hash;
  window.setTimeout(() => document.getElementById('main')?.focus(), 0);
}

/** Everything the palette offers, given the current state. */
export function appCommands(s: AppState, ctx: { setTheme(t: Theme): void; mod: string }): Command[] {
  const inputs = workspaceInputs(s);
  const problems = inputProblems(inputs).length;
  const fix = problems ? 'Fix the input problems first.' : undefined;
  const running = activeRunKey(s);
  const analysis = s.current.analysis ? s.runs[s.current.analysis] : undefined;
  const experiment = s.current.experiment ? s.runs[s.current.experiment] : undefined;
  const bundle = analysis?.bundleUrl && analysis.state === 'completed' ? analysis.bundleUrl : undefined;
  const cmds: Command[] = [
    {
      id: 'run.check',
      group: 'Run',
      label: 'Check design and circuit',
      keywords: 'lean verify prove analysis',
      shortcut: `${ctx.mod}+Enter`,
      disabled: fix ?? (canCheck(s) ? undefined : 'These inputs are being checked already.'),
      run: () => {
        checkNow();
        if (s.view !== 'workspace') go('#/workspace');
      },
    },
    {
      id: 'run.experiment',
      group: 'Run',
      label: 'Run quick experiment',
      keywords: 'search timing benchmark candidates',
      shortcut: `${ctx.mod}+Shift+Enter`,
      disabled: fix ?? (experiment && ['submitting', 'retrying', 'queued', 'running'].includes(experiment.state) ? 'An experiment is running.' : undefined),
      run: () => {
        startRun('experiment', 'quick');
      },
    },
    {
      id: 'run.stop',
      group: 'Run',
      label: 'Stop the running job',
      keywords: 'cancel abort',
      shortcut: 'Esc',
      disabled: running ? undefined : 'Nothing is running.',
      run: () => {
        if (running) void stopRun(running);
      },
    },
    {
      id: 'run.auto',
      group: 'Run',
      label: s.prefs.autoCheck ? 'Turn auto-check off' : 'Turn auto-check on',
      keywords: 'automatic live continuous',
      run: () => {
        setPrefs({ autoCheck: !s.prefs.autoCheck });
        announce(s.prefs.autoCheck ? 'Auto-check is off.' : 'Auto-check is on.');
      },
    },
    { id: 'go.story', group: 'Go to', label: 'Guided story', keywords: 'tour steps', shortcut: 'Alt+Shift+S', run: () => go(`#/story/${s.storyStep}`) },
    { id: 'go.workspace', group: 'Go to', label: 'Workspace', keywords: 'editor design circuit', shortcut: 'Alt+Shift+W', run: () => go('#/workspace') },
    { id: 'go.experiments', group: 'Go to', label: 'Experiments', keywords: 'search timing', shortcut: 'Alt+Shift+E', run: () => go('#/experiments') },
    { id: 'go.results', group: 'Go to', label: 'Results', keywords: 'claims evidence', run: () => {
      if (s.view !== 'workspace') go('#/workspace');
      window.setTimeout(() => document.getElementById('results-heading')?.scrollIntoView({ block: 'start' }), 0);
    } },
    ...STORY_STEPS.map((title, i) => ({
      id: `go.story.${i + 1}`,
      group: 'Go to',
      label: `Story step ${i + 1}: ${title}`,
      keywords: 'guided',
      run: () => {
        setStoryStep(i + 1);
        go(`#/story/${i + 1}`);
      },
    })),
    ...PRESETS.map((p) => ({
      id: `preset.${p.id}`,
      group: 'Presets',
      label: `Load ${p.label}`,
      detail: `${KIND_ONE[p.kind]} · ${FIELD_LABELS[p.field]}${p.weak ? ' · deliberately weak' : ''}`,
      keywords: `${KIND_LABELS[p.kind]} ${FIELD_LABELS[p.field]} ${p.family} ${p.tags.join(' ')}`,
      run: () => {
        applyPreset(p);
        if (s.view !== 'workspace') go('#/workspace');
      },
    })),
    ...(['light', 'dark', 'system'] as Theme[]).map((t) => ({
      id: `theme.${t}`,
      group: 'Theme',
      label: `Theme: ${THEME_TEXT[t]}${s.theme === t ? ' (current)' : ''}`,
      keywords: 'appearance colour color mode',
      run: () => ctx.setTheme(t),
    })),
    {
      id: 'export.json',
      group: 'Export',
      label: 'Export the request as JSON',
      keywords: 'download save file',
      disabled: fix,
      run: () => exportRequest(inputs),
    },
    {
      id: 'export.share',
      group: 'Export',
      label: 'Copy share link',
      keywords: 'url link clipboard',
      disabled: problems ? 'Fix the input problems to share this design.' : undefined,
      run: () => {
        void makeShareLink()
          .then((url) => copyText(url))
          .then((ok) => announce(ok ? 'Share link copied.' : 'The link could not be copied; use Copy share link in the workspace.'));
      },
    },
    {
      id: 'export.bundle',
      group: 'Export',
      label: 'Download the evidence bundle',
      keywords: 'tar gz verify',
      disabled: bundle ? undefined : 'No finished check with a bundle yet.',
      run: () => {
        if (!bundle) return;
        const a = document.createElement('a');
        a.href = bundle;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
    },
    { id: 'edit.undo', group: 'Edit', label: 'Undo', shortcut: `${ctx.mod}+Z`, disabled: s.history.past.length ? undefined : 'Nothing to undo.', run: () => void undo() },
    { id: 'edit.redo', group: 'Edit', label: 'Redo', shortcut: `Shift+${ctx.mod}+Z`, disabled: s.history.future.length ? undefined : 'Nothing to redo.', run: () => void redo() },
    { id: 'help.shortcuts', group: 'Help', label: 'Keyboard shortcuts', keywords: 'keys help', shortcut: '?', run: () => setOverlay('help') },
  ];
  return cmds;
}

const MAX_SHOWN = 60;

export function CommandPalette({ onClose, setTheme }: { onClose: () => void; setTheme: (t: Theme) => void }) {
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [why, setWhy] = useState('');
  // Commands reflect the state when the palette opened.
  const commands = useMemo(() => appCommands(getState(), { setTheme, mod: modLabel() }), [setTheme]);
  const view = useAppState((s) => s.view);
  const shown = useMemo(() => filterCommands(query, commands).slice(0, MAX_SHOWN), [query, commands]);
  const current = shown[Math.min(active, shown.length - 1)];

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, shown]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    if (c.disabled) {
      setWhy(`${c.label}: ${c.disabled}`);
      return;
    }
    // Story steps change the view; the palette closes first so focus can move.
    onClose();
    window.setTimeout(() => c.run(), 0);
  };

  return (
    <Modal labelledBy={`${id}-title`} className="dialog-palette" onClose={onClose} initialFocus={input}>
      <h2 id={`${id}-title`} className="visually-hidden">
        Command palette
      </h2>
      <div className="palette-search">
        <IconSearch size={16} />
        <input
          ref={input}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current ? `${id}-${current.id}` : undefined}
          aria-describedby={`${id}-why`}
          placeholder={`Type a command (${view === 'workspace' ? 'check, preset, theme, export…' : 'workspace, story, theme…'})`}
          aria-label="Command"
          autoComplete="off"
          spellCheck={false}
          data-native-undo=""
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setWhy('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!shown.length) return;
              const d = e.key === 'ArrowDown' ? 1 : -1;
              setActive((a) => (Math.min(a, shown.length - 1) + d + shown.length) % shown.length);
            } else if (e.key === 'Home' && e.ctrlKey) {
              setActive(0);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(current);
            }
          }}
        />
        <kbd className="palette-esc">Esc</kbd>
      </div>
      <ul ref={list} id={listId} className="palette-list" role="listbox" aria-label="Commands">
        {shown.map((c, i) => (
          <li
            key={c.id}
            id={`${id}-${c.id}`}
            role="option"
            aria-selected={c === current}
            aria-disabled={c.disabled ? true : undefined}
            className="palette-option"
            onMouseMove={() => setActive(i)}
            onClick={() => run(c)}
          >
            <span className="palette-group">{c.group}</span>
            <span className="palette-label">{c.label}</span>
            {c.disabled || c.detail ? <span className="palette-note">{c.disabled ?? c.detail}</span> : null}
            {c.shortcut ? <kbd className="palette-key">{c.shortcut}</kbd> : null}
          </li>
        ))}
      </ul>
      {shown.length ? null : <p className="palette-empty">No command matches “{query}”.</p>}
      <p id={`${id}-why`} className="palette-foot small muted" role="status">
        {why || '↑ ↓ to move, Enter to run, Esc to close.'}
      </p>
    </Modal>
  );
}
