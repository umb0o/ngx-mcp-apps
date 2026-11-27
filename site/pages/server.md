# The server side

`ngx-mcp-apps` is the page. Something has to hand that page to the chat host: an MCP server. Any MCP server that
follows the MCP Apps specification works, in any language. This page shows the smallest one in Node, so you can see
the whole loop once.

## What the server does

1. It serves the HTML file that `ng build` wrote, as a resource with a `ui://` address.
2. It exposes a tool and says "this tool opens that resource" with `_meta.ui.resourceUri`.
3. When the model calls the tool, the server answers with a normal tool result. Its `structuredContent` is what
   the app reads with `mcp.structuredContent()`.

## A minimal server

```bash
npm install express @modelcontextprotocol/sdk @modelcontextprotocol/ext-apps
```

```js
// server.mjs
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';

// The file written by `ng build` (the `singleFile` option of the builder)
const BUILD = new URL('./dist/my-app.html', import.meta.url);

// Kept in memory to keep the example short: use a database in a real server
const list = { title: 'Weekend in Lisbon', items: ['Passport', 'Charger'] };
let changes = 0;

async function createServer() {
  const server = new McpServer({ name: 'packing-list', version: '1.0.0' });

  // Hosts may cache the page: a hash of the build in the address makes a new build visible at once
  const html = await readFile(BUILD, 'utf8');
  const hash = createHash('sha256').update(html).digest('hex').slice(0, 12);
  const uri = `ui://packing-list/app-${hash}.html`;

  registerAppResource(server, 'packing-list', uri, { description: 'Packing list' }, async () => ({
    contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }],
  }));

  // The tool the model calls. Its result opens the app.
  registerAppTool(
    server,
    'show_packing_list',
    {
      title: 'Packing list',
      description: 'Shows the packing list of the trip as an interactive list.',
      inputSchema: {},
      _meta: { ui: { resourceUri: uri } },
    },
    async () => ({
      content: [{ type: 'text', text: `The list has ${list.items.length} items.` }],
      structuredContent: list,
    }),
  );

  // Tools only the app calls: `visibility: ['app']` hides them from the model
  const appOnly = { ui: { resourceUri: uri, visibility: ['app'] } };

  registerAppTool(
    server,
    'add_item',
    {
      description: 'Adds an item to the list.',
      inputSchema: { text: z.string().min(1) },
      _meta: appOnly,
    },
    async ({ text }) => {
      list.items.push(text);
      changes++;
      return { content: [{ type: 'text', text: 'Added.' }], structuredContent: list };
    },
  );

  // A normal tool the model calls in a later turn. The open app is not told: it follows `read_list`.
  server.registerTool(
    'add_items',
    {
      description: 'Adds several items to the packing list that is already shown.',
      inputSchema: { items: z.array(z.string().min(1)) },
    },
    async ({ items }) => {
      list.items.push(...items);
      changes++;
      return {
        content: [
          {
            type: 'text',
            text: `Added ${items.length} items. The list on screen updates by itself.`,
          },
        ],
      };
    },
  );

  registerAppTool(
    server,
    'read_list',
    { description: 'The list as it is now.', inputSchema: {}, _meta: appOnly },
    async () => ({ content: [], structuredContent: list }),
  );

  registerAppTool(
    server,
    'read_counter',
    { description: 'How many changes were saved.', inputSchema: {}, _meta: appOnly },
    async () => ({ content: [], structuredContent: { value: changes } }),
  );

  return server;
}

const app = express();
app.use(express.json());

// Stateless: a new server and a new transport for every request
app.post('/mcp', async (req, res) => {
  const server = await createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000, () => console.log('MCP server on http://localhost:3000/mcp'));
```

`zod` describes the arguments of a tool; the MCP SDK installs it.

These are the tools of the [example](example.html): `show_packing_list` opens the app; `add_item`, `read_list` and
`read_counter` are called by the page; `add_items` is called by the model in a later turn, and the open app picks
up the change through `read_list`.

## Connect it to a chat host

The host must reach your server over HTTPS. While developing, a tunnel in front of `localhost:3000` is enough. Then
add the address ending in `/mcp` as a custom connector in the host. In Claude: Settings, Connectors, Add custom
connector.

Ask the model for the packing list: it calls `show_packing_list` and the app opens in the conversation.

## Things that go wrong

- **The app does not change after a rebuild.** The host kept the old page. Put the hash of the build in the
  `ui://` address, as above.
- **An image or a font is missing.** The host blocks every address the server did not declare. Fonts and images
  that your CSS references are embedded by the builder; for anything loaded from another site, declare its domain in
  `_meta.ui.csp.resourceDomains` of the resource. For `fetch` calls, use `_meta.ui.csp.connectDomains`.
- **Anyone with the address can call the tools.** A server without authentication is public. Protect it before you
  put real data behind it.
