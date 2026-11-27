/**
 * Fullscreen button
 *
 * Asks the host to show the app in fullscreen, and back. It renders nothing when the host does not offer
 * fullscreen (many mobile hosts do not), so you can leave it in the template.
 *
 * Usage: `<mcp-fullscreen-button />`
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { McpApp } from 'ngx-mcp-apps';

@Component({
  selector: 'mcp-fullscreen-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mcp.canFullscreen()) {
      <button type="button" (click)="mcp.toggleFullscreen()">{{ label() }}</button>
    }
  `,
  styles: `
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      padding: 0.3em 0.8em;
      border-radius: 6px;
      background: transparent;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    }
    button:hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
  `,
})
export class McpFullscreenButton {
  protected readonly mcp = inject(McpApp);
  protected readonly label = computed(() =>
    this.mcp.displayMode() === 'fullscreen' ? 'Exit fullscreen' : 'Fullscreen',
  );
}
