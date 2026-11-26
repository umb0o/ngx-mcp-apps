import { McpBridge, McpError, McpPort, parentWindowPort } from './bridge';
import { JsonRpcMessage } from './protocol';
import { host, manualPort, until } from './test-helpers';

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

describe('McpBridge incoming messages', () => {
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
});

describe('McpBridge requests', () => {
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
});
