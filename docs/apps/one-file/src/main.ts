/**
 * A whole MCP App in one file
 *
 * One component and three lines of bootstrap: this file is the entire application. It waits for the
 * tool result and checks it, follows the host theme, calls a server tool from a form, follows the server
 * while it changes, goes fullscreen and tells the model what the user did. `ng build` turns it into one
 * HTML file. It is written for Angular 22: signal forms, `linkedSignal`, `@let`, `animate.enter`, no
 * zone.js. Start from here when the app is small; split it into the pieces below when it grows.
 *
 * Usage: save it as `src/main.ts` of a new Angular 22 application, then `ng add ngx-mcp-apps-builder` and `ng build`.
 */
import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, required } from '@angular/forms/signals';
import { bootstrapApplication } from '@angular/platform-browser';
import { McpApp, isObject, provideMcpApp } from 'ngx-mcp-apps';

// The data of the server, and the checks it must pass before the template uses it
interface PackingList {
  title: string;
  items: string[];
}
const isPackingList = (v: unknown): v is PackingList =>
  isObject(v) &&
  typeof v['title'] === 'string' &&
  Array.isArray(v['items']) &&
  v['items'].every((item) => typeof item === 'string');
const isCounter = (v: unknown): v is { value: number } =>
  isObject(v) && typeof v['value'] === 'number';

@Component({
  selector: 'app-root',
  imports: [FormField, FormRoot],
  template: `
    @let current = list();

    <header>
      <h1>{{ current?.title ?? 'Packing list' }}</h1>
      <span class="quiet">{{ mcp.status() }}</span>
      @if (mcp.canFullscreen()) {
        <button type="button" (click)="mcp.toggleFullscreen()">
          {{ mcp.displayMode() === 'fullscreen' ? 'Exit fullscreen' : 'Fullscreen' }}
        </button>
      }
    </header>

    @if (mcp.toolCancelled()) {
      <p>The request was cancelled.</p>
    } @else if (mcp.status() === 'standalone') {
      <p>Running outside a chat host: there is no list to show.</p>
    } @else if (!current) {
      <p aria-live="polite">Waiting for the list</p>
    } @else {
      @let total = current.items.length;
      @let done = packedCount();

      <div
        class="bar"
        role="progressbar"
        aria-label="Packed"
        aria-valuemin="0"
        [attr.aria-valuemax]="total"
        [attr.aria-valuenow]="done"
      >
        <span [style.width.%]="total ? (done / total) * 100 : 0"></span>
      </div>
      <p class="quiet">
        {{ done }} of {{ total }} packed. Changes saved on the server: {{ saved()?.value ?? 0 }}.
      </p>

      <ul>
        @for (item of current.items; track item) {
          <li animate.enter="arrive">
            <label [class.done]="packed().has(item)">
              <input type="checkbox" [checked]="packed().has(item)" (change)="toggle(item)" />
              {{ item }}
            </label>
          </li>
        }
      </ul>

      <!-- A signal form: on submit it validates, then runs the action of its "submission" -->
      <form [formRoot]="addForm">
        <input
          aria-label="New item"
          placeholder="Add an item"
          autocomplete="off"
          [formField]="addForm.text"
        />
        <button type="submit" [disabled]="addForm().submitting()">Add</button>
        <button type="button" (click)="tellModel()">Tell the model what is missing</button>
      </form>

      @if (addForm.text().touched()) {
        @for (error of addForm.text().errors(); track error.kind) {
          <p class="quiet" role="alert">{{ error.message }}</p>
        }
      }
      <p class="quiet" role="status">{{ note() }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.8rem;
      padding: 1rem;
      font:
        15px/1.5 system-ui,
        sans-serif;
      /* No background: the host draws it */
      color: light-dark(#16203a, #e6eaf5);
      --accent: light-dark(#2b4bee, #9db0ff);
      --line: color-mix(in srgb, currentColor 28%, transparent);
    }
    header,
    form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    h1 {
      margin: 0 auto 0 0;
      font-size: 1.25rem;
    }
    p,
    ul {
      margin: 0;
    }
    ul {
      padding: 0;
      list-style: none;
    }
    label {
      display: flex;
      gap: 0.5rem;
      padding: 0.2rem 0;
      cursor: pointer;
    }
    .done {
      opacity: 0.55;
      text-decoration: line-through;
    }
    .quiet {
      font-size: 0.88em;
      opacity: 0.8;
    }
    .bar {
      height: 0.5rem;
      border-radius: 99px;
      background: color-mix(in srgb, currentColor 12%, transparent);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--accent);
      transition: width 0.25s ease;
    }
    input:not([type]),
    button {
      font: inherit;
      color: inherit;
      padding: 0.3em 0.7em;
      border-radius: 6px;
      background: transparent;
      border: 1px solid var(--line);
    }
    input[type='checkbox'] {
      accent-color: var(--accent);
    }
    button {
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    /* animate.enter adds this class while a new item comes in */
    .arrive {
      animation: arrive 0.3s ease-out;
    }
    @keyframes arrive {
      from {
        opacity: 0;
        translate: 0 -0.4rem;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .arrive {
        animation: none;
      }
      .bar span {
        transition: none;
      }
    }
  `,
})
export class App {
  protected readonly mcp = inject(McpApp);

