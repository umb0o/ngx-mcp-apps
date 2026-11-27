/**
 * An MCP App with the Angular router
 *
 * A list of trips and a page for each trip. The router uses the part of the address after `#`, the model
 * chooses the first view with the arguments of the tool call, and the app tells the model where the user
 * is after every navigation.
 */
import { Location } from '@angular/common';
import {
  Component,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterOutlet,
  Routes,
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
} from '@angular/router';
import { McpApp, provideMcpApp } from 'ngx-mcp-apps';

const TRIPS = [
  { id: '1', city: 'Porto', days: 3, plan: 'Train from Lisbon, two nights near the river.' },
  { id: '2', city: 'Lisbon', days: 2, plan: 'A weekend on foot: Alfama, then the coast.' },
  { id: '3', city: 'Madeira', days: 5, plan: 'Flight on Monday, walking boots needed.' },
];

@Component({
  selector: 'app-trips',
  imports: [RouterLink],
  template: `
    <h1>Your trips</h1>
    <ul>
      @for (trip of trips; track trip.id) {
        <li>
          <a [routerLink]="['/trip', trip.id]">{{ trip.city }}</a>
          <span class="quiet">{{ trip.days }} days</span>
        </li>
      }
    </ul>
  `,
})
class Trips {
  protected readonly trips = TRIPS;
}

@Component({
  selector: 'app-trip',
  imports: [RouterLink],
  template: `
    @if (trip(); as trip) {
      <h1>{{ trip.city }}</h1>
      <p>{{ trip.days }} days. {{ trip.plan }}</p>
    } @else {
      <h1>No such trip</h1>
    }
    <p><a routerLink="/">All trips</a></p>
  `,
})
class Trip {
  /** The `:id` of the route, bound as an input by `withComponentInputBinding()`. */
  readonly id = input('');
  protected readonly trip = computed(() => TRIPS.find((trip) => trip.id === this.id()));
}

const routes: Routes = [
  { path: '', component: Trips },
  { path: 'trip/:id', component: Trip },
  { path: '**', redirectTo: '' },
];

/** The views the model may open. The argument comes from the model: it is checked, not trusted. */
const isView = (v: unknown): v is string => typeof v === 'string' && /^trip\/\d{1,3}$/.test(v);

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <nav>
      <button type="button" [disabled]="depth() === 0" (click)="location.back()">Back</button>
      <span class="quiet"
        >Route: <code>{{ url() }}</code></span
      >
    </nav>
    <router-outlet />
  `,
  // One stylesheet for the three components of this file
  encapsulation: ViewEncapsulation.None,
  styles: `
    app-root {
      display: grid;
      gap: 0.6rem;
      padding: 1rem;
      font:
        15px/1.5 system-ui,
        sans-serif;
      /* No background: the host draws it */
      color: light-dark(#16203a, #e6eaf5);
    }
    app-root nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
    }
    app-root button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      padding: 0.25em 0.8em;
      border-radius: 6px;
      background: transparent;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    }
    app-root button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    app-root h1 {
      margin: 0 0 0.4rem;
      font-size: 1.25rem;
    }
    app-root p,
    app-root ul {
      margin: 0 0 0.4rem;
    }
    app-root ul {
      padding: 0;
      list-style: none;
    }
    app-root li {
      display: flex;
      gap: 0.75rem;
      align-items: baseline;
      padding: 0.2rem 0;
    }
    app-root a {
      color: inherit;
    }
    app-root .quiet {
      font-size: 0.88em;
      opacity: 0.8;
    }
  `,
})
class App {
  private readonly mcp = inject(McpApp);
  private readonly router = inject(Router);
  protected readonly location = inject(Location);

  /** The current route, and how many steps Back can undo inside this app. */
  protected readonly url = signal('/');
  protected readonly depth = signal(0);
  /** True once the view asked by the model is on screen. */
  private readonly opened = signal(false);

  /** Where the user is, in words for the model. */
  private readonly place = computed(() => {
    const id = /^\/trip\/(\d+)$/.exec(this.url())?.[1];
    const trip = TRIPS.find((t) => t.id === id);
    return trip ? `the trip to ${trip.city} (route ${this.url()})` : 'the list of trips (route /)';
  });

  constructor() {
    // The theme of the host on the page itself, so the frame stays transparent
    effect(() => (document.documentElement.style.colorScheme = this.mcp.theme() ?? 'light dark'));

    let back = false;
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) back = event.navigationTrigger === 'popstate';
      if (!(event instanceof NavigationEnd)) return;
      this.url.set(event.urlAfterRedirects);
      // The first navigation is the start of the app, not a step to undo
      if (event.id > 1) this.depth.update((depth) => Math.max(0, depth + (back ? -1 : 1)));
    });

    // 2. The model opens a view: the arguments of the tool call choose the first route
    effect(() => {
      const input = this.mcp.toolInput();
      if (!input || this.opened()) return;
      const open = input['open'];
      void this.router
        .navigateByUrl(isView(open) ? `/${open}` : '/')
        .then(() => this.opened.set(true));
    });

    // 3. The app tells the model where the user is, after every navigation
    effect(() => {
      const place = this.place();
      if (!this.opened() || !this.mcp.connected()) return;
      this.mcp.updateModelContext(`The user is looking at ${place}.`).catch(() => {
        /* a host may refuse: the app works the same */
      });
    });
  }
}

bootstrapApplication(App, {
  providers: [
    provideMcpApp({ name: 'trips', version: '1.0.0' }),
    // 1. Hash routing: the address of the frame belongs to the host
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
  ],
}).catch((e) => console.error(e));
