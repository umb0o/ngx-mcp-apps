// A tiny MCP Apps host, enough to run the example inside this page.
// It plays both the chat host and the MCP server: the app in the iframe cannot tell the difference.
const PROTOCOL = '2026-01-26';

// Style variables as a real host sends them: each value is written with light-dark(), so it follows
// the colour scheme of the element that uses it. These are the colours of this site.
const STYLE_VARIABLES = {
  '--color-text-primary': 'light-dark(#0f1f1c, #e6eeea)',
  '--color-text-secondary': 'light-dark(#4d5c57, #9db2ac)',
  '--color-background-primary': 'light-dark(#fbfcfa, #121f1d)',
  '--color-border-primary': 'light-dark(#cdd5cf, #26393a)',
};

// A stage chooses its scenario with data-scenario. A scenario says what the user asked, which tool the
// model called, the arguments and the result the app receives, and which buttons the page offers:
// "args" opens the app again with other arguments, "message" posts one message to the app as it is.
const CONTACT = { name: 'Rita Fonseca', note: 'Front desk of the hotel. Call before 6 pm.' };
const toolResult = (structuredContent, text = 'One contact.') => ({
  jsonrpc: '2.0',
  method: 'ui/notifications/tool-result',
  params: { content: [{ type: 'text', text }], structuredContent },
});

// The later turns of a conversation. There is no model in this page: its side is written in advance.
// A round has the words of the user ("ask") and what the model then does ("play"). Rounds are offered
// in order, one at a time, each once; a round can ask to be offered again (c.again()), and after the last one the
// conversation ends with a line that says so.
const assistant = (c, text) => {
  c.say('bubble assistant', '', text);
  c.next();
};
const BEACH = ['Swimsuit', 'Beach towel', 'Sunscreen'];
const PACKING_ROUNDS = [
  {
    ask: 'Add what I need for the beach',
    once: true,
    play(c) {
      // The model calls a tool of the server. Nothing is sent to the app: it follows the server.
      c.later(700, () => {
        c.modelCalls('add_items');
        c.addToList(BEACH);
      });
      c.later(2000, () =>
        assistant(c, 'Added the things for the beach. The list above already shows them.'),
      );
    },
  },
  {
    ask: 'Did I leave you a note?',
    play(c) {
      c.later(900, () =>
        assistant(
          c,
          c.context()
            ? `Yes. From the app I have this: "${c.context()}"`
            : 'Not yet. Write a note in the app and press "Add to context", then ask me again.',
        ),
      );
    },
  },
];

// The chart of the example page. The numbers are invented: the title says so.
const point = ([label, value]) => ({ label, value });
const MONTHS = [
  ['Jan', 31],
  ['Feb', 28],
  ['Mar', 36],
  ['Apr', 33],
  ['May', 27],
  ['Jun', 41],
  ['Jul', 44],
  ['Aug', 25],
  ['Sep', 48],
].map(point);
const AUTUMN = [
  ['Oct', 52],
  ['Nov', 61],
].map(point);
const amount = (chart, value) => `${value} ${chart.unit}`.trim();
const CHART_ROUNDS = [
  {
    ask: 'Add October and November',
    once: true,
    play(c) {
      // update_chart changes the server. The chart on screen is not told: it reads read_chart again.
      c.later(700, () => {
        c.modelCalls('update_chart');
        const chart = c.state.chart;
        c.state.chart = { ...chart, points: [...chart.points, ...AUTUMN] };
      });
      c.later(2000, () =>
        assistant(c, 'Added October and November. The chart above already shows them.'),
      );
    },
  },
  {
    ask: 'Which months were the worst?',
    once: true,
    play(c) {
      c.later(700, () => {
        c.modelCalls('highlight_points');
        const chart = c.state.chart;
        const [a, b] = [...chart.points].sort((x, y) => x.value - y.value);
        c.state.chart = { ...chart, highlights: [a.label, b.label] };
        c.later(1300, () =>
          assistant(
            c,
            `${a.label} (${amount(chart, a.value)}) and ${b.label} (${amount(chart, b.value)}) were the two lowest. I marked them on the chart.`,
          ),
        );
      });
    },
  },
  {
    ask: 'Why is this one so high?',
    once: true,
    play(c) {
      // "This one" is what the user tapped: the app recorded it on the server with select_point
      c.later(700, () => c.modelCalls('read_chart_selection'));
      c.later(1700, () => {
        const { chart, selected } = c.state;
        const i = chart.points.findIndex((p) => p.label === selected);
        if (i === -1) {
          // Nothing tapped yet: the same question comes back, once a value is selected it can be answered
          c.again();
          assistant(
            c,
            'I cannot tell which one you mean. Tap a value in the chart, then ask me again.',
          );
          return;
        }
        const p = chart.points[i];
        const before = chart.points[i - 1];
        const top = chart.points.reduce((best, q) => (q.value > best.value ? q : best));
        const step = before
          ? ` That is ${amount(chart, Math.abs(p.value - before.value))} ${p.value >= before.value ? 'more' : 'less'} than ${before.label}.`
          : '';
        const rank =
          top.label === p.label
            ? ' It is the highest value of the chart.'
            : ` The highest is ${top.label} (${amount(chart, top.value)}).`;
        assistant(
          c,
          `You mean ${p.label}: ${amount(chart, p.value)}.${step}${rank} A real model would now say why; this page has none, it only shows that the model knows which value you mean.`,
        );
      });
    },
  },
];

