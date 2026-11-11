export type RouteView = 'story' | 'workspace' | 'experiments';

export interface Route {
  view: RouteView;
  step?: number;
  /** A share-link token from "#/workspace?d=…". */
  share?: string;
}

/** Reads "#/story/2", "#/workspace", "#/experiments" and "#/workspace?d=<token>". */
export function parseHash(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?', 2);
  const parts = path.split('/');
  const view: RouteView = parts[0] === 'workspace' || parts[0] === 'experiments' ? parts[0] : 'story';
  const step = view === 'story' && parts[1] ? Number(parts[1]) : undefined;
  const route: Route = { view, step: step && step >= 1 && step <= 5 ? step : undefined };
  if (view === 'workspace' && query) {
    const share = new URLSearchParams(query).get('d');
    if (share) route.share = share;
  }
  return route;
}
