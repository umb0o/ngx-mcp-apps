// The few words this script writes, in the language of the page
const WORDS =
  document.documentElement.lang === 'it'
    ? {
        light: 'Tema chiaro',
        dark: 'Tema scuro',
        copy: 'Copia',
        copied: 'Copiato',
        select: 'Seleziona e copia',
      }
    : {
        light: 'Light theme',
        dark: 'Dark theme',
        copy: 'Copy',
        copied: 'Copied',
        select: 'Select and copy',
      };

// Theme, copy buttons and the note for automated readers. The pages work without this file.
const root = document.documentElement;

// Theme: the stored choice, else the system one
const stored = (() => {
  try {
    return localStorage.getItem('theme');
  } catch {
    return null;
  }
})();
root.dataset.theme =
  stored === 'dark' || stored === 'light'
    ? stored
    : matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

for (const button of document.querySelectorAll('[data-theme-toggle]')) {
  const label = () =>
    (button.textContent = root.dataset.theme === 'dark' ? WORDS.light : WORDS.dark);
  label();
  button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', root.dataset.theme);
    } catch {
      /* private mode: the choice lasts for this page */
    }
    label();
  });
}

// A copy button on every code block
for (const pre of document.querySelectorAll('pre')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy';
  button.textContent = WORDS.copy;
  button.addEventListener('click', async () => {
    const code = pre.querySelector('code')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = WORDS.copied;
    } catch {
      button.textContent = WORDS.select;
    }
    setTimeout(() => (button.textContent = WORDS.copy), 1600);
  });
  pre.append(button);
}

// A browser driven by a program announces itself: make the line for agents hard to miss
if (navigator.webdriver) document.querySelector('.for-agents')?.classList.add('is-agent');

// Tabs (Preview / Code on the pages of the components). The markup shows both parts; this turns them into tabs.
for (const [n, group] of [...document.querySelectorAll('[data-tabs]')].entries()) {
  const list = group.querySelector('[role="tablist"]');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = [...group.querySelectorAll(':scope > [role="tabpanel"]')];
  const select = (index, focus = false) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      if (on && focus) tab.focus();
    });
  };
  tabs.forEach((tab, i) => {
    tab.id = `tab-${n}-${i}`;
    panels[i].id = `panel-${n}-${i}`;
    tab.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (step) select((i + step + tabs.length) % tabs.length, true);
    });
  });
  list.hidden = false;
  select(0);
}
