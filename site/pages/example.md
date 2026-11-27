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

## Several turns, one app

A conversation does not end when the app opens. Under the app, **Say next** continues it (this page has no model:
its side of the conversation is written in advance).

- **"Add what I need for the beach".** The model calls `add_items`, another tool of the server. No new app opens
  and nothing is sent to the one on screen: it reads `read_list` from the server every second, so the new items
  appear in it by themselves. This is how a model keeps working on an app across turns.
- **"Did I leave you a note?"** Write a note in the app and press "Add to context" first. The model answers with
  what the app told it: the other direction, from the app to the model's next turn.

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
