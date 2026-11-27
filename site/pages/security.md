# Security

An MCP App runs inside a chat host, and the host is trusted: it decides what the app may do, and the app talks only
to it. The content is another matter. The data a tool returns comes from your server and, through it, from the
model, and a model can be led to write anything: a wrong shape, a very long text, a piece of HTML. An app is safe
when bad data cannot break it and cannot run.

The application below shows a contact card from a tool result. Under the card it prints the log of the library, so
you can see what arrived. The buttons make this page, which plays the host, send it different things.

<!-- stage: security -->

## Try this

- **A valid result.** The card changes. The log says `tool-result` with the data.
- **The wrong shape.** The message is a correct tool result, but the name is a number and the note is missing. The
  check of the app refuses it: the card keeps the last valid contact and a line says so.
- **HTML in the text.** The name is `<img src=x onerror=alert(1)>` and the note holds a `<script>` and a
  `javascript:` link. They pass the check, because they are strings, and they appear on the card as the characters
  they are. No image, no link, no dialog: nothing runs.
- **A broken message.** A tool result whose `content` is not a list. The library drops it before the app sees it,
  and the log says `invalid tool-result dropped`.
- **Not a protocol message.** An object that is not JSON-RPC 2.0. The library ignores it: nothing changes, not even
  the log.

## The check of the app

The library checks the messages of the protocol. It cannot know the shape of your own data, so that check is
yours: a function that says whether a value is what the template expects. Check every field the template reads,
and put a limit on what could be too long.

```ts
interface Contact {
  name: string;
  note: string;
}
const isContact = (v: unknown): v is Contact =>
  isObject(v) &&
  typeof v['name'] === 'string' &&
  v['name'].length <= 80 &&
  typeof v['note'] === 'string' &&
  v['note'].length <= 300;
```

`structuredContentAs(isContact)` gives the data when it passes and `undefined` when it does not. This example
keeps the last valid contact on screen with a linked signal (Angular 19 or later):

```ts
private readonly checked = this.mcp.structuredContentAs(isContact);
protected readonly contact = linkedSignal<Contact | undefined, Contact | undefined>({
  source: this.checked,
  computation: (next, previous) => next ?? previous?.value,
});
protected readonly refused = computed(() => !!this.mcp.toolResult() && !this.checked());
```

Any function of the form `(value: unknown) => value is T` works: written by hand as here, or made by a library
such as typia or valibot.

## Text stays text

The template uses Angular's `{{ }}`. Angular writes the value as text, so markup inside it is shown, not
interpreted.

```html
<article>
  <h1>{{ contact.name }}</h1>
  <p>{{ contact.note }}</p>
</article>
```

The way to lose this protection is to ask for it: `[innerHTML]`, `bypassSecurityTrustHtml`, or writing to the DOM
by hand. Do not use them with tool data. The same goes for addresses: do not put a string from a tool result into
`href` or `src` without checking that it starts with `https://`.

## The log

`provideMcpApp({ ..., log: true })` keeps the last 50 protocol events in the signal `mcp.events()`, each cut at
1000 characters. The example shows the newest four. The log repeats the data that arrived, so it is a tool for
debugging: leave it off in an app that real users open.

## The checklist

<!-- checklist -->

## The server side

The app is one half. The other half is the MCP server that serves it and answers its tool calls, and an MCP server
without authentication is public: anyone who has its address can call its tools. The MCP specification defines
authorization based on OAuth 2.1 for servers reached over HTTP; use it, or another control you trust, before you
put real data behind a tool. More in [Things that go wrong](server.html#things-that-go-wrong).

## The whole file

<!-- source: projects/security/src/main.ts -->
