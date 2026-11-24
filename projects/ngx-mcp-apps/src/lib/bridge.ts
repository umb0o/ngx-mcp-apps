import {
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  McpImplementation,
  McpInitializeResult,
  Methods,
  PROTOCOL_VERSION,
} from './protocol';

/** Where messages go and come from. In a browser this is the parent window (the host). */
export interface McpPort {
  post(message: JsonRpcMessage): void;
  /** Subscribe to incoming messages; returns an unsubscribe function. */
  listen(onMessage: (message: unknown) => void): () => void;
}

export interface ParentWindowPortOptions {
  /**
   * Talk only to a parent with one of these origins (e.g. `https://claude.ai`).
   * Messages from other origins are ignored and nothing is posted to them.
   * Default: any origin, like the official SDK (hosts usually wrap the app in a sandbox with its own origin).
   */
  allowedOrigins?: string[];
}

/**
 * Port that talks to the host through `window.parent.postMessage`, like the official SDK.
 * Incoming messages are accepted only from the parent window.
 */
export function parentWindowPort(options: ParentWindowPortOptions = {}): McpPort {
  const allowed = options.allowedOrigins;
  return {
    post: (message) => {
      if (!allowed) window.parent.postMessage(message, '*');
      // The browser delivers only to the origin that matches
      else for (const origin of allowed) window.parent.postMessage(message, origin);
    },
    listen: (onMessage) => {
      const listener = (event: MessageEvent) => {
        if (event.source !== window.parent) return;
        if (allowed && !allowed.includes(event.origin)) return;
        onMessage(event.data);
      };
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    },
  };
}

export class McpError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

type RequestHandler = (params: any) => unknown | Promise<unknown>;
type NotificationHandler = (params: any) => void;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface McpBridgeOptions {
  /** Request timeout in ms. Default: 60000. */
  timeout?: number;
  /** App capabilities sent during `ui/initialize`. Default: {}. */
  appCapabilities?: Record<string, unknown>;
  /** Called when a notification handler throws. Default: console.error. */
  onError?: (error: unknown, method: string) => void;
}

/**
 * Framework-agnostic MCP Apps view runtime: JSON-RPC over a port, the `ui/initialize`
 * handshake and auto-resize. No dependencies.
 */
export class McpBridge {
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, Pending>();
  private readonly requestHandlers = new Map<string, RequestHandler>();
  private readonly notificationHandlers = new Map<string, NotificationHandler>();
  private readonly unlisten: () => void;
  private stopResize?: () => void;
  private closed = false;

  constructor(
    private readonly port: McpPort,
    private readonly appInfo: McpImplementation,
    private readonly options: McpBridgeOptions = {},
  ) {
    // The host may probe the view at any time
    this.onRequest(Methods.ping, () => ({}));
    this.onRequest(Methods.resourceTeardown, () => ({}));
    this.unlisten = port.listen((m) => this.receive(m));
  }

  /** Runs the `ui/initialize` handshake and sends `ui/notifications/initialized`. */
  async connect(): Promise<McpInitializeResult> {
    const result = await this.request<McpInitializeResult>(Methods.initialize, {
      appInfo: this.appInfo,
      appCapabilities: this.options.appCapabilities ?? {},
      protocolVersion: PROTOCOL_VERSION,
    });
    this.notify(Methods.initialized, {});
    return result;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new McpError(-32000, 'Bridge closed'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new McpError(-32001, `Request timed out: ${method}`));
      }, this.options.timeout ?? 60000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        this.port.post({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
      } catch (e) {
        // e.g. DataCloneError: fail now instead of waiting for the timeout
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new McpError(-32603, `Could not send ${method}: ${e instanceof Error ? e.message : String(e)}`));
      }
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return;
    this.port.post({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
  }

  /** Handle a request from the host. Replaces any previous handler for the method. */
  onRequest(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  /** Handle a notification from the host. Replaces any previous handler for the method. */
  onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  /**
   * Tells the host the content size whenever it changes, so the iframe fits the content.
   * Same measurement as the official SDK: the document height at `max-content`.
   */
  startAutoResize(): () => void {
    this.stopResize?.();
    let scheduled = false;
    let lastWidth = 0;
    let lastHeight = 0;
    const measure = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const html = document.documentElement;
        const previous = html.style.height;
        html.style.height = 'max-content';
        const height = Math.ceil(html.getBoundingClientRect().height);
        html.style.height = previous;
        const width = Math.ceil(window.innerWidth);
        if (width !== lastWidth || height !== lastHeight) {
          lastWidth = width;
          lastHeight = height;
          this.notify(Methods.sizeChanged, { width, height });
        }
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    this.stopResize = () => observer.disconnect();
    return this.stopResize;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unlisten();
    this.stopResize?.();
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new McpError(-32000, 'Bridge closed'));
    }
    this.pending.clear();
  }

  private receive(raw: unknown): void {
    if (!raw || typeof raw !== 'object' || (raw as { jsonrpc?: unknown }).jsonrpc !== '2.0') return;
    const message = raw as Partial<JsonRpcRequest & JsonRpcResponse>;

    // Response to one of our requests
    if (message.id !== undefined && message.method === undefined) {
      const p = this.pending.get(message.id);
      if (!p) return;
      this.pending.delete(message.id);
      clearTimeout(p.timer);
      if (message.error !== undefined && message.error !== null) {
        // The error object comes from outside: do not trust its shape
        const err = message.error as { code?: unknown; message?: unknown; data?: unknown };
        const code = typeof err.code === 'number' ? err.code : -32603;
        const text = typeof err.message === 'string' ? err.message : 'Unknown error from host';
        p.reject(new McpError(code, text, err.data));
      } else p.resolve(message.result);
      return;
    }
    if (typeof message.method !== 'string') return;

    // Request from the host: always answer
    if (message.id !== undefined) {
      void this.answer(message.id, message.method, message.params);
      return;
    }

    // Notification from the host
    const handler = this.notificationHandlers.get(message.method);
    if (!handler) return;
    try {
      handler(message.params);
    } catch (e) {
      const report = this.options.onError ?? ((err: unknown, m: string) => console.error(`[ngx-mcp-apps] ${m} handler failed`, err));
      report(e, message.method);
    }
  }

  private async answer(id: JsonRpcId, method: string, params: unknown): Promise<void> {
    const handler = this.requestHandlers.get(method);
    if (!handler) {
      this.reply({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      return;
    }
    let response: JsonRpcResponse;
    try {
      response = { jsonrpc: '2.0', id, result: (await handler(params)) ?? {} };
    } catch (e) {
      const error = e instanceof McpError ? e : new McpError(-32603, e instanceof Error ? e.message : String(e));
      response = { jsonrpc: '2.0', id, error: { code: error.code, message: error.message, data: error.data } };
    }
    if (!this.reply(response)) {
      // The result could not be sent (e.g. not cloneable): the host must still get an answer
      this.reply({ jsonrpc: '2.0', id, error: { code: -32603, message: `Could not send the result of ${method}` } });
    }
  }

  /** Sends a response; never throws, so a bad handler result cannot become an unhandled rejection. */
  private reply(response: JsonRpcResponse): boolean {
    if (this.closed) return true;
    try {
      this.port.post(response);
      return true;
    } catch {
      return false;
    }
  }
}
