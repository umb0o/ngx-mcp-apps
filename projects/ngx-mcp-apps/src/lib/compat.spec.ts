/**
 * Compatibility tests: our runtime talks to the official MCP Apps host implementation
 * (AppBridge from @modelcontextprotocol/ext-apps), wired in memory.
 * If these pass, a real host such as Claude speaks the same protocol with us.
 */
import { TestBed } from '@angular/core/testing';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { McpPort } from './bridge';
import { McpApp } from './mcp-app';
import { provideMcpApp } from './mcp-app.config';

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

const until = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};

async function setup() {
  const { hostTransport, port } = wire();
  const host = new AppBridge(
    null,
    { name: 'test-host', version: '1.0.0' },
    { serverTools: {}, openLinks: {}, updateModelContext: { text: {} }, message: { text: {} } },
    { hostContext: { theme: 'dark', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } },
  );
  const seen = { initialized: false, sizes: [] as unknown[], context: [] as unknown[], messages: [] as unknown[] };
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
    providers: [provideMcpApp({ name: 'compat-app', version: '1.0.0', port, autoResize: false, log: true })],
  });
  const app = TestBed.inject(McpApp);
  await until(() => app.connected());
  return { host, app, seen };
}

describe('compatibility with the official MCP Apps host (AppBridge)', () => {
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
    await host.sendToolResult({ content: [{ type: 'text', text: 'hi' }], structuredContent: { message: 'Ciao' } });
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
