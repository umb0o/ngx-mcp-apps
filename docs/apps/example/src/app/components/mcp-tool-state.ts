/**
 * Tool result states
 *
 * Wraps the part of the app that needs the tool result. It shows your content only when a result has
 * arrived; before that, and when the tool call is cancelled or fails, it shows a short message instead.
 * The app is on screen before the result exists, because the model streams the tool arguments first:
 * this component covers that moment.
 *
 * Usage: `<mcp-tool-state> ...your view of the result... </mcp-tool-state>`
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { McpApp } from 'ngx-mcp-apps';

@Component({
  selector: 'mcp-tool-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('ready') {
        <ng-content />
      }
      @case ('cancelled') {
        <p class="note">The request was cancelled.</p>
      }
      @case ('error') {
        <p class="note" role="alert">{{ errorText() }}</p>
      }
      @default {
        <p class="note" aria-live="polite">
          <span class="pulse" aria-hidden="true"></span>Waiting for the data
        </p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .note {
      margin: 0;
      opacity: 0.75;
    }
    .pulse {
      display: inline-block;
      width: 0.6em;
      height: 0.6em;
      margin-right: 0.5em;
      border-radius: 50%;
      background: currentColor;
      animation: mcp-pulse 1.2s ease-in-out infinite;
    }
    @keyframes mcp-pulse {
      50% {
        opacity: 0.2;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pulse {
        animation: none;
      }
    }
  `,
})
export class McpToolState {
  private readonly mcp = inject(McpApp);

  protected readonly state = computed(() => {
    if (this.mcp.toolCancelled()) return 'cancelled';
    const result = this.mcp.toolResult();
    if (!result) return 'waiting';
    return result.isError ? 'error' : 'ready';
  });

  /** The text the server put in the failed result, if any. */
  protected readonly errorText = computed(() => {
    const text = this.mcp.toolResult()?.content.find((block) => block.type === 'text')?.text;
    return text ?? 'The tool failed.';
  });
}
