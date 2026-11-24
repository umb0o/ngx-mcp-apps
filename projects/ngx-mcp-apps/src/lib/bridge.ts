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

/** Port that talks to the host through `window.parent.postMessage`, like the official SDK. */
export function parentWindowPort(): McpPort {
  return {
    post: (message) => window.parent.postMessage(message, '*'),
    listen: (onMessage) => {
      const listener = (event: MessageEvent) => {
        if (event.source === window.parent) onMessage(event.data);
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
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new McpError(-32001, `Request timed out: ${method}`));
      }, this.options.timeout ?? 60000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.port.post({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  notify(method: string, params?: unknown): void {
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
      if (message.error) p.reject(new McpError(message.error.code, message.error.message, message.error.data));
      else p.resolve(message.result);
      return;
    }
    if (typeof message.method !== 'string') return;

    // Request from the host: always answer
    if (message.id !== undefined) {
      void this.answer(message.id, message.method, message.params);
      return;
    }

    // Notification from the host
    this.notificationHandlers.get(message.method)?.(message.params);
  }

  private async answer(id: JsonRpcId, method: string, params: unknown): Promise<void> {
    const handler = this.requestHandlers.get(method);
    if (!handler) {
      this.port.post({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      return;
    }
    try {
      const result = await handler(params);
      this.port.post({ jsonrpc: '2.0', id, result: result ?? {} });
    } catch (e) {
      const error = e instanceof McpError ? e : new McpError(-32603, e instanceof Error ? e.message : String(e));
      this.port.post({ jsonrpc: '2.0', id, error: { code: error.code, message: error.message, data: error.data } });
    }
  }
}