const SCENARIOS = {
  // The packing list that uses the nine pieces
  app: { rounds: PACKING_ROUNDS },
  chart: {
    ask: 'How did we sell this year?',
    tool: 'show_chart',
    poll: 'read_chart',
    // The "server" of this scenario: what its tools read and write
    state: () => ({
      chart: {
        title: 'Sales by month (sample data)',
        unit: 'k€',
        type: 'bar',
        points: MONTHS,
        highlights: [],
      },
      selected: '',
    }),
    args: ({ chart }) => ({
      title: chart.title,
      unit: chart.unit,
      type: chart.type,
      points: chart.points,
    }),
    result: ({ chart }) => ({
      content: [{ type: 'text', text: 'Drawn in the app.' }],
      structuredContent: chart,
    }),
    // The tools only the app calls
    tools: {
      read_chart: (state) => ({ content: [], structuredContent: state.chart }),
      select_point(state, args) {
        const label = typeof args?.label === 'string' ? args.label : '';
        state.selected = state.chart.points.some((p) => p.label === label) ? label : '';
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    },
    rounds: CHART_ROUNDS,
  },
  routing: {
    tool: 'show_trips',
    result: () => ({ content: [{ type: 'text', text: 'Three trips.' }] }),
    label: 'Ask again:',
    actions: [
      { label: 'Show me the Lisbon trip', args: { open: 'trip/2' } },
      { label: 'Show me my trips', args: {} },
    ],
  },
  security: {
    ask: 'Who do I call at the hotel?',
    tool: 'show_contact',
    args: {},
    result: () => toolResult(CONTACT).params,
    label: 'The host sends:',
    actions: [
      {
        label: 'A valid result',
        message: toolResult({ name: 'Tiago Matos', note: 'Airport transfer. He waits at gate B.' }),
      },
      { label: 'The wrong shape', message: toolResult({ name: 42, notes: ['not', 'a', 'card'] }) },
      {
        label: 'HTML in the text',
        message: toolResult({
          name: '<img src=x onerror=alert(1)>',
          note: '<script>alert(2)</script> <b>bold?</b> <a href="javascript:alert(3)">link?</a>',
        }),
      },
      {
        label: 'A broken message',
        message: {
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: { content: 'not a list', structuredContent: CONTACT },
        },
      },
      { label: 'Not a protocol message', message: { hello: 'app', run: 'alert(4)' } },
    ],
  },
};

for (const stage of document.querySelectorAll('[data-host]')) mount(stage);

function mount(stage) {
  const frame = stage.querySelector('iframe');
  const holder = stage.querySelector('[data-frame]');
  const logList = stage.querySelector('[data-log]');
  const extra = stage.querySelector('[data-chat-extra]');
  const replay = stage.querySelector('[data-replay]');
  // The context the model will read: one line, replaced at each update, as the host keeps only the latest
  const contextLine = stage.querySelector('[data-context]');
  const contextText = stage.querySelector('[data-context-text]');
  const scenario = SCENARIOS[stage.dataset.scenario] ?? {};
  // What opens the app: the first button of the scenario, until another one is pressed
  let opening = scenario.actions?.find((action) => action.args) ?? scenario;

  // The "server": state the tools read and write. A scenario with tools of its own keeps it in "state"
  let list, changes, state, mode, polls, pollEntry, timers, modelContext, round;
  // Later rounds of the conversation, where the scenario has them
  const ROUNDS = scenario.rounds ?? [];
  const rounds = ROUNDS.length ? stage.querySelector('[data-rounds]') : null;
  const reset = () => {
    modelContext = '';
    round = 0;
    rounds?.replaceChildren();
    state = scenario.state?.() ?? {};
    list = { title: 'Weekend in Lisbon', items: ['Passport', 'Phone charger', 'Walking shoes'] };
    changes = 0;
    mode = 'inline';
    polls = 0;
    pollEntry = null;
    (timers ?? []).forEach(clearTimeout);
    timers = [];
    logList.replaceChildren();
    extra.replaceChildren();
    if (contextLine) {
      contextLine.hidden = true;
      contextLine.dataset.updates = '0';
    }
    holder.classList.remove('is-fullscreen');
  };
  reset();

  const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const post = (message) => frame.contentWindow?.postMessage(message, '*');
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));

  function log(direction, method, detail) {
    const item = document.createElement('li');
    item.className = direction;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = direction === 'out' ? 'app → host' : 'host → app';
    const name = document.createElement('code');
    name.textContent = method;
    item.append(who, name);
    if (detail !== undefined) {
      const more = document.createElement('span');
      more.className = 'detail';
      const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
      more.textContent = text.length > 90 ? text.slice(0, 90) + '…' : text;
      item.append(more);
    }
    logList.append(item);
    logList.scrollTop = logList.scrollHeight;
    return item;
  }

  function say(kind, label, text) {
    const p = document.createElement('p');
    p.className = kind;
    if (label) {
      const b = document.createElement('span');
      b.className = 'label';
      b.textContent = label;
      p.append(b);
    }
    p.append(text);
    extra.append(p);
    // The conversation has a height of its own: the newest line stays in sight
    extra.scrollTop = extra.scrollHeight;
  }

  /** A line of the conversation that names a tool the model calls. */
  function modelCalls(tool) {
    const p = document.createElement('p');
    p.className = 'toolcall';
    const code = document.createElement('code');
    code.textContent = tool;
    p.append('The model calls the tool ', code);
    extra.append(p);
  }

  // What a round of the conversation may use: the conversation, the clock, the state of the "server"
  const turn = {
    get state() {
      return state;
    },
    later,
    say,
    modelCalls,
    next: () => offerRound(),
    again: () => (round = Math.max(0, round - 1)),
    context: () => modelContext,
    addToList(items) {
      const missing = items.filter((item) => !list.items.includes(item));
      list = { ...list, items: [...list.items, ...missing] };
      changes++;
    },
  };

  /** Shows what the user can say next. The same app stays open through every round. */
  function offerRound() {
    if (!rounds) return;
    rounds.replaceChildren();
    const next = ROUNDS[round];
    if (!next) {
      const end = document.createElement('span');
      end.textContent = 'That is the whole conversation. Run again to start over.';
      rounds.append(end);
      return;
    }
    const label = document.createElement('span');
    label.textContent = 'Say next:';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = next.ask;
    button.addEventListener('click', () => {
      rounds.replaceChildren();
      say('bubble user', '', next.ask);
      round++;
      next.play(turn);
    });
    rounds.append(label, button);
  }

  const notify = (method, params) => {
    log('in', method, params);
    post({ jsonrpc: '2.0', method, params });
  };

  function setMode(next) {
    mode = next;
    holder.classList.toggle('is-fullscreen', mode === 'fullscreen');
  }

  // tools/call: what the MCP server would answer
  function callTool(name, args) {
    const own = scenario.tools?.[name];
    if (own) return own(state, args);
    if (name === 'read_counter') return { content: [], structuredContent: { value: changes } };
    if (name === 'read_list') return { content: [], structuredContent: list };
    if (name === 'add_item') {
      const text = typeof args?.text === 'string' ? args.text.trim() : '';
      if (!text)
        return { content: [{ type: 'text', text: 'Write the item first.' }], isError: true };
      list = { ...list, items: [...list.items, text.slice(0, 80)] };
      changes++;
      return { content: [{ type: 'text', text: 'Added.' }], structuredContent: list };
    }
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }

  function request(method, params) {
    switch (method) {
      case 'ui/initialize':
        return {
          protocolVersion: PROTOCOL,
          hostInfo: { name: 'docs-page-host', version: '1.0.0' },
          hostCapabilities: { serverTools: {}, openLinks: {}, updateModelContext: {}, message: {} },
          hostContext: {
            theme: theme(),
            displayMode: mode,
            availableDisplayModes: ['inline', 'fullscreen'],
            platform: 'web',
            styles: { variables: STYLE_VARIABLES },
          },
        };
      case 'tools/call':
        return callTool(params?.name, params?.arguments);
      case 'ui/update-model-context':
        // Each update replaces the previous one: the model reads the latest on its next turn
        modelContext = String(params?.content?.[0]?.text ?? '');
        if (contextLine) {
          contextText.textContent = modelContext;
          contextLine.dataset.updates = String(Number(contextLine.dataset.updates ?? 0) + 1);
          contextLine.hidden = false;
          contextLine.classList.remove('is-new');
          void contextLine.offsetWidth;
          contextLine.classList.add('is-new');
        } else say('context', 'Added to the model context', modelContext);
        return {};
      case 'ui/message':
        say('bubble user', '', String(params?.content?.[0]?.text ?? ''));
        return {};
      case 'ui/request-display-mode':
        if (params?.mode === 'inline' || params?.mode === 'fullscreen') setMode(params.mode);
        return { mode };
      case 'ui/open-link':
        if (typeof params?.url === 'string' && /^https:\/\//.test(params.url))
          window.open(params.url, '_blank', 'noopener,noreferrer');
        return {};
      default:
        return undefined;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    const m = event.data;
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return;

    // Notifications from the app
    if (m.id === undefined) {
      if (m.method === 'ui/notifications/size-changed') {
        const height = Number(m.params?.height);
        if (Number.isFinite(height) && height > 0) frame.style.height = `${Math.ceil(height)}px`;
        return;
      }
      log('out', m.method);
      if (m.method === 'ui/notifications/initialized') {
        // Like a real host: the arguments of the tool call first, the result a moment later
        const args = typeof opening.args === 'function' ? opening.args(state) : opening.args;
        later(500, () =>
          notify('ui/notifications/tool-input', { arguments: args ?? { trip: 'Lisbon' } }),
        );
        later(1500, () =>
          notify(
            'ui/notifications/tool-result',
            scenario.result?.(state) ?? {
              content: [{ type: 'text', text: `The list has ${list.items.length} items.` }],
              structuredContent: list,
            },
          ),
        );
        later(2200, offerRound);
      }
      return;
    }

    // Requests from the app. The poll would flood the log: it gets one line with a count
    const isPoll =
      m.method === 'tools/call' &&
      ['read_counter', 'read_list', 'read_chart'].includes(m.params?.name);
    if (isPoll) {
      polls++;
      if (!pollEntry?.isConnected) pollEntry = log('out', 'tools/call', 'poll');
      pollEntry.querySelector('.detail').textContent =
        `${scenario.poll ?? 'read_list and read_counter'}, every second (${polls})`;
    } else {
      log('out', m.method, m.method === 'tools/call' ? m.params?.name : undefined);
    }
    const result = request(m.method, m.params);
    if (result === undefined) {
      post({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } });
      return;
    }
    if (!isPoll) log('in', 'result', result);
    post({ jsonrpc: '2.0', id: m.id, result });
  });

  // The page theme is the host theme: the app follows it
  new MutationObserver(() => {
    notify('ui/notifications/host-context-changed', { theme: theme() });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /** Starts the app again from its first address: a router may have changed the part after #. */
  const restart = () => {
    reset();
    const start = new URL(frame.dataset.src, location.href).href;
    const inner = frame.contentWindow.location;
    if (inner.href === start) inner.reload();
    else inner.replace(start);
  };
  replay?.addEventListener('click', restart);

  // The words of the scenario in the conversation, and its buttons under the app
  const ask = stage.querySelector('[data-ask]');
  const showOpening = () => {
    const words = opening.ask ?? (opening.args && opening.label);
    if (ask && words) ask.textContent = words;
  };
  showOpening();
  if (scenario.tool) stage.querySelector('[data-tool]').textContent = scenario.tool;
  const actions = stage.querySelector('[data-actions]');
  if (actions && scenario.actions) {
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', scenario.label.replace(/:$/, ''));
    const label = document.createElement('span');
    label.textContent = scenario.label;
    actions.append(label);
    for (const action of scenario.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      // A button that opens the app stays pressed: it is the conversation the stage is showing
      const pressed = () =>
        action.args && button.setAttribute('aria-pressed', String(opening === action));
      pressed();
      button.addEventListener('click', () => {
        if (action.args) {
          opening = action;
          for (const other of actions.querySelectorAll('button'))
            other.dispatchEvent(new Event('sync'));
          showOpening();
          restart();
        } else if (action.message.jsonrpc === '2.0') {
          notify(action.message.method, action.message.params);
        } else {
          log('in', 'not JSON-RPC', action.message);
          post(action.message);
        }
      });
      button.addEventListener('sync', pressed);
      actions.append(button);
    }
  }

  // Only now: the app sends ui/initialize as soon as it loads, and this page must be listening
  frame.src = frame.dataset.src;
}
