import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { initialState, setState } from './state/store';

describe('App', () => {
  beforeEach(() => setState(initialState()));

  it('keeps one announcement region mounted on every view', () => {
    for (const view of ['story', 'workspace', 'experiments'] as const) {
      setState({ view });
      const html = renderToStaticMarkup(<App />);
      expect(html.match(/id="announcer"/g)?.length).toBe(1);
    }
  });
});
