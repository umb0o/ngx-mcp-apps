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
    (button.textContent = root.dataset.theme === 'dark' ? 'Light theme' : 'Dark theme');
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
  button.textContent = 'Copy';
  button.addEventListener('click', async () => {
    const code = pre.querySelector('code')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select and copy';
    }
    setTimeout(() => (button.textContent = 'Copy'), 1600);
  });
  pre.append(button);
}

// A browser driven by a program announces itself: make the line for agents hard to miss
if (navigator.webdriver) document.querySelector('.for-agents')?.classList.add('is-agent');
