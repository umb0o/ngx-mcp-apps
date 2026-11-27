/**
 * An MCP App that checks its data
 *
 * A contact card. The data comes from a tool result, so it is checked by a guard before the template
 * uses it and it is rendered as text. Under the card, the log of the library shows what arrived.
 */
import { Component, computed, effect, inject, linkedSignal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { McpApp, isObject, provideMcpApp } from 'ngx-mcp-apps';

interface Contact {
  name: string;
  note: string;
}
/** Every field the template reads, with its type and a limit on its length. */
const isContact = (v: unknown): v is Contact =>
  isObject(v) &&
  typeof v['name'] === 'string' &&
  v['name'].length <= 80 &&
  typeof v['note'] === 'string' &&
  v['note'].length <= 300;

@Component({
  selector: 'app-root',
  template: `
    @if (contact(); as contact) {
      <article>
        <h1>{{ contact.name }}</h1>
        <p>{{ contact.note }}</p>
      </article>
    } @else {
      <p aria-live="polite">Waiting for a contact</p>
    }
    @if (refused()) {
      <p class="warning" role="status">
        The last result did not pass the check of the app. The card shows the last valid one.
      </p>
    }

    <h2>Log of the library, newest first</h2>
    <ol>
      @for (line of log(); track $index) {
        <li>{{ line }}</li>
      } @empty {
        <li>Nothing yet</li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.7rem;
      padding: 1rem;
      font:
        15px/1.5 system-ui,
        sans-serif;
      /* No background: the host draws it */
      color: light-dark(#16203a, #e6eaf5);
      --line: color-mix(in srgb, currentColor 28%, transparent);
    }
    article {
      padding: 0.8rem 1rem;
      border: 1px solid var(--line);
      border-radius: 10px;
    }
    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.2rem;
    }
    h2 {
      margin: 0.4rem 0 0;
      font-size: 0.88rem;
      font-weight: 600;
    }
    p,
    ol {
      margin: 0;
    }
    h1,
    p,
    li {
      overflow-wrap: anywhere;
    }
    .warning {
      padding: 0.45rem 0.75rem;
      border-left: 3px solid light-dark(#b80f4a, #ff86ab);
      font-size: 0.9em;
    }
    ol {
      padding: 0;
      list-style: none;
      min-height: 9.5em;
      font:
        12px/1.5 ui-monospace,
        Consolas,
        monospace;
      opacity: 0.85;
    }
    li {
      padding: 0.15rem 0;
      border-top: 1px solid var(--line);
    }
  `,
})
class App {
  private readonly mcp = inject(McpApp);

  /** The data of the tool result, or undefined when it does not pass the guard. */
  private readonly checked = this.mcp.structuredContentAs(isContact);
  /** What the card shows: the checked data, and the last valid one when a later result is refused. */
  protected readonly contact = linkedSignal<Contact | undefined, Contact | undefined>({
    source: this.checked,
    computation: (next, previous) => next ?? previous?.value,
  });
  /** A result arrived, but not with the shape this app expects. */
  protected readonly refused = computed(() => !!this.mcp.toolResult() && !this.checked());

  /** The last lines of the log, each cut short: the log repeats the data it received. */
  protected readonly log = computed(() =>
    this.mcp
      .events()
      .slice(0, 4)
      .map((line) => (line.length > 150 ? line.slice(0, 150) + '…' : line)),
  );

  constructor() {
    // The theme of the host on the page itself, so the frame stays transparent
    effect(() => (document.documentElement.style.colorScheme = this.mcp.theme() ?? 'light dark'));
  }
}

bootstrapApplication(App, {
  // log: true keeps the last protocol events in mcp.events(). It is for debugging: here it is the demo.
  providers: [provideMcpApp({ name: 'contact-card', version: '1.0.0', log: true })],
}).catch((e) => console.error(e));
