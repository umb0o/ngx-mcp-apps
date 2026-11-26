import { DestroyRef, Injectable, Injector, Signal, computed, inject, signal } from '@angular/core';
import { McpBridge, McpError, McpPort, parentWindowPort } from './bridge';
import {
  isCallToolResult,
  isDisplayModeResult,
  isInitializeResult,
  isRefusableResult,
  isToolInputParams,
  sanitizeHostContext,
} from './guards';
import { MCP_APP_CONFIG } from './mcp-app.config';
import {
  McpCallToolResult,
  McpDisplayMode,
  McpHostCapabilities,
  McpHostContext,
  Methods,
  PROTOCOL_VERSION,
} from './protocol';

export type McpAppStatus = 'connecting' | 'connected' | 'standalone';

const MIN_POLL_INTERVAL = 100;
const MAX_LOG_DETAIL = 1000;

/** Runtime check for your own data: a hand-written type guard, typia, a valibot `is`... */
export type McpGuard<T> = (value: unknown) => value is T;

export interface PollOptions<T> {
  /** Interval between calls, in ms. Default: 1000, minimum: 100. */
  intervalMs?: number;
  /** Arguments for the tool. Default: {}. */
  args?: Record<string, unknown>;
  /** Check each `structuredContent`: invalid values are dropped and logged, the signal keeps the last valid one. */
  guard?: McpGuard<T>;
  /** Injector that owns the polling (it stops when destroyed). Needed outside an injection context, e.g. in ngOnInit. */
  injector?: Injector;
}

/**
 * An Angular MCP App, exposed as signals.
 *
 * Host → app:  toolInput, toolResult, hostContext (theme, display mode, ...)
 * App → host:  callServerTool, sendMessage, updateModelContext, requestDisplayMode, openLink
 */
@Injectable({ providedIn: 'root' })
export class McpApp {
  private readonly config = inject(MCP_APP_CONFIG);

  private readonly _status = signal<McpAppStatus>('connecting');
  private readonly _toolInput = signal<Record<string, unknown> | undefined>(undefined);
  private readonly _toolInputPartial = signal<Record<string, unknown> | undefined>(undefined);
  private readonly _toolResult = signal<McpCallToolResult | undefined>(undefined);
  private readonly _toolCancelled = signal(false);
  private readonly _hostContext = signal<McpHostContext | undefined>(undefined);
  private readonly _hostCapabilities = signal<McpHostCapabilities | undefined>(undefined);
  private readonly _events = signal<string[]>([]);

  readonly status = this._status.asReadonly();
  /** True once the handshake with the host succeeded. */
  readonly connected = computed(() => this._status() === 'connected');
  /** Arguments of the tool call that opened this app. */
  readonly toolInput = this._toolInput.asReadonly();
  /** Arguments while the model is still streaming them. */
  readonly toolInputPartial = this._toolInputPartial.asReadonly();
  /** Result of the tool call that opened this app. */
  readonly toolResult = this._toolResult.asReadonly();
  /** `structuredContent` of the tool result. */
  readonly structuredContent = computed(() => this._toolResult()?.structuredContent);
  /** True if the host cancelled the tool call. */
  readonly toolCancelled = this._toolCancelled.asReadonly();
  readonly hostContext = this._hostContext.asReadonly();
  readonly hostCapabilities = this._hostCapabilities.asReadonly();
  readonly theme = computed(() => this._hostContext()?.theme);
  readonly displayMode = computed<McpDisplayMode>(
    () => this._hostContext()?.displayMode ?? 'inline',
  );
  readonly availableDisplayModes = computed<McpDisplayMode[]>(
    () => this._hostContext()?.availableDisplayModes ?? [],
  );
  readonly canFullscreen = computed(() => this.availableDisplayModes().includes('fullscreen'));
  /** Protocol event log, newest first (only when `log: true`). */
  readonly events = this._events.asReadonly();

  /** The underlying bridge, for protocol methods not wrapped here. Undefined when standalone. */
  readonly bridge?: McpBridge;

