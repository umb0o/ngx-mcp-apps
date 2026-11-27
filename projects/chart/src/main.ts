/**
 * A chart the model draws in the conversation, and keeps working on.
 *
 * The model opens it with a tool call. In later turns it changes the data or points at some values by
 * calling other tools of the server: the app on screen follows the server and redraws. The user taps a
 * value to select it; the app tells the model silently, so "why is this one so high?" typed in the
 * chat has a meaning. One file, Angular 22.
 */
import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { McpApp, isObject, provideMcpApp } from 'ngx-mcp-apps';

interface Point {
  label: string;
  value: number;
}
interface Chart {
  title: string;
  unit: string;
  type: 'bar' | 'line';
  points: Point[];
  /** Labels the model is pointing at. */
  highlights: string[];
}
const isPoint = (v: unknown): v is Point =>
  isObject(v) && typeof v['label'] === 'string' && typeof v['value'] === 'number';
const isChart = (v: unknown): v is Chart =>
  isObject(v) &&
  typeof v['title'] === 'string' &&
  typeof v['unit'] === 'string' &&
  (v['type'] === 'bar' || v['type'] === 'line') &&
  Array.isArray(v['points']) &&
  v['points'].every(isPoint) &&
  Array.isArray(v['highlights']) &&
  v['highlights'].every((h) => typeof h === 'string');

