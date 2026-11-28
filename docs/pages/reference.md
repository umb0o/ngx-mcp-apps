# Reference

## API

### `McpApp` signals

| Signal                                                  | Meaning                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `status`                                                | `connecting`, `connected` or `standalone`                                   |
| `connected`                                             | `true` once the handshake with the host succeeded                           |
| `toolInput`, `toolInputPartial`                         | Arguments of the tool call that opened the app (final, and while streaming) |
| `toolResult`, `structuredContent`                       | Result of that tool call                                                    |
| `toolCancelled`, `toolCancelReason`                     | The host cancelled the tool call, and why when it says so                   |
| `hostContext`, `hostCapabilities`                       | What the host says about itself                                             |
| `theme`                                                 | `light` or `dark`, as reported by the host                                  |
| `displayMode`, `availableDisplayModes`, `canFullscreen` | `inline`, `fullscreen`, `pip`                                               |
| `events`                                                | Protocol log, newest first, when `log: true`                                |

### `McpApp` methods

| Method                                                        | Meaning                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `callServerTool(name, args)`                                  | Call a tool of your MCP server from the UI                                                                |
| `pollServerTool(name, { intervalMs, args, guard, injector })` | Signal that follows a server tool                                                                         |
| `structuredContentAs(guard)`                                  | `structuredContent`, checked by your guard and typed                                                      |
| `updateModelContext(text, structuredContent?)`                | Add context for the model's next turn, without a chat message                                             |
| `sendMessage(text)`                                           | Post a user message; resolves `false` if the host refuses                                                 |
| `requestDisplayMode(mode)`, `toggleFullscreen()`              | Ask the host for another display mode; resolves with the mode actually set                                |
| `openLink(url)`                                               | Ask the host to open a link; resolves `false` if the host refuses                                         |
| `requestTeardown()`                                           | Ask the host to close the app                                                                             |
| `onTeardown(handler)`                                         | Run `handler` before the host removes the app (the host waits for it); returns a function that removes it |
| `readServerResource(uri)`, `listServerResources(cursor?)`     | Read or list the resources of your MCP server, through the host                                           |
| `downloadFile(contents)`                                      | Ask the host to save files for the user; resolves `false` if refused                                      |
| `sendLog(level, data, logger?)`                               | Send a log message to the host (`notifications/message`)                                                  |
| `bridge`                                                      | The underlying `McpBridge`, for protocol methods not wrapped here                                         |

The methods that return a promise reject with an error when the app is not connected. `requestTeardown()` and
`sendLog()` do nothing in that case, and `bridge` is `undefined` when the app runs outside a host.

### Lower-level API

`McpBridge`, `parentWindowPort()`, the `Methods` constants and the guards are plain TypeScript and are exported too:

```ts
const bridge = new McpBridge(parentWindowPort(), { name: 'my-app', version: '1.0.0' });
bridge.onNotification(Methods.toolResult, (params) => {
  /* ... */
});
const { hostContext } = await bridge.connect();
```

## Configuration

Options of `provideMcpApp(config)`:

| Option                  | Default       | Meaning                                                               |
| ----------------------- | ------------- | --------------------------------------------------------------------- |
| `name`, `version`       | required      | Sent to the host during the handshake                                 |
| `autoResize`            | `true`        | Tell the host the content size so the iframe fits it                  |
| `availableDisplayModes` | not sent      | Display modes the app supports, declared to the host in the handshake |
| `connectTimeout`        | `4000`        | Ms to wait for the host before going `standalone`                     |
| `requestTimeout`        | `60000`       | Ms to wait for an answer to a request                                 |
| `log`                   | `false`       | Keep the last 50 protocol events in `events` (for debugging)          |
| `allowedOrigins`        | any           | Talk only to a parent window with one of these origins                |
| `port`                  | parent window | Custom transport, mainly for tests                                    |

## Compatibility

Both packages support the same Angular versions.

| Package                | Angular            | Peer dependencies                                                                       |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `ngx-mcp-apps`         | 18, 19, 20, 21, 22 | `@angular/core` `>=18.0.0 <23.0.0`                                                      |
| `ngx-mcp-apps-builder` | 18, 19, 20, 21, 22 | `@angular/build` `>=18.0.0 <23.0.0`, `@angular-devkit/architect` `>=0.1800.0 <0.2300.0` |

Each of these versions was checked with a new application that uses the library and is built by the builder, with
both the first release of the major (18.0.0, 19.0.0, ...) and its latest one: a production build, then the built page
opened in a browser.

The check is repeated automatically on every change and once a week, with the latest release of each major: a new
application, `ng add`, a component of Angular Material, the single-file build, then the page opened in a browser.
Run it yourself with `npm run build && npm run test:compat`.

- MCP Apps protocol `2026-01-26`. A different version announced by the host is logged, and the app keeps working.
- Automated tests run the library against the official `AppBridge`.
- **Hosts.** Tested with Claude: claude.ai on the web and the Claude app for Android. The library follows the MCP Apps specification (protocol 2026-01-26), so other hosts that implement it should work, but they have not been tried.

## Limits

- Not wrapped yet: tools provided by the app to the host, sampling, file download, reading server resources.
  They are reachable through `bridge.request(...)` and `bridge.onRequest(...)`.
- Only the host context fields the library knows are validated; unknown fields are passed through as they are.
- The single HTML file loads everything at once: lazy chunks are merged into it, and web workers are not supported
  (see [Build one HTML file](#4-build-one-html-file)).

## Acknowledgements

This is an independent, unofficial implementation. It is inspired by, and owes its design to:

- [`@modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps) (MIT / Apache-2.0), the official
  MCP Apps SDK: the handshake, the message flow and the auto-resize measurement are modelled on it, and its `AppBridge`
  is used in the test suite. No code from it is shipped in this package.
- The [MCP Apps specification (SEP-1865)](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp).

"MCP", "Model Context Protocol" and "Claude" are names of their respective owners and are used only
to describe compatibility and credit. This project is not affiliated with or endorsed by any of them.
