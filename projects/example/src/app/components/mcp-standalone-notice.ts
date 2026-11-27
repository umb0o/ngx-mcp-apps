/**
 * Standalone notice
 *
 * A line shown only when the app runs outside a host, for example with `ng serve`. There is no tool data
 * there and calls to the host fail: saying so saves a puzzled minute while developing.
 *
 * Usage: `<mcp-standalone-notice />`
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { McpApp } from 'ngx-mcp-apps';

@Component({
  selector: 'mcp-standalone-notice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mcp.status() === 'standalone') {
      <p>This page is running outside a chat host: there is no tool data, and host calls fail.</p>
    }
  `,
  styles: `
    p {
      margin: 0;
      padding: 0.5em 0.8em;
      border-radius: 6px;
      font-size: 0.9em;
      border: 1px dashed color-mix(in srgb, currentColor 40%, transparent);
    }
  `,
})
export class McpStandaloneNotice {
  protected readonly mcp = inject(McpApp);
}
