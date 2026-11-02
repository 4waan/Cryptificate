import { appShortcut, historyShortcut, isTextField, keepsNativeUndo, type KeyLike, type TargetLike } from '../lib/shortcuts';
import {
  activeRunKey,
  announce,
  canCheck,
  checkNow,
  inputProblems,
  redo,
  runIsActive,
  setOverlay,
  startRun,
  stopRun,
  undo,
} from './actions';
import { getState, workspaceInputs, type View } from './store';

export interface KeyEventLike extends KeyLike {
  code?: string;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  preventDefault(): void;
}

/**
 * The workbench-wide key handler (installed on window by App). An open
 * overlay (help, palette, Alerts popover) owns Escape: it closes the
 * overlay and never stops a run.
 */
export function handleAppKey(e: KeyEventLike, focused: TargetLike | null, go: (view: View) => void): void {
  if (e.defaultPrevented || e.isComposing) return;
  const s = getState();
  const shortcut = appShortcut(e, isTextField(focused));
  if (shortcut === 'palette') {
    e.preventDefault();
    setOverlay(s.overlay === 'palette' ? null : 'palette');
    return;
  }
  if (s.overlay) {
    // The dialogs handle their own keys; the Alerts popover is closed here
    // when Escape arrives while focus is outside it.
    if (s.overlay === 'alerts' && e.key === 'Escape') {
      e.preventDefault();
      setOverlay(null);
    }
    return;
  }
  if (shortcut === 'help') {
    e.preventDefault();
    setOverlay('help');
    return;
  }
  if (shortcut === 'stop') {
    const key = activeRunKey(s);
    if (key) {
      e.preventDefault();
      void stopRun(key);
      announce('Stopping the running job.');
    }
    return;
  }
  if (shortcut === 'check' || shortcut === 'experiment') {
    if (s.view === 'story') return;
    e.preventDefault();
    if (inputProblems(workspaceInputs(s)).length) {
      announce('Fix the input problems before checking.');
      return;
    }
    if (shortcut === 'check') {
      if (canCheck(s)) checkNow();
      else announce('These inputs are being checked already.');
    } else {
      const ex = s.current.experiment ? s.runs[s.current.experiment] : undefined;
      if (runIsActive(ex)) announce('An experiment is already running.');
      else startRun('experiment', 'quick');
    }
    return;
  }
  const history = historyShortcut(e);
  if (history && s.view === 'workspace' && !keepsNativeUndo(focused)) {
    e.preventDefault();
    if (history === 'undo') undo();
    else redo();
    return;
  }
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
  const target = ({ KeyS: 'story', KeyW: 'workspace', KeyE: 'experiments' } as Record<string, View>)[e.code ?? ''];
  if (target) {
    e.preventDefault();
    go(target);
  }
}
