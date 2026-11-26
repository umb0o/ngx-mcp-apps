# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).
Until 1.0.0 the API may change between minor versions.

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
