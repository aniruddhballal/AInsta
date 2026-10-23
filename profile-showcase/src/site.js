const catalogSearch = document.querySelector('#catalog-search');
if (catalogSearch) {
  const rows = [...document.querySelectorAll('[data-catalog-row]')];
  const count = document.querySelector('#catalog-count');
  const empty = document.querySelector('#catalog-empty');
  const update = () => {
    const query = catalogSearch.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of rows) {
      row.hidden = !row.textContent.toLocaleLowerCase().includes(query);
      if (!row.hidden) visible++;
    }
    count.textContent = `${visible} profile${visible === 1 ? '' : 's'} shown`;
    empty.hidden = visible > 0;
  };
  catalogSearch.addEventListener('input', update);
}

const reelGrid = document.querySelector('#reel-grid');
if (reelGrid) {
  const search = document.querySelector('#reel-search');
  const filter = document.querySelector('#reel-filter');
  const sort = document.querySelector('#reel-sort');
  const count = document.querySelector('#reel-count');
  const empty = document.querySelector('#reel-empty');
  const cards = [...reelGrid.querySelectorAll('[data-reel-card]')];
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const ordered = [...cards].sort((a, b) => {
      if (sort.value === 'views') return Number(b.dataset.views) - Number(a.dataset.views);
      return sort.value === 'oldest' ? a.dataset.date.localeCompare(b.dataset.date) : b.dataset.date.localeCompare(a.dataset.date);
    });
    reelGrid.replaceChildren(...ordered);
    let visible = 0;
    for (const card of ordered) {
      const matchesStatus = filter.value === 'all' || (filter.value === 'review' ? card.dataset.status !== 'complete' : card.dataset.status === 'complete');
      card.hidden = !matchesStatus || !card.textContent.toLocaleLowerCase().includes(query);
      if (!card.hidden) visible++;
    }
    count.textContent = `${visible} reel${visible === 1 ? '' : 's'} shown`;
    empty.hidden = visible > 0;
  };
  search.addEventListener('input', update);
  filter.addEventListener('change', update);
  sort.addEventListener('change', update);
  for (const image of reelGrid.querySelectorAll('img')) image.addEventListener('error', () => { image.hidden = true; });
  update();
}