  constructor() {
    const port = this.config.port ?? this.defaultPort();
    if (!port) {
      this.standalone('not inside a host iframe');
      return;
    }
    const bridge = new McpBridge(
      port,
      { name: this.config.name, version: this.config.version },
      {
        timeout: this.config.requestTimeout,
        onError: (e, method) =>
          this.log(`${method} handler failed`, e instanceof Error ? e.message : e),
      },
    );
    this.bridge = bridge;

    // Handlers before connect(), so the first notifications are not lost
    bridge.onNotification(Methods.toolInput, (p: unknown) => {
      if (!this.valid(p, isToolInputParams, 'tool-input')) return;
      this.log('tool-input', p.arguments);
      this._toolCancelled.set(false);
      this._toolInput.set(p.arguments ?? {});
    });
    bridge.onNotification(Methods.toolInputPartial, (p: unknown) => {
      if (this.valid(p, isToolInputParams, 'tool-input-partial'))
        this._toolInputPartial.set(p.arguments);
    });
    bridge.onNotification(Methods.toolResult, (p: unknown) => {
      if (!this.valid(p, isCallToolResult, 'tool-result')) return;
      this.log('tool-result', p.structuredContent);
      this._toolCancelled.set(false);
      this._toolResult.set(p);
    });
    bridge.onNotification(Methods.toolCancelled, (p) => {
      this.log('tool-cancelled', p);
      this._toolCancelled.set(true);
    });
    bridge.onNotification(Methods.hostContextChanged, (p: unknown) => {
      const ctx = this.sanitizedContext(p, 'host-context');
      if (!ctx) return;
      this.log('host-context', ctx);
      this._hostContext.update((prev) => ({ ...prev, ...ctx }));
    });

    inject(DestroyRef).onDestroy(() => bridge.close());
    this.connect(bridge);
  }

  async callServerTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpCallToolResult> {
    const r = await this.require().request(Methods.callTool, { name, arguments: args });
    return this.checked(r, isCallToolResult, 'tools/call result');
  }

  /** Posts a user message to the conversation. Hosts may ask for confirmation or refuse. */
  async sendMessage(text: string): Promise<boolean> {
    const raw = await this.require().request(Methods.message, {
      role: 'user',
      content: [{ type: 'text', text }],
    });
    const r = this.checked(raw, isRefusableResult, 'ui/message result');
    this.log('send-message', r.isError ? 'refused' : 'ok');
    return !r.isError;
  }

  /** Silently adds context for the model's next turn. */
  async updateModelContext(
    text: string,
    structuredContent?: Record<string, unknown>,
  ): Promise<void> {
    await this.require().request(Methods.updateModelContext, {
      content: [{ type: 'text', text }],
      ...(structuredContent ? { structuredContent } : {}),
    });
    this.log('model-context', 'ok');
  }

  async requestDisplayMode(mode: McpDisplayMode): Promise<McpDisplayMode> {
    const raw = await this.require().request(Methods.requestDisplayMode, { mode });
    const r = this.checked(raw, isDisplayModeResult, 'ui/request-display-mode result');
    this._hostContext.update((prev) => ({ ...prev, displayMode: r.mode }));
    this.log('display-mode', `${mode} → ${r.mode}`);
    return r.mode;
  }

  toggleFullscreen(): Promise<McpDisplayMode> {
    return this.requestDisplayMode(this.displayMode() === 'fullscreen' ? 'inline' : 'fullscreen');
  }

  async openLink(url: string): Promise<boolean> {
    const raw = await this.require().request(Methods.openLink, { url });
    return !this.checked(raw, isRefusableResult, 'ui/open-link result').isError;
  }

  /** Asks the host to close this app. */
  requestTeardown(): void {
    this.bridge?.notify(Methods.requestTeardown, {});
  }

  /**
   * Calls a server tool every `intervalMs` and exposes its `structuredContent`.
   * Useful when the model updates server state (e.g. a "write to app" tool) and the open app must follow.
   * Polling runs while connected and stops when the injection context is destroyed.
   */
  pollServerTool<T = Record<string, unknown>>(
    name: string,
    options: PollOptions<T> = {},
  ): Signal<T | undefined> {
    const { intervalMs = 1000, args = {}, guard, injector } = options;
    // Resolve the owner first, so a misplaced call fails with a clear message instead of NG0203
    let destroyRef: DestroyRef;
    try {
      destroyRef = injector ? injector.get(DestroyRef) : inject(DestroyRef);
    } catch {
      throw new Error(
        'pollServerTool() must be called in an injection context (e.g. a field initializer), or given { injector }.',
      );
    }
    const value = signal<T | undefined>(undefined);
    let busy = false;
    const tick = async () => {
      if (busy || !this.connected()) return;
      busy = true;
      try {
        const r = await this.callServerTool(name, args);
        if (r.isError) this.log(`poll ${name}`, r.content);
        else if (!guard) value.set(r.structuredContent as T);
        else if (this.valid(r.structuredContent, guard, `${name} result`))
          value.set(r.structuredContent);
      } catch (e) {
        this.log(`poll ${name} failed`, e instanceof Error ? e.message : e);
      } finally {
        busy = false;
      }
    };
    // A zero, negative or NaN interval would flood the host
    const every = Number.isFinite(intervalMs) ? Math.max(MIN_POLL_INTERVAL, intervalMs) : 1000;
    const timer = setInterval(tick, every);
    void tick();
    destroyRef.onDestroy(() => clearInterval(timer));
    return value.asReadonly();
  }

