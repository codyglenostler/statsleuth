// ============================================================
// STATMASK — GAME ENGINE
// ============================================================

function initGame(sport, config) {
  const MAX_GUESSES = 5;
  const STORAGE_KEY = `statsleuth_v2_${sport}_${getTodayKey()}`;
  const HISTORY_KEY = `statmask_history_${sport}`;

  // ── Load saved state ──
  let state = loadState();

  // ── DOM refs ──
  const card        = document.getElementById('sports-card');
  const cardHeader  = document.getElementById('card-header');
  const playerReveal= document.getElementById('player-name-reveal');
  const clueRows    = document.querySelectorAll('.clue-row');
  const searchInput = document.getElementById('search-input');
  const dropdown    = document.getElementById('autocomplete-dropdown');
  const guessBtn    = document.getElementById('guess-btn');
  const pips        = document.querySelectorAll('.guess-pip');
  const wrongList   = document.getElementById('wrong-guesses-list');
  const wrongSection= document.getElementById('wrong-guesses');
  const endState    = document.getElementById('end-state');
  const endScore    = document.getElementById('end-score');
  const endSub      = document.getElementById('end-sub');
  const emojiGrid   = document.getElementById('emoji-grid');
  const shareBtn    = document.getElementById('share-btn');
  const lockedBanner= document.getElementById('locked-banner');
  const mysteryName = document.getElementById('mystery-name');

  // ── Set blurred mystery name ──
  if (mysteryName) mysteryName.textContent = config.answer;

  // ── Set revealed name + accolades ──
  if (playerReveal) playerReveal.textContent = config.answer;
  const accoladesEl = document.getElementById('player-accolades-reveal');
  if (accoladesEl && config.accolades) {
    accoladesEl.innerHTML = config.accolades
      .map(a => `<span class="accolade-badge">${a}</span>`)
      .join('');
  }

  // ── Restore state on load ──
  restoreUI();
  updateAvgDisplay(loadHistory());

  // ── Search / autocomplete ──
  searchInput.addEventListener('focus', () => {
    setTimeout(() => {
      const rect = searchInput.getBoundingClientRect();
      const scrollTop = window.pageYOffset + rect.top - 68; // 56px nav + 12px breathing room
      window.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }, 150);
  });
  searchInput.addEventListener('input', onSearchInput);
  searchInput.addEventListener('keydown', onSearchKeydown);
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== searchInput) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 300);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) closeDropdown();
  });

  guessBtn.addEventListener('click', submitGuess);
  shareBtn.addEventListener('click', shareResult);

  // ────────────────────────────────────────────
  function onSearchInput() {
    const q = searchInput.value.trim();
    if (q.length < 3) { closeDropdown(); return; }
    const matches = config.players.filter(p =>
      p.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8);
    renderDropdown(matches, q);
  }

  function renderDropdown(matches, q) {
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = '';
    matches.forEach((name, i) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.dataset.index = i;
      item.innerHTML = highlight(name, q);
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectPlayer(name);
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.add('open');
    dropdown._matches = matches;
    dropdown._activeIndex = -1;
  }

  function highlight(name, q) {
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return name;
    return name.slice(0, idx) +
      `<mark>${name.slice(idx, idx + q.length)}</mark>` +
      name.slice(idx + q.length);
  }

  function onSearchKeydown(e) {
    if (!dropdown.classList.contains('open')) {
      if (e.key === 'Enter') submitGuess();
      return;
    }
    const items = dropdown.querySelectorAll('.autocomplete-item');
    let idx = dropdown._activeIndex ?? -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= 0 && dropdown._matches[idx]) {
        selectPlayer(dropdown._matches[idx]);
      } else {
        submitGuess();
      }
      return;
    } else if (e.key === 'Escape') {
      closeDropdown(); return;
    }
    items.forEach((el, i) => el.classList.toggle('active', i === idx));
    dropdown._activeIndex = idx;
  }

  function selectPlayer(name) {
    searchInput.value = name;
    closeDropdown();
    searchInput.blur();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
  }

  // ────────────────────────────────────────────
  function submitGuess() {
    if (state.locked) return;
    const guess = searchInput.value.trim();
    if (!guess) return;

    // Check if in player list (case-insensitive)
    const matched = config.players.find(p => p.toLowerCase() === guess.toLowerCase());
    if (!matched) {
      shake(searchInput);
      searchInput.placeholder = 'Player not found — check spelling';
      setTimeout(() => searchInput.placeholder = 'Search for a player...', 2000);
      return;
    }

    const matchedName = matched.replace(/\s*\(\d{4}-[\w]+\)$/, '').trim();

    // Already guessed?
    if (state.wrongGuesses.includes(matchedName)) {
      shake(searchInput);
      return;
    }

    searchInput.value = '';
    closeDropdown();

    const correct = matchedName.toLowerCase() === config.answer.toLowerCase();

    if (correct) {
      state.result = 'win';
      state.guessesUsed = state.wrongGuesses.length + 1;
      state.locked = true;
      card.classList.add('win');
      triggerWinSweep();
      recordGuesses(state.guessesUsed);
      setTimeout(() => showEndState('win'), 950);
    } else {
      state.wrongGuesses.push(matchedName);
      updatePips();
      addWrongGuessTag(matchedName);
      revealNextClue();
      card.classList.remove('wrong-flash');
      card.offsetHeight; // force reflow
      card.classList.add('wrong-flash');
      card.addEventListener('animationend', () => card.classList.remove('wrong-flash'), { once: true });

      if (state.wrongGuesses.length >= MAX_GUESSES) {
        state.result = 'lose';
        state.guessesUsed = MAX_GUESSES;
        state.locked = true;
        revealAllClues();
        revealCardHeader(false);
        card.classList.add('lose');
        recordGuesses(state.guessesUsed);
        setTimeout(() => showEndState('lose'), 700);
      }
    }

    saveState();

    if (state.locked) {
      searchInput.disabled = true;
      guessBtn.disabled = true;
      lockedBanner.classList.add('show');
    }
  }

  // ────────────────────────────────────────────
  function revealNextClue() {
    const idx = state.wrongGuesses.length; // offset by 1 since clue 0 is pre-shown
    if (idx < clueRows.length) {
      setTimeout(() => {
        clueRows[idx].classList.add('revealed');
      }, 200);
    }
  }

  function revealAllClues() {
    clueRows.forEach((row, i) => {
      setTimeout(() => row.classList.add('revealed'), i * 80);
    });
  }

  function triggerWinSweep() {
    card.classList.add('win-sweep');
    // Header is at the top — unmask as sweep first hits (~80ms)
    setTimeout(() => {
      cardHeader.classList.add('revealed');
    }, 80);
    // Stagger each clue row to match the sweep traveling down the card
    [230, 360, 480, 600, 720].forEach((delay, i) => {
      setTimeout(() => { if (clueRows[i]) clueRows[i].classList.add('revealed'); }, delay);
    });
  }

  function revealCardHeader(win) {
    setTimeout(() => {
      cardHeader.classList.add('revealed');
    }, win ? 300 : 500);
  }

  function updatePips() {
    state.wrongGuesses.forEach((_, i) => {
      if (pips[i]) pips[i].classList.add('wrong');
    });
  }

  function addWrongGuessTag(name) {
    wrongSection.style.display = 'block';
    const tag = document.createElement('span');
    tag.className = 'wrong-guess-tag';
    tag.textContent = name;
    wrongList.appendChild(tag);
  }

  function showEndState(result) {
    endState.classList.add('show');
    if (result === 'win') {
      endScore.textContent = `Got it in ${state.guessesUsed}/5!`;
      endScore.className = 'end-state-score win-text';
      endSub.textContent = 'Nice work, sleuth. Come back tomorrow.';
    } else {
      endScore.textContent = 'Better luck tomorrow!';
      endScore.className = 'end-state-score lose-text';
      endSub.textContent = `The answer was ${config.answer}.`;
    }
    emojiGrid.textContent = buildEmojiGrid(result);
  }

  function buildEmojiGrid(result) {
    const wrong = state.wrongGuesses.map(() => '🟥');
    if (result === 'win') wrong.push('🟩');
    while (wrong.length < MAX_GUESSES && result === 'lose') wrong.push('🟥');
    return wrong.join('');
  }

  function shareResult() {
    const sportEmoji = { mlb: '⚾', nba: '🏀', nfl: '🏈' }[sport];
    const sportName = sport.toUpperCase();
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const emoji = buildEmojiGrid(state.result);
    const scoreText = state.result === 'win'
      ? `Got it in ${state.guessesUsed}/5!`
      : 'Couldn\'t crack it!';

    const text = [
      `StatMask ${sportEmoji} ${sportName} — ${date}`,
      emoji,
      scoreText,
      `Play: statmask.com/${sport}`
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      shareBtn.textContent = '✓ Copied!';
      shareBtn.classList.add('copied');
      setTimeout(() => {
        shareBtn.textContent = '🔗 Share Result';
        shareBtn.classList.remove('copied');
      }, 2000);
    });
  }

  // ────────────────────────────────────────────
  function restoreUI() {
    if (!state) {
      state = { wrongGuesses: [], result: null, guessesUsed: 0, locked: false };
      saveState();
      clueRows[0].classList.add('revealed');
      return;
    }

    // Always show first clue
    clueRows[0].classList.add('revealed');

    // Restore wrong guesses
    state.wrongGuesses.forEach((name, i) => {
      if (pips[i]) pips[i].classList.add('wrong');
      addWrongGuessTag(name);
      if (i < clueRows.length) clueRows[i].classList.add('revealed');
    });

    if (state.locked) {
      searchInput.disabled = true;
      guessBtn.disabled = true;
      lockedBanner.classList.add('show');
      recordGuesses(state.guessesUsed);

      if (state.result === 'win') {
        revealAllClues();
        revealCardHeader(true);
        card.classList.add('win');
        showEndState('win');
      } else if (state.result === 'lose') {
        revealAllClues();
        revealCardHeader(false);
        card.classList.add('lose');
        showEndState('lose');
      }
    }
  }

  // ────────────────────────────────────────────
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }

  function shake(el) {
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'shake 0.35s ease';
    setTimeout(() => el.style.animation = '', 400);
  }

  // ────────────────────────────────────────────
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }

  function recordGuesses(guesses) {
    const history = loadHistory();
    const today = getTodayKey();
    if (history.some(h => h.date === today)) return;
    history.push({ date: today, guesses });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    updateAvgDisplay(history);
  }

  function updateAvgDisplay(history) {
    const el = document.getElementById('nav-avg');
    if (!el || !history.length) return;
    const avg = (history.reduce((sum, h) => sum + h.guesses, 0) / history.length).toFixed(1);
    el.innerHTML = `<span class="nav-avg-label">Avg Guess</span><span class="nav-avg-value">${avg}</span>`;
  }
}

// ── CSS shake keyframe injected once ──
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20%      { transform: translateX(-6px); }
  40%      { transform: translateX(6px); }
  60%      { transform: translateX(-4px); }
  80%      { transform: translateX(4px); }
}`;
document.head.appendChild(shakeStyle);
