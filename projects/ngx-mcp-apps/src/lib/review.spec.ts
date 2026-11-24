/** Regression tests for the issues found in the code review. */
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { McpBridge, McpPort } from './bridge';
import { McpApp } from './mcp-app';
import { provideMcpApp } from './mcp-app.config';

const until = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** A host that completes the handshake, with an optional custom context. */
function host(hostContext: Record<string, unknown> = {}, protocolVersion = '2026-01-26') {
  const listeners = new Set<(m: unknown) => void>();
  const send = (m: unknown) => queueMicrotask(() => listeners.forEach((cb) => cb(m)));
  const port: McpPort = {
    post: (m) => {
      if ('id' in m && 'method' in m && m.method === 'ui/initialize') {
        send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion, hostInfo: { name: 'h', version: '1' }, hostCapabilities: {}, hostContext } });
      }
    },
    listen: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return { port, send };
}

function app(port: McpPort) {
  TestBed.configureTestingModule({ providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })] });
  return TestBed.inject(McpApp);
}

describe('review fixes', () => {
  it('connects even if a known context field has an unexpected value', async () => {
    const { port } = host({ theme: 'dark', platform: 'tv' });
    const a = app(port);
    await until(() => a.connected());
    expect(a.theme()).toBe('dark');
    expect(a.hostContext()?.platform).toBeUndefined();
    expect(a.events().some((e) => e.includes('invalid fields dropped platform'))).toBe(true);
  });

  it('logs a protocol version mismatch but stays connected', async () => {
    const { port } = host({}, '2099-01-01');
    const a = app(port);
    await until(() => a.connected());
    expect(a.events().some((e) => e.includes('protocol version app 2026-01-26, host 2099-01-01'))).toBe(true);
  });

  it('fails a request at once when the message cannot be sent', async () => {
    const port: McpPort = {
      post: () => {
        throw new Error('DataCloneError');
      },
      listen: () => () => {},
    };
    const bridge = new McpBridge(port, { name: 't', version: '1' }, { timeout: 60000 });
    const started = Date.now();
    await expect(bridge.request('x')).rejects.toThrow('Could not send x: DataCloneError');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('rejects requests after close', async () => {
    const { port } = host();
    const bridge = new McpBridge(port, { name: 't', version: '1' });
    bridge.close();
    await expect(bridge.request('x')).rejects.toThrow('Bridge closed');
  });

  it('reports a throwing notification handler instead of crashing the listener', async () => {
    const { port, send } = host();
    const errors: string[] = [];
    const bridge = new McpBridge(port, { name: 't', version: '1' }, { onError: (_e, m) => errors.push(m) });
    bridge.onNotification('boom', () => {
      throw new Error('bad');
    });
    send({ jsonrpc: '2.0', method: 'boom' });
    await until(() => errors.length === 1);
    expect(errors).toEqual(['boom']);
  });

  it('logs circular data without throwing', async () => {
    const { port, send } = host();
    const a = app(port);
    await until(() => a.connected());
    const circular: Record<string, unknown> = { content: [] };
    circular['_meta'] = circular;
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], structuredContent: circular } });
    await until(() => a.structuredContent() !== undefined);
    expect(a.events().some((e) => e.includes('[unserializable]'))).toBe(true);
  });

  it('resets toolCancelled when a new tool call arrives', async () => {
    const { port, send } = host();
    const a = app(port);
    await until(() => a.connected());
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-cancelled', params: {} });
    await until(() => a.toolCancelled());
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: {} } });
    await until(() => !a.toolCancelled());
  });

  it('pollServerTool explains how to fix a call outside an injection context', () => {
    const { port } = host();
    const a = app(port);
    expect(() => a.pollServerTool('x')).toThrow('must be called in an injection context');
    expect(() => a.pollServerTool('x', { injector: TestBed.inject(Injector) })).not.toThrow();
  });
});
