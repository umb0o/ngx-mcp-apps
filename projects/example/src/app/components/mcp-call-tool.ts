/**
 * Button that calls a server tool
 *
 * Put it on a `<button>`: a click calls a tool of your MCP server through the host. While the call runs
 * the button is disabled and marked busy, so a second click cannot start a second call.
 *
 * Usage: `<button mcpCallTool="add_item" [args]="{ text }" (result)="saved($event)" (failed)="show($event)">Add</button>`
 */
import { Directive, inject, input, output, signal } from '@angular/core';
import { McpApp, McpCallToolResult } from 'ngx-mcp-apps';

@Directive({
  selector: 'button[mcpCallTool]',
  standalone: true,
  exportAs: 'mcpCallTool',
  host: {
    '(click)': 'call()',
    '[disabled]': 'pending()',
    '[attr.aria-busy]': 'pending()',
  },
})
export class McpCallTool {
  private readonly mcp = inject(McpApp);

  /** Name of the tool on your server. */
  readonly tool = input.required<string>({ alias: 'mcpCallTool' });
  readonly args = input<Record<string, unknown>>({});

  /** The result of the tool, when it succeeded. */
  readonly result = output<McpCallToolResult>();
  /** A message to show, when the call failed or the tool answered with `isError`. */
  readonly failed = output<string>();

  /** True while the call runs. Read it in the template with `#call="mcpCallTool"`. */
  readonly pending = signal(false);

  protected async call(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    try {
      const result = await this.mcp.callServerTool(this.tool(), this.args());
      if (result.isError) {
        const text = result.content.find((block) => block.type === 'text')?.text;
        this.failed.emit(text ?? 'The tool failed.');
      } else {
        this.result.emit(result);
      }
    } catch (e) {
      // Not connected, timeout, or the host refused
      this.failed.emit(e instanceof Error ? e.message : String(e));
    } finally {
      this.pending.set(false);
    }
  }
}
