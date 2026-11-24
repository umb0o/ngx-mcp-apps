import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
// Self-contained build: no lazy chunks, so the app can be inlined into a single HTML file
import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';
import { MCP_APP_CONFIG } from './mcp-app.config';

export type McpAppStatus = 'connecting' | 'connected' | 'standalone';
export type McpDisplayMode = 'inline' | 'fullscreen' | 'pip';

type CallToolResult = Awaited<ReturnType<App['callServerTool']>>;
type HostContext = NonNullable<ReturnType<App['getHostContext']>>;
type HostCapabilities = NonNullable<ReturnType<App['getHostCapabilities']>>;

/**
 * Angular wrapper around the MCP Apps `App` class, exposed as signals.
 *
 * Host → app:  toolInput, toolResult, hostContext (theme, display mode, ...)
 * App → host:  callServerTool, sendMessage, updateModelContext, requestDisplayMode, openLink
 */
@Injectable({ providedIn: 'root' })
export class McpApp {
  private readonly config = inject(MCP_APP_CONFIG);
  private readonly destroyRef = inject(DestroyRef);

  /** The underlying `App` from @modelcontextprotocol/ext-apps, for anything not wrapped here. */
  readonly app = new App(
    { name: this.config.name, version: this.config.version },
    {},
    { autoResize: this.config.autoResize ?? true },
  );

  private readonly _status = signal<McpAppStatus>('connecting');
  private readonly _toolInput = signal<Record<string, unknown> | undefined>(undefined);
  private readonly _toolResult = signal<CallToolResult | undefined>(undefined);
  private readonly _hostContext = signal<HostContext | undefined>(undefined);
  private readonly _hostCapabilities = signal<HostCapabilities | undefined>(undefined);
  private readonly _events = signal<string[]>([]);

  readonly status = this._status.asReadonly();
  /** True once the handshake with the host succeeded. */
  readonly connected = computed(() => this._status() === 'connected');
  /** Arguments of the tool call that opened this app. */
  readonly toolInput = this._toolInput.asReadonly();
  /** Result of the tool call that opened this app. */
  readonly toolResult = this._toolResult.asReadonly();
  /** `structuredContent` of the tool result, typed by the caller. */
  readonly structuredContent = computed(() => this._toolResult()?.structuredContent);
  readonly hostContext = this._hostContext.asReadonly();
  readonly hostCapabilities = this._hostCapabilities.asReadonly();
  readonly displayMode = computed<McpDisplayMode>(() => (this._hostContext()?.displayMode as McpDisplayMode) ?? 'inline');
  readonly availableDisplayModes = computed<McpDisplayMode[]>(
    () => (this._hostContext()?.availableDisplayModes as McpDisplayMode[] | undefined) ?? [],
  );
  readonly canFullscreen = computed(() => this.availableDisplayModes().includes('fullscreen'));
  /** Protocol event log, newest first (only when `log: true`). */
  readonly events = this._events.asReadonly();

  constructor() {
    // Handlers before connect(), so the first notifications are not lost
    this.app.ontoolinput = ({ arguments: args }) => {
      this.log('tool-input', args);
      this._toolInput.set(args);
    };
    this.app.ontoolresult = (result) => {
      this.log('tool-result', result.structuredContent);
      this._toolResult.set(result);
    };
    this.app.onhostcontextchanged = (ctx) => {
      this.log('host-context', ctx);
      this._hostContext.update((prev) => ({ ...prev, ...ctx }));
    };
    this.connect();
  }

  callServerTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    return this.app.callServerTool({ name, arguments: args });
  }

  /** Posts a user message to the conversation. Hosts may ask for confirmation or refuse. */
  async sendMessage(text: string): Promise<boolean> {
    const r = await this.app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
    this.log('send-message', r.isError ? 'refused' : 'ok');
    return !r.isError;
  }

  /** Silently adds context for the model's next turn. */
  async updateModelContext(text: string): Promise<void> {
    await this.app.updateModelContext({ content: [{ type: 'text', text }] });
    this.log('model-context', 'ok');
  }

  async requestDisplayMode(mode: McpDisplayMode): Promise<McpDisplayMode> {
    const r = await this.app.requestDisplayMode({ mode });
    this._hostContext.update((prev) => ({ ...prev, displayMode: r.mode }) as HostContext);
    this.log('display-mode', `${mode} → ${r.mode}`);
    return r.mode as McpDisplayMode;
  }

  toggleFullscreen(): Promise<McpDisplayMode> {
    return this.requestDisplayMode(this.displayMode() === 'fullscreen' ? 'inline' : 'fullscreen');
  }

  openLink(url: string): Promise<unknown> {
    return this.app.openLink({ url });
  }

  /**
   * Calls a server tool every `intervalMs` and exposes its `structuredContent`.
   * Useful when the model updates server state (e.g. a "write to app" tool) and the open app must follow.
   * Polling starts once connected and stops when the injector is destroyed.
   */
  pollServerTool<T>(name: string, intervalMs = 1000, args: Record<string, unknown> = {}): Signal<T | undefined> {
    const value = signal<T | undefined>(undefined);
    let busy = false;
    let timer: ReturnType<typeof setInterval> | undefined;
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
    timer = setInterval(tick, intervalMs);
    void tick();
    this.destroyRef.onDestroy(() => clearInterval(timer));
    return value.asReadonly();
  }

  private connect(): void {
    if (typeof window === 'undefined' || window.parent === window) {
      this.standalone('not inside a host iframe');
      return;
    }
    const timeout = setTimeout(() => this.standalone('connect timeout'), this.config.connectTimeout ?? 4000);
    this.app
      .connect()
      .then(() => {
        clearTimeout(timeout);
        this._hostCapabilities.set(this.app.getHostCapabilities());
        this._hostContext.set(this.app.getHostContext());
        this._status.set('connected');
        this.log('connected', this.app.getHostCapabilities());
      })
      .catch((e) => {
        clearTimeout(timeout);
        this.standalone(e instanceof Error ? e.message : String(e));
      });
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
