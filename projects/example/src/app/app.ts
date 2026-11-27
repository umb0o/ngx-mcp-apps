/**
 * The example: a packing list the model opens with a tool call.
 * It uses every copy-and-paste component of ./components.
 */
import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { McpApp, McpCallToolResult, isObject } from 'ngx-mcp-apps';
import { McpCallTool } from './components/mcp-call-tool';
import { McpFullscreenButton } from './components/mcp-fullscreen-button';
import { McpHostLink } from './components/mcp-host-link';
import { McpLiveValue } from './components/mcp-live-value';
import { McpStandaloneNotice } from './components/mcp-standalone-notice';
import { McpStatus } from './components/mcp-status';
import { McpTellModel } from './components/mcp-tell-model';
import { McpTheme } from './components/mcp-theme';
import { McpToolState } from './components/mcp-tool-state';

interface PackingList {
  title: string;
  items: string[];
}
const isPackingList = (v: unknown): v is PackingList =>
  isObject(v) &&
  typeof v['title'] === 'string' &&
  Array.isArray(v['items']) &&
  v['items'].every((item) => typeof item === 'string');

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [McpTheme],
  imports: [
    McpCallTool,
    McpFullscreenButton,
    McpHostLink,
    McpLiveValue,
    McpStandaloneNotice,
    McpStatus,
    McpTellModel,
    McpToolState,
  ],
  template: `
    <header>
      <h1>{{ list()?.title ?? 'Packing list' }}</h1>
      <mcp-status />
      <mcp-fullscreen-button />
    </header>

    <mcp-standalone-notice />

    <mcp-tool-state>
      <ul>
        @for (item of list()?.items; track $index) {
          <li>{{ item }}</li>
        }
      </ul>

      <form (submit)="$event.preventDefault()">
        <label for="new-item">Add an item</label>
        <input
          id="new-item"
          autocomplete="off"
          [value]="text()"
          (input)="text.set($any($event.target).value)"
        />
        <button
          type="submit"
          mcpCallTool="add_item"
          [args]="{ text: text() }"
          (result)="added($event)"
          (failed)="problem.set($event)"
        >
          Add
        </button>
      </form>
      @if (problem()) {
        <p role="alert">{{ problem() }}</p>
      }

      <p class="quiet">Changes saved on the server: <mcp-live-value /></p>
    </mcp-tool-state>

    <mcp-tell-model />

    <p class="quiet">
      <a mcpHostLink href="https://github.com/umb0o/ngx-mcp-apps">Source of this example</a>
    </p>
  `,
  styles: `
    :host {
      display: grid;
      gap: 1rem;
      padding: 1rem;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem;
    }
    h1 {
      margin: 0 auto 0 0;
      font-size: 1.25rem;
    }
    ul {
      margin: 0 0 0.8rem;
      padding-left: 1.2rem;
    }
    form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    input,
    button[type='submit'] {
      font: inherit;
      color: inherit;
      padding: 0.3em 0.6em;
      border-radius: 6px;
      background: transparent;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    }
    button[type='submit'] {
      cursor: pointer;
    }
    button[type='submit']:disabled {
      opacity: 0.5;
    }
    .quiet {
      margin: 0.6rem 0 0;
      font-size: 0.9em;
      opacity: 0.8;
    }
    a {
      color: inherit;
    }
  `,
})
export class App {
  private readonly mcp = inject(McpApp);

  /** The list as the tool call that opened the app returned it. */
  private readonly opened = this.mcp.structuredContentAs(isPackingList);
  /**
   * The list as it is on the server now. The app stays open while the conversation goes on: when the model
   * changes the list in a later turn, by calling another tool of the server, the app sees it here.
   */
  private readonly followed = this.mcp.pollServerTool('read_list', { guard: isPackingList });
  /** What is shown: the latest from the server, or at once what a change made from this page returned. */
  protected readonly list = linkedSignal(() => this.followed() ?? this.opened());
  protected readonly problem = signal('');
  /** What is typed in the box: a signal, so the arguments of the button are up to date at the click. */
  protected readonly text = signal('');

  protected added(result: McpCallToolResult): void {
    this.problem.set('');
    this.text.set('');
    if (isPackingList(result.structuredContent)) this.list.set(result.structuredContent);
  }
}