  /**
   * `structuredContent` of the tool call that opened the app, checked by your guard.
   * Undefined until a valid result arrives (or if the result does not pass the check).
   */
  structuredContentAs<T>(guard: McpGuard<T>): Signal<T | undefined> {
    return computed(() => {
      const v = this._toolResult()?.structuredContent;
      return guard(v) ? v : undefined;
    });
  }

  private connect(bridge: McpBridge): void {
    const timeout = setTimeout(
      () => this.standalone('connect timeout'),
      this.config.connectTimeout ?? 4000,
    );
    bridge
      .connect()
      .then((raw) => {
        clearTimeout(timeout);
        const r = this.checked(raw, isInitializeResult, 'ui/initialize result');
        if (r.protocolVersion !== PROTOCOL_VERSION)
          this.log('protocol version', `app ${PROTOCOL_VERSION}, host ${r.protocolVersion}`);
        this._hostCapabilities.set(r.hostCapabilities);
        this._hostContext.set(this.sanitizedContext(r.hostContext, 'host context') ?? {});
        this._status.set('connected');
        this.log('connected', { host: r.hostInfo, capabilities: r.hostCapabilities });
        if ((this.config.autoResize ?? true) && typeof ResizeObserver !== 'undefined')
          bridge.startAutoResize();
      })
      .catch((e) => {
        clearTimeout(timeout);
        this.standalone(e instanceof Error ? e.message : String(e));
      });
  }

  /** Notifications: an invalid message is dropped and logged. */
  private valid<T>(v: unknown, guard: (v: unknown) => v is T, what: string): v is T {
    if (guard(v)) return true;
    this.log(`invalid ${what} dropped`, v);
    return false;
  }

  /** Host context: invalid known fields are dropped one by one, the rest is kept. */
  private sanitizedContext(v: unknown, what: string): McpHostContext | undefined {
    const r = sanitizeHostContext(v);
    if (!r) {
      this.log(`invalid ${what} dropped`, v);
      return undefined;
    }
    if (r.dropped.length) this.log(`${what}: invalid fields dropped`, r.dropped.join(', '));
    return r.context;
  }

  /** Results: an invalid answer becomes a clear error instead of a crash later on. */
  private checked<T>(v: unknown, guard: (v: unknown) => v is T, what: string): T {
    if (guard(v)) return v;
    this.log(`invalid ${what}`, v);
    throw new McpError(-32602, `Invalid ${what} from host`, v);
  }

  private defaultPort(): McpPort | undefined {
    if (typeof window === 'undefined' || window.parent === window) return undefined;
    return parentWindowPort({ allowedOrigins: this.config.allowedOrigins });
  }

  private require(): McpBridge {
    if (!this.bridge || !this.connected()) throw new Error('McpApp is not connected to a host');
    return this.bridge;
  }

  private standalone(reason: string): void {
    if (this._status() === 'connected') return;
    this._status.set('standalone');
    this.log('standalone', reason);
  }

  private log(event: string, data?: unknown): void {
    if (!this.config.log) return;
    const time = new Date().toLocaleTimeString();
    let detail = '';
    if (data !== undefined) {
      try {
        detail = ' ' + (typeof data === 'string' ? data : JSON.stringify(data));
      } catch {
        detail = ' [unserializable]'; // e.g. circular data, which postMessage allows
      }
    }
    // Host data can be large: keep the log small
    if (detail.length > MAX_LOG_DETAIL) detail = detail.slice(0, MAX_LOG_DETAIL) + '…';
    this._events.update((e) => [`${time} ${event}${detail}`, ...e].slice(0, 50));
  }
}
