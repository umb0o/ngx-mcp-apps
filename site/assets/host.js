// A tiny MCP Apps host, enough to run the example inside this page.
// It plays both the chat host and the MCP server: the app in the iframe cannot tell the difference.
const PROTOCOL = '2026-01-26';

for (const stage of document.querySelectorAll('[data-host]')) mount(stage);

function mount(stage) {
  const frame = stage.querySelector('iframe');
  const holder = stage.querySelector('[data-frame]');
  const logList = stage.querySelector('[data-log]');
  const extra = stage.querySelector('[data-chat-extra]');
  const replay = stage.querySelector('[data-replay]');

  // The "server": state the tools read and write
  let list, changes, mode, polls, pollEntry, timers;
  const reset = () => {
    list = { title: 'Weekend in Lisbon', items: ['Passport', 'Phone charger', 'Walking shoes'] };
    changes = 0;
    mode = 'inline';
    polls = 0;
    pollEntry = null;
    (timers ?? []).forEach(clearTimeout);
    timers = [];
    logList.replaceChildren();
    extra.replaceChildren();
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
    if (name === 'read_counter') return { content: [], structuredContent: { value: changes } };
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
          },
        };
      case 'tools/call':
        return callTool(params?.name, params?.arguments);
      case 'ui/update-model-context':
        say('context', 'Added to the model context', String(params?.content?.[0]?.text ?? ''));
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
        later(500, () => notify('ui/notifications/tool-input', { arguments: { trip: 'Lisbon' } }));
        later(1500, () =>
          notify('ui/notifications/tool-result', {
            content: [{ type: 'text', text: `The list has ${list.items.length} items.` }],
            structuredContent: list,
          }),
        );
      }
      return;
    }

    // Requests from the app. The poll would flood the log: it gets one line with a count
    const isPoll = m.method === 'tools/call' && m.params?.name === 'read_counter';
    if (isPoll) {
      polls++;
      if (!pollEntry?.isConnected) pollEntry = log('out', 'tools/call', 'read_counter');
      pollEntry.querySelector('.detail').textContent = `read_counter, every second (${polls})`;
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

  replay?.addEventListener('click', () => {
    reset();
    frame.contentWindow?.location.reload();
  });

  // Only now: the app sends ui/initialize as soon as it loads, and this page must be listening
  frame.src = frame.dataset.src;
}
