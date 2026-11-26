import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { McpPort } from './bridge';
import { isObject } from './guards';
import { McpApp } from './mcp-app';
import { provideMcpApp } from './mcp-app.config';
import { fakeHost, handshake, host, hostWith, manualPort, until } from './test-helpers';

function app(port: McpPort) {
  TestBed.configureTestingModule({
    providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })],
  });
  return TestBed.inject(McpApp);
}

describe('McpApp without a host', () => {
  it('goes standalone outside a host iframe', () => {
    TestBed.configureTestingModule({
      providers: [provideMcpApp({ name: 'test', version: '1.0.0', log: true })],
    });
    const mcp = TestBed.inject(McpApp);
    expect(mcp.status()).toBe('standalone');
    expect(mcp.connected()).toBe(false);
    expect(mcp.displayMode()).toBe('inline');
    expect(mcp.canFullscreen()).toBe(false);
    expect(mcp.events()[0]).toContain('standalone');
  });

  it('works without provideMcpApp', () => {
    const mcp = TestBed.inject(McpApp);
    expect(mcp.status()).toBe('standalone');
    expect(mcp.events()).toEqual([]);
  });
});

describe('McpApp connection', () => {
  it('stays standalone if the initialize result is invalid', async () => {
    const { port } = fakeHost({ protocolVersion: '2026-01-26', hostInfo: 'claude' });
    TestBed.configureTestingModule({
      providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })],
    });
    const app = TestBed.inject(McpApp);
    await until(() => app.status() === 'standalone');
    expect(app.events().some((e) => e.includes('Invalid ui/initialize result'))).toBe(true);
  });

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
    expect(
      a.events().some((e) => e.includes('protocol version app 2026-01-26, host 2099-01-01')),
    ).toBe(true);
  });

  it('refuses to call the host before the connection is ready', async () => {
    const { port } = manualPort();
    const a = app(port);
    await expect(a.callServerTool('x')).rejects.toThrow('not connected');
    await expect(a.sendMessage('x')).rejects.toThrow('not connected');
  });
});

describe('McpApp host notifications', () => {
  it('drops malformed notifications and keeps the last good state', async () => {
    const { port, send } = fakeHost({
      protocolVersion: '2026-01-26',
      hostInfo: { name: 'fake', version: '1' },
      hostCapabilities: {},
      hostContext: { theme: 'dark' },
    });
    TestBed.configureTestingModule({
      providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })],
    });
    const app = TestBed.inject(McpApp);
    await until(() => app.connected());

    send({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { content: [], structuredContent: { ok: 1 } },
    });
    await until(() => app.structuredContent() !== undefined);
    send({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { structuredContent: 'broken' },
    });
    send({
      jsonrpc: '2.0',
      method: 'ui/notifications/host-context-changed',
      params: { theme: 'purple' },
    });
    await until(() => app.events().filter((e) => e.includes('dropped')).length === 2);

    expect(app.structuredContent()).toEqual({ ok: 1 });
    expect(app.theme()).toBe('dark');
    expect(app.events().some((e) => e.includes('host-context: invalid fields dropped theme'))).toBe(
      true,
    );
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
});

describe('McpApp event log', () => {
  it('keeps log entries short even when the host sends a lot of data', async () => {
    const { port, send } = manualPort(handshake);
    const a = app(port);
    await until(() => a.connected());
    send({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { content: [], structuredContent: { big: 'x'.repeat(50_000) } },
    });
    await until(() => a.structuredContent() !== undefined);
    expect(Math.max(...a.events().map((e) => e.length))).toBeLessThan(1100);
  });

  it('never keeps more than 50 log entries', async () => {
    const { port, send } = manualPort(handshake);
    const a = app(port);
    await until(() => a.connected());
    for (let i = 0; i < 80; i++)
      send({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: { i } } });
    await until(() => (a.toolInput() as { i?: number } | undefined)?.i === 79);
    expect(a.events().length).toBe(50);
  });

  it('logs circular data without throwing', async () => {
    const { port, send } = host();
    const a = app(port);
    await until(() => a.connected());
    const circular: Record<string, unknown> = { content: [] };
    circular['_meta'] = circular;
    send({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { content: [], structuredContent: circular },
    });
    await until(() => a.structuredContent() !== undefined);
    expect(a.events().some((e) => e.includes('[unserializable]'))).toBe(true);
  });
});

describe('McpApp typed tool data (pollServerTool, structuredContentAs)', () => {
  interface Note {
    id: number;
    text: string;
  }
  const isNote = (v: unknown): v is Note =>
    isObject(v) && typeof v['id'] === 'number' && typeof v['text'] === 'string';

  function setup(port: McpPort) {
    TestBed.configureTestingModule({
      providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })],
    });
    return TestBed.inject(McpApp);
  }

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

  it('pollServerTool explains how to fix a call outside an injection context', () => {
    const { port } = host();
    const a = app(port);
    expect(() => a.pollServerTool('x')).toThrow('must be called in an injection context');
    expect(() => a.pollServerTool('x', { injector: TestBed.inject(Injector) })).not.toThrow();
  });

  it('pollServerTool keeps only values that pass the guard', async () => {
    const { port } = hostWith([
      { id: 1, text: 'first' },
      { id: 'two', text: 2 },
    ]);
    const app = setup(port);
    await until(() => app.connected());
    const note = TestBed.runInInjectionContext(() =>
      app.pollServerTool('read_note', { intervalMs: 10, guard: isNote }),
    );
    await until(() => note()?.id === 1);
    await until(() => app.events().some((e) => e.includes('read_note result dropped')));
    expect(note()).toEqual({ id: 1, text: 'first' });
  });

  it('pollServerTool without a guard passes everything through', async () => {
    const { port } = hostWith([{ anything: true }]);
    const app = setup(port);
    await until(() => app.connected());
    const data = TestBed.runInInjectionContext(() =>
      app.pollServerTool('read', { intervalMs: 10 }),
    );
    await until(() => data() !== undefined);
    expect(data()).toEqual({ anything: true });
  });

  it('structuredContentAs checks the data that opened the app', async () => {
    const { port, send } = hostWith([]);
    const app = setup(port);
    await until(() => app.connected());
    const note = app.structuredContentAs(isNote);

    send({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { content: [], structuredContent: { id: 'x' } },
    });
    await until(() => app.structuredContent() !== undefined);
    expect(note()).toBeUndefined();

    send({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { content: [], structuredContent: { id: 7, text: 'ok' } },
    });
    await until(() => note() !== undefined);
    expect(note()).toEqual({ id: 7, text: 'ok' });
  });
});

