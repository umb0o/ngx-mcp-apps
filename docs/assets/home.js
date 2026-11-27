// The few words this script writes, in the language of the page
const WORDS =
  document.documentElement.lang === 'it'
    ? { packed: (n) => `${n} di 4 pronti`, pause: 'Pausa', play: 'Riproduci' }
    : { packed: (n) => `${n} of 4 packed`, pause: 'Pause', play: 'Play' };

// The animated scene of the home page: three short stories played in a chat window.
// The markup holds every story in its finished state, so the page is complete without this file.
// Here each story is rewound and replayed as a list of timed steps.
const scene = document.querySelector('[data-scene]');

if (scene) {
  const body = scene.querySelector('[data-body]');
  const typed = scene.querySelector('[data-typed]');
  const pointer = scene.querySelector('[data-pointer]');
  const controls = scene.querySelector('[data-controls]');
  const toggle = scene.querySelector('[data-toggle]');
  const picks = [...scene.querySelectorAll('[data-pick]')];
  const stories = [...scene.querySelectorAll('.story')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TYPE = 32; // ms per letter
  const HOLD = 1900; // how long the finished story stays

  /** Moves the pointer over an element of the scene. */
  const pointAt = (el) => {
    const box = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const x = r.left - box.left + Math.min(r.width / 2, 60);
    const y = r.top - box.top + r.height / 2;
    pointer.style.transform = `translate(${x}px, ${y}px)`;
    pointer.classList.add('on');
  };
  const tap = () => {
    pointer.classList.remove('tap');
    void pointer.getBoundingClientRect();
    pointer.classList.add('tap');
  };

  /** What happens inside each card, as steps after the card has appeared. */
  const acts = [
    (story, at, t) => {
      const best = story.querySelector('.bar:last-child');
      at(t + 500, () => story.querySelector('.bars').classList.add('on'));
      at(t + 1700, () => pointAt(best.querySelector('i')));
      at(t + 2300, () => best.classList.add('hot'));
      return t + 2900;
    },
    (story, at, t) => {
      const card = story.querySelector('.card');
      const items = story.querySelectorAll('.ticks li');
      const count = story.querySelector('[data-count]');
      const pack = (n) => {
        items[n - 1].classList.add('on');
        card.dataset.packed = n;
        count.textContent = WORDS.packed(n);
      };
      at(t + 700, () => pointAt(items[0]));
      at(t + 1300, () => (tap(), pack(1)));
      at(t + 1800, () => pointAt(items[1]));
      at(t + 2400, () => (tap(), pack(2)));
      return t + 2900;
    },
    (story, at, t) => {
      const slot = story.querySelectorAll('.slots span')[2];
      at(t + 800, () => pointAt(slot));
      at(t + 1500, () => (tap(), slot.classList.add('picked')));
      at(t + 2200, () => story.querySelector('.booked').classList.add('on'));
      return t + 2700;
    },
  ];

  /** Rewinds a story to its first frame. */
  const rewind = (story) => {
    for (const el of story.querySelectorAll('.on, .hot, .picked'))
      el.classList.remove('on', 'hot', 'picked');
    const card = story.querySelector('[data-packed]');
    if (card) {
      card.dataset.packed = 0;
      story.querySelector('[data-count]').textContent = WORDS.packed(0);
    }
  };

  /** The steps of a story: the question is typed and sent, the answer comes, then the card. */
  const script = (index) => {
    const story = stories[index];
    const steps = [];
    const at = (time, run) => steps.push([time, run]);
    const question = story.querySelector('.ask').textContent;
    for (let i = 1; i <= question.length; i++)
      at(250 + i * TYPE, () => (typed.textContent = question.slice(0, i)));
    const sent = 250 + question.length * TYPE + 350;
    at(sent, () => {
      typed.textContent = '';
      story.querySelector('.ask').classList.add('on');
    });
    at(sent + 550, () => story.querySelector('.say').classList.add('on'));
    at(sent + 1150, () => story.querySelector('.card').classList.add('on'));
    const end = acts[index](story, at, sent + 1150);
    at(end, () => pointer.classList.remove('on'));
    return { steps: steps.sort((a, b) => a[0] - b[0]), length: end + HOLD };
  };

  let index = 0;
  let current = null;
  let cursor = 0;
  let elapsed = 0;
  let last = 0;
  let ticking = false;
  let wanted = !reduced; // what the person asked for
  let inView = true;

  const running = () => wanted && inView && !document.hidden;

  /** Puts a story on screen at its first frame. */
  const load = (next) => {
    index = next;
    stories.forEach((story, i) => {
      story.classList.toggle('is-on', i === index);
      rewind(story);
    });
    picks.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    typed.textContent = '';
    pointer.classList.remove('on', 'tap');
    current = script(index);
    cursor = 0;
    elapsed = 0;
  };
  /** Puts a story on screen already finished. */
  const finish = (next) => {
    load(next);
    for (const [, run] of current.steps) run();
    cursor = current.steps.length;
    elapsed = current.length;
  };

  const frame = (now) => {
    if (!running()) {
      ticking = false;
      return;
    }
    elapsed += Math.min(now - last, 100);
    last = now;
    while (cursor < current.steps.length && current.steps[cursor][0] <= elapsed)
      current.steps[cursor++][1]();
    if (elapsed >= current.length) load((index + 1) % stories.length);
    requestAnimationFrame(frame);
  };
  const wake = () => {
    if (ticking || !running()) return;
    ticking = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };

  toggle.addEventListener('click', () => {
    wanted = !wanted;
    toggle.textContent = wanted ? WORDS.pause : WORDS.play;
    if (wanted && elapsed >= current.length) load(index);
    wake();
  });
  picks.forEach((button, i) =>
    button.addEventListener('click', () => {
      if (wanted) load(i);
      else finish(i);
      wake();
    }),
  );
  document.addEventListener('visibilitychange', wake);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    wake();
  }).observe(scene);

  controls.hidden = false;
  toggle.textContent = wanted ? WORDS.pause : WORDS.play;
  if (wanted) load(0);
  else finish(0);
  wake();
}
