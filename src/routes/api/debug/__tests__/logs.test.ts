import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../logs';

const send = (body: Record<string, unknown>) =>
  POST({ request: new Request('http://x/api/debug/logs', { method: 'POST', body: JSON.stringify(body) }) });

describe('debug console log route (#446)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the copy of the app that sent the line', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await send({ level: 'log', args: ['[WEB AUDIO] Context running'], timestamp: Date.now(), page: 'c4eria' });
    expect(out.mock.calls[0][0]).toMatch(/^📱 \[.+\] \[CLIENT\] \[c4eria\] \[WEB AUDIO\] Context running$/);
  });

  it('prints the line as before when there is no page id, or a bad one', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await send({ level: 'log', args: ['a'], timestamp: Date.now() });
    await send({ level: 'log', args: ['b'], timestamp: Date.now(), page: '] fake [CLIENT' });
    expect(out.mock.calls[0][0]).toMatch(/\[CLIENT\] a$/);
    expect(out.mock.calls[1][0]).toMatch(/\[CLIENT\] b$/);
  });
});
