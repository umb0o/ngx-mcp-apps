/**
 * Host theme
 *
 * Follows the light or dark theme of the host. It writes `data-theme` on the `<html>` element, so your
 * stylesheet can react with `:root[data-theme='dark'] { ... }`, and sets `color-scheme` there too. That
 * second part matters: when the colour scheme of your page differs from the one of the host, the browser
 * paints the frame white instead of leaving it transparent. It also copies the style variables the host
 * sends (colours, fonts) to the `<html>` element, so your CSS can use them with a fallback:
 * `color: var(--color-text-primary, #16203a)`. Keep the page background transparent: the host draws it.
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
      root.style.colorScheme = theme ?? 'light dark';
    });

    // The style variables of the host, as they come. The ones of the previous context are removed first
    let applied: string[] = [];
    effect(() => {
      const variables = mcp.hostContext()?.styles?.variables ?? {};
      for (const name of applied) root.style.removeProperty(name);
      applied = [];
      for (const [name, value] of Object.entries(variables)) {
        if (name.startsWith('--') && typeof value === 'string' && value) {
          root.style.setProperty(name, value);
          applied.push(name);
        }
      }
    });
  }
}
