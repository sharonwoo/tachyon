(function () {
  const umas = TEAM_TRIAL_DATA.umas;

  const state = {
    query: '',
    sort: 'avg_score',
    roster: '',
    scenario: '',
    distance: '',
  };

  const scenarios = Array.from(new Set(umas.map(u => u.scenario).filter(Boolean))).sort();

  // Score slices (see renderTeamComponents / renderScoreBreakdown).
  const BREAKDOWN_LABELS = TEAM_TRIAL_DATA.score_component_labels || {};
  const BREAKDOWN_KEYS = Object.keys(BREAKDOWN_LABELS);

  // Finishing position is blue and the residual bonuses slice neutral gray; the
  // three skill slices share one hue (orange) as an ordinal ramp, light -> dark
  // by rarity (white < gold < unique), validated with --ordinal on the card surface.
  const SKILL_KEYS = ['white_skills', 'gold_skills', 'unique_skills'];
  const SLICE_COLORS = {
    position: '#3987e5', white_skills: '#eb9566', gold_skills: '#d95926', unique_skills: '#a8431b', strong_start: '#2fa37a', bonuses: '#6e7681',
  };

  renderSummary();
  renderTeamComponents();
  renderScoreTrend();
  renderFilters();
  applyAndRender();

  // ---------- helpers ----------

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatNumber(n) {
    return Math.round(n).toLocaleString();
  }

  function fmt1(n) {
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function pct(n) {
    return `${Math.round(n * 100)}%`;
  }

  // Stats to actually show/sort by: a current-team uma should be judged on
  // how she performs at the distance she's racing NOW, not blended across
  // every distance she's ever run - a uma can be great at Long and mediocre
  // at Medium, and slotting her at Medium should show the Medium numbers.
  // Falls back to her overall (all-distance) stats when there's no
  // current-team distance, or no races logged at it yet.
  function effectiveStats(uma) {
    // An explicit distance filter wins over the current-team default.
    if (state.distance) {
      const ds = uma.distance_stats[state.distance];
      if (ds) return { stats: ds, label: `at ${state.distance}` };
    }
    if (uma.in_current_team && uma.current_team_distance_category) {
      const ds = uma.distance_stats[uma.current_team_distance_category];
      if (ds) return { stats: ds, label: `at ${uma.current_team_distance_category}` };
    }
    // Otherwise, if she has switched distances, use the category she's run most.
    const cats = Object.entries(uma.distance_stats || {});
    if (cats.length > 1) {
      const [cat, ds] = cats.reduce((best, c) => (c[1].races > best[1].races ? c : best));
      return { stats: ds, label: `at ${cat}` };
    }
    return { stats: uma, label: 'all distances' };
  }

  // ---------- filtering + sorting ----------

  function applyFilters(all) {
    let filtered = all;
    if (state.roster === 'current') {
      filtered = filtered.filter(u => u.in_current_team);
    } else if (state.roster === 'bench') {
      filtered = filtered.filter(u => !u.in_current_team);
    } else if (state.roster === 'switches') {
      filtered = filtered.filter(u => u.switches_distance);
    }
    if (state.scenario) {
      filtered = filtered.filter(u => u.scenario === state.scenario);
    }
    if (state.distance) {
      filtered = filtered.filter(u => u.distance_stats[state.distance]);
    }
    if (state.query) {
      const q = state.query.toLowerCase();
      filtered = filtered.filter(u => u.uma.toLowerCase().includes(q));
    }
    return filtered;
  }

  function sortUmas(filtered) {
    const sorted = filtered.slice();
    // Sort on each uma's effective (current-distance, where applicable)
    // stats, so ranking matches what the card actually displays.
    const s = uma => effectiveStats(uma).stats;
    if (state.sort === 'consistency') {
      sorted.sort((a, b) => s(a).score_cv - s(b).score_cv);
    } else if (state.sort === 'win_rate') {
      sorted.sort((a, b) => s(b).win_rate - s(a).win_rate || s(b).avg_score - s(a).avg_score);
    } else if (state.sort === 'top1_rate') {
      sorted.sort((a, b) => s(b).top1_rate - s(a).top1_rate || s(b).avg_score - s(a).avg_score);
    } else if (state.sort === 'top3_rate') {
      sorted.sort((a, b) => s(b).top3_rate - s(a).top3_rate || s(b).avg_score - s(a).avg_score);
    } else if (state.sort === 'full_spurt_rate') {
      sorted.sort((a, b) => (s(b).full_spurt_rate ?? -1) - (s(a).full_spurt_rate ?? -1) || s(b).avg_score - s(a).avg_score);
    } else if (state.sort === 'finish_order') {
      sorted.sort((a, b) => s(a).avg_finish_order - s(b).avg_finish_order);
    } else if (state.sort === 'races') {
      sorted.sort((a, b) => s(b).races - s(a).races);
    } else if (state.sort === 'median') {
      sorted.sort((a, b) => s(b).score_median - s(a).score_median);
    } else {
      sorted.sort((a, b) => s(b).avg_score - s(a).avg_score);
    }
    return sorted;
  }

  function applyAndRender() {
    const filtered = sortUmas(applyFilters(umas));
    renderCount(filtered, umas.length);
    renderList(filtered);
  }

  // ---------- summary ----------

  function renderSummary() {
    document.getElementById('summary').innerHTML = `
      <div class="stat"><strong>${umas.length}</strong><span>umas tracked</span></div>
      <div class="stat"><strong>${TEAM_TRIAL_DATA.match_count}</strong><span>matches captured</span></div>
      <div class="stat"><strong>${TEAM_TRIAL_DATA.race_count}</strong><span>total races</span></div>
      <div class="stat"><strong>${pct(TEAM_TRIAL_DATA.win_count / TEAM_TRIAL_DATA.race_count)}</strong><span>team round win rate</span></div>
      <div class="stat"><strong>${pct(TEAM_TRIAL_DATA.top1_count / TEAM_TRIAL_DATA.race_count)}</strong><span>individual top-1 rate</span></div>
      <div class="stat"><strong>${pct(TEAM_TRIAL_DATA.top3_count / TEAM_TRIAL_DATA.race_count)}</strong><span>individual top-3 rate</span></div>
      <div class="stat"><strong>${TEAM_TRIAL_DATA.current_team_size}</strong><span>on current team (as of ${escapeHtml(TEAM_TRIAL_DATA.current_team_date || '?')})</span></div>
    `;
  }

  function renderCount(filtered, total) {
    document.getElementById('team-trial-count').textContent =
      filtered.length === total ? `${total} umas` : `${filtered.length} of ${total} umas`;
  }

  // ---------- team overview boxplot ----------

  // "Nice" tick step (1/2/5 x 10^n) for an axis spanning [min, max].
  function niceTicks(min, max, count) {
    const range = max - min || 1;
    const rawStep = range / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const step = norm < 1.5 ? mag : norm < 3 ? 2 * mag : norm < 7 ? 5 * mag : 10 * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
    return ticks;
  }

  // Jump from a team chart row down to that uma's card in the list
  // below. Clears any active filter that could be hiding her (every row here
  // is in_current_team, so resetting to "All umas"/no query/no scenario
  // filter always makes her visible) before scrolling.
  function goToUmaCard(trainedCharaId) {
    state.query = '';
    state.roster = '';
    state.scenario = '';
    const rosterSelect = document.getElementById('tt-roster-select');
    const scenarioSelect = document.getElementById('tt-scenario-select');
    const queryInput = document.getElementById('tt-query-input');
    if (rosterSelect) rosterSelect.value = '';
    if (scenarioSelect) scenarioSelect.value = '';
    if (queryInput) queryInput.value = '';
    applyAndRender();

    const card = document.getElementById(`tt-uma-card-${trainedCharaId}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('tt-card-flash');
    setTimeout(() => card.classList.remove('tt-card-flash'), 1600);
  }

  // ---------- score trend by day ----------

  function dateMs(s) {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  // "Nice" y-axis ticks (1/2/5 x 10^n step) for an axis spanning [lo, hi].
  function niceAxis(lo, hi, nticks = 5) {
    const range = hi - lo || 1;
    const rawStep = range / nticks;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 5, 10].map(f => f * mag).find(s => range / s <= nticks + 1) || mag;
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let t = min; t <= max; t += step) ticks.push(t);
    return { min, max, ticks };
  }

  // Aggregate every uma's matches into one row per day. team_total_score
  // and win are per-race values shared by every teammate who raced that
  // race, so they're deduped by (match_key, round) rather than summed once
  // per uma - otherwise a day with a full 3-uma team would count each
  // race's score 3x.
  function buildDailyTrend() {
    const races = new Map(); // "match_key#round" -> {date, match_key, team_total_score, win}
    const byDay = new Map(); // date -> {races: 0, best: {score, uma}, assumedCount: 0}

    for (const uma of umas) {
      for (const m of uma.matches) {
        const raceKey = `${m.match_key}#${m.round}`;
        if (!races.has(raceKey)) {
          races.set(raceKey, { date: m.date, match_key: m.match_key, team_total_score: m.team_total_score, win: m.win });
        }
        if (!byDay.has(m.date)) byDay.set(m.date, { races: 0, best: null, assumedCount: 0 });
        const day = byDay.get(m.date);
        day.races += 1;
        if (!day.best || m.score > day.best.score) {
          day.best = { score: m.score, uma: uma.uma };
        }
        // Most replays are named "TT-YYYYMMDD_HHMMSS_mmm" by umadump at the
        // moment of capture, so `date` is the real capture date. A handful
        // of older-convention replays carry no such timestamp in their
        // filename, so their date falls back to the replay file's mtime -
        // which gets rewritten by any copy/sync between machines, so it's
        // only an assumed date, not a verified one. See date_source on each
        // match (from build_team_trial_journal.py's resolve_match_date).
        if (m.date_source === 'assumed') day.assumedCount += 1;
      }
    }

    // A "round" here is one full Team Trial run (a single captured replay,
    // up to 5 races) - its score is the sum of team_total_score across all
    // its races, matching what the game itself scores the run on. Win rate
    // stays at race granularity (race_wins/race_count) since a round mixes
    // 5 independent win/loss outcomes, not one.
    const matches = new Map(); // match_key -> {date, total_score, race_wins, race_count}
    for (const r of races.values()) {
      if (!matches.has(r.match_key)) {
        matches.set(r.match_key, { date: r.date, total_score: 0, race_wins: 0, race_count: 0 });
      }
      const match = matches.get(r.match_key);
      match.total_score += r.team_total_score;
      match.race_wins += r.win ? 1 : 0;
      match.race_count += 1;
    }

    for (const { date, total_score, race_wins, race_count } of matches.values()) {
      const day = byDay.get(date);
      day.rounds = (day.rounds || 0) + 1;
      day.total_score = (day.total_score || 0) + total_score;
      day.race_wins = (day.race_wins || 0) + race_wins;
      day.race_count = (day.race_count || 0) + race_count;
    }

    return Array.from(byDay.entries())
      .map(([date, d]) => ({
        date,
        rounds: d.rounds || 0,
        // Avg per round (a full run's score, summed across its races), not
        // the day's total - a day where you happened to play more rounds
        // shouldn't look like a "better" day just because its total is
        // bigger.
        avg_round_score: d.rounds ? d.total_score / d.rounds : 0,
        win_rate: d.race_count ? d.race_wins / d.race_count : 0,
        races: d.races,
        best: d.best,
        assumedCount: d.assumedCount,
        hasAssumed: d.assumedCount > 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderScoreTrend() {
    const container = document.getElementById('score-trend');
    if (!container) return;
    container.innerHTML = '';

    const days = buildDailyTrend();
    if (days.length < 2) {
      const empty = document.createElement('p');
      empty.className = 'tt-overview-empty';
      empty.textContent = 'Not enough days captured yet to trend (need at least 2).';
      container.appendChild(empty);
      return;
    }

    const W = 928, H = 260;
    const pad = { top: 20, right: 20, bottom: 30, left: 70 };
    const iW = W - pad.left - pad.right;
    const iH = H - pad.top - pad.bottom;

    const xs = days.map(d => dateMs(d.date));
    const ys = days.map(d => d.avg_round_score);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yAxis = niceAxis(Math.min(...ys), Math.max(...ys));

    const px = x => pad.left + (xMax === xMin ? iW / 2 : (x - xMin) / (xMax - xMin) * iW);
    const py = y => pad.top + iH - (y - yAxis.min) / (yAxis.max - yAxis.min) * iH;

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="Average team score per round, by day">`;

    yAxis.ticks.forEach(t => {
      const y = py(t);
      svg += `<line class="grid-h" x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" />`;
      svg += `<text class="axis-lbl" x="${pad.left - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${formatNumber(t)}</text>`;
    });

    // One label per day would overlap once there are more than ~15-20 days
    // captured, so thin them to whatever actually fits: keep a label only
    // once it's at least MIN_LABEL_GAP past the last one shown, always
    // showing the first and last day so the chart's range stays legible.
    const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const MIN_LABEL_GAP = 56;
    let lastLabelX = -Infinity;
    days.forEach((d, i) => {
      const x = px(dateMs(d.date));
      const isLast = i === days.length - 1;
      if (x - lastLabelX < MIN_LABEL_GAP && !isLast) return;
      svg += `<line class="grid-v" x1="${x}" y1="${pad.top}" x2="${x}" y2="${H - pad.bottom}" />`;
      svg += `<text class="axis-lbl" x="${x}" y="${H - pad.bottom + 16}" text-anchor="middle">${dateFmt.format(new Date(dateMs(d.date)))}</text>`;
      lastLabelX = x;
    });

    const points = days.map(d => `${px(dateMs(d.date)).toFixed(1)},${py(d.avg_round_score).toFixed(1)}`).join(' ');
    svg += `<polyline points="${points}" fill="none" stroke="#58a6ff" stroke-width="1.5" opacity="0.5" />`;

    days.forEach((d, i) => {
      // Amber dot = this day's date includes at least one replay whose date
      // is only assumed from file mtime, not from a capture-time filename -
      // see hasAssumed in buildDailyTrend.
      const dotColor = d.hasAssumed ? '#d29922' : '#58a6ff';
      svg += `<circle class="chart-dot tt-trend-dot" data-idx="${i}" cx="${px(dateMs(d.date)).toFixed(1)}" cy="${py(d.avg_round_score).toFixed(1)}" r="4" fill="${dotColor}" stroke="#0d1117" stroke-width="1" />`;
    });

    svg += `</svg>`;

    const chart = document.createElement('div');
    chart.style.position = 'relative';
    chart.innerHTML = svg;
    container.appendChild(chart);

    const tooltip = document.createElement('div');
    tooltip.className = 'tt-overview-tooltip';
    chart.appendChild(tooltip);

    chart.querySelectorAll('.tt-trend-dot').forEach(dot => {
      const d = days[Number(dot.dataset.idx)];
      dot.addEventListener('mousemove', e => {
        const rect = chart.getBoundingClientRect();
        tooltip.innerHTML = `
          <strong>${escapeHtml(d.date)}</strong><br>
          avg score/round ${formatNumber(d.avg_round_score)} · ${d.rounds} round${d.rounds === 1 ? '' : 's'}<br>
          team win rate ${pct(d.win_rate)} · ${d.races} individual race${d.races === 1 ? '' : 's'}<br>
          ${d.best ? `top scorer: ${escapeHtml(d.best.uma)} (${formatNumber(d.best.score)})<br>` : ''}
          ${d.hasAssumed ? `<span class="tt-assumed-note">⚠ ${d.assumedCount} race${d.assumedCount === 1 ? '' : 's'} this day ${d.assumedCount === 1 ? 'has' : 'have'} no capture timestamp in its replay filename - date assumed from file save time, may be wrong</span>` : ''}
        `;
        tooltip.style.left = `${e.clientX - rect.left + 12}px`;
        tooltip.style.top = `${e.clientY - rect.top + 12}px`;
        tooltip.classList.add('visible');
      });
      dot.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    });
  }

  // ---------- filters ----------

  function renderFilters() {
    const container = document.getElementById('filters');
    container.innerHTML = '';

    const rosterField = makeSelect('Roster', [
      ['', 'All umas'],
      ['current', 'Current team only'],
      ['bench', 'Not on current team'],
      ['switches', 'Switches distance'],
    ], v => {
      state.roster = v;
      applyAndRender();
    });
    rosterField.querySelector('select').id = 'tt-roster-select';
    container.appendChild(rosterField);

    const scenarioField = makeSelect('Game mode', [
      ['', 'All game modes'],
      ...scenarios.map(s => [s, s]),
    ], v => {
      state.scenario = v;
      applyAndRender();
    });
    scenarioField.querySelector('select').id = 'tt-scenario-select';
    container.appendChild(scenarioField);

    const distanceField = makeSelect('Distance', [
      ['', 'Auto (current slot, else most-raced)'],
      ...['Sprint', 'Mile', 'Medium', 'Long', 'Dirt'].map(d => [d, d]),
    ], v => {
      state.distance = v;
      applyAndRender();
    });
    container.appendChild(distanceField);

    const sortField = makeSelect('Sort by', [
      ['avg_score', 'Avg score (default)'],
      ['median', 'Median score'],
      ['consistency', 'Consistency (lowest score variance)'],
      ['top1_rate', 'Top-1 finish rate'],
      ['top3_rate', 'Top-3 finish rate'],
      ['win_rate', 'Team round win rate'],
      ['full_spurt_rate', 'Full spurt rate'],
      ['finish_order', 'Avg finish position (best first)'],
      ['races', 'Most races run'],
    ], v => {
      state.sort = v;
      applyAndRender();
    });
    container.appendChild(sortField);

    const queryLabel = document.createElement('label');
    queryLabel.className = 'filter-item';
    queryLabel.innerHTML = '<span>Uma name</span>';
    const queryInput = document.createElement('input');
    queryInput.type = 'text';
    queryInput.placeholder = 'e.g. Special Week';
    queryInput.className = 'filter-input';
    queryInput.id = 'tt-query-input';
    queryInput.addEventListener('input', () => {
      state.query = queryInput.value.trim();
      applyAndRender();
    });
    queryLabel.appendChild(queryInput);
    container.appendChild(queryLabel);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'filter-reset';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      state.query = '';
      state.sort = 'avg_score';
      state.roster = '';
      state.scenario = '';
      state.distance = '';
      distanceField.querySelector('select').value = '';
      sortField.querySelector('select').value = 'avg_score';
      rosterField.querySelector('select').value = '';
      scenarioField.querySelector('select').value = '';
      queryInput.value = '';
      applyAndRender();
    });
    container.appendChild(resetBtn);
  }

  function makeSelect(label, options, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'filter-item';
    const span = document.createElement('span');
    span.textContent = label;
    const sel = document.createElement('select');
    sel.className = 'filter-select';
    for (const [val, text] of options) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    wrap.appendChild(span);
    wrap.appendChild(sel);
    return wrap;
  }

  // ---------- list ----------

  function renderList(filtered) {
    const container = document.getElementById('team-trial-list');
    container.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'timeline-empty';
      empty.textContent = 'No umas match the current filters.';
      container.appendChild(empty);
      return;
    }

    filtered.forEach((uma, i) => container.appendChild(renderCard(uma, i)));
  }

  function renderCard(uma, rank) {
    const card = document.createElement('div');
    card.className = uma.in_current_team ? 'run-card current-team' : 'run-card';
    card.id = `tt-uma-card-${uma.trained_chara_id}`;

    const { stats: s, label: statsLabel } = effectiveStats(uma);

    const header = document.createElement('div');
    header.className = 'run-header';
    header.innerHTML = `
      <span class="badge">#${rank + 1}</span>
      <span class="run-uma">${escapeHtml(uma.uma)}</span>
      ${uma.in_current_team
        ? `<span class="badge status-badge status-keep">Current team · ${uma.current_team_distance_category ? `${uma.current_team_distance_category} (${uma.current_team_distance}m)` : `slot ${uma.current_team_round}`}</span>`
        : '<span class="badge">Not on current team</span>'}
      ${(uma.in_current_team && statsLabel === `at ${uma.current_team_distance_category}`) || (statsLabel === 'all distances' && !(uma.in_current_team && uma.current_team_distance_category)) ? '' : `<span class="badge" title="All stats below are ${escapeHtml(statsLabel)}${statsLabel === 'all distances' && uma.in_current_team && uma.current_team_distance_category ? ' - no races logged yet at her current distance (' + uma.current_team_distance_category + ')' : ''}">${escapeHtml(statsLabel.replace(/^at (.+)$/, '$1 runner'))}</span>`}
      <span class="badge">${s.races} race${s.races === 1 ? '' : 's'}</span>
      <span class="badge status-badge status-keep" title="Individual finish_order === 1 out of the 12-horse field, ${escapeHtml(statsLabel)}">${pct(s.top1_rate)} top-1</span>
      <span class="badge" title="Individual finish_order <= 3 out of the 12-horse field, ${escapeHtml(statsLabel)}">${pct(s.top3_rate)} top-3</span>
      <span class="badge" title="Team's round win/loss (win_type) - shared by every teammate who raced that round, not this uma's own placement">${pct(s.win_rate)} team win rate</span>
      ${s.full_spurt_rate != null ? `<span class="badge" title="Share of races where she held the last spurt's target speed all the way to the finish, rather than throttling back from low stamina, ${escapeHtml(statsLabel)}">${pct(s.full_spurt_rate)} full spurt</span>` : ''}
      ${uma.switches_distance ? '<span class="badge status-badge status-safe_transfer" title="This uma has raced at more than one distance category - see the per-distance breakdown below">Switches distance</span>' : ''}
      ${renderCollapseBadge(uma)}
      ${renderStartBadge(uma)}
    `;
    card.appendChild(header);

    const stats = document.createElement('div');
    stats.className = 'run-stats';
    stats.innerHTML = [
      ['AVG SCORE', formatNumber(s.avg_score)],
      ['MEDIAN', formatNumber(s.score_median)],
      ['STDEV', formatNumber(s.score_stddev)],
      ['CV', `${fmt1(s.score_cv * 100)}%`],
      ['P25–P75', `${formatNumber(s.score_p25)}–${formatNumber(s.score_p75)}`],
      ['RANGE', `${formatNumber(s.score_min)}–${formatNumber(s.score_max)}`],
      ['AVG FINISH', fmt1(s.avg_finish_order)],
      ['BEST FINISH', s.best_finish_order],
    ].map(([label, value]) => `<span><span class="stat-label">${label}</span>${value}</span>`).join('');
    card.appendChild(stats);

    const meta = document.createElement('div');
    meta.className = 'run-meta';
    const metaParts = [];
    if (uma.scenario) metaParts.push(uma.scenario);
    if (uma.train_rank != null) metaParts.push(`Training rank ${uma.train_rank}`);
    if (uma.rank_score != null) metaParts.push(`Rating ${formatNumber(uma.rank_score)}`);
    if (uma.total_stats != null) metaParts.push(`stats total ${formatNumber(uma.total_stats)}`);
    metaParts.push(`${s.wins}W / ${s.races - s.wins}L (team round)`);
    metaParts.push(`${s.top1s} top-1 / ${s.top3s} top-3 (individual)`);
    meta.textContent = metaParts.join(' · ');
    card.appendChild(meta);

    if (uma.distance_stats && Object.keys(uma.distance_stats).length) {
      card.appendChild(renderDistanceTable(uma));
    }

    if (uma.score_components && Object.keys(uma.score_components).length) {
      card.appendChild(renderScoreBreakdown(uma));
    }

    if (uma.skills && uma.skills.length) {
      card.appendChild(renderSkillChips(uma));
    }

    card.appendChild(renderMatchLog(uma));

    return card;
  }

  // Strong-start rate vs the whole roster's: flagged when it sits more than 2
  // standard errors from the baseline (one binomial proportion test).
  function renderStartBadge(uma) {
    const s = uma.start_stats;
    const base = TEAM_TRIAL_DATA.strong_start_baseline;
    if (!s || !s.races || !base || !base.races) return '';
    const p = base.bonus / base.races;
    const rate = s.bonus / s.races;
    const z = (rate - p) / Math.sqrt(p * (1 - p) / s.races);
    const statusClass = z > 2 ? 'status-keep' : z < -2 ? 'status-safe_transfer' : '';
    const title = `Strong start (start delay 0.02s or less) in ${s.bonus} of ${s.races} races; roster average ${(p * 100).toFixed(0)}%`;
    return `<span class="badge status-badge ${statusClass}" title="${escapeHtml(title)}">${(rate * 100).toFixed(0)}% strong starts</span>`;
  }

  function renderCollapseBadge(uma) {
    const n = uma.stamina_collapses;
    const statusClass = n === 0 ? 'status-keep' : 'status-safe_transfer';
    const breakdown = Object.entries(uma.defeat_breakdown || {}).map(([name, count]) => `${name}: ${count}`).join(', ');
    const title = `Defeat causes across ${uma.races} races — Stamina is an actual mid-race collapse, the rest just explain an ordinary non-winning race: ${breakdown || 'none recorded'}`;
    return `<span class="badge status-badge ${statusClass}" title="${escapeHtml(title)}">${n} stamina collapse${n === 1 ? '' : 's'}</span>`;
  }

  function renderDistanceTable(uma) {
    const wrap = document.createElement('div');
    wrap.className = 'tt-distance-table-wrap';

    const order = ['Sprint', 'Mile', 'Medium', 'Long', 'Dirt'];
    const cats = order.filter(cat => uma.distance_stats[cat]);
    const rows = cats.map(cat => {
      const d = uma.distance_stats[cat];
      const isCurrent = uma.in_current_team && cat === uma.current_team_distance_category;
      return `
        <tr class="${isCurrent ? 'tt-current-distance-row' : ''}">
          <td>${escapeHtml(cat)}${isCurrent ? ' <span class="badge status-badge status-keep">current</span>' : ''}</td>
          <td class="col-num">${d.races}</td>
          <td class="col-num">${pct(d.top1_rate)}</td>
          <td class="col-num">${pct(d.top3_rate)}</td>
          <td class="col-num">${pct(d.win_rate)}</td>
          <td class="col-num">${formatNumber(d.avg_score)}</td>
        </tr>
      `;
    }).join('');

    const table = document.createElement('table');
    table.className = 'deck-table tt-distance-table';
    table.innerHTML = `
      <thead><tr>
        <th>distance</th><th class="col-num">races</th>
        <th class="col-num">top-1</th><th class="col-num">top-3</th>
        <th class="col-num">team win</th><th class="col-num">avg score</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    `;
    wrap.appendChild(table);
    return wrap;
  }

  // ---------- score breakdown (where the points come from) ----------

  function compactPoints(v) {
    return Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(Math.round(v));
  }

  const SKILL_KIND = { white_skills: 'white', gold_skills: 'gold', unique_skills: 'unique' };

  // Total points from the three skill slices, plus her overall proc rate
  // (average share of races each carried white/gold/unique skill fires in).
  function skillSummary(uma) {
    const total = SKILL_KEYS.reduce((sum, k) => sum + (uma.score_components[k] ? uma.score_components[k].mean : 0), 0);
    const proc = uma.skill_proc && uma.skill_proc.all;
    return { total, proc };
  }

  function procText(p) {
    return p ? `${p.carried} carried, ${pct(p.rate)} proc rate` : '';
  }

  function breakdownTooltip(key, uma) {
    const c = uma.score_components[key];
    const share = Math.round(c.mean / uma.avg_score * 100);
    let html = `<strong>${escapeHtml(BREAKDOWN_LABELS[key])}</strong> · ${formatNumber(c.mean)} (${share}% of her score)`;
    const kind = SKILL_KIND[key];
    const p = kind && uma.skill_proc && uma.skill_proc[kind];
    if (p) html += `<br>${procText(p)}`;
    if (kind) {
      const s = skillSummary(uma);
      html += `<br>all skills: ${formatNumber(s.total)}${s.proc ? ` · ${procText(s.proc)}` : ''}`;
    }
    return html;
  }

  function attachTooltip(chart, tooltip, hitSelector, htmlFor) {
    chart.querySelectorAll(hitSelector).forEach(el => {
      el.addEventListener('mousemove', e => {
        const rect = chart.getBoundingClientRect();
        tooltip.innerHTML = htmlFor(el);
        tooltip.style.left = `${e.clientX - rect.left + 12}px`;
        tooltip.style.top = `${e.clientY - rect.top + 12}px`;
        tooltip.classList.add('visible');
      });
      el.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    });
  }

  // Legend items in stack order, with the three skill slices grouped under
  // one "Skills" label since they share a colour family.
  function renderBreakdownLegend() {
    const item = k => `<span class="tt-trend-legend-item"><span class="tt-trend-swatch" style="background:${SLICE_COLORS[k]}"></span>${escapeHtml(BREAKDOWN_LABELS[k])}</span>`;
    const parts = [];
    let skillsDone = false;
    for (const k of BREAKDOWN_KEYS) {
      if (SKILL_KEYS.includes(k)) {
        if (skillsDone) continue;
        skillsDone = true;
        parts.push(`<span class="tt-legend-group"><span class="tt-legend-group-label">Skills</span>${SKILL_KEYS.filter(s => BREAKDOWN_KEYS.includes(s)).map(item).join('')}</span>`);
      } else {
        parts.push(item(k));
      }
    }
    const legend = document.createElement('div');
    legend.className = 'tt-trend-legend tt-breakdown-legend';
    legend.innerHTML = parts.join('');
    return legend;
  }

  // Team chart: for each current team member, a stacked bar of her average
  // score by where the points come from, with her score spread directly
  // underneath on the same points axis: a thin line for the middle half of
  // her races (25th-75th percentile) with a short tick at the median, and a
  // dot at her worst and best race (0th / 100th percentile). Weakest average
  // first, so the remake candidates are at the top.
  function renderTeamComponents() {
    const container = document.getElementById('team-components');
    if (!container) return;
    container.innerHTML = '';
    const team = umas
      .filter(u => u.in_current_team && u.score_components)
      .map(u => ({ uma: u, s: effectiveStats(u).stats }))
      .sort((a, b) => a.s.avg_score - b.s.avg_score);
    if (!team.length) return;
    container.appendChild(renderBreakdownLegend());
    const teamAvg = team.reduce((sum, t) => sum + t.s.avg_score, 0) / team.length;

    const rowH = 44, padTop = 18, padBottom = 26, labelW = 190, rightPad = 64, width = 928, gap = 2;
    const barH = 15;
    const chartW = width - labelW - rightPad;
    const hi = Math.max(...team.map(t => t.s.score_max)) * 1.02;
    const x = v => labelW + (v / hi) * chartW;
    const ticks = niceTicks(0, hi, 6);
    const plotH = rowH * team.length;

    let svg = `<svg viewBox="0 0 ${width} ${padTop + plotH + padBottom}" class="tt-boxplot" role="img" aria-label="Average score split into finishing position, white, gold and unique skills, and style lead and other, with her score spread underneath, per current team member">`;
    ticks.forEach(t => {
      svg += `<line class="tt-boxplot-gridline" x1="${x(t).toFixed(1)}" y1="${padTop}" x2="${x(t).toFixed(1)}" y2="${padTop + plotH}" />`;
    });
    const avgX = x(teamAvg).toFixed(1);
    svg += `<line class="tt-team-avg-line" x1="${avgX}" y1="${padTop - 4}" x2="${avgX}" y2="${padTop + plotH + 2}" />`;
    svg += `<text class="tt-team-avg-label" x="${avgX}" y="${padTop - 8}" text-anchor="middle">team avg ${formatNumber(teamAvg)}</text>`;
    team.forEach((t, i) => {
      const u = t.uma, s = t.s;
      const top = padTop + rowH * i;
      const barY = top + 6;
      const lineY = barY + barH + 11;
      let cum = 0;
      let segs = '';
      BREAKDOWN_KEYS.forEach(k => {
        const c = u.score_components[k];
        if (!c || c.mean <= 0) return;
        const x0 = x(cum), x1 = x(cum + c.mean);
        segs += `<rect x="${x0.toFixed(1)}" y="${barY}" width="${Math.max(1, x1 - x0 - gap).toFixed(1)}" height="${barH}" rx="2" fill="${SLICE_COLORS[k]}" />`;
        cum += c.mean;
      });
      svg += `
        <g class="tt-boxplot-row" data-idx="${i}">
          <rect class="tt-boxplot-hit" x="0" y="${top}" width="${width}" height="${rowH}" />
          <text class="tt-boxplot-label" x="0" y="${top + 18}">${escapeHtml(u.uma)}</text>
          <text class="tt-boxplot-sublabel" x="0" y="${top + 32}">${escapeHtml(u.current_team_team || '')} · ${s.races} races</text>
          ${segs}
          <text class="tt-stack-total" x="${(x(cum) + 6).toFixed(1)}" y="${barY + 12}">${formatNumber(s.avg_score)}</text>
          <line class="tt-range-line" x1="${x(s.score_p25).toFixed(1)}" y1="${lineY}" x2="${x(s.score_p75).toFixed(1)}" y2="${lineY}" />
          <line class="tt-range-line" x1="${x(s.score_median).toFixed(1)}" y1="${lineY - 3.5}" x2="${x(s.score_median).toFixed(1)}" y2="${lineY + 3.5}" />
          <circle class="tt-extreme-dot" cx="${x(s.score_min).toFixed(1)}" cy="${lineY}" r="3" />
          <circle class="tt-extreme-dot" cx="${x(s.score_max).toFixed(1)}" cy="${lineY}" r="3" />
        </g>`;
    });
    svg += `<g class="tt-boxplot-axis">`;
    ticks.forEach(t => {
      svg += `<text x="${x(t).toFixed(1)}" y="${padTop + plotH + 16}" text-anchor="middle">${compactPoints(t)}</text>`;
    });
    svg += `</g></svg>`;

    const chart = document.createElement('div');
    chart.style.position = 'relative';
    chart.innerHTML = svg;
    container.appendChild(chart);
    const tooltip = document.createElement('div');
    tooltip.className = 'tt-overview-tooltip';
    chart.appendChild(tooltip);
    attachTooltip(chart, tooltip, '.tt-boxplot-row', row => {
      const { uma: u, s } = team[Number(row.dataset.idx)];
      const lines = BREAKDOWN_KEYS.filter(k => u.score_components[k]).map(k => {
        const c = u.score_components[k];
        const p = SKILL_KIND[k] && u.skill_proc && u.skill_proc[SKILL_KIND[k]];
        return `${escapeHtml(BREAKDOWN_LABELS[k])}: ${formatNumber(c.mean)} (${Math.round(c.mean / u.avg_score * 100)}%)${p ? ` · ${procText(p)}` : ''}`;
      }).join('<br>');
      const sk = skillSummary(u);
      return `<strong>${escapeHtml(u.uma)}</strong> · avg ${formatNumber(s.avg_score)} (${s.races} races)<br>${lines}<br><strong>All skills: ${formatNumber(sk.total)} (${Math.round(sk.total / u.avg_score * 100)}%)</strong>${sk.proc ? ` · ${procText(sk.proc)}` : ''}<br>score: median ${formatNumber(s.score_median)} · range ${formatNumber(s.score_min)}–${formatNumber(s.score_max)}`;
    });
    chart.querySelectorAll('.tt-boxplot-row').forEach(row => {
      row.addEventListener('click', () => goToUmaCard(team[Number(row.dataset.idx)].uma.trained_chara_id));
    });
  }

  // Per-uma card: a waterfall from 0 to her average score, one step per
  // slice, so each step's height is its absolute contribution. Rendered on
  // first open (115 cards).
  function renderScoreBreakdown(uma) {
    const details = document.createElement('details');
    details.className = 'tt-breakdown';
    const summary = document.createElement('summary');
    summary.textContent = 'Score breakdown (all races)';
    details.appendChild(summary);
    let drawn = false;
    details.addEventListener('toggle', () => {
      if (!details.open || drawn) return;
      drawn = true;
      const keys = BREAKDOWN_KEYS.filter(k => uma.score_components[k]);
      const total = uma.avg_score;
      const cols = keys.length + 1;
      const width = 640, padL = 44, padR = 10, padTop = 22, padBottom = 30, plotH = 170;
      const bandW = (width - padL - padR) / cols;
      const barW = Math.min(64, bandW * 0.6);
      const hi = total * 1.08;
      const y = v => padTop + plotH - (v / hi) * plotH;
      const cx = i => padL + bandW * i + bandW / 2;
      const ticks = niceTicks(0, hi, 4);
      let svg = `<svg viewBox="0 0 ${width} ${padTop + plotH + padBottom}" class="tt-boxplot" role="img" aria-label="How ${escapeHtml(uma.uma)}'s average score builds up from each slice">`;
      ticks.forEach(t => {
        svg += `<line class="tt-boxplot-gridline" x1="${padL}" y1="${y(t).toFixed(1)}" x2="${width - padR}" y2="${y(t).toFixed(1)}" />`;
      });
      svg += `<g class="tt-boxplot-axis">`;
      ticks.forEach(t => {
        svg += `<text x="${padL - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${compactPoints(t)}</text>`;
      });
      svg += `</g>`;
      let cum = 0;
      keys.forEach((k, i) => {
        const c = uma.score_components[k];
        const top = y(cum + c.mean), bottom = y(cum);
        svg += `
          <g class="tt-boxplot-row" data-key="${k}">
            <rect class="tt-boxplot-hit" x="${(cx(i) - bandW / 2).toFixed(1)}" y="${padTop}" width="${bandW.toFixed(1)}" height="${plotH + padBottom}" />
            <rect x="${(cx(i) - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, bottom - top - 2).toFixed(1)}" rx="3" fill="${SLICE_COLORS[k]}" />
            <text class="tt-stack-total" x="${cx(i).toFixed(1)}" y="${(top - 6).toFixed(1)}" text-anchor="middle">+${compactPoints(c.mean)}</text>
            <text class="tt-boxplot-sublabel" x="${cx(i).toFixed(1)}" y="${padTop + plotH + 16}" text-anchor="middle">${escapeHtml(BREAKDOWN_LABELS[k])}</text>
          </g>`;
        cum += c.mean;
        svg += `<line class="tt-range-line" x1="${(cx(i) + barW / 2).toFixed(1)}" y1="${y(cum).toFixed(1)}" x2="${(cx(i + 1) - barW / 2).toFixed(1)}" y2="${y(cum).toFixed(1)}" />`;
      });
      const i = keys.length;
      svg += `
        <g>
          <rect x="${(cx(i) - barW / 2).toFixed(1)}" y="${y(total).toFixed(1)}" width="${barW.toFixed(1)}" height="${(padTop + plotH - y(total)).toFixed(1)}" rx="3" fill="var(--text-muted)" opacity="0.55" />
          <text class="tt-stack-total" x="${cx(i).toFixed(1)}" y="${(y(total) - 6).toFixed(1)}" text-anchor="middle">${formatNumber(total)}</text>
          <text class="tt-boxplot-sublabel" x="${cx(i).toFixed(1)}" y="${padTop + plotH + 16}" text-anchor="middle">Average score</text>
        </g></svg>`;
      const chart = document.createElement('div');
      chart.style.position = 'relative';
      chart.innerHTML = svg;
      details.appendChild(chart);
      const tooltip = document.createElement('div');
      tooltip.className = 'tt-overview-tooltip';
      chart.appendChild(tooltip);
      attachTooltip(chart, tooltip, '.tt-boxplot-row', row =>
        breakdownTooltip(row.dataset.key, uma));
    });
    return details;
  }

  function renderSkillChips(uma) {
    const wrap = document.createElement('div');
    wrap.className = 'tt-skill-chips';
    wrap.innerHTML = uma.skills.map(s => `
      <span class="tt-skill-chip${s.is_green ? ' tt-skill-chip-green' : ''}" title="${escapeHtml(s.name)}: fired ${s.races_fired}/${uma.races} races">
        ${escapeHtml(s.name)} <span class="rate">${pct(s.rate)}</span>
      </span>
    `).join('');
    return wrap;
  }

  function renderSpurtBadge(m) {
    if (m.spurted == null) {
      return '<span class="badge" title="This race\'s replay data didn\'t decode">?</span>';
    }
    if (!m.spurted) {
      return '<span class="badge status-badge status-safe_transfer" title="Never entered last-spurt phase">No spurt</span>';
    }
    return m.full_spurt
      ? '<span class="badge status-badge status-keep" title="Held the last spurt\'s target speed all the way to the finish">Full spurt</span>'
      : '<span class="badge status-badge status-safe_transfer" title="Spurted, but had to throttle back from low stamina before the finish">Partial spurt</span>';
  }

  function renderMatchLog(uma) {
    const details = document.createElement('details');
    details.className = 'cull-detail';
    const summary = document.createElement('summary');
    summary.textContent = `Match history (${uma.matches.length})`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'cull-detail-body';
    details.appendChild(body);

    // Built on first open, not up front - every card's full history
    // (~10k rows across all umas) built eagerly made the page lag on load
    // and on every filter change/keystroke.
    details.addEventListener('toggle', () => {
      if (details.open && !body.hasChildNodes()) body.appendChild(renderMatchTable(uma));
    });
    return details;
  }

  function renderMatchTable(uma) {
    const table = document.createElement('table');
    table.className = 'deck-table';
    const rows = uma.matches.map(m => `
      <tr>
        <td>${escapeHtml(m.date)}</td>
        <td>${escapeHtml(m.opponent)}</td>
        <td class="col-num">${m.round}</td>
        <td class="col-num">${m.distance_category ? `${m.distance}m (${escapeHtml(m.distance_category)})` : '—'}</td>
        <td class="col-num${m.finish_order === 1 ? ' tt-top1' : m.finish_order <= 3 ? ' tt-top3' : ''}">${m.finish_order}</td>
        <td class="col-num">${formatNumber(m.score)}</td>
        <td class="col-num">${formatNumber(m.team_total_score)}</td>
        <td>${m.win ? '<span class="badge status-badge status-keep">Win</span>' : '<span class="badge status-badge status-safe_transfer">Loss</span>'}</td>
        <td>${renderSpurtBadge(m)}</td>
      </tr>
    `).join('');
    table.innerHTML = `
      <thead><tr>
        <th>date</th><th>opponent</th><th class="col-num">round</th>
        <th class="col-num">distance</th>
        <th class="col-num">finish (of 12)</th><th class="col-num">score</th>
        <th class="col-num">team total</th><th>team result</th><th>spurt</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    `;
    return table;
  }
})();
