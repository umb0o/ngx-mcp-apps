# Routing

An Angular application with the router works as an MCP App. Three things are worth knowing: how the router keeps
its address inside the frame, how the model chooses the view the app opens on, and how the app tells the model
where the user went.

The application below has a list of trips and a page for each trip. It is built into one HTML file and runs in an
iframe; this page plays the chat host.

<!-- stage: routing -->

## Try this

- **Click a trip, then Back.** The line "Route" follows. Only the app changes: the address of this page stays the
  same.
- **Look at the dark column.** After each navigation the app sends `ui/update-model-context`, and the sentence it
  sent appears under the app as "Added to the model context".
- **Press "Show me my trips"** under the app. The app starts again, and this time the tool call has no `open`
  argument, so it opens on the list. "Show me the Lisbon trip" sends `{ "open": "trip/2" }` and the app opens
  there.

## 1. Use the hash for the address

A host shows the app in a frame of its own: the address of that frame is the host's, not a path on your site. So
the router must not write paths into it. With `withHashLocation()` the router keeps the route in the part after
`#`, which a page can always change in its own address. Links (`routerLink`) and Back then work inside the frame.

```ts
bootstrapApplication(App, {
  providers: [
    provideMcpApp({ name: 'trips', version: '1.0.0' }),
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
  ],
});
```

`withComponentInputBinding()` is not needed for MCP: it only passes `:id` to the trip component as an input.

Lazy routes work too. `loadComponent`, `loadChildren` and `@defer` make separate files, which one HTML file cannot
fetch, so the builder merges them back into the file: they are loaded with the app instead of on demand. This
example uses static routes because there is nothing to gain from lazy ones here. See [The builder](builder.html).

```ts
const routes: Routes = [
  { path: '', component: Trips },
  { path: 'trip/:id', component: Trip },
  { path: '**', redirectTo: '' },
];
```

## 2. Let the model open a view

The model opens the app by calling a tool, and the arguments of that call reach the app in `mcp.toolInput()`. Give
your tool an argument that names the view, and navigate when it arrives. The value is written by the model, so
check it before you use it: here only `trip/` followed by a number is accepted, anything else opens the list.

```ts
const isView = (v: unknown): v is string => typeof v === 'string' && /^trip\/\d{1,3}$/.test(v);

effect(() => {
  const input = this.mcp.toolInput();
  if (!input || this.opened()) return;
  const open = input['open'];
  void this.router.navigateByUrl(isView(open) ? `/${open}` : '/').then(() => this.opened.set(true));
});
```

`toolInput()` is `undefined` until the host sends the arguments, which happens a moment after the app has started.
The signal `opened` makes the effect navigate once, and lets the next step wait for it.

## 3. Tell the model where the user is

The model does not see the screen. After each navigation the app sends one sentence with
`mcp.updateModelContext(...)`: the host keeps the latest one and the model reads it on its next turn, so "tell me
more about this one" has an answer. It is silent: nothing appears in the conversation.

```ts
private readonly place = computed(() => {
  const id = /^\/trip\/(\d+)$/.exec(this.url())?.[1];
  const trip = TRIPS.find((t) => t.id === id);
  return trip ? `the trip to ${trip.city} (route ${this.url()})` : 'the list of trips (route /)';
});

effect(() => {
  const place = this.place();
  if (!this.opened() || !this.mcp.connected()) return;
  this.mcp.updateModelContext(`The user is looking at ${place}.`).catch(() => {
    /* a host may refuse: the app works the same */
  });
});
```

`url` is a signal set from the router's `NavigationEnd` event. `updateModelContext` rejects when the app is not
connected to a host or the host refuses, which is why the call is guarded and the error is caught.

## Limits

- Lazy routes are merged into the file: they work, but they are loaded with the app, as said above.
- The Back button of this example counts the navigations made inside the app and is disabled at the first one. A
  step further back would leave the app, and what the host does then is up to the host.
- The example was tried in the host of this page. Try your own app in the hosts you care about.

## The whole file

<!-- source: projects/routing/src/main.ts -->
