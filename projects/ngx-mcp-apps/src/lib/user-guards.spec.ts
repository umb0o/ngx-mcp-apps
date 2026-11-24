import { TestBed } from '@angular/core/testing';
import { McpPort } from './bridge';
import { isObject } from './guards';
import { McpApp } from './mcp-app';
import { provideMcpApp } from './mcp-app.config';

interface Note {
  id: number;
  text: string;
}
const isNote = (v: unknown): v is Note => isObject(v) && typeof v['id'] === 'number' && typeof v['text'] === 'string';

const until = async (check: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** Host that answers tools/call with the next item of `replies`, then repeats the last one. */
function hostWith(replies: unknown[]) {
  const listeners = new Set<(m: unknown) => void>();
  const send = (m: unknown) => queueMicrotask(() => listeners.forEach((cb) => cb(m)));
  let i = 0;
  const port: McpPort = {
    post: (m) => {
      if (!('id' in m) || !('method' in m)) return;
      if (m.method === 'ui/initialize') {
        send({
          jsonrpc: '2.0',
          id: m.id,
          result: { protocolVersion: '2026-01-26', hostInfo: { name: 'h', version: '1' }, hostCapabilities: {}, hostContext: {} },
        });
      } else if (m.method === 'tools/call') {
        const structuredContent = replies[Math.min(i++, replies.length - 1)];
        send({ jsonrpc: '2.0', id: m.id, result: { content: [], structuredContent } });
      }
    },
    listen: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return { port, send };
}

function setup(port: McpPort) {
  TestBed.configureTestingModule({ providers: [provideMcpApp({ name: 't', version: '1', port, autoResize: false, log: true })] });
  return TestBed.inject(McpApp);
}

describe('user data guards', () => {
  it('pollServerTool keeps only values that pass the guard', async () => {
    const { port } = hostWith([{ id: 1, text: 'first' }, { id: 'two', text: 2 }]);
    const app = setup(port);
    await until(() => app.connected());
    const note = TestBed.runInInjectionContext(() => app.pollServerTool('read_note', { intervalMs: 10, guard: isNote }));
    await until(() => note()?.id === 1);
    await until(() => app.events().some((e) => e.includes('read_note result dropped')));
    expect(note()).toEqual({ id: 1, text: 'first' });
  });

  it('pollServerTool without a guard passes everything through', async () => {
    const { port } = hostWith([{ anything: true }]);
    const app = setup(port);
    await until(() => app.connected());
    const data = TestBed.runInInjectionContext(() => app.pollServerTool('read', { intervalMs: 10 }));
    await until(() => data() !== undefined);
    expect(data()).toEqual({ anything: true });
  });

  it('structuredContentAs checks the data that opened the app', async () => {
    const { port, send } = hostWith([]);
    const app = setup(port);
    await until(() => app.connected());
    const note = app.structuredContentAs(isNote);

    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], structuredContent: { id: 'x' } } });
    await until(() => app.structuredContent() !== undefined);
    expect(note()).toBeUndefined();

    send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], structuredContent: { id: 7, text: 'ok' } } });
    await until(() => note() !== undefined);
    expect(note()).toEqual({ id: 7, text: 'ok' });
  });
});
