# The example

A chart that the model draws in the conversation and then keeps working on. The user asks a question, the model
calls a tool with the numbers, and the chart below opens. It is the real application, built into one HTML file by
the builder and running in an iframe. This page plays the chat host and the MCP server, so everything works here
as it does inside a conversation. The numbers are sample data.

<!-- stage: chart -->

## Try this

- **Tap a value.** It is selected, and the line under the chart compares it with the one before. Under the app,
  "Added to the model context" shows the sentence the app sent to the model. Tap it again to clear the selection.
- **Switch to Line** and back. The same data, drawn another way. The choice stays while the app keeps reading the
  server.
- **Switch the theme of this page.** The host tells the app, and the app follows.
- **Go fullscreen.** The app asks, the host decides. The same button brings it back.

## Several turns, one app

A conversation does not end when the app opens. Under the app, **Say next** continues it. This page has no model:
its side of the conversation is written in advance.

- **"Add October and November".** The model calls `update_chart`, another tool of the server. No new app opens and
  nothing is sent to the one on screen: it reads `read_chart` from the server every second, so the two columns
  appear by themselves.
- **"Which months were the worst?"** The model calls `highlight_points` with two labels. The server remembers them,
  the chart marks them, and the answer names them: the model points at what it is talking about.
- **"Why is this one so high?"** "This one" is the value you tapped. The model calls `read_chart_selection` and
  answers about that value. Ask without a selection and it tells you to tap one first.

So there are two directions. From the model to the app: the model changes the data on the server with a normal
tool, and the open app follows the server with `pollServerTool`. From the user to the model: the app records the
selection, silently, with `updateModelContext` and with a tool of the server that only the app can call
(`select_point`). The model reads it when the user writes the next message.

On the right you see every message that crosses the iframe border. That is the whole MCP Apps protocol as far as
an app is concerned; the library speaks it for you.

## What an app cannot do

The chart was tried in Claude for Android, and these limits were measured there. Other hosts may differ.

- A tap in the app cannot make the model answer. The model speaks when the user sends a message.
- Text typed inside the app did not reach the model. The user writes in the box of the chat, as always.
- The app cannot offer tools of its own to the model, and cannot ask the model for a completion (sampling): that
  host does not provide either.

That is why the chart works the way it does: it records what the user selected and waits. The next message of the
user, typed in the chat, finds the selection already there.

Open the [application alone](example/chart.html) in a new tab to see what it does outside a host: after a moment
it says it is standalone and draws nothing.

## The application

One file. The data of the server is checked by the guard `isChart` before the template uses it, both when the app
opens and at every reading of the server. The tools it relies on (`show_chart`, `update_chart`,
`highlight_points`, `read_chart_selection`, `read_chart`, `select_point`) are written out in
[The server side](server.html). The file alone: [`chart.ts`](example/chart.ts).

<!-- source: projects/chart/src/main.ts -->

## The nine pieces in one app

A second application, a packing list, is built from the nine [components](components.html) you can copy: the
connection badge, the states of the tool call, a button that calls a tool, a value that follows the server, the
theme, fullscreen, a note for the model, a link opened by the host, a notice outside a host. It runs here against
the same kind of host.

<!-- stage -->

- **Add an item.** The button calls the server tool `add_item` through the host. The list comes back in the
  result, and the count of saved changes follows on its own within a second.
- **Write a note for the model.** "Add to context" stays silent; "Send as message" appears in the chat.
- **Say next.** "Add what I need for the beach" makes the model call `add_items`, and the list on screen grows by
  itself. "Did I leave you a note?" answers with what "Add to context" sent.

Open this [application alone](example/app.html) to see its standalone state.

<!-- source: projects/example/src/app/app.ts -->

Its configuration:

<!-- source: projects/example/src/main.ts -->
