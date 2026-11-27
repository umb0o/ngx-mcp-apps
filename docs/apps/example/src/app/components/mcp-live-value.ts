/**
 * Follow server state
 *
 * A tool result reaches the app once. To show something that changes afterwards, for example because the
 * model called another tool, read it from your server again and again. This component follows a counter:
 * it calls `read_counter` every second and checks each answer with a guard. Copy it, then change the
 * tool name, the guard and the template.
 *
 * Usage: `<mcp-live-value />`
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { McpApp, isObject } from 'ngx-mcp-apps';

interface Counter {
  value: number;
}
const isCounter = (v: unknown): v is Counter => isObject(v) && typeof v['value'] === 'number';

@Component({
  selector: 'mcp-live-value',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ counter()?.value ?? '…' }}`,
  styles: `
    :host {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class McpLiveValue {
  // In a field initializer: the polling stops when the component is destroyed
  protected readonly counter = inject(McpApp).pollServerTool('read_counter', {
    intervalMs: 1000,
    guard: isCounter,
  });
}
