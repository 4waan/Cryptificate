import type { ClaimStatus } from '../lib/types';

type IconProps = { size?: number; title?: string };

function Svg({ size = 16, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconProved = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M5 8.2l2 2 4-4.4" />
  </Svg>
);

export const IconRefuted = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
  </Svg>
);

export const IconNotEstablished = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" strokeDasharray="2.2 2" />
    <path d="M5.2 8h5.6" />
  </Svg>
);

export const IconUnsupported = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M3.6 12.4l8.8-8.8" />
  </Svg>
);

export const IconPreview = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="1.8" />
  </Svg>
);

export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.8l6.5 11.4H1.5z" />
    <path d="M8 6.2v3.2M8 11.4v.1" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7.2v4M8 4.8v.1" />
  </Svg>
);

export const IconLive = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3" fill="currentColor" />
    <circle cx="8" cy="8" r="6" />
  </Svg>
);

export const IconCached = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="8" cy="4" rx="5.5" ry="2" />
    <path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
  </Svg>
);

export const IconRecorded = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.5" y="3" width="13" height="10" rx="2" />
    <path d="M6.5 6v4l3.5-2z" fill="currentColor" />
  </Svg>
);

export const IconUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 12.5v-9M4 7.5l4-4 4 4" />
  </Svg>
);

export const IconDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3.5v9M4 8.5l4 4 4-4" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5v8M4.5 7l3.5 3.5L11.5 7M2.5 13.5h11" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 10.5v-8M4.5 6L8 2.5 11.5 6M2.5 13.5h11" />
  </Svg>
);

export const IconStop = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
  </Svg>
);

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />
  </Svg>
);

export const IconAuto = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" />
  </Svg>
);

export const STATUS_TEXT: Record<ClaimStatus, string> = {
  proved: 'Proved',
  refuted: 'Refuted',
  not_established: 'Not established by this method',
  unsupported: 'Unsupported',
};

export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3.5L2.5 6.5l3 3" />
    <path d="M2.5 6.5h7a4 4 0 010 8H7" />
  </Svg>
);

export const IconRedo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.5 3.5l3 3-3 3" />
    <path d="M13.5 6.5h-7a4 4 0 000 8H9" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.8 9.2a3 3 0 004.2 0l2.1-2.1a3 3 0 00-4.2-4.2l-.9.9" />
    <path d="M9.2 6.8a3 3 0 00-4.2 0L2.9 8.9a3 3 0 004.2 4.2l.9-.9" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M10.5 3V2.5a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1H4" />
  </Svg>
);

export const IconPaste = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 2.5h5v2h-5z" />
    <path d="M10.5 3.5h1.5a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-9a1 1 0 011-1h1.5" />
    <path d="M5.5 8.5h5M5.5 11h3" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.4 10.4l3.6 3.6" />
  </Svg>
);

export const IconCircuit = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="3.5" cy="4" r="1.5" />
    <circle cx="3.5" cy="12" r="1.5" />
    <circle cx="12.5" cy="8" r="1.5" />
    <path d="M5 4h2.5l3.5 4M5 12h2.5L11 8" />
  </Svg>
);

export function StatusIcon({ status, size }: { status: ClaimStatus; size?: number }) {
  switch (status) {
    case 'proved':
      return <IconProved size={size} />;
    case 'refuted':
      return <IconRefuted size={size} />;
    case 'not_established':
      return <IconNotEstablished size={size} />;
    case 'unsupported':
      return <IconUnsupported size={size} />;
  }
}

/**
 * Status with icon and text. "Not established" carries "by this method" when
 * the method itself does not apply (the activity bound without MDS), so it is
 * never read as a refutation.
 */
export function StatusPill({
  status,
  short = false,
  byMethod = false,
}: {
  status: ClaimStatus;
  short?: boolean;
  byMethod?: boolean;
}) {
  const text = status === 'not_established' && (short || !byMethod) ? 'Not established' : STATUS_TEXT[status];
  return (
    <span className={`status status-${status}`}>
      <StatusIcon status={status} />
      {text}
    </span>
  );
}

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11.5V7.5a4 4 0 018 0v4l1 1.5H3z" />
    <path d="M6.5 14.5h3" />
  </Svg>
);

export const IconKeyboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.5" y="4" width="13" height="8.5" rx="1" />
    <path d="M4 6.8h.01M6.5 6.8h.01M9 6.8h.01M11.5 6.8h.01M5 9.8h6" />
  </Svg>
);

export const IconTerminal = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
    <path d="M4.5 6l2 2-2 2M8 10.5h3.5" />
  </Svg>
);
