import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { initialState, setState } from '../state/store';
import { WorkspaceToolbar } from './WorkspaceToolbar';

describe('WorkspaceToolbar', () => {
  beforeEach(() => setState(initialState()));

  it('does not claim a save before the first write', () => {
    const html = renderToStaticMarkup(<WorkspaceToolbar field="gf256" problems={0} />);
    expect(html).toContain('Changes are saved in this browser.');
    expect(html).not.toContain('Saved in this browser.');
    setState({ storage: 'saved' });
    expect(renderToStaticMarkup(<WorkspaceToolbar field="gf256" problems={0} />)).toContain('Saved in this browser.');
    setState({ storage: 'unavailable' });
    expect(renderToStaticMarkup(<WorkspaceToolbar field="gf256" problems={0} />)).toContain('Not saved');
  });

  it('shows why sharing is unavailable as visible text tied to the button', () => {
    const html = renderToStaticMarkup(<WorkspaceToolbar field="gf256" problems={2} />);
    const button = html.match(/<button[^>]*>(?:(?!<\/button>).)*Copy share link<\/button>/)![0];
    expect(button).toContain('disabled=""');
    expect(button).not.toContain('title=');
    const describedBy = button.match(/aria-describedby="([^"]+)"/)![1]!;
    expect(html).toMatch(new RegExp(`id="${describedBy.replace(/[:]/g, '\\:')}"[^>]*>Fix the input problems to share this design.<`));
  });
});
