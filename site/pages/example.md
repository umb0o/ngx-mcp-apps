# The example

A packing list that the model opens with a tool call. The page below is the real application, built into one HTML
file by the builder and running in an iframe. This page plays the chat host and the MCP server, so everything works
here as it does inside a conversation.

<!-- stage -->

## Try this

- **Add an item.** The button calls the server tool `add_item` through the host. The list comes back in the
  result, and the count of saved changes follows on its own within a second.
- **Switch the theme of this page.** The host tells the app, and the app follows.
- **Go fullscreen.** The app asks, the host decides. The same button brings it back.
- **Write a note for the model.** "Add to context" stays silent; "Send as message" appears in the chat.

On the right you see every message that crosses the iframe border. That is the whole MCP Apps protocol as far as
an app is concerned; the library speaks it for you.

Open the [application alone](example/app.html) in a new tab to see what it does outside a host: after a moment it
says it is standalone and shows no data.

## The application

One component, plus the [components](components.html) you can copy. The data of the server is checked by the
guard `isPackingList` before the template uses it.

<!-- source: projects/example/src/app/app.ts -->

## Its configuration

<!-- source: projects/example/src/main.ts -->

The tools it calls (`show_packing_list`, `add_item`, `read_counter`) are written out in
[The server side](server.html).
