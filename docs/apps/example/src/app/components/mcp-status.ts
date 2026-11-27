/**
 * Connection status
 *
 * A small badge that says whether the app is talking to a host. Useful in a header while you develop:
 * outside a host (`ng serve`, a browser tab) it reads "Standalone".
 *
 * Usage: `<mcp-status />`
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { McpApp } from 'ngx-mcp-apps';

const LABELS = {
  connecting: 'Connecting',
  connected: 'Connected',
  standalone: 'Standalone',
} as const;

@Component({
  selector: 'mcp-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dot" aria-hidden="true"></span>{{ label() }}`,
  host: { role: 'status', '[attr.data-status]': 'mcp.status()' },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      font-size: 0.85em;
      padding: 0.15em 0.6em;
      border-radius: 99px;
      border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    }
    .dot {
      width: 0.55em;
      height: 0.55em;
      border-radius: 50%;
      background: #b8860b;
    }
    :host([data-status='connected']) .dot {
      background: #1f9d55;
    }
    :host([data-status='standalone']) .dot {
      background: color-mix(in srgb, currentColor 45%, transparent);
    }
  `,
})
export class McpStatus {
  protected readonly mcp = inject(McpApp);
  protected readonly label = computed(() => LABELS[this.mcp.status()]);
}
