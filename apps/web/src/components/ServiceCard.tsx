import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import { secondsUntil } from '../lib/retry';
import { useNow } from '../lib/useNow';
import { checkConnection } from '../state/actions';
import type { AppState } from '../state/store';
import { IconCopy, IconRefresh, IconTerminal } from './icons';

export const START_COMMAND = 'npm start';

/** The reconnect line: "Next try in 4 s" or "Trying now…". */
export function reconnectText(connection: AppState['connection'], now: number): string {
  if (connection.status === 'checking') return 'Trying to reach the service now…';
  if (connection.nextAttemptAt === undefined) return 'Reconnects automatically.';
  return `Reconnects automatically; next try in ${secondsUntil(connection.nextAttemptAt, now)} s.`;
}

/**
 * Shown while the local service does not answer: how to start it, with a
 * copy button, and the automatic reconnect countdown. Until it is back,
 * results come from recorded runs and the in-browser preview.
 */
export function ServiceCard({ connection, now: fixedNow }: { connection: AppState['connection']; now?: number }) {
  const [copied, setCopied] = useState<string>('');
  const clock = useNow(fixedNow === undefined && connection.status === 'unreachable', 1000);
  const now = fixedNow ?? clock;
  return (
    <section className="service-card" aria-labelledby="service-card-title">
      <div className="service-card-head">
        <IconTerminal size={18} />
        <h2 id="service-card-title">The local service is not running</h2>
      </div>
      <p className="small">
        Lean checks, experiments and native timing run on this machine through the Cryptificate service. Start it from
        the repository root:
      </p>
      <div className="command">
        <code className="mono" aria-label="Command">
          <span aria-hidden="true" className="muted prompt">$</span>
          {START_COMMAND}
        </code>
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            setCopied((await copyText(START_COMMAND)) ? 'Copied.' : 'Select the command and copy it.');
          }}
        >
          <IconCopy size={14} /> Copy
        </button>
        <span className="small muted" role="status">
          {copied}
        </span>
      </div>
      <p className="small muted">
        The first run installs the pinned Lean toolchain and the engine; later runs start in seconds. Already installed?{' '}
        <code className="mono">npx cryptificate serve</code> starts the service alone.
      </p>
      <div className="row service-card-foot">
        <span className="small service-card-state" data-status={connection.status}>
          <span className="conn-dot" aria-hidden="true" />
          <span>
            {connection.status === 'checking' ? null : <strong>Not connected. </strong>}
            <span className={connection.status === 'checking' ? undefined : 'muted'}>{reconnectText(connection, now)}</span>
          </span>
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={connection.status === 'checking'}
          onClick={() => void checkConnection()}
        >
          <IconRefresh size={12} /> Try now
        </button>
      </div>
      <p className="small muted">Meanwhile the page shows recorded runs and the instant preview, never as proofs.</p>
    </section>
  );
}
