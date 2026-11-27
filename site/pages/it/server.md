# Il lato server

`ngx-mcp-apps` è la pagina. Qualcosa deve consegnare quella pagina all'host di chat: un server MCP. Va bene qualsiasi
server MCP che segue la specifica MCP Apps, in qualsiasi linguaggio. Questa pagina mostra il più piccolo in Node, così
vedi l'intero giro una volta.

## Cosa fa il server

1. Serve il file HTML scritto da `ng build`, come risorsa con un indirizzo `ui://`.
2. Espone un tool e dice "questo tool apre quella risorsa" con `_meta.ui.resourceUri`.
3. Quando il modello chiama il tool, il server risponde con un normale risultato di tool. Il suo `structuredContent`
   è ciò che l'app legge con `mcp.structuredContent()`.
4. Nei turni successivi il modello chiama altri tool che cambiano ciò che il server contiene. L'app aperta non viene
   avvisata: richiede i dati al server ogni secondo, con un tool che solo l'app può chiamare.

## Un server minimo

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

`zod` descrive gli argomenti di un tool; lo installa l'SDK MCP.

Questi sono i tool dell'[esempio](example.html), in tre gruppi:

- `show_chart` apre l'app. La descrizione di un tool è ciò che il modello legge per decidere quando chiamarlo:
  scrivila per il modello.
- `update_chart`, `highlight_points` e `read_chart_selection` sono tool normali per i turni successivi. I primi due
  cambiano ciò che il server contiene, e l'app aperta riceve la modifica attraverso `read_chart`. Il terzo dà al
  modello ciò che l'utente ha selezionato.
- `read_chart` e `select_point` vengono chiamati solo dalla pagina. Con il primo l'app legge il grafico ogni
  secondo, con il secondo registra ciò che l'utente ha toccato.

Il grafico è un solo oggetto per tutti, e per provarlo basta. Un server vero ne tiene uno per ogni utente o
conversazione.

## Collegalo a un host di chat

L'host deve raggiungere il tuo server via HTTPS. Mentre sviluppi, basta un tunnel davanti a `localhost:3000`. Poi
aggiungi l'indirizzo che finisce con `/mcp` come connettore personalizzato nell'host. In Claude: Settings,
Connectors, Add custom connector.

Chiedi al modello di disegnare un grafico di qualche numero: chiama `show_chart` e l'app si apre nella
conversazione.

## Cosa può andare storto

- **L'app non cambia dopo una nuova build.** L'host ha tenuto la pagina vecchia. Metti l'hash della build
  nell'indirizzo `ui://`, come sopra.
- **Manca un'immagine o un font.** L'host blocca ogni indirizzo che il server non ha dichiarato. I font e le
  immagini a cui fa riferimento il tuo CSS vengono incorporati dal builder; per tutto ciò che viene caricato da un
  altro sito, dichiara il suo dominio in `_meta.ui.csp.resourceDomains` della risorsa. Per le chiamate `fetch`, usa
  `_meta.ui.csp.connectDomains`.
- **Chiunque abbia l'indirizzo può chiamare i tool.** Un server senza autenticazione è pubblico. Proteggilo prima
  di metterci dietro dati veri.
