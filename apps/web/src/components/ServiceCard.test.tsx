import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { START_COMMAND, ServiceCard, reconnectText } from './ServiceCard';

describe('ServiceCard', () => {
  it('names the command to start the service, with a copy button', () => {
    const html = renderToStaticMarkup(
      <ServiceCard now={1_000} connection={{ status: 'unreachable', message: 'x', nextAttemptAt: 6_000 }} />,
    );
    expect(START_COMMAND).toBe('npm start');
    expect(html).toContain('npm start');
    expect(html).toContain('Copy');
    expect(html).toContain('npx cryptificate serve');
    expect(html).toContain('next try in 5 s');
    expect(html).toContain('never as proofs');
  });

  it('describes reconnecting', () => {
    expect(reconnectText({ status: 'checking' }, 0)).toMatch(/now/);
    expect(reconnectText({ status: 'unreachable' }, 0)).toBe('Reconnects automatically.');
    expect(reconnectText({ status: 'unreachable', nextAttemptAt: 2_400 }, 0)).toContain('3 s');
  });
});
