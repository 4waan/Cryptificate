import { useEffect, useId, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { isMacPlatform } from '../lib/shortcuts';
import type { FieldName } from '../lib/types';
import { makeShareLink, redo, undo } from '../state/actions';
import { useAppState } from '../state/store';
import { IconLink, IconRedo, IconUndo } from './icons';
import { PresetPicker } from './PresetPicker';

function modKey(): string {
  return typeof navigator !== 'undefined' && isMacPlatform(navigator.platform ?? '') ? '⌘' : 'Ctrl';
}

function ShareLinkButton({ disabled, reason }: { disabled: boolean; reason?: string }) {
  const id = useId();
  const [status, setStatus] = useState<string>('');
  const [manual, setManual] = useState<string | null>(null);
  const manualRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (manual) manualRef.current?.select();
  }, [manual]);

  const share = async () => {
    setStatus('');
    setManual(null);
    try {
      const url = await makeShareLink();
      if (await copyText(url)) {
        setStatus(`Link copied (${url.length.toLocaleString('en')} characters). The design travels inside the link.`);
      } else {
        setManual(url);
        setStatus('Copy this link:');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'The link could not be made.');
    }
  };

  return (
    <div className="share">
      <button
        type="button"
        className="btn btn-sm"
        disabled={disabled}
        title={disabled ? undefined : 'Copy a link that opens this design and circuit'}
        aria-describedby={`${id}-status`}
        onClick={() => void share()}
      >
        <IconLink size={14} /> Copy share link
      </button>
      <span id={`${id}-status`} className="small muted share-status" role="status">
        {disabled ? reason : status}
      </span>
      {manual ? (
        <input
          ref={manualRef}
          className="input share-url"
          readOnly
          value={manual}
          aria-label="Share link"
          data-native-undo=""
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
    </div>
  );
}

/** Presets, undo/redo, share link and the save status, above the workspace editors. */
export function WorkspaceToolbar({ field, problems }: { field: FieldName; problems: number }) {
  const canUndo = useAppState((s) => s.history.past.length > 0);
  const canRedo = useAppState((s) => s.history.future.length > 0);
  const storage = useAppState((s) => s.storage);
  const mod = modKey();
  return (
    <div className="toolbar" role="region" aria-label="Workspace tools">
      <PresetPicker field={field} />
      <div className="toolbar-group" role="group" aria-label="History">
        <button
          type="button"
          className="btn btn-sm"
          disabled={!canUndo}
          onClick={() => undo()}
          aria-keyshortcuts="Control+Z Meta+Z"
          title={`Undo (${mod}+Z)`}
        >
          <IconUndo size={14} /> Undo
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!canRedo}
          onClick={() => redo()}
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
          title={`Redo (Shift+${mod}+Z)`}
        >
          <IconRedo size={14} /> Redo
        </button>
      </div>
      <ShareLinkButton disabled={problems > 0} reason="Fix the input problems to share this design." />
      <span className="toolbar-status small muted">
        {storage === 'unavailable'
          ? 'Not saved: this browser blocks local storage.'
          : storage === 'saved'
            ? 'Saved in this browser.'
            : 'Changes are saved in this browser.'}
      </span>
    </div>
  );
}
