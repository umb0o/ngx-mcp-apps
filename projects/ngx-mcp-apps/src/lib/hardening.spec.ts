/** Security and robustness tests added for 0.1.0. */
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { McpBridge, McpError, McpPort, parentWindowPort } from './bridge';
import { McpApp } from './mcp-app';
import { provideMcpApp } from './mcp-app.config';
import { JsonRpcMessage } from './protocol';

const until = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** A port whose incoming side is driven by the test. */
function manualPort(onPost: (m: JsonRpcMessage, send: (m: unknown) => void) => void = () => {}) {
  const listeners = new Set<(m: unknown) => void>();
  const send = (m: unknown) => queueMicrotask(() => listeners.forEach((cb) => cb(m)));
  const posted: JsonRpcMessage[] = [];
  const port: McpPort = {
    post: (m) => {
      posted.push(m);
      onPost(m, send);
    },
    listen: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return { port, send, posted };
}

const handshake = (m: JsonRpcMessage, send: (m: unknown) => void) => {
  if ('id' in m && 'method' in m && m.method === 'ui/initialize') {
    send({
      jsonrpc: '2.0',
      id: m.id,
      result: { protocolVersion: '2026-01-26', hostInfo: { name: 'h', version: '1' }, hostCapabilities: {}, hostContext: {} },
    });
  }
};

describe('parentWindowPort', () => {
  // In the test environment window.parent === window, so the window stands in for the host
  const dispatch = (data: unknown, origin: string, source: unknown = window) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as MessageEventSource }));

  it('ignores messages that do not come from the parent window', () => {
    const received: unknown[] = [];
    const stop = parentWindowPort().listen((m) => received.push(m));
    dispatch({ from: 'parent' }, 'https://host.example');
    dispatch({ from: 'other frame' }, 'https://evil.example', null);
    stop();
    expect(received).toEqual([{ from: 'parent' }]);
  });

  it('with allowedOrigins, ignores other origins and posts only to the allowed ones', () => {
    const received: unknown[] = [];
    const port = parentWindowPort({ allowedOrigins: ['https://host.example'] });
    const stop = port.listen((m) => received.push(m));
    dispatch({ ok: true }, 'https://host.example');
    dispatch({ ok: false }, 'https://evil.example');
    stop();
    expect(received).toEqual([{ ok: true }]);

    const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    port.post({ jsonrpc: '2.0', method: 'x' });
    expect(spy.mock.calls.map((c) => c[1])).toEqual(['https://host.example']);
    spy.mockRestore();
  });

  it('without allowedOrigins, posts to any origin like the official SDK', () => {
    const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    parentWindowPort().post({ jsonrpc: '2.0', method: 'x' });
    expect(spy.mock.calls.map((c) => c[1])).toEqual(['*']);
    spy.mockRestore();
  });
});

describe('McpBridge hardening', () => {
  it('ignores anything that is not JSON-RPC 2.0', async () => {
    const { port, send, posted } = manualPort();
    const bridge = new McpBridge(port, { name: 't', version: '1' });
    let called = 0;
    bridge.onNotification('n', () => called++);
    for (const junk of [null, 'text', 42, [], { method: 'n' }, { jsonrpc: '1.0', method: 'n' }, { jsonrpc: '2.0' }, { jsonrpc: '2.0', method: 7 }]) {
      send(junk);
    }
    send({ jsonrpc: '2.0', method: 'n' });
    await until(() => called === 1);
    expect(called).toBe(1);
    expect(posted).toEqual([]);
  });

  it('turns a malformed error object into a clean McpError', async () => {
    const { port } = manualPort((m, send) => {
      if ('id' in m) send({ jsonrpc: '2.0', id: m.id, error: { code: 'nope', message: { html: '<b>' } } });
    });
    const bridge = new McpBridge(port, { name: 't', version: '1' });
    const error = (await bridge.request('x').catch((e: unknown) => e)) as McpError;
    expect(error).toBeInstanceOf(McpError);
    expect(error.code).toBe(-32603);
    expect(error.message).toBe('Unknown error from host');
  });

  it('ignores responses with an unknown id', async () => {
    const { port, send } = manualPort();
    const bridge = new McpBridge(port, { name: 't', version: '1' }, { timeout: 50 });
    const pending = bridge.request('x');
    send({ jsonrpc: '2.0', id: 999, result: { hijacked: true } });
    await expect(pending).rejects.toThrow('Request timed out: x');
  });

  it('answers unknown host requests with "method not found"', async () => {
    const { port, send, posted } = manualPort();
    new McpBridge(port, { name: 't', version: '1' });
    send({ jsonrpc: '2.0', id: 'a1', method: 'secret/dump' });
    await until(() => posted.length === 1);
    expect(posted[0]).toEqual({ jsonrpc: '2.0', id: 'a1', error: { code: -32601, message: 'Method not found: secret/dump' } });
  });

  it('still answers the host when a handler result cannot be sent', async () => {
    const answers: JsonRpcMessage[] = [];
    const listeners = new Set<(m: unknown) => void>();
    const port: McpPort = {
      post: (m) => {
        if ('result' in m) throw new Error('DataCloneError');
        answers.push(m);
      },
      listen: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
    const bridge = new McpBridge(port, { name: 't', version: '1' });
    bridge.onRequest('custom', () => ({ fn: () => {} }));
    listeners.forEach((cb) => cb({ jsonrpc: '2.0', id: 5, method: 'custom' }));
    await until(() => answers.length === 1);
    expect(answers[0]).toEqual({ jsonrpc: '2.0', id: 5, error: { code: -32603, message: 'Could not send the result of custom' } });
  });
});

describe('McpApp hardening', () => {
  function app(port: McpPort) {
    TestBed.configureTestingModule({ providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })] });
    return TestBed.inject(McpApp);
  }

  it('keeps log entries short even when the host sends a lot of data', async () => {
    const { port, send } = manualPort(handshake);
    const a = app(port);
    await until(() => a.connected());
    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], structuredContent: { big: 'x'.repeat(50_000) } } });
    await until(() => a.structuredContent() !== undefined);
    expect(Math.max(...a.events().map((e) => e.length))).toBeLessThan(1100);
  });

  it('never keeps more than 50 log entries', async () => {
    const { port, send } = manualPort(handshake);
    const a = app(port);
    await until(() => a.connected());
    for (let i = 0; i < 80; i++) send({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: { i } } });
    await until(() => (a.toolInput() as { i?: number } | undefined)?.i === 79);
    expect(a.events().length).toBe(50);
  });

  it('refuses to call the host before the connection is ready', async () => {
    const { port } = manualPort();
    const a = app(port);
    await expect(a.callServerTool('x')).rejects.toThrow('not connected');
    await expect(a.sendMessage('x')).rejects.toThrow('not connected');
  });

  it('clamps the polling interval so a bad value cannot flood the host', async () => {
    const { port } = manualPort(handshake);
    const a = app(port);
    await until(() => a.connected());
    const spy = vi.spyOn(globalThis, 'setInterval');
    const injector = TestBed.inject(Injector);
    a.pollServerTool('x', { intervalMs: 0, injector });
    a.pollServerTool('x', { intervalMs: -5, injector });
    a.pollServerTool('x', { intervalMs: Number.NaN, injector });
    expect(spy.mock.calls.map((c) => c[1])).toEqual([100, 100, 1000]);
    spy.mockRestore();
  });
});
