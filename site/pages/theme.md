# Theme

An MCP App is shown inside a conversation that is light or dark, and it should look like part of it. The app has
three things to go by, in this order: the theme the host names, the style variables the host sends, and, when the
host says nothing, the setting of the system.

The preview below is the copy-and-paste piece [Host theme](component-mcp-theme.html) at work. Switch the theme of
this page with the button in the menu: this page is the host, it tells the app, and the app follows. The box is
drawn only with variables sent by the host.

<!-- preview: mcp-theme -->

## 1. The theme of the host

The host puts its theme in the host context. `mcp.theme()` is a signal with the value `'light'`, `'dark'` or
`undefined`. The piece writes it on the `<html>` element as `data-theme`, so a stylesheet can use it:

```css
:root[data-theme='dark'] .card {
  border-color: #3a4a66;
}
```

## 2. The style variables of the host

A host can also send CSS variables with its own colours and fonts, in `mcp.hostContext()?.styles?.variables`.
Claude for Android, for example, was seen to send 76 of them (protocol 2026-01-26), such as:

```css
--color-text-primary: light-dark(rgba(20, 20, 19, 1), rgba(250, 249, 245, 1));
--color-background-primary: light-dark(rgba(255, 255, 255, 1), rgba(48, 48, 46, 1));
```

The values are written with `light-dark()`, so each one holds both colours and the browser picks one from the
`color-scheme` of the element that uses it. The piece copies the variables to the `<html>` element. Use them with a
fallback, because another host may send other names or none:

```css
.card {
  color: var(--color-text-primary, light-dark(#16203a, #e6eaf5));
  border: 1px solid var(--color-border-primary, currentColor);
}
```

The library checks that the variables are strings and passes them on. It does not apply them: the piece does, and
you can read it to see exactly what is written to the page.

## 3. The setting of the system

Outside a host, or with a host that sends no theme, `mcp.theme()` is `undefined`. Then let the browser choose:
`color-scheme: light dark` follows the setting of the system, and `light-dark()` colours follow with it. When code
needs a yes or no, ask `matchMedia('(prefers-color-scheme: dark)').matches`.

## Set the colour scheme on the page, not on a component

`color-scheme` must be set on the root of the app's document, the `<html>` element. A browser paints a frame with
an opaque background when the colour scheme of the frame differs from the one of the page around it. So if only a
component says "dark", the document stays light, and in a dark host the frame turns white: light text on it
cannot be read. This was seen on a real host, and setting it on the root fixed it.

For the same reason, give the page no background. The host draws it, and a transparent frame takes the colour of
the conversation.

```css
body {
  margin: 0;
  background: transparent;
}
```

## The theme can change while the app is open

When the user switches theme, the host sends `ui/notifications/host-context-changed`. `mcp.theme()` and
`mcp.hostContext()` are signals, so an `effect` that reads them runs again. Nothing else is needed: you saw it
happen in the preview above.

## Without the piece

If the theme is all you need, two lines in the root component are enough:

```ts
constructor() {
  const mcp = inject(McpApp);
  effect(() => (document.documentElement.style.colorScheme = mcp.theme() ?? 'light dark'));
}
```

With that, every colour written with `light-dark()` follows the host, and the system when the host is silent. The
[piece](component-mcp-theme.html) adds `data-theme` and the variables of the host.
