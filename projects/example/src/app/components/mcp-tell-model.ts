/**
 * Tell the model
 *
 * A text box with the two ways an app can talk back. "Add to context" is silent: the model reads the
 * text on its next turn. "Send as message" posts a chat message as the user; hosts may ask the user to
 * confirm it or refuse it (common on mobile), and then the component says so instead of failing.
 *
 * Usage: `<mcp-tell-model />`
 */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { McpApp } from 'ngx-mcp-apps';

@Component({
  selector: 'mcp-tell-model',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label for="mcp-tell-model-text">Note for the model</label>
    <textarea id="mcp-tell-model-text" rows="2" #text (input)="outcome.set('')"></textarea>
    <div class="row">
      <button type="button" [disabled]="busy()" (click)="context(text.value)">
        Add to context
      </button>
      <button type="button" [disabled]="busy()" (click)="message(text.value)">
        Send as message
      </button>
      <span role="status">{{ outcome() }}</span>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.4em;
    }
    textarea {
      font: inherit;
      color: inherit;
      padding: 0.5em;
      border-radius: 6px;
      resize: vertical;
      background: color-mix(in srgb, currentColor 5%, transparent);
      border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5em;
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      padding: 0.3em 0.8em;
      border-radius: 6px;
      background: transparent;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    span {
      font-size: 0.9em;
      opacity: 0.8;
    }
  `,
})
export class McpTellModel {
  private readonly mcp = inject(McpApp);
  protected readonly busy = signal(false);
  protected readonly outcome = signal('');

  protected context(text: string): Promise<void> {
    return this.run(text, async () => {
      await this.mcp.updateModelContext(text);
      return 'Added: the model reads it on its next turn.';
    });
  }

  protected message(text: string): Promise<void> {
    return this.run(text, async () =>
      (await this.mcp.sendMessage(text))
        ? 'Sent.'
        : 'The host did not send it. Type it in the chat instead.',
    );
  }

  private async run(text: string, action: () => Promise<string>): Promise<void> {
    if (!text.trim()) return this.outcome.set('Write something first.');
    this.busy.set(true);
    try {
      this.outcome.set(await action());
    } catch (e) {
      this.outcome.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
