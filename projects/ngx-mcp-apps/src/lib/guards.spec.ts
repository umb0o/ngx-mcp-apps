import { TestBed } from '@angular/core/testing';
import { McpPort } from './bridge';
import {
  isCallToolResult,
  isDisplayModeResult,
  isHostContext,
  isInitializeResult,
  isRefusableResult,
  isToolInputParams,
} from './guards';
import { McpApp } from './mcp-app';
import { provideMcpApp } from './mcp-app.config';

describe('guards', () => {
  it('isCallToolResult', () => {
    expect(isCallToolResult({ content: [{ type: 'text', text: 'hi' }], structuredContent: { a: 1 } })).toBe(true);
    expect(isCallToolResult({ content: [], isError: true })).toBe(true);
    expect(isCallToolResult({ structuredContent: {} })).toBe(false);
    expect(isCallToolResult({ content: [{ text: 'no type' }] })).toBe(false);
    expect(isCallToolResult({ content: [], structuredContent: 'x' })).toBe(false);
    expect(isCallToolResult({ content: [], isError: 'yes' })).toBe(false);
    expect(isCallToolResult(null)).toBe(false);
  });

  it('isHostContext, also for partial updates', () => {
    expect(isHostContext({})).toBe(true);
    expect(
      isHostContext({
        theme: 'dark',
        displayMode: 'inline',
        availableDisplayModes: ['inline', 'fullscreen'],
        platform: 'mobile',
        containerDimensions: { width: 400, maxHeight: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 20, left: 0 },
        styles: { variables: { '--font-sans': 'Inter' } },
        somethingNew: { future: true },
      }),
    ).toBe(true);
    expect(isHostContext({ theme: 'blue' })).toBe(false);
    expect(isHostContext({ displayMode: 'maximized' })).toBe(false);
    expect(isHostContext({ availableDisplayModes: 'inline' })).toBe(false);
    expect(isHostContext({ containerDimensions: { width: '400px' } })).toBe(false);
    expect(isHostContext({ safeAreaInsets: { top: 0 } })).toBe(false);
    expect(isHostContext([])).toBe(false);
  });

  it('isInitializeResult', () => {
    const ok = {
      protocolVersion: '2026-01-26',
      hostInfo: { name: 'claude', version: '1' },
      hostCapabilities: { serverTools: {} },
      hostContext: { theme: 'light' },
    };
    expect(isInitializeResult(ok)).toBe(true);
    expect(isInitializeResult({ ...ok, hostInfo: { name: 'claude' } })).toBe(false);
    expect(isInitializeResult({ ...ok, hostCapabilities: { serverTools: true } })).toBe(false);
    expect(isInitializeResult({ ...ok, hostContext: { theme: 3 } })).toBe(false);
    expect(isInitializeResult({ ...ok, protocolVersion: undefined })).toBe(false);
  });

  it('small results', () => {
    expect(isToolInputParams({ arguments: { a: 1 } })).toBe(true);
    expect(isToolInputParams({})).toBe(true);
    expect(isToolInputParams({ arguments: [1] })).toBe(false);
    expect(isDisplayModeResult({ mode: 'fullscreen' })).toBe(true);
    expect(isDisplayModeResult({ mode: 'big' })).toBe(false);
    expect(isRefusableResult({})).toBe(true);
    expect(isRefusableResult({ isError: true })).toBe(true);
    expect(isRefusableResult({ isError: 'no' })).toBe(false);
  });
});

describe('McpApp with a misbehaving host', () => {
  function fakeHost(initializeResult: unknown) {
    const listeners = new Set<(m: unknown) => void>();
    const send = (m: unknown) => queueMicrotask(() => listeners.forEach((cb) => cb(m)));
    const port: McpPort = {
      post: (m) => {
        if ('id' in m && 'method' in m && m.method === 'ui/initialize') {
          send({ jsonrpc: '2.0', id: m.id, result: initializeResult });
        }
      },
      listen: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
    return { port, send };
  }

  const until = async (check: () => boolean, ms = 2000) => {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > ms) throw new Error('condition not met in time');
      await new Promise((r) => setTimeout(r, 5));
    }
  };

  it('drops malformed notifications and keeps the last good state', async () => {
    const { port, send } = fakeHost({
      protocolVersion: '2026-01-26',
      hostInfo: { name: 'fake', version: '1' },
      hostCapabilities: {},
      hostContext: { theme: 'dark' },
    });
    TestBed.configureTestingModule({ providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })] });
    const app = TestBed.inject(McpApp);
    await until(() => app.connected());

    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], structuredContent: { ok: 1 } } });
    await until(() => app.structuredContent() !== undefined);
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: 'broken' } });
    send({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'purple' } });
    await until(() => app.events().filter((e) => e.includes('dropped')).length === 2);

    expect(app.structuredContent()).toEqual({ ok: 1 });
    expect(app.theme()).toBe('dark');
  });

  it('stays standalone if the initialize result is invalid', async () => {
    const { port } = fakeHost({ protocolVersion: '2026-01-26', hostInfo: 'claude' });
    TestBed.configureTestingModule({ providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })] });
    const app = TestBed.inject(McpApp);
    await until(() => app.status() === 'standalone');
    expect(app.events().some((e) => e.includes('Invalid ui/initialize result'))).toBe(true);
  });
});
