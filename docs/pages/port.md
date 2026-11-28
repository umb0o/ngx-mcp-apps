# Bring an existing Angular app

You do not have to start from scratch. Components, services, forms, Angular Material and the libraries your app
already uses keep working inside a chat host: the app is still an Angular application, built into one HTML file.
This page lists what to do, and the few things that work differently inside a host.

## 1. Add the builder

In the workspace of the app:

```bash
ng add ngx-mcp-apps-builder
```

It switches the `build` target to `ngx-mcp-apps-builder:application`, adds `ngx-mcp-apps` and, on Angular 18 and
19, `@angular/build`. Every other option of your `build` target stays as it is. Then:

```bash
ng build
```

```text
Single file: dist/my-app.html (212.4 kB)
```

The build log also lists what the file still needs from outside (see [What changes](#what-changes)). Read it: it is
the to-do list of the port.

## 2. Connect it to the host

Register the library where you bootstrap the app, next to your providers:

```ts
bootstrapApplication(App, {
  providers: [...yourProviders, provideMcpApp({ name: 'my-app', version: '1.0.0' })],
});
```

`McpApp` gives what the host sends as signals: the arguments and the result of the tool call that opened the app,
the theme, the display mode. Outside a host (`ng serve`) its status becomes `standalone` and the app runs as
before, so you keep developing it in the browser. Details in [Get started](start.html).

## 3. Serve it from an MCP server

The HTML file is the `ui://` resource of a tool of your MCP server, as in [The server side](server.html). From
there the host opens the app when the model calls the tool.

## What stays the same

- Components, templates, services, dependency injection, pipes, signals and RxJS.
- Angular Material and the CDK, with their fonts and icons when they are files of your project (the builder embeds
  them).
- The libraries of your app: a test app with Angular Material, `date-fns`, `dayjs` and `chart.js`, built with the
  builder, runs in Claude for Android and in claude.ai on the web.
- Apps with zone.js and zoneless apps: the compatibility checks build new apps of Angular 18 to 22 with their own
  defaults.

## What changes

- **Routes.** The frame has the host's address, not yours: use `withHashLocation()`. Lazy routes and `@defer`
  blocks still work; their code is merged into the file and loads with the app. See [Routing](routing.html).
- **Where the app starts.** There is no URL to read: the app starts from the tool call that opened it
  (`mcp.toolInput()`, `mcp.structuredContent()`), so the model chooses the first view.
- **Images in templates.** `<img src="logo.png">` is not embedded, and a relative address does not reach your
  site from the frame. Reference the image from CSS (the builder embeds CSS `url()` files), or serve it from your
  site and declare the domain (next point).
- **Anything loaded from another site** (scripts from a CDN, web fonts) loads only if the MCP server declares its
  domain in `_meta.ui.csp.resourceDomains` of the resource. Calls with `fetch` or `HttpClient` need
  `_meta.ui.csp.connectDomains`, and your backend must accept requests from the frame's origin (CORS). The builder
  lists the remote addresses it finds.
- **Your API and its credentials.** The simplest path is to leave the calls to your backend in the MCP server and
  reach them from the app with `mcp.callServerTool()`: the server keeps the credentials, and the app needs no
  `connectDomains`.
- **Width and theme.** The frame is narrow (334 px in Claude for Android, 736 px in claude.ai on the web, measured
  in November 2026): the layout must work there. The host has its own light or dark theme: set `color-scheme` on the
  root of the document, or the frame stays white in a dark host. See [Theme](theme.html).
- **Web workers** are not supported: the build stops with an error that says so.
