/**
 * Link opened by the host
 *
 * Inside the host iframe a normal link is usually blocked by the sandbox. This directive asks the host
 * to open the link instead. Outside a host, or if the host refuses, the link opens as a normal one in a
 * new tab.
 *
 * Usage: `<a mcpHostLink href="https://example.com/docs">Docs</a>`
 */
import { Directive, ElementRef, inject } from '@angular/core';
import { McpApp } from 'ngx-mcp-apps';

@Directive({
  selector: 'a[mcpHostLink]',
  standalone: true,
  host: {
    '(click)': 'open($event)',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
})
export class McpHostLink {
  private readonly mcp = inject(McpApp);
  private readonly link = inject<ElementRef<HTMLAnchorElement>>(ElementRef).nativeElement;

  protected async open(event: MouseEvent): Promise<void> {
    // Standalone: let the browser follow the link
    if (!this.mcp.connected()) return;
    event.preventDefault();
    const url = this.link.href;
    let opened = false;
    try {
      opened = await this.mcp.openLink(url);
    } catch {
      opened = false;
    }
    if (!opened) window.open(url, '_blank', 'noopener,noreferrer');
  }
}