@Component({
  selector: 'app-root',
  host: { '[class.dark]': 'dark()' },
  template: `
    @let current = chart();

    <header>
      <h1>{{ current?.title ?? 'Chart' }}</h1>
      @if (current) {
        <div class="switch" role="group" aria-label="Kind of chart">
          <button type="button" [attr.aria-pressed]="kind() === 'bar'" (click)="kind.set('bar')">
            Bars
          </button>
          <button type="button" [attr.aria-pressed]="kind() === 'line'" (click)="kind.set('line')">
            Line
          </button>
        </div>
      }
      @if (mcp.canFullscreen()) {
        <button type="button" (click)="mcp.toggleFullscreen()">
          {{ mcp.displayMode() === 'fullscreen' ? 'Exit fullscreen' : 'Fullscreen' }}
        </button>
      }
    </header>

    @if (mcp.toolCancelled()) {
      <p class="quiet">The request was cancelled.</p>
    } @else if (mcp.status() === 'standalone') {
      <p class="quiet">Running outside a chat host: there is no data to draw.</p>
    } @else if (!current) {
      <p class="quiet" aria-live="polite">Waiting for the data</p>
    } @else if (!current.points.length) {
      <p class="quiet">No data yet.</p>
    } @else {
      <div class="plot" [class.line]="kind() === 'line'">
        @if (kind() === 'line') {
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline [attr.points]="line()" />
          </svg>
        }
        @for (p of columns(); track p.label) {
          <button
            type="button"
            class="col"
            animate.enter="arrive"
            [class.on]="p.label === selected()"
            [class.star]="p.starred"
            [style.--share]="p.share + '%'"
            [attr.aria-pressed]="p.label === selected()"
            [attr.aria-label]="p.label + ': ' + p.text + (p.starred ? ', pointed out' : '')"
            (click)="select(p.label)"
          >
            <span class="value">{{ p.text }}</span>
            <span class="track"><span class="mark"></span></span>
            <span class="label">{{ p.label }}</span>
          </button>
        }
      </div>

      <p class="quiet" role="status">
        @if (picked(); as p) {
          <strong>{{ p.label }}: {{ p.text }}</strong> · {{ p.versus }} Ask about it in the chat.
        } @else {
          Total {{ total() }}. Tap a value to select it, then ask about it in the chat.
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
      font:
        15px/1.45 system-ui,
        sans-serif;
      /* No background: the host draws it */
      /* The colour of the text of the host when it gives one, otherwise ours for its theme */
      --ink: #16203a;
      --paper: #ffffff;
      --accent: #b80f4a;
      color: var(--color-text-primary, var(--ink));
      --bar: color-mix(in srgb, currentColor 30%, transparent);
      --line: color-mix(in srgb, currentColor 28%, transparent);
    }
    :host(.dark) {
      --ink: #e6eaf5;
      --paper: #0f1526;
      --accent: #ff86ab;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    h1 {
      margin: 0 auto 0 0;
      font-size: 1.2rem;
    }
    p {
      margin: 0;
    }
    .quiet {
      font-size: 0.9em;
      opacity: 0.85;
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      background: transparent;
    }
    header button {
      padding: 0.25em 0.75em;
      border-radius: 6px;
      border: 1px solid var(--line);
    }
    .switch {
      display: flex;
    }
    .switch button:first-child {
      border-radius: 6px 0 0 6px;
      border-right: 0;
    }
    .switch button:last-child {
      border-radius: 0 6px 6px 0;
    }
    .switch button[aria-pressed='true'] {
      background: var(--color-text-primary, var(--ink));
      color: var(--color-background-primary, var(--paper));
    }

    .plot {
      position: relative;
      display: flex;
      height: 15rem;
      border-bottom: 1.5px solid currentColor;
    }
    .col {
      flex: 1 1 0;
      min-width: 0;
      display: grid;
      grid-template-rows: 1.4rem minmax(0, 1fr) 0;
      /* The column never grows with what is written in it: twelve months stay twelve equal columns */
      grid-template-columns: minmax(0, 1fr);
      padding: 0 0.12rem;
      border: 0;
      border-radius: 6px 6px 0 0;
    }
    .col:hover,
    .col:focus-visible {
      background: color-mix(in srgb, currentColor 7%, transparent);
    }
    .value {
      /* Centred on its column even when it is wider than the column */
      display: flex;
      justify-content: center;
      font-size: 0.72rem;
      font-weight: 600;
      white-space: nowrap;
      opacity: 0;
    }
    .col:hover .value,
    .col:focus-visible .value,
    .col.on .value,
    .col.star .value {
      opacity: 1;
    }
    .track {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .mark {
      width: min(100%, 3.2rem);
      height: var(--share);
      min-height: 2px;
      border-radius: 4px 4px 0 0;
      background: var(--bar);
      transition:
        height 0.45s cubic-bezier(0.2, 0.8, 0.2, 1),
        bottom 0.45s cubic-bezier(0.2, 0.8, 0.2, 1),
        background 0.2s;
    }
    .col.star .mark {
      background: color-mix(in srgb, var(--accent) 45%, transparent);
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
    .col.on .mark {
      background: var(--accent);
    }
    .on .value,
    .star .value {
      color: var(--accent);
    }
    .label {
      position: relative;
      top: 0.3rem;
      height: 1.4rem;
      font-size: 0.7rem;
      letter-spacing: -0.01em;
      white-space: nowrap;
      /* A short label is shown whole; a long one is cut, without dots that would eat a narrow column */
      overflow: hidden;
    }
    .plot {
      margin-bottom: 1.6rem;
    }

    /* The same columns as a line: each mark becomes a dot at its height */
    .plot.line .mark {
      position: absolute;
      bottom: calc(var(--share) - 0.35rem);
      width: 0.7rem;
      height: 0.7rem;
      min-height: 0;
      border-radius: 50%;
      background: currentColor;
    }
    .plot.line .col.star .mark,
    .plot.line .col.on .mark {
      background: var(--accent);
      outline: 3px solid color-mix(in srgb, var(--accent) 35%, transparent);
      outline-offset: 0;
    }
    svg {
      position: absolute;
      inset: 1.4rem 0 0 0;
      width: 100%;
      height: calc(100% - 1.4rem);
      overflow: visible;
      pointer-events: none;
    }
    polyline {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      opacity: 0.55;
    }
    .arrive .mark {
      animation: grow 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
    }
    @keyframes grow {
      from {
        height: 0;
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .mark {
        transition: none;
      }
      .arrive .mark {
        animation: none;
      }
    }
  `,
})
export class App {
  protected readonly mcp = inject(McpApp);

  /** As the tool call that opened the app returned it, then as it is on the server now. */
  private readonly opened = this.mcp.structuredContentAs(isChart);
  private readonly followed = this.mcp.pollServerTool('read_chart', { guard: isChart });
  protected readonly chart = computed(() => this.followed() ?? this.opened());

