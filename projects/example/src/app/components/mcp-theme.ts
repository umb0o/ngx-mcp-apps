/**
 * Host theme
 *
 * Follows the light or dark theme of the host. It writes `data-theme` on the `<html>` element, so your
 * stylesheet can react with `:root[data-theme='dark'] { ... }`. Keep the page background transparent:
 * the host draws it.
 *
 * Usage: add `McpTheme` to the `hostDirectives` of your root component, or put `mcpTheme` on any element.
 */
import { DOCUMENT } from '@angular/common';
import { Directive, effect, inject } from '@angular/core';
import { McpApp } from 'ngx-mcp-apps';

@Directive({
  selector: '[mcpTheme]',
  standalone: true,
})
export class McpTheme {
  constructor() {
    const mcp = inject(McpApp);
    const root = inject(DOCUMENT).documentElement;
    effect(() => {
      const theme = mcp.theme();
      // No theme from the host (or standalone): leave the choice to the browser
      if (theme) root.setAttribute('data-theme', theme);
      else root.removeAttribute('data-theme');
    });
  }
}
