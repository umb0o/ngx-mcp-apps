# Get started

You need an Angular application (Angular 18 to 22, see [Compatibility](#compatibility)). A new one is fine:
`ng new my-app`.

## 1. Install

```bash
ng add ngx-mcp-apps-builder
```

This installs the builder and the library, and sets up the `build` target of your application to write one HTML
file (`dist/<project>.html`; choose another path with `--single-file`). Step 4 shows what it changes.

By hand instead:

```bash
npm install ngx-mcp-apps
npm install -D ngx-mcp-apps-builder
```

## 2. Configure

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideMcpApp } from 'ngx-mcp-apps';

export const appConfig: ApplicationConfig = {
  providers: [provideMcpApp({ name: 'my-app', version: '1.0.0' })],
};
```

## 3. Use `McpApp` in a component

```ts
// app.ts
import { Component, inject } from '@angular/core';
import { McpApp, isObject } from 'ngx-mcp-apps';

interface Greeting {
  message: string;
}
const isGreeting = (v: unknown): v is Greeting => isObject(v) && typeof v['message'] === 'string';

@Component({
  selector: 'app-root',
  template: `
    <p>{{ mcp.status() }} · {{ mcp.displayMode() }}</p>
    <p>{{ greeting()?.message }}</p>
    @if (mcp.canFullscreen()) {
      <button (click)="mcp.toggleFullscreen()">Fullscreen</button>
    }
  `,
})
export class App {
  protected readonly mcp = inject(McpApp);
  // structuredContent of the tool call that opened the app, checked and typed
  protected readonly greeting = this.mcp.structuredContentAs(isGreeting);
}
```

The connection starts on its own when `McpApp` is first injected. Outside a host (`ng serve`, a plain browser tab)
`status()` becomes `standalone`, so the same app can be developed as a normal page.

## 4. Build one HTML file

Hosts load the app from one HTML resource inside a sandboxed iframe, so the build must not need other files.
`ng add` has already done this. By hand: in `angular.json`, replace the builder of the `build` target and add the
`singleFile` option:

```json
{
  "projects": {
    "my-app": {
      "architect": {
        "build": {
          "builder": "ngx-mcp-apps-builder:application",
          "options": {
            "browser": "src/main.ts",
            "tsConfig": "tsconfig.app.json",
            "styles": ["src/styles.css"],
            "singleFile": "public/app.html"
          }
        }
      }
    }
  }
}
```

Keep the other options you already have: the builder runs Angular's official application builder with the same
options, then writes the single file.

```bash
ng build
```

```text
Single file: public/app.html (212.4 kB)
```

`public/app.html` is the whole app: every local script and stylesheet is inlined. This is the file your MCP server
returns to the host.

**Lazy loading is merged into the file.** One HTML file cannot fetch other chunks, so the builder puts lazy routes
(`loadComponent` / `loadChildren`), `@defer` blocks and dynamic `import()` back into the file. The code works as
written, but everything is loaded with the app: there is no saving. A web worker cannot be merged and fails the build.
Fonts and images referenced by your CSS
are embedded; an image named in a template (`<img src>`) is not: use a `data:` URL or an absolute `https://` URL. More in the
[The builder](builder.html).

Two more things to know inside the host iframe:

- if you need a router, use `withHashLocation()`: the iframe URL is not yours;
- `localStorage` may be unavailable in the sandbox: wrap it in `try/catch` and keep real state on your server.

## How it fits together

1. Your MCP server exposes a tool and, as the MCP Apps specification describes, serves the built HTML file as a
   `ui://` resource linked to that tool with `_meta.ui.resourceUri`.
2. When the model calls the tool, the host loads that HTML in a sandboxed iframe inside the conversation.
3. `McpApp` does the handshake with the host over `postMessage` and receives the tool arguments and the tool result:
   the `structuredContent` of that result is what `mcp.structuredContent()` returns.
4. From then on the app can call tools of your server, add context for the model and ask for another display mode.

The server side is out of scope of this project: any MCP server that follows the MCP Apps specification works, and how
you write it is up to you.

Hosts may cache the resource: put a hash of the build in the URI (`ui://my-app/app-<hash>.html`) so a new build is
always picked up.
