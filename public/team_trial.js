(function () {
  const umas = TEAM_TRIAL_DATA.umas;

  const state = {
    query: '',
    sort: 'avg_score',
    roster: '',
    scenario: '',
  };

  const scenarios = Array.from(new Set(umas.map(u => u.scenario).filter(Boolean))).sort();

  renderSummary();
  renderTeamOverview();
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
    if (uma.in_current_team && uma.current_team_distance_category) {
      const ds = uma.distance_stats[uma.current_team_distance_category];
      if (ds) return { stats: ds, label: `at ${uma.current_team_distance_category}` };
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

  function renderTeamOverview() {
    const container = document.getElementById('team-overview');
    container.innerHTML = '';

    // Each row uses the same current-distance-scoped stats as the card
    // headline (effectiveStats), so the chart matches what the cards show.
    const team = umas
      .filter(u => u.in_current_team)
      .map(u => ({ uma: u, ...effectiveStats(u) }));

    if (!team.length) {
      const empty = document.createElement('p');
      empty.className = 'tt-overview-empty';
      empty.textContent = 'No current team detected yet.';
      container.appendChild(empty);
      return;
    }

    // Weakest average score first - the remake candidates are what you
    // want to see immediately at the top of the chart.
    team.sort((a, b) => a.stats.avg_score - b.stats.avg_score);
    const teamAvg = team.reduce((sum, t) => sum + t.stats.avg_score, 0) / team.length;

    const rowH = 30;
    const padTop = 10;
    const padBottom = 26;
    const labelW = 210;
    const rightPad = 12;
    const width = 928;
    const chartW = width - labelW - rightPad;
    const plotH = rowH * team.length;
    const height = padTop + plotH + padBottom;

    const domainMin = Math.min(...team.map(t => t.stats.score_min));
    const domainMax = Math.max(...team.map(t => t.stats.score_max));
    const pad = (domainMax - domainMin) * 0.06 || domainMax * 0.05 || 1;
    const lo = Math.max(0, domainMin - pad);
    const hi = domainMax + pad;
    const x = v => (labelW + ((v - lo) / (hi - lo)) * chartW).toFixed(1);
    const ticks = niceTicks(lo, hi, 5);

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="tt-boxplot" role="img" aria-label="Score distribution per current team member, weakest average first">`;

    ticks.forEach(t => {
      svg += `<line class="tt-boxplot-gridline" x1="${x(t)}" y1="${padTop}" x2="${x(t)}" y2="${padTop + plotH}" />`;
    });

    const avgX = x(teamAvg);
    svg += `<line class="tt-team-avg-line" x1="${avgX}" y1="${padTop - 4}" x2="${avgX}" y2="${padTop + plotH + 4}" />`;
    svg += `<text class="tt-team-avg-label" x="${avgX}" y="${padTop - 6}" text-anchor="middle">team avg</text>`;

    team.forEach((t, i) => {
      const s = t.stats;
      const cy = padTop + rowH * i + rowH / 2;
      const boxH = 13;
      const capH = 8;
      // Distance category is a stable property of the uma (her build/
      // aptitude); the round number isn't - every uma here has raced in
      // all 5 rounds historically, so it's just whichever slot she
      // happened to be in on the last captured replay. Show distance, not
      // round.
      const sub = t.uma.current_team_distance_category
        ? `${t.uma.current_team_distance_category} (${t.uma.current_team_distance}m)`
        : `slot ${t.uma.current_team_round}`;
      svg += `
        <g class="tt-boxplot-row" data-idx="${i}">
          <rect class="tt-boxplot-hit" x="0" y="${padTop + rowH * i}" width="${width}" height="${rowH}" />
          <text class="tt-boxplot-label" x="0" y="${cy - 3}">${escapeHtml(t.uma.uma)}</text>
          <text class="tt-boxplot-sublabel" x="0" y="${cy + 9}">${escapeHtml(sub)}</text>
          <line class="tt-whisker" x1="${x(s.score_min)}" y1="${cy}" x2="${x(s.score_p25)}" y2="${cy}" />
          <line class="tt-whisker" x1="${x(s.score_p75)}" y1="${cy}" x2="${x(s.score_max)}" y2="${cy}" />
          <line class="tt-whisker" x1="${x(s.score_min)}" y1="${cy - capH / 2}" x2="${x(s.score_min)}" y2="${cy + capH / 2}" />
          <line class="tt-whisker" x1="${x(s.score_max)}" y1="${cy - capH / 2}" x2="${x(s.score_max)}" y2="${cy + capH / 2}" />
          <rect class="tt-box" x="${x(s.score_p25)}" y="${(cy - boxH / 2).toFixed(1)}" width="${Math.max(1, x(s.score_p75) - x(s.score_p25)).toFixed(1)}" height="${boxH}" rx="3" />
          <line class="tt-median" x1="${x(s.score_median)}" y1="${(cy - boxH / 2).toFixed(1)}" x2="${x(s.score_median)}" y2="${(cy + boxH / 2).toFixed(1)}" />
          <circle class="tt-mean" cx="${x(s.avg_score)}" cy="${cy}" r="3.5" />
        </g>
      `;
    });

    const axisY = padTop + plotH + 4;
    svg += `<g class="tt-boxplot-axis"><line x1="${labelW}" y1="${axisY}" x2="${labelW + chartW}" y2="${axisY}" />`;
    ticks.forEach(t => {
      svg += `<text x="${x(t)}" y="${axisY + 14}" text-anchor="middle">${formatNumber(t)}</text>`;
    });
    svg += `</g></svg>`;

    const key = document.createElement('p');
    key.className = 'tt-overview-key';
    key.innerHTML = '<span class="tt-key-swatch"></span>box = 25th–75th percentile · line = min–max · tick = median · dot = average score · dashed = team average';
    container.appendChild(key);

    const chart = document.createElement('div');
    chart.style.position = 'relative';
    chart.innerHTML = svg;
    container.appendChild(chart);

    const tooltip = document.createElement('div');
    tooltip.className = 'tt-overview-tooltip';
    chart.appendChild(tooltip);

    chart.querySelectorAll('.tt-boxplot-row').forEach(row => {
      const t = team[Number(row.dataset.idx)];
      const s = t.stats;
      row.addEventListener('mousemove', e => {
        const rect = chart.getBoundingClientRect();
        tooltip.innerHTML = `
          <strong>${escapeHtml(t.uma.uma)}</strong> (${s.races} races, ${escapeHtml(t.label)})<br>
          min ${formatNumber(s.score_min)} · p25 ${formatNumber(s.score_p25)}<br>
          median ${formatNumber(s.score_median)} · mean ${formatNumber(s.avg_score)}<br>
          p75 ${formatNumber(s.score_p75)} · max ${formatNumber(s.score_max)}
        `;
        tooltip.style.left = `${e.clientX - rect.left + 12}px`;
        tooltip.style.top = `${e.clientY - rect.top + 12}px`;
        tooltip.classList.add('visible');
      });
      row.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
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
    container.appendChild(rosterField);

    const scenarioField = makeSelect('Game mode', [
      ['', 'All game modes'],
      ...scenarios.map(s => [s, s]),
    ], v => {
      state.scenario = v;
      applyAndRender();
    });
    container.appendChild(scenarioField);

    const sortField = makeSelect('Sort by', [
      ['avg_score', 'Avg score (default)'],
      ['median', 'Median score'],
      ['consistency', 'Consistency (lowest score variance)'],
      ['top1_rate', 'Top-1 finish rate'],
      ['top3_rate', 'Top-3 finish rate'],
      ['win_rate', 'Team round win rate'],
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

    const { stats: s, label: statsLabel } = effectiveStats(uma);

    const header = document.createElement('div');
    header.className = 'run-header';
    header.innerHTML = `
      <span class="badge">#${rank + 1}</span>
      <span class="run-uma">${escapeHtml(uma.uma)}</span>
      ${uma.in_current_team
        ? `<span class="badge status-badge status-keep">Current team · ${uma.current_team_distance_category ? `${uma.current_team_distance_category} (${uma.current_team_distance}m)` : `slot ${uma.current_team_round}`}</span>`
        : '<span class="badge">Not on current team</span>'}
      <span class="badge" title="All stats below are ${escapeHtml(statsLabel)}${statsLabel === 'all distances' && uma.in_current_team && uma.current_team_distance_category ? ' - no races logged yet at her current distance (' + uma.current_team_distance_category + ')' : ''}">${escapeHtml(statsLabel)}</span>
      <span class="badge">${s.races} race${s.races === 1 ? '' : 's'}</span>
      <span class="badge status-badge status-keep" title="Individual finish_order === 1 out of the 12-horse field, ${escapeHtml(statsLabel)}">${pct(s.top1_rate)} top-1</span>
      <span class="badge" title="Individual finish_order <= 3 out of the 12-horse field, ${escapeHtml(statsLabel)}">${pct(s.top3_rate)} top-3</span>
      <span class="badge" title="Team's round win/loss (win_type) - shared by every teammate who raced that round, not this uma's own placement">${pct(s.win_rate)} team win rate</span>
      ${uma.switches_distance ? '<span class="badge status-badge status-safe_transfer" title="This uma has raced at more than one distance category - see the per-distance breakdown below">Switches distance</span>' : ''}
      ${renderCollapseBadge(uma)}
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

    if (uma.skills && uma.skills.length) {
      card.appendChild(renderSkillChips(uma));
    }

    card.appendChild(renderMatchLog(uma));

    return card;
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

    const order = ['Sprint', 'Mile', 'Medium', 'Long'];
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

  function renderMatchLog(uma) {
    const details = document.createElement('details');
    details.className = 'cull-detail';
    const summary = document.createElement('summary');
    summary.textContent = `Match history (${uma.matches.length})`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'cull-detail-body';

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
      </tr>
    `).join('');
    table.innerHTML = `
      <thead><tr>
        <th>date</th><th>opponent</th><th class="col-num">round</th>
        <th class="col-num">distance</th>
        <th class="col-num">finish (of 12)</th><th class="col-num">score</th>
        <th class="col-num">team total</th><th>team result</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    `;
    body.appendChild(table);

    details.appendChild(body);
    return details;
  }
})();
