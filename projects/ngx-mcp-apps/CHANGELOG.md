# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).
Until 1.0.0 the API may change between minor versions.

## [0.2.1] - 2026-11-27

### Added

- **`ng add ngx-mcp-apps-builder`**: one command installs the builder and the library and switches the `build`
  target of the application to the builder, with the `singleFile` option (`dist/<project>.html` by default).
  Options: `--project`, `--single-file`, `--skip-library`.

  Checked on a new application of each major, from Angular 18 to 22: `ng add`, then `ng build`.

### Fixed

- Installing the builder in an application of Angular 18 or 19 failed with a peer dependency conflict: those
  applications have `@angular/build` only through `@angular-devkit/build-angular`. The peer dependency is now
  optional and `ng add` lists `@angular/build` in the application, with the version it already uses.

The library itself is unchanged: it is released with the same version as the builder.

## [0.2.0] - 2026-11-27

### Added

- **`ngx-mcp-apps-builder`**, a new package: an Angular CLI builder (`ngx-mcp-apps-builder:application`) that runs
  Angular's official application builder and, with the `singleFile` option, writes the app as one self-contained
  HTML file. The build fails if the app needs lazy-loaded chunks.
  - Fonts and images that the CSS references with `url(...)` are embedded as `data:` URLs: global styles, `<style>`
    elements of `index.html` and component styles. A referenced file that is missing from the build output fails the build.
  - Critical CSS inlining is turned off when `singleFile` is set, so that those files are embedded once.
  - Warnings list what the single file does not contain: remote URLs (they need the domains declared in the CSP of the
    UI resource), files that the application code names (for example an `<img src>` of a template) and local
    references of the static `index.html`.
  - The error for extra JavaScript files tells dynamic imports (lazy loading), statically imported shared chunks and
    web worker scripts apart.

### Changed

- **Wider Angular support.** The library now works with Angular 18, 19, 20, 21 and 22
  (`@angular/core` `>=18.0.0 <23.0.0`); it required Angular 22.3 before. The builder supports the same versions
  (`@angular/build` `>=18.0.0 <23.0.0`, `@angular-devkit/architect` `>=0.1800.0 <0.2300.0`). Each major was checked
  with a new application: a production build with the builder, then the page opened in a browser.
- README rewritten around a quick start, with a compatibility table for both packages.

## [0.1.2] - 2026-11-26

### Changed

- The package now links to its source repository (`repository`, `homepage`, `bugs`).
- Releases are built and staged on npm by GitHub Actions with trusted publishing, when a pull request is merged into `main`.
- Source formatted with Prettier. No change to the behaviour of the published code.

## [0.1.1] - 2026-11-26

### Changed

- README: the size is stated on its own (about 13 KB minified, under 5 KB gzipped), without comparisons with other packages.
- Tests regrouped as one spec file per source file. No change to the published code.

## [0.1.0] - 2026-11-25

First public release.

### Added

- **`McpApp` service**: an Angular MCP App exposed as signals.
  - Connection: `status`, `connected`; the handshake starts on first injection and falls back to `standalone` outside a host.
  - Tool data: `toolInput`, `toolInputPartial`, `toolResult`, `structuredContent`, `toolCancelled`.
  - Host: `hostContext`, `hostCapabilities`, `theme`, `displayMode`, `availableDisplayModes`, `canFullscreen`.
  - Actions: `callServerTool`, `updateModelContext`, `sendMessage`, `requestDisplayMode`, `toggleFullscreen`,
    `openLink`, `requestTeardown`.
  - `pollServerTool(name, { intervalMs, args, guard, injector })`: a signal that follows a server tool, so the model can
    keep updating an app that is already open.
  - `structuredContentAs(guard)`: the opening tool result, checked and typed.
  - `events`: optional log of the last 50 protocol events.
- **`provideMcpApp(config)`** with `name`, `version`, `autoResize`, `connectTimeout`, `requestTimeout`, `log`,
  `allowedOrigins` and `port`.
- **`McpBridge`**: a framework-agnostic implementation of the view side of MCP Apps (protocol `2026-01-26`):
  JSON-RPC 2.0 over `postMessage`, the `ui/initialize` handshake, answers to `ping` and `ui/resource-teardown`,
  custom request and notification handlers, request timeouts and auto-resize.
- **`parentWindowPort({ allowedOrigins })`** and the `McpPort` interface for custom transports.
- **Runtime type guards** for protocol messages (`isCallToolResult`, `isHostContext`, `isInitializeResult`, ...),
  `sanitizeHostContext`, and the `McpGuard<T>` type and `isObject` helper for user data.
- Protocol types and the `Methods` and `PROTOCOL_VERSION` constants.

### Security and robustness

- Messages are accepted only from the parent window; anything that is not JSON-RPC 2.0 is ignored.
- Invalid notifications are dropped and logged; invalid results reject with `McpError`.
- The handshake is forward compatible: host capabilities are passed through, and a host context field with an
  unexpected value is dropped on its own instead of refusing the connection.
- Error objects from the host are not trusted: a malformed one becomes a clean `McpError`.
- A request fails at once if the message cannot be posted, and is rejected after `close()`.
- A notification handler that throws is reported and does not break the message listener.
- A request from the host always gets an answer, also when the handler result cannot be sent.
- Log entries are capped at 1000 characters and survive circular data.
- The polling interval has a minimum of 100 ms.
- No runtime dependencies; no `eval`, no `innerHTML`.

### Tests

- 38 tests, including a compatibility suite that connects the library to the official `AppBridge` host from
  `@modelcontextprotocol/ext-apps`.

[0.1.0]: https://www.npmjs.com/package/ngx-mcp-apps/v/0.1.0
