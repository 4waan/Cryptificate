import { useEffect, useId, useRef, useState } from 'react';
import { notifyPermission, type NotifyPermission } from '../lib/signals';
import { useNow } from '../lib/useNow';
import { setOverlay, setPrefs } from '../state/actions';
import { enableNotifications } from '../state/signals';
import { getState, useAppState, type AutoStatus } from '../state/store';
import { IconBell } from './icons';

/** What auto-check is doing, in words. */
export function autoStatusText(on: boolean, auto: AutoStatus, now: number, source: 'live' | 'replay'): string {
  if (!on || auto.kind === 'off') return source === 'live' ? 'Checks 1.2 s after you stop editing.' : 'Looks up a recorded check 1.2 s after you stop editing.';
  switch (auto.kind) {
    case 'scheduled':
      return auto.at - now > 1500 ? 'Waiting before the next check…' : 'Checking when you pause…';
    case 'checking':
      return 'Checking these inputs…';
    case 'idle':
      return auto.reason;
  }
}

/** The opt-in auto-check switch and its status. Saved in this browser. */
export function AutoCheckSwitch({ source }: { source: 'live' | 'replay' }) {
  const id = useId();
  const on = useAppState((s) => s.prefs.autoCheck);
  const auto = useAppState((s) => s.auto);
  const now = useNow(auto.kind === 'scheduled', 500);
  return (
    <div className="auto">
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={on}
        aria-describedby={`${id}-status`}
        onClick={() => setPrefs({ autoCheck: !on })}
      >
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        Auto-check
      </button>
      <span id={`${id}-status`} className="auto-status small muted" data-kind={on ? auto.kind : 'off'}>
        {autoStatusText(on, auto, now, source)}
      </span>
    </div>
  );
}

const PERMISSION_TEXT: Record<NotifyPermission, string> = {
  default: 'The browser asks for permission the first time.',
  granted: 'Allowed in this browser.',
  denied: 'Blocked in this browser’s site settings.',
  unsupported: 'This browser does not support notifications here.',
};

/** The first control a keyboard user can reach in a container: an enabled input or a button. */
export const FIRST_FOCUSABLE = 'input:not(:disabled), button:not(:disabled)';

/**
 * Completion alerts: tab title (always), desktop notification and tone (both opt-in).
 * Open state lives in the store as the 'alerts' overlay, so the window key
 * handler leaves Escape to the popover and never stops a run with it.
 */
export function AlertsMenu() {
  const id = useId();
  const prefs = useAppState((s) => s.prefs);
  const open = useAppState((s) => s.overlay === 'alerts');
  const [permission, setPermission] = useState<NotifyPermission>(() => notifyPermission());
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPermission(notifyPermission());
    // With notifications blocked the first checkbox is disabled: focus the tone switch instead.
    panel.current?.querySelector<HTMLElement>(FIRST_FOCUSABLE)?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOverlay(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Leaving the view with the popover open must not leave the overlay set.
  useEffect(
    () => () => {
      if (getState().overlay === 'alerts') setOverlay(null);
    },
    [],
  );

  const close = () => {
    setOverlay(null);
    button.current?.focus();
  };

  const toggleNotify = async (checked: boolean) => {
    if (!checked) return setPrefs({ notify: false });
    const result = await enableNotifications();
    setPermission(result);
    setPrefs({ notify: result === 'granted' });
  };

  const count = Number(prefs.notify) + Number(prefs.sound);
  return (
    <div
      ref={wrap}
      className="menu-wrap"
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      onBlur={(e) => {
        // Tabbing out of the button and popover closes it.
        const next = e.relatedTarget as Node | null;
        if (open && next && !wrap.current?.contains(next)) setOverlay(null);
      }}
    >
      <button
        ref={button}
        type="button"
        className="btn btn-sm btn-quiet"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOverlay(open ? null : 'alerts')}
      >
        <IconBell size={14} /> Alerts{count ? <span className="muted"> ({count} on)</span> : null}
      </button>
      {open ? (
        <div
          ref={panel}
          id={`${id}-panel`}
          className="popover"
          role="group"
          aria-label="When a run finishes"
        >
          <p className="popover-title">When a run finishes</p>
          <p className="small muted">The tab title shows ✓ Done or ✕ Stopped while you are in another tab.</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={prefs.notify && permission === 'granted'}
              disabled={permission === 'unsupported' || permission === 'denied'}
              onChange={(e) => void toggleNotify(e.target.checked)}
              aria-describedby={`${id}-perm`}
            />
            <span>
              Desktop notification when the page is in the background
              <span id={`${id}-perm`} className="small muted block">
                {PERMISSION_TEXT[permission]}
              </span>
            </span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} />
            <span>Play a short, quiet tone</span>
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm" onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
