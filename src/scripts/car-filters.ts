// Car list filters: brand, cash budget, year, search and sort.
// The current choice is written into the URL (e.g. ?brand=honda&max=50000) so it can be shared.

type Sort = '' | 'price-asc' | 'price-desc' | 'year-desc';
const KEYS = ['brand', 'max', 'year', 'q', 'sort', 'ask'] as const;

export function initCarFilters() {
  const form = document.querySelector<HTMLFormElement>('[data-filters]');
  const list = document.querySelector<HTMLElement>('[data-car-list]');
  if (!form || !list) return;

  const cards = [...list.querySelectorAll<HTMLElement>('[data-car]')];
  const total = cards.length;
  const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const resultCount = $('[data-result-count]');
  const applyCount = $('[data-apply-count]');
  const filterCount = $('[data-filter-count]');
  const askNotice = $('[data-ask-notice]');
  const askCount = $('[data-ask-count]');
  const empty = $('[data-empty]');
  const backdrop = $('[data-filters-backdrop]');
  const openBtn = $<HTMLButtonElement>('[data-filters-open]');
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;

  // Restore choices from the URL.
  const params = new URLSearchParams(location.search);
  for (const key of KEYS) {
    const el = field(key);
    const value = params.get(key);
    if (!el || value === null) continue;
    if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === value)) continue;
    el.value = value;
  }

  const read = () => ({
    brand: field('brand')?.value ?? '',
    max: Number(field('max')?.value) || 0,
    year: Number(field('year')?.value) || 0,
    q: (field('q')?.value ?? '').trim().toLowerCase(),
    sort: (field('sort')?.value ?? '') as Sort,
    ask: field('ask')?.value === '1',
  });

  function apply() {
    const f = read();
    const tokens = f.q.split(/\s+/).filter(Boolean);
    let hiddenNoPrice = 0;

    const matches = cards.filter((card) => {
      const d = card.dataset;
      if (f.brand && d.brand !== f.brand) return false;
      if (f.year && Number(d.year) < f.year) return false;
      if (tokens.length && !tokens.every((t) => d.search!.includes(t))) return false;
      if (f.max) {
        if (!d.price) {
          // No listed price: we cannot tell if it fits the budget, so it is opt-in.
          if (!f.ask) hiddenNoPrice++;
          return f.ask;
        }
        if (Number(d.price) > f.max) return false;
      }
      return true;
    });

    const price = (c: HTMLElement) => (c.dataset.price ? Number(c.dataset.price) : null);
    const byRank = (a: HTMLElement, b: HTMLElement) => Number(a.dataset.rank) - Number(b.dataset.rank);
    matches.sort((a, b) => {
      if (f.sort === 'year-desc') return Number(b.dataset.year) - Number(a.dataset.year) || byRank(a, b);
      if (f.sort === 'price-asc' || f.sort === 'price-desc') {
        const pa = price(a);
        const pb = price(b);
        if (pa === null || pb === null) return pa === pb ? byRank(a, b) : pa === null ? 1 : -1; // no price → last
        return (f.sort === 'price-asc' ? pa - pb : pb - pa) || byRank(a, b);
      }
      return byRank(a, b);
    });

    const visible = new Set(matches);
    for (const card of cards) card.hidden = !visible.has(card);
    for (const card of matches) list!.appendChild(card);

    const n = matches.length;
    if (resultCount) {
      resultCount.innerHTML =
        n === total ? `Showing <span class="mono">${n}</span> cars` : `Showing <span class="mono">${n}</span> of ${total} cars`;
    }
    if (applyCount) applyCount.textContent = String(n);
    if (askNotice && askCount) {
      askNotice.hidden = hiddenNoPrice === 0;
      askCount.textContent = String(hiddenNoPrice);
    }
    if (empty) empty.hidden = n > 0 || hiddenNoPrice > 0;

    const active = [f.brand, f.max, f.year].filter(Boolean).length;
    if (filterCount) {
      filterCount.hidden = active === 0;
      filterCount.textContent = String(active);
    }

    // Keep the URL in sync so the result can be shared.
    const next = new URLSearchParams();
    if (f.brand) next.set('brand', f.brand);
    if (f.max) next.set('max', String(f.max));
    if (f.year) next.set('year', String(f.year));
    if (f.q) next.set('q', f.q);
    if (f.sort) next.set('sort', f.sort);
    if (f.ask && f.max) next.set('ask', '1');
    const qs = next.toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  }

  let typing: number | undefined;
  form.addEventListener('change', apply);
  // The search box lives in the sticky toolbar (outside the <form>, linked with form="car-filters").
  field('q')?.addEventListener('input', () => {
    clearTimeout(typing);
    typing = window.setTimeout(apply, 120);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    apply();
    (document.activeElement as HTMLElement | null)?.blur();
  });

  const reset = () => {
    form.reset();
    const q = field('q');
    if (q) q.value = '';
    const ask = field('ask');
    if (ask) ask.value = '';
    apply();
  };
  document.querySelectorAll('[data-filters-reset]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      reset();
    }),
  );

  $('[data-ask-show]')?.addEventListener('click', () => {
    const ask = field('ask');
    if (ask) ask.value = '1';
    apply();
  });

  // Bottom sheet on phones.
  const open = () => {
    form.classList.add('is-open');
    if (backdrop) backdrop.hidden = false;
    openBtn?.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    form.querySelector<HTMLElement>('select')?.focus({ preventScroll: true });
  };
  const close = () => {
    if (!form.classList.contains('is-open')) return;
    form.classList.remove('is-open');
    if (backdrop) backdrop.hidden = true;
    openBtn?.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    openBtn?.focus({ preventScroll: true });
  };
  openBtn?.addEventListener('click', open);
  backdrop?.addEventListener('click', close);
  document.querySelectorAll('[data-filters-close]').forEach((btn) => btn.addEventListener('click', close));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  matchMedia('(min-width: 900px)').addEventListener('change', close);

  apply();
}
