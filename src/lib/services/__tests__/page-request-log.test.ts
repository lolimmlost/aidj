import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { isPageRequest, logPageRequest, shortUserAgent } from '../page-request-log';

const IPHONE_PWA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

function req(url: string, headers: Record<string, string> = {}, method = 'GET') {
  return { method, url, headers } as unknown as IncomingMessage;
}

function res() {
  const r = new EventEmitter() as EventEmitter & { statusCode: number };
  r.statusCode = 200;
  return r as unknown as ServerResponse & EventEmitter;
}

describe('page request log (#446)', () => {
  it('counts HTML page loads only', () => {
    expect(isPageRequest(req('/dashboard', { 'sec-fetch-dest': 'document' }))).toBe(true);
    expect(isPageRequest(req('/assets/main-abc.js', { 'sec-fetch-dest': 'script' }))).toBe(false);
    expect(isPageRequest(req('/api/navidrome/stream/x', { 'sec-fetch-dest': 'audio' }))).toBe(false);
    expect(isPageRequest(req('/dashboard', { 'sec-fetch-dest': 'document' }, 'POST'))).toBe(false);
    // no fetch metadata: by address and Accept
    expect(isPageRequest(req('/playlists/1?x=1', { accept: 'text/html,application/xhtml+xml' }))).toBe(true);
    expect(isPageRequest(req('/api/config', { accept: 'text/html' }))).toBe(false);
    expect(isPageRequest(req('/icons/icon-32x32.png', { accept: 'text/html' }))).toBe(false);
    expect(isPageRequest(req('/dashboard', { accept: 'application/json' }))).toBe(false);
  });

  it('logs a page when it finishes: path, status, time and device', () => {
    const lines: string[] = [];
    let t = 1000;
    const r = res();
    logPageRequest(req('/dashboard?from=icon', { 'sec-fetch-dest': 'document', 'user-agent': IPHONE_PWA }), r, (l) => lines.push(l), () => t);
    t = 1085;
    r.emit('finish');
    r.emit('close');
    expect(lines).toEqual(['[PAGE] GET /dashboard → 200 in 85 ms (iPhone iOS 18.7)']);
  });

  it('logs a page the browser dropped before it was sent', () => {
    const lines: string[] = [];
    let t = 0;
    const r = res();
    logPageRequest(req('/dashboard', { 'sec-fetch-dest': 'document', 'user-agent': IPHONE_PWA }), r, (l) => lines.push(l), () => t);
    t = 30_000;
    r.emit('close');
    expect(lines).toEqual(['[PAGE] GET /dashboard closed before finishing, after 30000 ms (iPhone iOS 18.7)']);
  });

  it('leaves everything else out of the log', () => {
    const log = vi.fn();
    const r = res();
    logPageRequest(req('/assets/app.css', { 'sec-fetch-dest': 'style' }), r, log);
    r.emit('finish');
    expect(log).not.toHaveBeenCalled();
  });

  it('shortens the user agent to the device and browser', () => {
    expect(shortUserAgent(IPHONE_PWA)).toBe('iPhone iOS 18.7');
    expect(shortUserAgent(IPHONE_SAFARI)).toBe('iPhone iOS 18.7');
    expect(shortUserAgent(FIREFOX)).toBe('Firefox 140 Linux');
    expect(shortUserAgent(EDGE)).toBe('Edge 131 Windows');
    expect(shortUserAgent(undefined)).toBe('?');
  });
});
