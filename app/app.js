const STORAGE_KEY = 'leonida-trophy-guide-v1';
const HIDDEN_NAME = 'Hidden story trophy';
const HIDDEN_DESC = 'Earn this trophy to reveal its name and description.';

const state = {
  trophies: [],
  roadmap: [],
  earned: [],
  counts: {},
  spoiler: false,
  activeTab: 'checklist',
  selectedTrophyId: null,
  searchQuery: '',
  kindFilter: 'all',
  gradeFilter: 'all',
  earnedOnly: false
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.earned)) {
        state.earned = parsed.earned;
      }
      if (parsed && parsed.counts && typeof parsed.counts === 'object') {
        state.counts = parsed.counts;
      }
      if (parsed && typeof parsed.spoiler === 'boolean') {
        state.spoiler = parsed.spoiler;
      }
    }
  } catch (err) {
    console.error('Failed to load progress from localStorage', err);
  }
}

function saveProgress() {
  try {
    const payload = {
      version: 1,
      earned: state.earned,
      counts: state.counts,
      spoiler: state.spoiler
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to save progress to localStorage', err);
  }
}

async function loadData() {
  loadProgress();
  try {
    const [trophiesRes, roadmapRes] = await Promise.all([
      fetch('data/trophies.json'),
      fetch('data/roadmap.json')
    ]);
    if (!trophiesRes.ok || !roadmapRes.ok) {
      throw new Error('Failed to fetch data files');
    }
    const trophiesData = await trophiesRes.json();
    state.trophies = trophiesData.trophies;
    state.roadmap = await roadmapRes.json();
    
    // Initialize progress counters for any target-based achievements
    state.trophies.forEach(t => {
      if (t.target && t.target > 0 && state.counts[t.name] === undefined) {
        state.counts[t.name] = 0;
      }
    });

    renderAll();
    window.__shotReady = true;
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

function isHidden(t) {
  return state.spoiler && t.kind === 'story' && !state.earned.includes(t.name);
}

function displayName(t) {
  return isHidden(t) ? HIDDEN_NAME : t.name;
}

function displayDescription(t) {
  return isHidden(t) ? HIDDEN_DESC : t.description;
}

function toggleEarned(trophyName, e) {
  if (e) e.stopPropagation();
  const idx = state.earned.indexOf(trophyName);
  const trophy = state.trophies.find(t => t.name === trophyName);
  if (idx > -1) {
    state.earned.splice(idx, 1);
    if (trophy && trophy.target) {
      state.counts[trophyName] = 0;
    }
  } else {
    state.earned.push(trophyName);
    if (trophy && trophy.target) {
      state.counts[trophyName] = trophy.target;
    }
  }
  saveProgress();
  renderAll();
}

function setCount(trophyName, val) {
  const trophy = state.trophies.find(t => t.name === trophyName);
  if (!trophy || !trophy.target) return;
  const num = Math.max(0, Math.min(trophy.target, parseInt(val, 10) || 0));
  state.counts[trophyName] = num;
  if (num >= trophy.target) {
    if (!state.earned.includes(trophyName)) {
      state.earned.push(trophyName);
    }
  } else {
    const idx = state.earned.indexOf(trophyName);
    if (idx > -1) {
      state.earned.splice(idx, 1);
    }
  }
  saveProgress();
  renderAll();
}

function renderList() {
  const listEl = document.getElementById('trophy-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const q = (state.searchQuery || '').toLowerCase();

  const filtered = state.trophies.filter(t => {
    const dN = displayName(t).toLowerCase();
    const dD = displayDescription(t).toLowerCase();
    const matchSearch = !q || dN.includes(q) || dD.includes(q) || t.name.toLowerCase().includes(q);
    const matchKind = state.kindFilter === 'all' || t.kind === state.kindFilter;
    const matchGrade = state.gradeFilter === 'all' || t.grade === state.gradeFilter;
    const isEarned = state.earned.includes(t.name) || (t.target && (state.counts[t.name] || 0) >= t.target);
    const matchEarned = !state.earnedOnly || isEarned;
    return matchSearch && matchKind && matchGrade && matchEarned;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<li class="trophy-item" style="justify-content:center; color: var(--text-muted);">No trophies match the current filters.</li>';
    return;
  }

  // If selected trophy is not in filtered or none selected, select first filtered
  if (state.selectedTrophyId === null || !filtered.some(t => t.id === state.selectedTrophyId)) {
    state.selectedTrophyId = filtered[0].id;
  }

  filtered.forEach(t => {
    const isEarned = state.earned.includes(t.name) || (t.target && (state.counts[t.name] || 0) >= t.target);
    const li = document.createElement('li');
    li.className = `trophy-item ${isEarned ? 'earned' : ''} ${state.selectedTrophyId === t.id ? 'selected' : ''}`;
    li.onclick = () => {
      state.selectedTrophyId = t.id;
      renderList();
      renderDetail();
    };

    const dName = displayName(t);
    const dDesc = displayDescription(t);
    const currentCnt = t.target ? (state.counts[t.name] || 0) : 0;

    li.innerHTML = `
      <input type="checkbox" class="trophy-checkbox" ${isEarned ? 'checked' : ''}>
      <div class="medal-dot ${t.grade}"></div>
      <div class="trophy-info">
        <div class="trophy-name-row">
          <span class="trophy-title">${dName}</span>
          <span class="kind-tag">${t.kind}</span>
          ${t.missable ? '<span class="missable-badge">Missable</span>' : ''}
        </div>
        <div class="trophy-desc-preview">${dDesc}</div>
        ${t.target ? `<div class="target-badge">${t.target_label || 'Progress'}: ${currentCnt} / ${t.target}</div>` : ''}
      </div>
    `;

    const cb = li.querySelector('.trophy-checkbox');
    cb.onclick = (e) => {
      toggleEarned(t.name, e);
    };

    listEl.appendChild(li);
  });
}

function renderDetail() {
  const pane = document.getElementById('detail-pane');
  if (!pane) return;

  const trophy = state.trophies.find(t => t.id === state.selectedTrophyId);
  if (!trophy) {
    pane.innerHTML = '<div class="detail-placeholder">Select a trophy from the list to view its guide and details.</div>';
    return;
  }

  const dName = displayName(trophy);
  const dDesc = displayDescription(trophy);
  const currentCnt = trophy.target ? (state.counts[trophy.name] || 0) : 0;
  const gradeCap = trophy.grade.charAt(0).toUpperCase() + trophy.grade.slice(1);

  let stepperHtml = '';
  if (trophy.target) {
    stepperHtml = `
      <div class="target-stepper-box">
        <div class="stepper-label">${trophy.target_label || 'Progress'}</div>
        <div class="stepper-controls">
          <button class="stepper-btn" id="step-minus">-</button>
          <input type="number" class="stepper-input" id="step-input" value="${currentCnt}" min="0" max="${trophy.target}">
          <button class="stepper-btn" id="step-plus">+</button>
          <span class="stepper-target-text">${currentCnt} / ${trophy.target}</span>
        </div>
      </div>
    `;
  }

  let missableBoxHtml = '';
  if (trophy.missable) {
    missableBoxHtml = `
      <div class="missable-box">
        <strong>Missable Notice:</strong> ${trophy.missable_reason}
      </div>
    `;
  }

  const sourcesHtml = (trophy.sources || []).map(s => `
    <li><a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>: ${s.covers}</li>
  `).join('');

  pane.innerHTML = `
    <div class="detail-header">
      <div class="detail-grade-row ${trophy.grade}">
        <div class="medal-dot ${trophy.grade}" style="width: 14px; height: 14px; display: inline-block; margin-right: 8px;"></div>
        <span>${gradeCap} Trophy</span>
      </div>
      <h2 class="detail-title">${dName}</h2>
      <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
        <span class="kind-tag">${trophy.kind}</span>
        ${trophy.missable ? '<span class="missable-badge">Missable</span>' : ''}
      </div>
    </div>
    <p class="detail-desc">${dDesc}</p>
    ${missableBoxHtml}
    ${stepperHtml}
    <div class="guide-section">
      <h4 class="section-heading">Strategy & Guide</h4>
      <p class="guide-text">${trophy.guide}</p>
    </div>
    <div class="guide-section">
      <h4 class="section-heading">Sources</h4>
      <ul class="sources-list-detail">
        ${sourcesHtml}
      </ul>
    </div>
  `;

  if (trophy.target) {
    const minusBtn = pane.querySelector('#step-minus');
    const plusBtn = pane.querySelector('#step-plus');
    const inputEl = pane.querySelector('#step-input');

    if (minusBtn) {
      minusBtn.onclick = () => setCount(trophy.name, currentCnt - 1);
    }
    if (plusBtn) {
      plusBtn.onclick = () => setCount(trophy.name, currentCnt + 1);
    }
    if (inputEl) {
      inputEl.onchange = (e) => setCount(trophy.name, e.target.value);
    }
  }
}

function renderHeader() {
  const total = state.trophies.length || 55;
  const earnedCount = state.earned.length;
  const pct = Math.round((earnedCount / total) * 100);

  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = pct + '%';

  const text = document.getElementById('progress-text');
  if (text) text.textContent = `${earnedCount} of ${total} earned (${pct}%)`;

  // Mini counts by kind
  const kindsEarned = { story: 0, missable: 0, collectible: 0, activity: 0 };
  const kindsTotal = { story: 0, missable: 0, collectible: 0, activity: 0 };

  state.trophies.forEach(t => {
    if (kindsTotal[t.kind] !== undefined) {
      kindsTotal[t.kind]++;
    }
    if (state.earned.includes(t.name)) {
      if (kindsEarned[t.kind] !== undefined) {
        kindsEarned[t.kind]++;
      }
    }
  });

  const cs = document.getElementById('count-story');
  const cm = document.getElementById('count-missable');
  const ccol = document.getElementById('count-collectibles');
  const cact = document.getElementById('count-activities');

  if (cs) cs.textContent = kindsEarned.story;
  if (cm) cm.textContent = kindsEarned.missable;
  if (ccol) ccol.textContent = kindsEarned.collectible;
  if (cact) cact.textContent = kindsEarned.activity;

  const ts = document.getElementById('total-story');
  const tm = document.getElementById('total-missable');
  const tcol = document.getElementById('total-collectibles');
  const tact = document.getElementById('total-activities');

  if (ts) ts.textContent = kindsTotal.story;
  if (tm) tm.textContent = kindsTotal.missable;
  if (tcol) tcol.textContent = kindsTotal.collectibles;
  if (tact) tact.textContent = kindsTotal.activity;
}

function switchTab(tabName) {
  state.activeTab = tabName;
  ['checklist', 'roadmap', 'missables', 'sources'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const sec = document.getElementById(`section-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (sec) sec.style.display = (t === tabName) ? 'block' : 'none';
  });
  renderAll();
}

function setupToolbar() {
  const searchInput = document.getElementById('search');
  if (searchInput) {
    searchInput.value = state.searchQuery;
    searchInput.oninput = (e) => {
      state.searchQuery = e.target.value;
      renderList();
    };
  }

  const kindSelect = document.getElementById('kind-filter');
  if (kindSelect) {
    kindSelect.value = state.kindFilter;
    kindSelect.onchange = (e) => {
      state.kindFilter = e.target.value;
      renderList();
    };
  }

  const gradeSelect = document.getElementById('grade-filter');
  if (gradeSelect) {
    gradeSelect.value = state.gradeFilter;
    gradeSelect.onchange = (e) => {
      state.gradeFilter = e.target.value;
      renderList();
    };
  }

  const earnedOnlyCb = document.getElementById('earned-only');
  if (earnedOnlyCb) {
    earnedOnlyCb.checked = state.earnedOnly;
    earnedOnlyCb.onchange = (e) => {
      state.earnedOnly = e.target.checked;
      renderList();
    };
  }

  const spoilerBtn = document.getElementById('spoiler-toggle');
  if (spoilerBtn) {
    spoilerBtn.textContent = `Spoiler shield: ${state.spoiler ? 'on' : 'off'}`;
    spoilerBtn.onclick = () => {
      state.spoiler = !state.spoiler;
      spoilerBtn.textContent = `Spoiler shield: ${state.spoiler ? 'on' : 'off'}`;
      saveProgress();
      renderAll();
    };
  }

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.onclick = exportProgress;
  }

  const importInput = document.getElementById('import-input');
  if (importInput) {
    importInput.onchange = importProgress;
  }

  // Tab buttons
  ['checklist', 'roadmap', 'missables', 'sources'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) {
      btn.onclick = () => switchTab(t);
    }
  });
}

function exportProgress() {
  try {
    const payload = {
      version: 1,
      earned: state.earned,
      counts: state.counts,
      spoiler: state.spoiler
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", "leonida-trophy-progress.json");
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  } catch (err) {
    console.error('Export failed', err);
  }
}

function importProgress(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (parsed && Array.isArray(parsed.earned)) {
        state.earned = parsed.earned;
        if (parsed.counts && typeof parsed.counts === 'object') {
          state.counts = parsed.counts;
        }
        if (typeof parsed.spoiler === 'boolean') {
          state.spoiler = parsed.spoiler;
        }
        saveProgress();
        renderAll();
        alert('Progress imported successfully!');
      } else {
        alert('Invalid progress file format: missing earned array.');
      }
    } catch (err) {
      alert('Failed to parse JSON progress file.');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

function renderRoadmap() {
  const container = document.getElementById('roadmap-container');
  if (!container) return;

  const rm = state.roadmap;
  if (!rm || !rm.stages) {
    container.innerHTML = '<div class="detail-placeholder">Roadmap data unavailable.</div>';
    return;
  }

  let html = `
    <div class="roadmap-overview-card">
      <h2>${rm.title || 'Road to the Platinum'}</h2>
      <div class="overview-meta">
        <span>Difficulty: <strong>${rm.difficulty || '4/10'}</strong></span>
        <span>Estimated Time: <strong>${rm.hours || 'about 200 hours'}</strong></span>
        <span>Playthroughs: <strong>${rm.playthroughs || '1 playthrough'}</strong></span>
      </div>
      <p style="margin-top: 12px; color: var(--text-muted);">${rm.playthroughs || ''}</p>
    </div>
  `;

  rm.stages.forEach(stage => {
    let earnedInStage = 0;
    const totalInStage = (stage.trophy_names || []).length;

    const chipsHtml = (stage.trophy_names || []).map(tName => {
      const trophyObj = state.trophies.find(t => t.name === tName);
      const grade = trophyObj ? trophyObj.grade : 'bronze';
      const isEarned = state.earned.includes(tName) || (trophyObj && trophyObj.target && (state.counts[tName] || 0) >= trophyObj.target);
      if (isEarned) earnedInStage++;
      return `<div class="trophy-chip ${isEarned ? 'earned' : ''}"><span>${tName}</span><span class="medal-dot ${grade}" style="width: 8px; height: 8px; display: inline-block; margin-left: 6px;"></span></div>`;
    }).join('');

    html += `
      <div class="roadmap-stage-card">
        <div class="stage-header-row">
          <div class="stage-title-wrap">
            <span style="font-size: 0.85rem; color: var(--accent); font-weight: 700; text-transform: uppercase;">Stage ${stage.number}</span>
            <h3>${stage.title}</h3>
          </div>
          <div class="stage-hours">${stage.hours}</div>
        </div>
        <p class="stage-summary">${stage.summary}</p>
        <div class="stage-trophies-wrap">
          <span style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; display: block;">Trophies in this stage:</span>
          <div class="stage-trophies-chips">${chipsHtml}</div>
        </div>
        <div class="stage-progress-line">${earnedInStage} of ${totalInStage} earned in this stage</div>
        ${stage.tip ? `<div class="stage-tip"><strong>Tip:</strong> ${stage.tip}</div>` : ''}
      </div>
    `;
  });

  const platTrophy = state.trophies.find(t => t.kind === 'platinum');
  const platName = platTrophy ? platTrophy.name : 'Vice Got a Price!';
  const platEarned = state.earned.includes(platName);

  html += `
    <div class="platinum-card" style="background: var(--bg-surface); border: 1px solid var(--border-color); padding: 24px; border-radius: var(--radius); display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="medal-dot platinum" style="width: 20px; height: 20px;"></div>
        <h3 style="font-family: Georgia, serif; font-size: 1.4rem; color: var(--text-main);">${platName}</h3>
      </div>
      <p style="color: var(--text-muted);">Earn the other 54 trophies to unlock the platinum trophy. Total estimate ~200 hours, difficulty 4/10, one playthrough.</p>
      <div style="font-size: 0.9rem; color: var(--accent);">Status: ${platEarned ? 'Earned' : 'Locked'}</div>
    </div>
  `;

  container.innerHTML = html;
}

function renderMissables() {
  const container = document.getElementById('missables-container');
  if (!container) return;

  const missableTrophies = state.trophies.filter(t => t.missable);
  const pma = missableTrophies.find(t => t.name === 'Positive Mental Attitude') || missableTrophies[0];

  let pmaHtml = '';
  if (pma) {
    pmaHtml = `
      <div class="missable-hero-card" style="background: var(--bg-surface); border: 1px solid var(--accent); padding: 24px; border-radius: var(--radius); display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="missable-badge">Missable</span>
          <h2 style="font-size: 1.3rem; color: var(--text-main);">${pma.name}</h2>
        </div>
        <p style="color: var(--text-muted);"><strong>Reason:</strong> ${pma.missable_reason}</p>
        <p style="color: var(--text-main); line-height: 1.6;">${pma.guide}</p>
      </div>
    `;
  }

  const otherMissables = state.trophies.filter(t => t.missable && (!pma || t.name !== pma.name));

  let othersHtml = otherMissables.map(t => `
    <div style="background: var(--bg-surface); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius); display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="missable-badge">Missable</span>
        <h3 style="font-size: 1.1rem;">${t.name}</h3>
      </div>
      <p style="color: var(--text-muted);">${t.missable_reason}</p>
      <p style="font-size: 0.9rem;">${t.guide}</p>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      ${pmaHtml}
      <div class="advice-card" style="background: var(--bg-surface); border: 1px solid var(--border-color); padding: 24px; border-radius: var(--radius); display: flex; flex-direction: column; gap: 12px;">
        <h3 style="font-size: 1.2rem; color: var(--amber);">Save Advice & Mission Replay</h3>
        <p style="color: var(--text-muted);">The game has no mission replay feature and supports manual saves in 15 slots plus 1 autosave slot. To be fully safe against missable or story-locked objectives, keep a manual save at the start and end of each chapter.</p>
      </div>
      ${othersHtml}
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); padding: 20px; border-radius: var(--radius);">
        <h3 style="font-size: 1.1rem; margin-bottom: 8px; color: var(--text-main);">Free-Roam Availability Reassurance</h3>
        <p style="color: var(--text-muted);">Every other trophy in Leonida stays available in free-roam after completing the story. You can freely clean up collectibles, stranger quests, and open-world activities anytime.</p>
      </div>
    </div>
  `;
}

function renderSources() {
  const container = document.getElementById('sources-container');
  if (!container) return;

  container.innerHTML = `
    <div style="background: var(--bg-surface); border: 1px solid var(--border-color); padding: 24px; border-radius: var(--radius); display: flex; flex-direction: column; gap: 20px;">
      <h2 style="font-family: Georgia, serif; font-size: 1.6rem; color: var(--text-main);">Sources & Methodology</h2>
      <p style="color: var(--text-muted);">This guide aggregates official Leonida trophy data and community completion strategies from the following primary sources:</p>
      <ul style="list-style-type: disc; padding-left: 20px; display: flex; flex-direction: column; gap: 12px; color: var(--text-main);">
        <li><a href="https://www.exophase.com/game/grand-theft-auto-vi-psn/trophies/" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">Exophase</a> — Official trophy list provider covering names, descriptions, and grades.</li>
        <li><a href="https://psnprofiles.com/trophies/43531-grand-theft-auto-vi" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">PSNProfiles</a> — Official PlayStation Network tracked list, Rarity percentages, and completion tracking.</li>
        <li><a href="https://www.powerpyx.com/gta-6-grand-theft-auto-vi-trophy-guide-roadmap/" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">PowerPyx</a> — Comprehensive written trophy guide, walkthrough roadmap, missable warnings, and collectible locations.</li>
      </ul>
      <div style="background: var(--bg-core); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-sm); margin-top: 12px;">
        <h3 style="font-size: 1.05rem; color: var(--amber); margin-bottom: 6px;">Editorial Honesty Note</h3>
        <p style="color: var(--text-muted); font-size: 0.95rem;">Three trophies (<strong style="color: var(--text-main);">In The Beginning…</strong>, <strong style="color: var(--text-main);">Bad Luck, I Guess</strong>, and <strong style="color: var(--text-main);">Ten Pin</strong>) have no published method or verified unlock strategy yet. This guide explicitly states that fact in their descriptions rather than inventing unverified placeholder methods.</p>
      </div>
    </div>
  `;
}

function renderAll() {
  renderHeader();
  setupToolbar();
  if (state.activeTab === 'checklist') {
    renderList();
    renderDetail();
  } else if (state.activeTab === 'roadmap') {
    renderRoadmap();
  } else if (state.activeTab === 'missables') {
    renderMissables();
  } else if (state.activeTab === 'sources') {
    renderSources();
  }
}

// Provide public API bridge for automated screenshot capture tools
window.__trophyGuide = {
  state,
  renderAll,
  loadData,
  saveProgress,
  switchTab,
  renderRoadmap,
  renderMissables,
  renderSources
};

loadData();

