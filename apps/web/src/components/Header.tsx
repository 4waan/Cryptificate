import { checkConnection } from '../state/actions';
import type { AppState, Theme, View } from '../state/store';
import { IconAuto, IconCached, IconLive, IconMoon, IconPreview, IconRecorded, IconRefresh, IconSun } from './icons';

export type DisplayOrigin = 'live' | 'cached' | 'recorded' | 'preview' | 'none-live' | 'none-replay';

const ORIGIN: Record<DisplayOrigin, { text: string; title: string; cls: string; icon: JSX.Element }> = {
  live: {
    text: 'Live',
    title: 'Computed just now by the local service on this machine.',
    cls: 'badge badge-accent',
    icon: <IconLive size={14} />,
  },
  cached: {
    text: 'Cached exact result',
    title: 'An earlier result for exactly these inputs, toolchain and checker revision.',
    cls: 'badge badge-accent',
    icon: <IconCached size={14} />,
  },
  recorded: {
    text: 'Recorded run',
    title: 'A genuine run recorded earlier with the local service. Nothing runs in this browser.',
    cls: 'badge',
    icon: <IconRecorded size={14} />,
  },
  preview: {
    text: 'Unverified preview',
    title: 'Edited inputs without a checked result. Export the design and check it locally.',
    cls: 'badge badge-warn',
    icon: <IconPreview size={14} />,
  },
  'none-live': {
    text: 'Live · no result yet',
    title: 'Results will come from the local service.',
    cls: 'badge',
    icon: <IconLive size={14} />,
  },
  'none-replay': {
    text: 'Recorded runs',
    title: 'Results come from recorded runs. Nothing runs in this browser.',
    cls: 'badge',
    icon: <IconRecorded size={14} />,
  },
};

const VIEWS: { view: View; label: string; key: string }[] = [
  { view: 'story', label: 'Guided story', key: 'S' },
  { view: 'workspace', label: 'Workspace', key: 'W' },
  { view: 'experiments', label: 'Experiments', key: 'E' },
];

const THEME_NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_TEXT: Record<Theme, string> = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };

function Connection({ connection }: { connection: AppState['connection'] }) {
  const caps = connection.capabilities;
  let text: string;
  let detail: string | undefined;
  switch (connection.status) {
    case 'connected': {
      const lean = caps?.toolchain?.lean?.available ? 'Lean' : null;
      const rust = caps?.toolchain?.rust?.available ? 'Rust' : null;
      text = 'Service connected';
      detail = [caps?.version ? `v${caps.version.replace(/^v/, '')}` : null, lean, rust].filter(Boolean).join(' · ');
      break;
    }
    case 'unreachable':
      text = 'Service offline';
      detail = 'showing recorded runs';
      break;
    case 'checking':
      text = 'Connecting to service';
      break;
    case 'replay-build':
      text = 'Recorded runs only';
      detail = 'static build';
      break;
  }
  return (
    <span
      className="conn"
      data-status={connection.status}
      role="status"
      aria-live="polite"
      title={connection.message ?? 'Local Cryptificate service on 127.0.0.1:4173'}
    >
      <span className="conn-dot" aria-hidden="true" />
      <span>
        {text}
        {detail ? <span className="muted conn-detail"> ({detail})</span> : null}
      </span>
      {connection.status === 'unreachable' ? (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void checkConnection()}>
          <IconRefresh size={12} /> Retry
        </button>
      ) : null}
    </span>
  );
}

export function Header({
  view,
  origin,
  stale = false,
  connection,
  theme,
  onTheme,
}: {
  view: View;
  origin: DisplayOrigin;
  /** The displayed result describes an earlier version of the inputs. */
  stale?: boolean;
  connection: AppState['connection'];
  theme: Theme;
  onTheme: (t: Theme) => void;
}) {
  const o = ORIGIN[origin];
  return (
    <header className="header">
      <div className="header-inner">
        <a className="brand" href="#/story" aria-label="Cryptificate, guided story">
          {__BRAND__.logo ? (
            <>
              <img
                className={`brand-logo${__BRAND__.logoDark ? ' brand-light' : ''}`}
                src="brand/logo.svg"
                alt="Cryptificate"
              />
              {__BRAND__.logoDark ? (
                <img className="brand-logo brand-dark" src="brand/logo-dark.svg" alt="Cryptificate" />
              ) : null}
            </>
          ) : (
            <>
              {__BRAND__.mark ? <img src="brand/mark.svg" alt="" /> : null}
              <span>Cryptificate</span>
            </>
          )}
        </a>
        <nav className="nav" aria-label="Modes">
          {VIEWS.map((v) => (
            <a
              key={v.view}
              href={`#/${v.view}`}
              aria-current={view === v.view ? 'page' : undefined}
              aria-keyshortcuts={`Alt+Shift+${v.key}`}
              title={`${v.label} (Alt+Shift+${v.key})`}
            >
              {v.label}
            </a>
          ))}
        </nav>
        <div className="header-status">
          <span className={stale && origin !== 'preview' ? 'badge badge-warn' : o.cls} title={o.title}>
            {o.icon}
            <span className="visually-hidden">Result origin: </span>
            {o.text}
            {stale && origin !== 'preview' ? <span> · earlier version</span> : null}
          </span>
          <Connection connection={connection} />
          <button
            type="button"
            className="btn btn-quiet btn-icon"
            aria-label={`${THEME_TEXT[theme]}. Switch theme.`}
            title={THEME_TEXT[theme]}
            onClick={() => onTheme(THEME_NEXT[theme])}
          >
            {theme === 'system' ? <IconAuto /> : theme === 'light' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </div>
    </header>
  );
}
