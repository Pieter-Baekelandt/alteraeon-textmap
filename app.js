document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form instanceof HTMLFormElement && (form.id === 'route-form' || form.id === 'search-form')) {
    event.preventDefault();
  }
}, true);

function init() {
  const dataNode = document.getElementById('area-data');
  if (!dataNode) return;

  const data = JSON.parse(dataNode.textContent);
  const areas = data.areas;
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const areaElements = new Map(areas.map((area) => [area.id, document.getElementById(`area-${area.id}`)]));
  const oppositeDirections = {
    North: 'South',
    South: 'North',
    East: 'West',
    West: 'East',
    Northeast: 'Southwest',
    Southwest: 'Northeast',
    Northwest: 'Southeast',
    Southeast: 'Northwest',
    Up: 'Down',
    Down: 'Up',
    In: 'Out',
    Out: 'In',
  };
  const graph = new Map(areas.map((area) => [area.id, new Map()]));
  for (const area of areas) {
    for (const nearby of area.nearby) {
      if (!areaById.has(nearby.id)) continue;
      graph.get(area.id).set(nearby.id, {
        to: nearby.id,
        direction: nearby.direction,
        inferred: false,
      });
    }
  }
  for (const area of areas) {
    for (const nearby of area.nearby) {
      if (!areaById.has(nearby.id)) continue;
      const reverseEdges = graph.get(nearby.id);
      if (!reverseEdges.has(area.id)) {
        reverseEdges.set(area.id, {
          to: area.id,
          direction: oppositeDirections[nearby.direction] ?? 'Direction unknown',
          inferred: true,
        });
      }
    }
  }
  const adjacency = new Map(
    [...graph].map(([id, edges]) => [id, [...edges.values()]]),
  );
  const regionSections = [...document.querySelectorAll('.region')];
  const regionLinks = new Map(
    [...document.querySelectorAll('[data-region-link]')].map((link) => [link.dataset.regionLink, link]),
  );

  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('area-search');
  const clearButton = document.getElementById('clear-search');
  const searchStatus = document.getElementById('search-status');
  const noResults = document.getElementById('no-results');
  const routeForm = document.getElementById('route-form');
  const routeOutput = document.getElementById('route-output');

  const normalize = (value) => value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const searchText = new Map(areas.map((area) => [
    area.id,
    normalize(`${area.name} ${area.region} level ${area.level}`),
  ]));

  function createCombobox(prefix, label) {
    const input = document.getElementById(prefix);
    const hidden = document.getElementById(`${prefix}-value`);
    const listbox = document.getElementById(`${prefix}-listbox`);
    const status = document.getElementById(`${prefix}-status`);
    if (!input || !hidden || !listbox || !status) return null;

    const MAX_OPTIONS = 20;
    let activeIndex = -1;
    let shown = [];

    function matchesFor(query) {
      const tokens = normalize(query).split(/\s+/).filter(Boolean);
      if (!tokens.length) return [];
      const scored = [];
      for (const area of areas) {
        const text = searchText.get(area.id);
        if (!tokens.every((token) => text.includes(token))) continue;
        const name = normalize(area.name);
        let score = 2;
        if (name.startsWith(tokens[0])) score = 0;
        else if (name.includes(tokens[0])) score = 1;
        scored.push({ area, score });
      }
      scored.sort((a, b) => a.score - b.score);
      return scored.map((entry) => entry.area);
    }

    function setActive(index) {
      activeIndex = index;
      const options = [...listbox.querySelectorAll('[role="option"]')];
      options.forEach((option, optionIndex) => {
        const isActive = optionIndex === index;
        option.classList.toggle('is-active', isActive);
        option.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      if (index >= 0 && options[index]) {
        input.setAttribute('aria-activedescendant', options[index].id);
        options[index].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function close() {
      listbox.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      setActive(-1);
      shown = [];
    }

    function open(matches) {
      shown = matches;
      if (!matches.length) {
        close();
        return;
      }
      const items = matches.map((area, index) => {
        const item = document.createElement('li');
        item.id = `${prefix}-option-${index}`;
        item.className = 'option';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        item.dataset.areaId = String(area.id);
        item.textContent = `${area.name} (level ${area.level})`;
        return item;
      });
      listbox.replaceChildren(...items);
      listbox.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      setActive(-1);
    }

    function announce(message) {
      status.textContent = '';
      window.requestAnimationFrame(() => {
        status.textContent = message;
      });
    }

    function select(area, options = {}) {
      input.value = area.name;
      hidden.value = String(area.id);
      input.removeAttribute('aria-invalid');
      close();
      if (options.announce !== false) {
        announce(`${area.name}, level ${area.level}, ${area.region} selected.`);
      }
    }

    function resolveTyped() {
      if (hidden.value) return true;
      const query = normalize(input.value.trim());
      if (!query) return false;
      const exact = areas.find((area) => normalize(area.name) === query);
      if (!exact) return false;
      select(exact, { announce: false });
      return true;
    }

    input.addEventListener('input', () => {
      hidden.value = '';
      input.removeAttribute('aria-invalid');
      const query = input.value.trim();
      if (!query) {
        close();
        announce('No area selected.');
        return;
      }
      const matches = matchesFor(query);
      open(matches.slice(0, MAX_OPTIONS));
      if (matches.length === 0) {
        announce(`No areas match ${query}.`);
      } else if (matches.length > MAX_OPTIONS) {
        announce(`${matches.length} areas match. Showing the first ${MAX_OPTIONS}. Use the Up and Down arrow keys to choose.`);
      } else {
        announce(`${matches.length} ${matches.length === 1 ? 'area matches' : 'areas match'}. Use the Up and Down arrow keys to choose.`);
      }
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (listbox.hidden) {
          open(matchesFor(input.value.trim()).slice(0, MAX_OPTIONS));
          if (!shown.length) return;
        }
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        let next = activeIndex + delta;
        if (next < 0) next = shown.length - 1;
        if (next >= shown.length) next = 0;
        setActive(next);
        return;
      }
      if (event.key === 'Enter') {
        if (!listbox.hidden) {
          const choice = activeIndex >= 0 ? shown[activeIndex] : shown[0];
          if (choice) {
            event.preventDefault();
            select(choice);
          }
        }
        return;
      }
      if (event.key === 'Escape' && !listbox.hidden) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'Tab') {
        if (!listbox.hidden && activeIndex >= 0) select(shown[activeIndex]);
        else close();
      }
    });

    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (document.activeElement !== input) close();
      }, 0);
    });

    listbox.addEventListener('mousedown', (event) => {
      if (event.target.closest('[role="option"]')) event.preventDefault();
    });

    listbox.addEventListener('click', (event) => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      const area = areaById.get(Number(option.dataset.areaId));
      if (area) select(area);
    });

    document.addEventListener('pointerdown', (event) => {
      if (!(event.target instanceof Element)) return;
      if (!input.parentElement.contains(event.target) && !listbox.contains(event.target)) {
        close();
      }
    });

    return {
      input,
      hidden,
      label,
      resolveTyped,
    };
  }

  const routeFrom = createCombobox('route-from', 'starting area');
  const routeTo = createCombobox('route-to', 'destination area');

  let filterTimer;

  function orderedMatches(tokens) {
    const query = tokens.join(' ');
    const scored = [];
    for (const area of areas) {
      const text = searchText.get(area.id);
      if (!tokens.every((token) => text.includes(token))) continue;
      const name = normalize(area.name);
      let score = 3;
      if (name === query) score = 0;
      else if (name.startsWith(tokens[0])) score = 1;
      else if (name.includes(tokens[0])) score = 2;
      scored.push({ area, score });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.map((entry) => entry.area);
  }

  function applyFilter() {
    const rawQuery = searchInput.value.trim();
    const tokens = normalize(rawQuery).split(/\s+/).filter(Boolean);
    const matches = tokens.length ? orderedMatches(tokens) : areas;
    const matchIds = new Set(matches.map((area) => area.id));
    const regionCounts = new Map(regionSections.map((section) => [section.dataset.regionName, 0]));
    let visibleCount = 0;

    for (const area of areas) {
      const isMatch = matchIds.has(area.id);
      const element = areaElements.get(area.id);
      if (element) element.hidden = !isMatch;
      if (isMatch) {
        visibleCount += 1;
        regionCounts.set(area.region, regionCounts.get(area.region) + 1);
      }
    }

    for (const section of regionSections) {
      const count = regionCounts.get(section.dataset.regionName) ?? 0;
      section.hidden = count === 0;
      const link = regionLinks.get(section.dataset.regionName);
      if (link) link.closest('li').hidden = count === 0;
    }

    if (tokens.length === 0) {
      searchStatus.textContent = `${areas.length} areas across ${data.regions.length} regions.`;
      noResults.hidden = true;
    } else {
      searchStatus.textContent = `${visibleCount} ${visibleCount === 1 ? 'area' : 'areas'} match “${rawQuery}”.`;
      noResults.textContent = `No areas match “${rawQuery}”.`;
      noResults.hidden = visibleCount !== 0;
    }

    return { rawQuery, tokens, matches };
  }

  function scheduleFilter() {
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(applyFilter, 120);
  }

  function revealArea(area, options = {}) {
    const element = areaElements.get(area.id);
    if (!element) return;
    element.hidden = false;
    if (options.expand) {
      const details = element.querySelector('details');
      if (details) details.open = true;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.focus({ preventScroll: true });
  }

  function revealRegion(section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const heading = section.querySelector('h2, h3');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(filterTimer);
    const { rawQuery, tokens, matches } = applyFilter();

    if (!tokens.length || !matches.length) {
      searchInput.focus();
      return;
    }

    const query = tokens.join(' ');
    const exactArea = matches.find((area) => normalize(area.name) === query);
    if (exactArea) {
      revealArea(exactArea, { expand: true });
      searchStatus.textContent = `Moved to ${exactArea.name} (level ${exactArea.level}) in ${exactArea.region}.`;
      return;
    }

    const exactRegion = regionSections.find((section) => normalize(section.dataset.regionName) === query);
    if (exactRegion) {
      revealRegion(exactRegion);
      searchStatus.textContent = `Moved to region ${exactRegion.dataset.regionName}.`;
      return;
    }

    const target = matches[0];
    revealArea(target, { expand: matches.length === 1 });
    searchStatus.textContent = matches.length === 1
      ? `Moved to ${target.name} (level ${target.level}).`
      : `${matches.length} areas match “${rawQuery}”. Moved to the first result, ${target.name} (level ${target.level}).`;
  });
  searchInput.addEventListener('input', scheduleFilter);
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    window.clearTimeout(filterTimer);
    applyFilter();
    searchInput.focus();
  });

  function findRoute(startId, endId) {
    if (startId === endId) return [];
    const queue = [startId];
    const previous = new Map([[startId, null]]);

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const nearby of adjacency.get(current) ?? []) {
        if (previous.has(nearby.to)) continue;
        previous.set(nearby.to, {
          from: current,
          direction: nearby.direction,
          inferred: nearby.inferred,
        });
        if (nearby.to === endId) {
          const steps = [];
          let cursor = endId;
          while (cursor !== startId) {
            const step = previous.get(cursor);
            const target = areaById.get(cursor);
            steps.push({
              id: cursor,
              name: target.name,
              level: target.level,
              direction: step.direction,
              inferred: step.inferred,
            });
            cursor = step.from;
          }
          return steps.reverse();
        }
        queue.push(nearby.to);
      }
    }

    return null;
  }

  function showRouteMessage(message, options = {}) {
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    routeOutput.replaceChildren(paragraph);
    if (options.focus !== false) routeOutput.focus();
  }

  function showRoute(start, end, steps) {
    const heading = document.createElement('h3');
    heading.textContent = `Route from ${start.name} to ${end.name}`;

    const summary = document.createElement('p');
    summary.textContent = `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}.`;
    const inferredCount = steps.filter((step) => step.inferred).length;

    const list = document.createElement('ol');
    for (const step of steps) {
      const item = document.createElement('li');
      const direction = document.createElement('span');
      direction.className = 'direction';
      direction.textContent = step.direction;
      const link = document.createElement('a');
      link.href = `#area-${step.id}`;
      link.textContent = step.name;
      const level = document.createElement('span');
      level.className = 'route-level';
      level.textContent = ` (level ${step.level})`;
      item.append(direction);
      if (step.inferred) {
        const inferred = document.createElement('span');
        inferred.className = 'inferred';
        inferred.textContent = ' (inferred)';
        item.append(inferred);
      }
      item.append(' to ', link, level);
      list.append(item);
    }

    const children = [heading, summary];
    if (inferredCount > 0) {
      const note = document.createElement('p');
      note.className = 'route-note';
      note.textContent = 'Directions marked inferred are the opposite of a one-way nearby link.';
      children.push(note);
    }
    children.push(list);
    routeOutput.replaceChildren(...children);
    routeOutput.focus();
  }

  function comboboxMessage(combobox, label) {
    const typed = combobox.input.value.trim();
    return typed
      ? `No area matches “${typed}”. Choose a ${label} from the suggestions.`
      : `Choose a ${label}.`;
  }

  routeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!routeFrom || !routeTo) return;

    routeFrom.input.removeAttribute('aria-invalid');
    routeTo.input.removeAttribute('aria-invalid');

    const fromReady = routeFrom.resolveTyped();
    const toReady = routeTo.resolveTyped();

    if (!fromReady || !toReady) {
      if (!fromReady) routeFrom.input.setAttribute('aria-invalid', 'true');
      if (!toReady) routeTo.input.setAttribute('aria-invalid', 'true');
      let message;
      if (!fromReady && !toReady) {
        message = 'Choose both a starting area and a destination area.';
      } else if (!fromReady) {
        message = comboboxMessage(routeFrom, 'starting area');
      } else {
        message = comboboxMessage(routeTo, 'destination area');
      }
      showRouteMessage(message, { focus: false });
      (!fromReady ? routeFrom.input : routeTo.input).focus();
      return;
    }

    const startId = Number(routeFrom.hidden.value);
    const endId = Number(routeTo.hidden.value);
    const start = areaById.get(startId);
    const end = areaById.get(endId);

    if (startId === endId) {
      showRouteMessage(`You are already at ${start.name}.`);
      return;
    }

    const steps = findRoute(startId, endId);
    if (!steps) {
      showRouteMessage(`No route found from ${start.name} to ${end.name} using the nearby-area links. The source data may not connect these areas.`);
      return;
    }

    showRoute(start, end, steps);
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href^="#area-"]');
    if (!link) return;
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    if (target.hidden) {
      searchInput.value = '';
      window.clearTimeout(filterTimer);
      applyFilter();
    }
  });

  applyFilter();
}

let bootAttempts = 0;
let started = false;

function boot() {
  if (started) return;
  if (!document.getElementById('area-data')) {
    if (bootAttempts < 50) {
      bootAttempts += 1;
      window.setTimeout(boot, 100);
    }
    return;
  }
  started = true;
  init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
