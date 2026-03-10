// ============================================================
// STATMASK — GAME ENGINE
// ============================================================

function initGame(sport, config) {
  const MAX_GUESSES = 5;
  const STORAGE_KEY = `statsleuth_v2_${sport}_${getTodayKey()}`;
  const HISTORY_KEY = `statmask_history_${sport}`;
  const STREAK_KEY  = `statmask_streak_${sport}`;

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
  const skipBtn     = document.getElementById('skip-btn');
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
  const navAvg      = document.getElementById('nav-avg');
  const navStreak   = document.getElementById('nav-streak');
  const streakDisplay = document.getElementById('streak-display');

  // ── Pre-normalize player list once for fast search ──
  // Players may be "Name|Team" — only normalize the name portion
  const normalizedPlayers = config.players.map(p => normalize(p.split('|')[0]));

  // ── Set blurred mystery name ──
  if (mysteryName) mysteryName.textContent = config.answer;

  // ── Set revealed name + accolades ──
  if (playerReveal) playerReveal.textContent = config.answer;
  const accoladesEl = document.getElementById('player-accolades-reveal');
  if (accoladesEl && config.accolades) {
    config.accolades.forEach(a => {
      const span = document.createElement('span');
      span.className = 'accolade-badge';
      span.textContent = a;
      accoladesEl.appendChild(span);
    });
  }

  // ── Restore state on load ──
  restoreUI();
  updateAvgDisplay(loadHistory());
  displayNavStreak();

  // ── Search / autocomplete ──
  let searchActive = false;
  let lockedScrollY = null;

  function snapScroll() {
    if (lockedScrollY !== null) window.scrollTo(0, lockedScrollY);
  }

  function lockScroll() {
    lockedScrollY = Math.round(window.scrollY);
    window.addEventListener('scroll', snapScroll);
  }

  function unlockScroll() {
    lockedScrollY = null;
    window.removeEventListener('scroll', snapScroll);
  }

  searchInput.addEventListener('focus', () => {
    if (searchActive) return;
    searchActive = true;
    let el = searchInput, absTop = 0;
    while (el) { absTop += el.offsetTop; el = el.offsetParent; }
    const targetY = Math.max(0, absTop - 68);
    setTimeout(() => {
      window.scrollTo({ top: targetY, behavior: 'smooth' });
      // Lock after smooth scroll settles so nothing can move it while typing
      setTimeout(() => { if (searchActive) lockScroll(); }, 550);
    }, 350);
  });

  searchInput.addEventListener('input', onSearchInput);
  searchInput.addEventListener('keydown', onSearchKeydown);

  // Only dismiss when user explicitly taps outside the input area
  document.addEventListener('pointerdown', (e) => {
    if (searchActive && !e.target.closest('.guess-area')) {
      searchActive = false;
      unlockScroll();
      closeDropdown();
      searchInput.blur();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) closeDropdown();
  });

  guessBtn.addEventListener('click', submitGuess);
  skipBtn.addEventListener('click', () => {
    skipBtn.classList.contains('give-up-mode') ? giveUp() : skipGuess();
  });
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  shareBtn.addEventListener('click', shareResult);
  shareBtn.textContent = isMobile && navigator.share ? 'Share Result' : 'Copy Result';

  // ────────────────────────────────────────────
  function normalize(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.']/g, '');
  }

  // Handles "Last, First" → "first last" so both formats match
  function normalizeQuery(q) {
    const n = normalize(q);
    if (n.includes(',')) {
      const [last, first] = n.split(',').map(s => s.trim());
      return first ? `${first} ${last}` : last;
    }
    return n;
  }

  function onSearchInput() {
    const q = searchInput.value.trim();
    if (q.length < 3) { closeDropdown(); return; }
    const nq = normalizeQuery(q);
    const matches = config.players.filter((_p, i) =>
      normalizedPlayers[i].includes(nq)
    ).slice(0, 8);
    renderDropdown(matches, q);
  }

  function renderDropdown(matches, q) {
    if (!matches.length) { closeDropdown(); return; }
    dropdown.innerHTML = '';
    matches.forEach((playerStr, i) => {
      const [name, team] = playerStr.split('|');
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.dataset.index = i;
      const nameEl = document.createElement('span');
      nameEl.className = 'autocomplete-item-name';
      highlightInto(nameEl, name, q);
      item.appendChild(nameEl);
      if (team) {
        const teamEl = document.createElement('span');
        teamEl.className = 'autocomplete-team';
        teamEl.textContent = team;
        item.appendChild(teamEl);
      }
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectPlayer(name);
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.add('open');
    dropdown._matches = matches;
    dropdown._activeIndex = -1;
    positionDropdown();
  }

  function highlightInto(el, name, q) {
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) { el.textContent = name; return; }
    el.appendChild(document.createTextNode(name.slice(0, idx)));
    const mark = document.createElement('mark');
    mark.textContent = name.slice(idx, idx + q.length);
    el.appendChild(mark);
    el.appendChild(document.createTextNode(name.slice(idx + q.length)));
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
        selectPlayer(dropdown._matches[idx].split('|')[0]);
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
    searchActive = false;
    unlockScroll();
    // Wait for the virtual keyboard to finish dismissing, then scroll
    // so the Skip button (bottom of the guess area) is fully in view.
    setTimeout(() => {
      const rect = skipBtn.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 16) {
        window.scrollBy({ top: rect.bottom - window.innerHeight + 32, behavior: 'smooth' });
      }
    }, 350);
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    dropdown.style.top = '';
    dropdown.style.bottom = '';
    dropdown.style.maxHeight = '';
  }

  // ────────────────────────────────────────────
  function submitGuess() {
    if (state.locked) return;
    const guess = searchInput.value.trim();
    if (!guess) return;

    // Check if in player list (accent-insensitive) — entries may be "Name|Team"
    const matched = config.players.find(p => normalize(p.split('|')[0]) === normalize(guess));
    if (!matched) {
      shake(searchInput);
      searchInput.placeholder = 'Player not found — check spelling';
      setTimeout(() => searchInput.placeholder = 'Search for a player...', 2000);
      return;
    }

    const matchedName = matched.split('|')[0].replace(/\s*\(\d{4}-[\w]+\)$/, '').trim();

    // Already guessed?
    if (state.wrongGuesses.includes(matchedName)) {
      shake(searchInput);
      return;
    }

    searchInput.value = '';
    closeDropdown();

    const correct = normalize(matchedName) === normalize(config.answer);

    if (correct) {
      state.result = 'win';
      state.guessesUsed = state.wrongGuesses.length + 1;
      state.locked = true;
      if (pips[state.wrongGuesses.length]) pips[state.wrongGuesses.length].classList.add('correct');
      guessBtn.textContent = '✓ Correct!';
      guessBtn.classList.add('correct');
      card.classList.add('win');
      triggerWinSweep();
      updateStreak(true);
      displayNavStreak();
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
        updateStreak(false);
        displayNavStreak();
        recordGuesses(state.guessesUsed);
        setTimeout(() => showEndState('lose'), 700);
      }
    }

    saveState();

    if (state.locked) {
      searchInput.disabled = true;
      guessBtn.disabled = true;
      skipBtn.disabled = true;
      lockedBanner.classList.add('show');
    }
  }

  // ────────────────────────────────────────────
  function skipGuess() {
    if (state.locked) return;

    const skipIndex = state.wrongGuesses.length;
    state.wrongGuesses.push('__skip__');
    if (pips[skipIndex]) pips[skipIndex].classList.add('skip');
    addWrongGuessTag('__skip__');
    revealNextClue();

    if (state.wrongGuesses.length >= MAX_GUESSES) {
      state.result = 'lose';
      state.guessesUsed = MAX_GUESSES;
      state.locked = true;
      revealAllClues();
      revealCardHeader(false);
      card.classList.add('lose');
      updateStreak(false);
      displayNavStreak();
      recordGuesses(state.guessesUsed);
      setTimeout(() => showEndState('lose'), 700);
    }

    saveState();

    if (state.locked) {
      searchInput.disabled = true;
      guessBtn.disabled = true;
      skipBtn.disabled = true;
      lockedBanner.classList.add('show');
    } else if (state.wrongGuesses.length >= MAX_GUESSES - 1) {
      skipBtn.textContent = 'Give Up';
      skipBtn.classList.add('give-up-mode');
    }
  }

  // ────────────────────────────────────────────
  function giveUp() {
    if (state.locked) return;
    state.result = 'lose';
    state.guessesUsed = state.wrongGuesses.length;
    state.locked = true;
    revealAllClues();
    revealCardHeader(false);
    card.classList.add('lose');
    updateStreak(false);
    displayNavStreak();
    recordGuesses(state.guessesUsed);
    saveState();
    searchInput.disabled = true;
    guessBtn.disabled = true;
    skipBtn.disabled = true;
    lockedBanner.classList.add('show');
    setTimeout(() => showEndState('lose'), 700);
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
    state.wrongGuesses.forEach((g, i) => {
      if (pips[i]) pips[i].classList.add(g === '__skip__' ? 'skip' : 'wrong');
    });
  }

  function addWrongGuessTag(name) {
    wrongSection.style.display = 'block';
    const tag = document.createElement('span');
    if (name === '__skip__') {
      tag.className = 'wrong-guess-tag skip-tag';
      tag.textContent = 'Skipped';
    } else {
      tag.className = 'wrong-guess-tag';
      tag.textContent = name;
    }
    wrongList.appendChild(tag);
  }

  function showEndState(result) {
    endState.classList.add('show');
    const streak = loadStreak();
    if (result === 'win') {
      endScore.textContent = `Got it in ${state.guessesUsed}/${MAX_GUESSES}!`;
      endScore.className = 'end-state-score win-text';
      endSub.textContent = 'Nice work, sleuth. Come back tomorrow.';
      if (streakDisplay) {
        if (streak.count >= 1) {
          streakDisplay.textContent = streak.count === 1 ? '🔥 1-day streak' : `🔥 ${streak.count}-day streak`;
          streakDisplay.style.display = '';
        } else {
          streakDisplay.style.display = 'none';
        }
      }
    } else {
      endScore.textContent = 'Better luck tomorrow!';
      endScore.className = 'end-state-score lose-text';
      endSub.textContent = `The answer was ${config.answer}.`;
      if (streakDisplay) streakDisplay.style.display = 'none';
    }
    emojiGrid.textContent = buildEmojiGrid(result);
    setTimeout(() => endState.focus(), 50);
  }

  function buildEmojiGrid(result) {
    const wrong = state.wrongGuesses.map(() => '🟥');
    if (result === 'win') wrong.push('🟩');
    while (wrong.length < MAX_GUESSES && result === 'lose') wrong.push('🟥');
    return wrong.join('');
  }

  function buildShareText() {
    const sportLabel = sport.toUpperCase();
    const emoji = buildEmojiGrid(state.result);
    const streak = loadStreak();
    const lines = [];

    if (state.result === 'win') {
      const clueWord = state.guessesUsed === 1 ? 'clue' : 'clues';
      lines.push(`I unmasked today's ${sportLabel} Player in ${state.guessesUsed} ${clueWord}.`);
      lines.push(emoji);
      if (streak.count >= 1) lines.push(`🔥 ${streak.count}-day streak`);
    } else {
      lines.push(`I couldn't unmask today's ${sportLabel} Player.`);
      lines.push(emoji);
    }
    lines.push(`#StatMask #${sportLabel}`);
    lines.push(`statmask.com/${sport}`);
    return lines.join('\n');
  }

  function shareResult() {
    const text = buildShareText();
    const resetBtn = () => {
      shareBtn.textContent = isMobile && navigator.share ? 'Share Result' : 'Copy Result';
      shareBtn.classList.remove('copied');
    };

    if (isMobile && navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        shareBtn.textContent = '✓ Copied!';
        shareBtn.classList.add('copied');
        setTimeout(resetBtn, 3000);
      });
    }
  }

  // ────────────────────────────────────────────
  function restoreUI() {
    if (!state) {
      state = { wrongGuesses: [], result: null, guessesUsed: 0, locked: false };
      saveState();
    }

    // Always show first clue
    clueRows[0].classList.add('revealed');

    // Restore wrong guesses
    state.wrongGuesses.forEach((name, i) => {
      if (pips[i]) pips[i].classList.add(name === '__skip__' ? 'skip' : 'wrong');
      addWrongGuessTag(name);
      if (i < clueRows.length) clueRows[i].classList.add('revealed');
    });

    if (!state.locked && state.wrongGuesses.length >= MAX_GUESSES - 1) {
      skipBtn.textContent = 'Give Up';
      skipBtn.classList.add('give-up-mode');
    }

    if (state.locked) {
      searchInput.disabled = true;
      guessBtn.disabled = true;
      skipBtn.disabled = true;
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
  // ────────────────────────────────────────────
  function getYesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }

  function loadStreak() {
    try { return JSON.parse(localStorage.getItem(STREAK_KEY)) || { count: 0, lastWinDate: null }; }
    catch { return { count: 0, lastWinDate: null }; }
  }

  function saveStreak(streak) {
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(streak)); } catch {}
  }

  function updateStreak(won) {
    const streak = loadStreak();
    const today = getTodayKey();
    if (streak.lastWinDate === today) return streak; // already recorded today
    if (won) {
      streak.count = (streak.lastWinDate === getYesterdayKey()) ? streak.count + 1 : 1;
      streak.lastWinDate = today;
    } else {
      streak.count = 0;
      streak.lastWinDate = null;
    }
    saveStreak(streak);
    return streak;
  }

  function displayNavStreak() {
    if (!navStreak) return;
    const streak = loadStreak();
    navStreak.innerHTML = '';
    if (streak.count >= 1) {
      const label = document.createElement('span');
      label.className = 'nav-streak-label';
      label.textContent = 'Streak';
      const value = document.createElement('span');
      value.className = 'nav-streak-value';
      value.textContent = `🔥${streak.count}`;
      navStreak.appendChild(label);
      navStreak.appendChild(value);
    }
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }

  function recordGuesses(guesses) {
    const history = loadHistory();
    const today = getTodayKey();
    if (history.some(h => h.date === today)) return;
    history.push({ date: today, guesses });
    if (history.length > 365) history.splice(0, history.length - 365);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    updateAvgDisplay(history);
  }

  function updateAvgDisplay(history) {
    if (!navAvg || !history.length) return;
    const avg = (history.reduce((sum, h) => sum + h.guesses, 0) / history.length).toFixed(1);
    navAvg.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'nav-avg-label';
    label.textContent = 'Avg Guess';
    const value = document.createElement('span');
    value.className = 'nav-avg-value';
    value.textContent = avg;
    navAvg.appendChild(label);
    navAvg.appendChild(value);
  }
}

// ── CSS shake keyframe injected once ──
if (!document.getElementById('statmask-shake-style')) {
  const shakeStyle = document.createElement('style');
  shakeStyle.id = 'statmask-shake-style';
  shakeStyle.textContent = `
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20%      { transform: translateX(-6px); }
  40%      { transform: translateX(6px); }
  60%      { transform: translateX(-4px); }
  80%      { transform: translateX(4px); }
}`;
  document.head.appendChild(shakeStyle);
}
