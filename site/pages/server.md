# The server side

`ngx-mcp-apps` is the page. Something has to hand that page to the chat host: an MCP server. Any MCP server that
follows the MCP Apps specification works, in any language. This page shows the smallest one in Node, so you can see
the whole loop once.

## What the server does

1. It serves the HTML file that `ng build` wrote, as a resource with a `ui://` address.
2. It exposes a tool and says "this tool opens that resource" with `_meta.ui.resourceUri`.
3. When the model calls the tool, the server answers with a normal tool result. Its `structuredContent` is what
   the app reads with `mcp.structuredContent()`.
4. In later turns the model calls other tools that change what the server holds. The open app is not told: it
   asks the server again every second, with a tool that only the app can call.

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
const chart = { title: 'Chart', unit: '', type: 'bar', points: [], highlights: [], selected: '' };

const point = z.object({ label: z.string().min(1).max(24), value: z.number().min(0) });
/** What the app draws: everything but the selection. */
const chartData = () => ({
  title: chart.title,
  unit: chart.unit,
  type: chart.type,
  points: chart.points,
  highlights: chart.highlights,
});
/** The same in words, for the model. */
const chartText = () => {
  const values = chart.points.map((p) => `${p.label} ${p.value}`).join(', ');
  return `"${chart.title}": ${values || 'no data'}.`;
};

async function createServer() {
  const server = new McpServer({ name: 'chart', version: '1.0.0' });

  // Hosts may cache the page: a hash of the build in the address makes a new build visible at once
  const html = await readFile(BUILD, 'utf8');
  const hash = createHash('sha256').update(html).digest('hex').slice(0, 12);
  const uri = `ui://chart/app-${hash}.html`;

  registerAppResource(server, 'chart', uri, { description: 'Chart' }, async () => ({
    contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }],
  }));

  // The tool the model calls first. Its result opens the app.
  registerAppTool(
    server,
    'show_chart',
    {
      title: 'Chart',
      description:
        'Draws a chart as an interactive app in the conversation. The user can tap a value to select it.',
      inputSchema: {
        title: z.string().min(1).max(80),
        points: z.array(point).min(1).max(24),
        unit: z.string().max(12).optional(),
        type: z.enum(['bar', 'line']).optional(),
      },
      _meta: { ui: { resourceUri: uri } },
    },
    async ({ title, points, unit, type }) => {
      Object.assign(chart, { title, points, unit: unit ?? '', type: type ?? 'bar' });
      Object.assign(chart, { highlights: [], selected: '' });
      return {
        content: [{ type: 'text', text: `Drawn in the app. ${chartText()}` }],
        structuredContent: chartData(),
      };
    },
  );

  // Normal tools the model calls in later turns. The open app is not told: it follows `read_chart`.
  server.registerTool(
    'update_chart',
    {
      description:
        'Changes the chart that is already on screen. The open app redraws by itself: do not call show_chart again.',
      inputSchema: {
        title: z.string().min(1).max(80).optional(),
        unit: z.string().max(12).optional(),
        type: z.enum(['bar', 'line']).optional(),
        points: z.array(point).max(24).optional(),
        add_points: z.array(point).max(24).optional(),
      },
    },
    async ({ title, unit, type, points, add_points }) => {
      if (title !== undefined) chart.title = title;
      if (unit !== undefined) chart.unit = unit;
      if (type !== undefined) chart.type = type;
      if (points) chart.points = points;
      if (add_points) chart.points = [...chart.points, ...add_points].slice(-24);
      // A mark on a value that is gone means nothing
      chart.highlights = chart.highlights.filter((l) => chart.points.some((p) => p.label === l));
      return {
        content: [
          { type: 'text', text: `Changed. The chart on screen already shows it. ${chartText()}` },
        ],
      };
    },
  );

  server.registerTool(
    'highlight_points',
    {
      description:
        'Marks some values of the chart on screen, by label, so the user sees what you are talking about. An empty list removes the marks.',
      inputSchema: { labels: z.array(z.string()).max(24) },
    },
    async ({ labels }) => {
      const wanted = labels.map((l) => l.toLowerCase());
      chart.highlights = chart.points
        .filter((p) => wanted.includes(p.label.toLowerCase()))
        .map((p) => p.label);
      return {
        content: [{ type: 'text', text: `Marked: ${chart.highlights.join(', ') || 'nothing'}.` }],
      };
    },
  );

  server.registerTool(
    'read_chart_selection',
    {
      description:
        'Reads which value of the chart the user selected by tapping it. Call it when the user says "this one" or asks about the chart without naming a value.',
      inputSchema: {},
    },
    async () => {
      const p = chart.points.find((x) => x.label === chart.selected);
      const selection = p
        ? `The user has selected ${p.label} (${p.value}).`
        : 'The user has nothing selected.';
      return { content: [{ type: 'text', text: `${selection} ${chartText()}` }] };
    },
  );

  // Tools only the app calls: `visibility: ['app']` hides them from the model
  const appOnly = { ui: { resourceUri: uri, visibility: ['app'] } };

  registerAppTool(
    server,
    'read_chart',
    { description: 'The chart as it is now.', inputSchema: {}, _meta: appOnly },
    async () => ({ content: [], structuredContent: chartData() }),
  );

  registerAppTool(
    server,
    'select_point',
    {
      description: 'What the user tapped.',
      inputSchema: { label: z.string().max(24) },
      _meta: appOnly,
    },
    async ({ label }) => {
      chart.selected = chart.points.some((p) => p.label === label) ? label : '';
      return { content: [{ type: 'text', text: 'ok' }] };
    },
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

These are the tools of the [example](example.html), in three groups:

- `show_chart` opens the app. The description of a tool is what the model reads to decide when to call it: write
  it for the model.
- `update_chart`, `highlight_points` and `read_chart_selection` are normal tools for later turns. The first two
  change what the server holds, and the open app picks the change up through `read_chart`. The third gives the
  model what the user selected.
- `read_chart` and `select_point` are called by the page only. The app reads the chart every second with the
  first, and records what the user tapped with the second.

The chart is one object for everybody, which is enough to try it. A real server keeps one for each user or
conversation.

## Connect it to a chat host

The host must reach your server over HTTPS. While developing, a tunnel in front of `localhost:3000` is enough. Then
add the address ending in `/mcp` as a custom connector in the host. In Claude: Settings, Connectors, Add custom
connector.

Ask the model to draw a chart of some numbers: it calls `show_chart` and the app opens in the conversation.

## Things that go wrong

- **The app does not change after a rebuild.** The host kept the old page. Put the hash of the build in the
  `ui://` address, as above.
- **An image or a font is missing.** The host blocks every address the server did not declare. Fonts and images
  that your CSS references are embedded by the builder; for anything loaded from another site, declare its domain in
  `_meta.ui.csp.resourceDomains` of the resource. For `fetch` calls, use `_meta.ui.csp.connectDomains`.
- **Anyone with the address can call the tools.** A server without authentication is public. Protect it before you
  put real data behind it.
