/**
 * The previews of the documentation site: shows ONE of the copy-and-paste components, chosen by the
 * address (`gallery.html#mcp-status`), with the little it needs around it to be seen working.
 */
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { McpApp, McpCallToolResult, provideMcpApp } from 'ngx-mcp-apps';
import { McpCallTool } from '../../example/src/app/components/mcp-call-tool';
import { McpFullscreenButton } from '../../example/src/app/components/mcp-fullscreen-button';
import { McpHostLink } from '../../example/src/app/components/mcp-host-link';
import { McpLiveValue } from '../../example/src/app/components/mcp-live-value';
import { McpStandaloneNotice } from '../../example/src/app/components/mcp-standalone-notice';
import { McpStatus } from '../../example/src/app/components/mcp-status';
import { McpTellModel } from '../../example/src/app/components/mcp-tell-model';
import { McpTheme } from '../../example/src/app/components/mcp-theme';
import { McpToolState } from '../../example/src/app/components/mcp-tool-state';

@Component({
  selector: 'app-root',
  hostDirectives: [McpTheme],
  imports: [
    McpCallTool,
    McpFullscreenButton,
    McpHostLink,
    McpLiveValue,
    McpStandaloneNotice,
    McpStatus,
    McpTellModel,
    McpToolState,
  ],
  template: `
    @switch (which) {
      @case ('mcp-status') {
        <mcp-status />
      }
      @case ('mcp-tool-state') {
        <mcp-tool-state>
          <p>The result arrived: this is where your view of it goes.</p>
        </mcp-tool-state>
        <p class="hint">Press "Run again" to see the waiting state.</p>
      }
      @case ('mcp-call-tool') {
        <button
          class="plain"
          mcpCallTool="add_item"
          [args]="{ text: 'Umbrella' }"
          (result)="added($event)"
          (failed)="outcome.set($event)"
        >
          Add an umbrella to the list
        </button>
        <p class="hint" role="status">{{ outcome() }}</p>
      }
      @case ('mcp-live-value') {
        <p>
          Changes saved on the server: <strong><mcp-live-value /></strong>
        </p>
        <button class="plain" mcpCallTool="add_item" [args]="{ text: 'Umbrella' }">
          Make a change
        </button>
        <p class="hint">The number follows the server within a second.</p>
      }
      @case ('mcp-theme') {
        <p>
          Theme from the host: <strong>{{ mcp.theme() ?? 'none' }}</strong>
        </p>
        <p>
          System setting, as this frame sees it: <span class="value">{{ system() }}</span>
        </p>
        <div class="from-host">
          <p>This box is drawn only with the variables of the host.</p>
          <p class="hint">
            Variables received: {{ variableCount() }}. Text, background and border come from them.
          </p>
        </div>
        <p class="hint">Switch the theme of this page: the host tells the app.</p>
      }
      @case ('mcp-fullscreen-button') {
        <mcp-fullscreen-button />
        <p class="hint">Display mode: {{ mcp.displayMode() }}</p>
      }
      @case ('mcp-tell-model') {
        <mcp-tell-model />
      }
      @case ('mcp-host-link') {
        <p><a mcpHostLink href="https://github.com/umb0o/ngx-mcp-apps">Open the repository</a></p>
        <p class="hint">The app asks the host to open it.</p>
      }
      @case ('mcp-standalone-notice') {
        <mcp-standalone-notice />
        @if (mcp.connected()) {
          <p class="hint">
            Connected to a host, so the notice is hidden.
            <a [href]="here" target="_blank" rel="noopener">Open this preview alone</a> to see it.
          </p>
        }
      }
      @default {
        <p>Unknown component: {{ which }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.7rem;
      justify-items: start;
      padding: 1.25rem;
      font:
        15px/1.5 system-ui,
        sans-serif;
      color: light-dark(#16203a, #e6eaf5);
    }
    mcp-tell-model,
    mcp-tool-state {
      justify-self: stretch;
    }
    p {
      margin: 0;
    }
    a {
      color: inherit;
    }
    .value {
      font-weight: 600;
    }
    /* No colour of its own: without the variables of the host it looks like the text around it */
    .from-host {
      justify-self: stretch;
      padding: 0.7rem 0.9rem;
      border-radius: 8px;
      color: var(--color-text-primary);
      background: var(--color-background-primary);
      border: 1px solid var(--color-border-primary, transparent);
    }
    .hint {
      font-size: 0.88em;
      opacity: 0.75;
    }
    .plain {
      font: inherit;
      color: inherit;
      cursor: pointer;
      padding: 0.35em 0.9em;
      border-radius: 6px;
      background: transparent;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    }
    .plain:disabled {
      opacity: 0.5;
    }
  `,
})
export class Gallery {
  protected readonly mcp = inject(McpApp);
  protected readonly which = location.hash.slice(1);
  protected readonly here = location.href;
  protected readonly outcome = signal('');

  /** For the preview of the theme: what the browser says, and how many style variables the host sent. */
  private readonly darkQuery = matchMedia('(prefers-color-scheme: dark)');
  protected readonly system = signal(this.darkQuery.matches ? 'dark' : 'light');
  protected readonly variableCount = computed(
    () => Object.keys(this.mcp.hostContext()?.styles?.variables ?? {}).length,
  );

  constructor() {
    const follow = () => this.system.set(this.darkQuery.matches ? 'dark' : 'light');
    this.darkQuery.addEventListener('change', follow);
    inject(DestroyRef).onDestroy(() => this.darkQuery.removeEventListener('change', follow));
  }

  protected added(result: McpCallToolResult): void {
    const items = result.structuredContent?.['items'];
    this.outcome.set(
      Array.isArray(items) ? `Done: the list now has ${items.length} items.` : 'Done.',
    );
  }
}

bootstrapApplication(Gallery, {
  providers: [provideMcpApp({ name: 'component-preview', version: '1.0.0', connectTimeout: 1500 })],
}).catch((e) => console.error(e));
