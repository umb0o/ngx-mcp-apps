/** Helpers shared by the spec files. Not part of the published library (excluded in tsconfig.lib.json). */
import { McpPort } from './bridge';
import { JsonRpcMessage } from './protocol';

/** Waits until `check` returns true, or fails after `ms`. */
export const until = async (check: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** A port whose incoming side is driven by the test. */
export function manualPort(onPost: (m: JsonRpcMessage, send: (m: unknown) => void) => void = () => {}) {
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

/** For manualPort: answers ui/initialize with a valid result. */
export const handshake = (m: JsonRpcMessage, send: (m: unknown) => void) => {
  if ('id' in m && 'method' in m && m.method === 'ui/initialize') {
    send({
      jsonrpc: '2.0',
      id: m.id,
      result: { protocolVersion: '2026-01-26', hostInfo: { name: 'h', version: '1' }, hostCapabilities: {}, hostContext: {} },
    });
  }
};

/** A host that answers ui/initialize with the given result, valid or not. */
export function fakeHost(initializeResult: unknown) {
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

/** A host that completes the handshake, with an optional custom context. */
export function host(hostContext: Record<string, unknown> = {}, protocolVersion = '2026-01-26') {
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

/** Host that answers tools/call with the next item of `replies`, then repeats the last one. */
export function hostWith(replies: unknown[]) {
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