  /** Bars or line: what the model asked for, until the user chooses otherwise. */
  private readonly asked = computed(() => this.chart()?.type ?? 'bar');
  // Linked to the text, not to the chart: the chart is read again every second, the choice must survive that
  protected readonly kind = linkedSignal(() => this.asked());

  private readonly format = computed(
    () => new Intl.NumberFormat(this.mcp.hostContext()?.locale, { notation: 'compact' }),
  );
  private text(value: number): string {
    const unit = this.chart()?.unit ?? '';
    return this.format().format(value) + (unit ? ` ${unit}` : '');
  }

  protected readonly columns = computed(() => {
    const chart = this.chart();
    if (!chart) return [];
    const top = Math.max(1e-9, ...chart.points.map((p) => p.value));
    return chart.points.map((p) => ({
      label: p.label,
      value: p.value,
      text: this.text(p.value),
      share: Math.max(0, (p.value / top) * 100),
      starred: chart.highlights.includes(p.label),
    }));
  });

  /** The line through the dots, in the 100 x 100 box of the SVG. */
  protected readonly line = computed(() => {
    const cols = this.columns();
    return cols.map((c, i) => `${((i + 0.5) / cols.length) * 100},${100 - c.share}`).join(' ');
  });

  protected readonly total = computed(() =>
    this.text(this.columns().reduce((sum, c) => sum + c.value, 0)),
  );

  /** The label the user tapped. It is dropped when the data no longer has it. */
  private readonly tapped = signal<string | null>(null);
  protected readonly selected = computed(() => {
    const label = this.tapped();
    return this.columns().some((c) => c.label === label) ? label : null;
  });
  protected readonly picked = computed(() => {
    const cols = this.columns();
    const i = cols.findIndex((c) => c.label === this.selected());
    if (i === -1) return null;
    const before = cols[i - 1];
    let versus = 'The first value.';
    if (before && before.value !== 0) {
      const change = ((cols[i].value - before.value) / Math.abs(before.value)) * 100;
      versus = `${change >= 0 ? '+' : ''}${change.toFixed(0)}% on ${before.label}.`;
    }
    return { ...cols[i], versus };
  });

  /**
   * Dark or light. The host says it; some hosts say it late or not at all, and then the system setting decides.
   */
  private readonly system = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  protected readonly dark = computed(
    () => (this.mcp.theme() ?? (this.system() ? 'dark' : 'light')) === 'dark',
  );

  constructor() {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) =>
      this.system.set(e.matches),
    );
    // On the page itself, not on a component: a frame whose colour scheme differs from the page around it
    // gets an opaque white background from the browser, and light text on it cannot be read
    effect(() => (document.documentElement.style.colorScheme = this.dark() ? 'dark' : 'light'));
    // The style variables of the host (text, background, fonts) are applied as they come: ours stay as fallback
    let applied: string[] = [];
    effect(() => {
      const variables = this.mcp.hostContext()?.styles?.variables ?? {};
      const root = document.documentElement.style;
      for (const name of applied) root.removeProperty(name);
      applied = [];
      for (const [name, value] of Object.entries(variables)) {
        if (name.startsWith('--') && typeof value === 'string' && value) {
          root.setProperty(name, value);
          applied.push(name);
        }
      }
    });

    // Tell the model what is selected, silently: it reads it when the user writes the next message
    // A text, so that the effect runs when the selection changes and not at every reading of the server
    const note = computed(() => {
      const p = this.picked();
      const title = this.chart()?.title ?? 'the chart';
      return p
        ? `In "${title}" the user has selected ${p.label} (${p.text}). "This one" in their next message means it.`
        : `In "${title}" the user has nothing selected.`;
    });
    const ready = computed(() => !!this.chart());
    effect(() => {
      const text = note();
      const label = this.selected();
      if (!this.mcp.connected() || !ready()) return;
      void this.mcp.updateModelContext(text).catch(() => {});
      // Also kept on the server, where a tool of the model can read it
      void this.mcp.callServerTool('select_point', { label: label ?? '' }).catch(() => {});
    });
  }

  protected select(label: string): void {
    this.tapped.update((now) => (now === label ? null : label));
  }
}

bootstrapApplication(App, {
  providers: [provideMcpApp({ name: 'chart', version: '1.0.0' })],
}).catch((e) => console.error(e));