  /**
   * The list: what the tool call that opened the app returned, until this page changes it.
   * A linked signal is writable and starts again from its source when a new tool result arrives.
   */
  protected readonly list = linkedSignal(this.mcp.structuredContentAs(isPackingList));

  /** The server counts the changes: the app reads the count again every second. */
  protected readonly saved = this.mcp.pollServerTool('read_counter', { guard: isCounter });

  /** Which items are ticked. It lives only in this page. */
  protected readonly packed = signal<ReadonlySet<string>>(new Set());
  protected readonly packedCount = computed(
    () => (this.list()?.items ?? []).filter((item) => this.packed().has(item)).length,
  );
  protected readonly note = signal('');

  /** The form that adds an item: rules first, then what a valid submit does. */
  private readonly draft = signal({ text: '' });
  protected readonly addForm = form(
    this.draft,
    (draft) => {
      required(draft.text, { message: 'Write the item first.' });
      maxLength(draft.text, 80, { message: 'Keep it under 80 characters.' });
    },
    {
      submission: {
        // Calls a tool of the MCP server through the host. An error returned here shows up on the field.
        action: async (field) => {
          try {
            const result = await this.mcp.callServerTool('add_item', { text: this.draft().text });
            if (result.isError) {
              const message = result.content.find((c) => c.type === 'text')?.text;
              return {
                kind: 'server',
                message: message ?? 'The server refused it.',
                fieldTree: field.text,
              };
            }
            if (isPackingList(result.structuredContent)) this.list.set(result.structuredContent);
            field().reset({ text: '' });
            return undefined;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { kind: 'host', message, fieldTree: field.text };
          }
        },
      },
    },
  );

  constructor() {
    // The theme of the host, on the page itself: a frame whose colour scheme differs from the page around it
    // gets an opaque white background from the browser. With no theme from the host, the browser chooses.
    effect(() => (document.documentElement.style.colorScheme = this.mcp.theme() ?? 'light dark'));
  }

  protected toggle(item: string): void {
    this.packed.update((set) => {
      const next = new Set(set);
      if (!next.delete(item)) next.add(item);
      return next;
    });
  }

  /** Silent: the model reads it on its next turn. */
  protected async tellModel(): Promise<void> {
    const missing = (this.list()?.items ?? []).filter((item) => !this.packed().has(item));
    try {
      await this.mcp.updateModelContext(
        missing.length ? `Still to pack: ${missing.join(', ')}.` : 'Everything is packed.',
        { missing },
      );
      this.note.set('The model will read it on its next turn.');
    } catch (e) {
      this.note.set(e instanceof Error ? e.message : String(e));
    }
  }
}

bootstrapApplication(App, {
  providers: [provideMcpApp({ name: 'packing-list', version: '1.0.0' })],
}).catch((e) => console.error(e));
