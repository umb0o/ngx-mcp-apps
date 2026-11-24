import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { McpBridge, McpPort, parentWindowPort } from './bridge';
import { MCP_APP_CONFIG } from './mcp-app.config';
import { McpCallToolResult, McpDisplayMode, McpHostCapabilities, McpHostContext, Methods } from './protocol';

export type McpAppStatus = 'connecting' | 'connected' | 'standalone';

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
  readonly displayMode = computed<McpDisplayMode>(() => this._hostContext()?.displayMode ?? 'inline');
  readonly availableDisplayModes = computed<McpDisplayMode[]>(() => this._hostContext()?.availableDisplayModes ?? []);
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
    const bridge = new McpBridge(port, { name: this.config.name, version: this.config.version }, {
      timeout: this.config.requestTimeout,
    });
    this.bridge = bridge;

    // Handlers before connect(), so the first notifications are not lost
    bridge.onNotification(Methods.toolInput, (p: { arguments?: Record<string, unknown> }) => {
      this.log('tool-input', p?.arguments);
      this._toolInput.set(p?.arguments ?? {});
    });
    bridge.onNotification(Methods.toolInputPartial, (p: { arguments?: Record<string, unknown> }) =>
      this._toolInputPartial.set(p?.arguments),
    );
    bridge.onNotification(Methods.toolResult, (p: McpCallToolResult) => {
      this.log('tool-result', p?.structuredContent);
      this._toolResult.set(p);
    });
    bridge.onNotification(Methods.toolCancelled, (p) => {
      this.log('tool-cancelled', p);
      this._toolCancelled.set(true);
    });
    bridge.onNotification(Methods.hostContextChanged, (p: McpHostContext) => {
      this.log('host-context', p);
      this._hostContext.update((prev) => ({ ...prev, ...p }));
    });

    inject(DestroyRef).onDestroy(() => bridge.close());
    this.connect(bridge);
  }

  callServerTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallToolResult> {
    return this.require().request<McpCallToolResult>(Methods.callTool, { name, arguments: args });
  }

  /** Posts a user message to the conversation. Hosts may ask for confirmation or refuse. */
  async sendMessage(text: string): Promise<boolean> {
    const r = await this.require().request<{ isError?: boolean }>(Methods.message, {
      role: 'user',
      content: [{ type: 'text', text }],
    });
    this.log('send-message', r?.isError ? 'refused' : 'ok');
    return !r?.isError;
  }

  /** Silently adds context for the model's next turn. */
  async updateModelContext(text: string, structuredContent?: Record<string, unknown>): Promise<void> {
    await this.require().request(Methods.updateModelContext, {
      content: [{ type: 'text', text }],
      ...(structuredContent ? { structuredContent } : {}),
    });
    this.log('model-context', 'ok');
  }

  async requestDisplayMode(mode: McpDisplayMode): Promise<McpDisplayMode> {
    const r = await this.require().request<{ mode: McpDisplayMode }>(Methods.requestDisplayMode, { mode });
    this._hostContext.update((prev) => ({ ...prev, displayMode: r.mode }));
    this.log('display-mode', `${mode} → ${r.mode}`);
    return r.mode;
  }

  toggleFullscreen(): Promise<McpDisplayMode> {
    return this.requestDisplayMode(this.displayMode() === 'fullscreen' ? 'inline' : 'fullscreen');
  }

  async openLink(url: string): Promise<boolean> {
    const r = await this.require().request<{ isError?: boolean }>(Methods.openLink, { url });
    return !r?.isError;
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
  pollServerTool<T>(name: string, intervalMs = 1000, args: Record<string, unknown> = {}): Signal<T | undefined> {
    const value = signal<T | undefined>(undefined);
    let busy = false;
    const tick = async () => {
      if (busy || !this.connected()) return;
      busy = true;
      try {
        const r = await this.callServerTool(name, args);
        if (r.isError) this.log(`poll ${name}`, r.content);
        else value.set(r.structuredContent as T);
      } catch (e) {
        this.log(`poll ${name} failed`, e instanceof Error ? e.message : e);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, intervalMs);
    void tick();
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    return value.asReadonly();
  }

  private connect(bridge: McpBridge): void {
    const timeout = setTimeout(() => this.standalone('connect timeout'), this.config.connectTimeout ?? 4000);
    bridge
      .connect()
      .then((r) => {
        clearTimeout(timeout);
        this._hostCapabilities.set(r.hostCapabilities);
        this._hostContext.set(r.hostContext);
        this._status.set('connected');
        this.log('connected', { host: r.hostInfo, capabilities: r.hostCapabilities });
        if ((this.config.autoResize ?? true) && typeof ResizeObserver !== 'undefined') bridge.startAutoResize();
      })
      .catch((e) => {
        clearTimeout(timeout);
        this.standalone(e instanceof Error ? e.message : String(e));
      });
  }

  private defaultPort(): McpPort | undefined {
    if (typeof window === 'undefined' || window.parent === window) return undefined;
    return parentWindowPort();
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
    const detail = data === undefined ? '' : ' ' + (typeof data === 'string' ? data : JSON.stringify(data));
    this._events.update((e) => [`${time} ${event}${detail}`, ...e].slice(0, 50));
  }
}