/**
 * Compatibility tests: our runtime talks to the official MCP Apps host implementation
 * (AppBridge from @modelcontextprotocol/ext-apps), wired in memory.
 * If these pass, a real host such as Claude speaks the same protocol with us.
 */
describe('McpApp with the official MCP Apps host (AppBridge)', () => {
  function wire() {
    const appListeners = new Set<(m: unknown) => void>();
    const hostTransport = {
      onmessage: undefined as ((m: unknown) => void) | undefined,
      onclose: undefined as (() => void) | undefined,
      onerror: undefined as ((e: Error) => void) | undefined,
      start: async () => {},
      close: async () => {},
      send: async (m: unknown) => {
        const copy = structuredClone(m);
        queueMicrotask(() => appListeners.forEach((cb) => cb(copy)));
      },
    };
    const port: McpPort = {
      post: (m) => {
        const copy = structuredClone(m);
        queueMicrotask(() => hostTransport.onmessage?.(copy));
      },
      listen: (cb) => {
        appListeners.add(cb);
        return () => appListeners.delete(cb);
      },
    };
    return { hostTransport, port };
  }

  async function setup() {
    const { hostTransport, port } = wire();
    const host = new AppBridge(
      null,
      { name: 'test-host', version: '1.0.0' },
      { serverTools: {}, openLinks: {}, updateModelContext: { text: {} }, message: { text: {} } },
      {
        hostContext: {
          theme: 'dark',
          displayMode: 'inline',
          availableDisplayModes: ['inline', 'fullscreen'],
        },
      },
    );
    const seen = {
      initialized: false,
      sizes: [] as unknown[],
      context: [] as unknown[],
      messages: [] as unknown[],
    };
    host.oninitialized = () => (seen.initialized = true);
    host.onsizechange = (p) => seen.sizes.push(p);
    host.oncalltool = async (p) => ({
      content: [{ type: 'text', text: 'ok' }],
      structuredContent: { echo: p.name, args: p.arguments ?? {} },
    });
    host.onupdatemodelcontext = async (p) => {
      seen.context.push(p);
      return {};
    };
    host.onmessage = async (p) => {
      seen.messages.push(p);
      return {};
    };
    host.onrequestdisplaymode = async (p) => ({ mode: p.mode });
    await host.connect(hostTransport as never);

    TestBed.configureTestingModule({
      providers: [
        provideMcpApp({ name: 'compat-app', version: '1.0.0', port, autoResize: false, log: true }),
      ],
    });
    const app = TestBed.inject(McpApp);
    await until(() => app.connected());
    return { host, app, seen };
  }

  it('completes the ui/initialize handshake and reads host context', async () => {
    const { app, seen } = await setup();
    await until(() => seen.initialized);
    expect(app.status()).toBe('connected');
    expect(app.theme()).toBe('dark');
    expect(app.availableDisplayModes()).toEqual(['inline', 'fullscreen']);
    expect(app.canFullscreen()).toBe(true);
    expect(app.hostCapabilities()?.serverTools).toBeDefined();
  });

  it('receives tool input and tool result', async () => {
    const { host, app } = await setup();
    await host.sendToolInput({ arguments: { topic: 'loops' } });
    await host.sendToolResult({
      content: [{ type: 'text', text: 'hi' }],
      structuredContent: { message: 'Ciao' },
    });
    await until(() => app.structuredContent() !== undefined);
    expect(app.toolInput()).toEqual({ topic: 'loops' });
    expect(app.structuredContent()).toEqual({ message: 'Ciao' });
  });

  it('follows host context changes', async () => {
    const { host, app } = await setup();
    host.sendHostContextChange({ theme: 'light' });
    await until(() => app.theme() === 'light');
    expect(app.displayMode()).toBe('inline');
  });

  it('calls server tools through the host', async () => {
    const { app } = await setup();
    const r = await app.callServerTool('read_message', { n: 1 });
    expect(r.structuredContent).toEqual({ echo: 'read_message', args: { n: 1 } });
  });

  it('sends model context, messages and display mode requests', async () => {
    const { app, seen } = await setup();
    await app.updateModelContext('lesson 3');
    expect(seen.context).toEqual([{ content: [{ type: 'text', text: 'lesson 3' }] }]);
    expect(await app.sendMessage('hello')).toBe(true);
    expect(seen.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]);
    expect(await app.toggleFullscreen()).toBe('fullscreen');
    expect(app.displayMode()).toBe('fullscreen');
  });

  it('answers host requests (teardown)', async () => {
    const { host } = await setup();
    await expect(host.teardownResource({})).resolves.toEqual({});
  });
});
