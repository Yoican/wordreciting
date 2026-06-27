const EMBEDDED_CET6 = window.EMBEDDED_CET6_DATA || '';
const EMBEDDED_TOEFL = window.EMBEDDED_TOEFL_DATA || '';
const EMBEDDED_A = window.EMBEDDED_A_DATA || '';
const EMBEDDED_B = window.EMBEDDED_B_DATA || '';
const EMBEDDED_C = window.EMBEDDED_C_DATA || '';

const STORAGE_KEYS = {
      review: 'vocab.review.words.v2',
      seen: 'vocab.seen.byList.v2',
      defs: 'vocab.review.defs.v2',
      mistakes: 'vocab.mistakes.words.v1',
      cycles: 'vocab.cycles.v1',
      mastery: 'vocab.mastery.v1'
    };

    const MASTERY_THRESHOLD = 80;
    const MASTERY_INITIAL = 0;

    function getNextReviewInterval(consecutiveCorrect) {
      // 10min, 1h, 4h, 1d, 3d, 7d
      const intervals = [10 * 60 * 1000, 60 * 60 * 1000, 4 * 60 * 60 * 1000,
                         24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000,
                         7 * 24 * 60 * 60 * 1000];
      return intervals[Math.min(consecutiveCorrect, intervals.length - 1)];
    }

    const LIST_CONFIG = {
      a: { name: 'A级词（四级高频）', file: 'wordlist-a.txt', embedded: EMBEDDED_A },
      b: { name: 'B级词（四级次高频）', file: 'wordlist-b.txt', embedded: EMBEDDED_B },
      c: { name: 'C级词（六级）', file: 'wordlist-c.txt', embedded: EMBEDDED_C },
      cet6: { name: '六级词表', file: 'wordlist.txt', embedded: EMBEDDED_CET6 },
      toefl: { name: '托福词表', file: 'toefl.txt', embedded: EMBEDDED_TOEFL },
      review: { name: '重点背诵表', file: null, embedded: '' }
    };

    const state = {
      lists: { a: [], b: [], c: [], cet6: [], toefl: [], review: [] },
      currentListKey: 'a',
      history: [],
      currentQuestion: null,
      answered: false,
      cycle: { active: false, queue: [], index: 0, pass: 0 }
    };

    const els = {
      listSelect: document.getElementById('listSelect'),
      reloadBtn: document.getElementById('reloadBtn'),
      exportMemoryBtn: document.getElementById('exportMemoryBtn'),
      importMemoryBtn: document.getElementById('importMemoryBtn'),
      importMemoryInput: document.getElementById('importMemoryInput'),
      resetSeenBtn: document.getElementById('resetSeenBtn'),
      clearReviewBtn: document.getElementById('clearReviewBtn'),
      currentListName: document.getElementById('currentListName'),
      totalCount: document.getElementById('totalCount'),
      remainingCount: document.getElementById('remainingCount'),
      reviewCount: document.getElementById('reviewCount'),
      mistakesCount: document.getElementById('mistakesCount'),
      loadedInfo: document.getElementById('loadedInfo'),
      wordTag: document.getElementById('wordTag'),
      wordDisplay: document.getElementById('wordDisplay'),
      statusText: document.getElementById('statusText'),
      optionsContainer: document.getElementById('optionsContainer'),
      idkBtn: document.getElementById('idkBtn'),
      easyBtn: document.getElementById('easyBtn'),
      toggleReviewBtn: document.getElementById('toggleReviewBtn'),
      prevBtn: document.getElementById('prevBtn'),
      nextBtn: document.getElementById('nextBtn'),
      quizArea: document.getElementById('quizArea'),
      emptyArea: document.getElementById('emptyArea')
    };

    function readJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    }

    function writeJSON(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    function normalizeWord(word) {
      return String(word || '').trim().toLowerCase();
    }

    function getMasteryMap() { return readJSON(STORAGE_KEYS.mastery, {}); }

    function getMasteryEntry(word) {
      return getMasteryMap()[normalizeWord(word)] || null;
    }

    function setMasteryEntry(word, updates) {
      const map = getMasteryMap();
      const key = normalizeWord(word);
      const defaults = { mastery: MASTERY_INITIAL, addedAt: Date.now(), lastReviewed: 0, consecutiveCorrect: 0, totalWrong: 0, nextReview: 0 };
      const existing = map[key] || { ...defaults };
      map[key] = { ...defaults, ...existing, ...updates };
      writeJSON(STORAGE_KEYS.mastery, map);
    }

    function migrateOldData() {
      const existingMastery = getMasteryMap();
      if (Object.keys(existingMastery).length > 0) return;
      const oldReview = readJSON(STORAGE_KEYS.review, []);
      const oldMistakes = readJSON(STORAGE_KEYS.mistakes, []);
      const oldDefs = readJSON(STORAGE_KEYS.defs, {});
      const allWords = new Set([...oldReview, ...oldMistakes]);
      if (allWords.size === 0) return;
      const map = {};
      for (const word of allWords) {
        const key = normalizeWord(word);
        const defItem = oldDefs[key];
        map[key] = { mastery: MASTERY_INITIAL, addedAt: Date.now(), lastReviewed: 0, consecutiveCorrect: 0, totalWrong: 0, nextReview: 0 };
        if (defItem) saveReviewDef(defItem);
      }
      writeJSON(STORAGE_KEYS.mastery, map);
    }

    function getSeenMap() { return readJSON(STORAGE_KEYS.seen, {}); }
    function isSeen(listKey, word) {
      const all = getSeenMap();
      return !!(all[listKey] && all[listKey][normalizeWord(word)]);
    }
    function setSeen(listKey, word, seen = true) {
      const all = getSeenMap();
      if (!all[listKey]) all[listKey] = {};
      all[listKey][normalizeWord(word)] = !!seen;
      writeJSON(STORAGE_KEYS.seen, all);
    }
    function clearSeen(listKey) {
      const all = getSeenMap();
      all[listKey] = {};
      writeJSON(STORAGE_KEYS.seen, all);
    }

    function getReviewDefs() { return readJSON(STORAGE_KEYS.defs, {}); }
    function getCycles() { return readJSON(STORAGE_KEYS.cycles, { review: 0 }); }
    function saveCycles(cycles) { writeJSON(STORAGE_KEYS.cycles, cycles); }
    function saveReviewDef(item) {
      const defs = getReviewDefs();
      defs[normalizeWord(item.word)] = item;
      writeJSON(STORAGE_KEYS.defs, defs);
    }

    function addToReview(item) {
      const entry = getMasteryEntry(item.word);
      if (!entry || entry.mastery >= MASTERY_THRESHOLD) {
        setMasteryEntry(item.word, { mastery: MASTERY_INITIAL, addedAt: Date.now(), lastReviewed: 0, consecutiveCorrect: 0, totalWrong: 0 });
      }
      saveReviewDef(item);
      refreshReviewList();
    }

    function isInReview(word) {
      const entry = getMasteryEntry(word);
      return entry !== null && entry.mastery < MASTERY_THRESHOLD;
    }

    function shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function uniqByWord(items) {
      const map = new Map();
      for (const item of items) {
        const key = normalizeWord(item.word);
        if (!key) continue;
        if (!map.has(key)) map.set(key, item);
      }
      return Array.from(map.values());
    }

    function cleanMeaningText(meaning) {
      let text = String(meaning || '')
        .replace(/[？?]+/g, '｜')
        .replace(/[;；]+/g, '；')
        .replace(/[，,]+/g, '，')
        .replace(/\s+/g, ' ')
        .trim();

      const parts = text
        .split('｜')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => part.replace(/^([a-z]+\.)\1+/i, '$1'));

      const seen = new Set();
      const deduped = [];
      for (const part of parts) {
        const key = part.replace(/\s+/g, '');
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(part);
        }
      }

      text = deduped.join('； ')
        .replace(/；\s*；+/g, '； ')
        .replace(/，\s*，+/g, '，')
        .replace(/^[；，\s]+|[；，\s]+$/g, '')
        .trim();

      return text;
    }

    function exportMemory() {
      const payload = {
        version: 3,
        updatedAt: new Date().toISOString(),
        seen: getSeenMap(),
        mastery: getMasteryMap(),
        defs: getReviewDefs(),
        cycles: getCycles()
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `vocab-memory-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      els.statusText.textContent = '记忆文件已导出。';
    }

    async function importMemoryFromFile(file) {
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('invalid memory file');

      const seen = data.seen && typeof data.seen === 'object' ? data.seen : {};
      const mastery = data.mastery && typeof data.mastery === 'object' ? data.mastery : {};
      const defs = data.defs && typeof data.defs === 'object' ? data.defs : {};
      const cycles = data.cycles && typeof data.cycles === 'object' ? data.cycles : { review: 0 };

      // Migrate old v2 format if present
      if (!Object.keys(mastery).length) {
        const reviewWords = Array.isArray(data.review && data.review.words) ? data.review.words : [];
        const reviewDefs = data.review && typeof data.review.defs === 'object' ? data.review.defs : {};
        const mistakesWords = Array.isArray(data.mistakes && data.mistakes.words) ? data.mistakes.words : [];
        const allOld = new Set([...reviewWords, ...mistakesWords]);
        for (const w of allOld) {
          const key = normalizeWord(w);
          mastery[key] = { mastery: MASTERY_INITIAL, addedAt: Date.now(), lastReviewed: 0, consecutiveCorrect: 0, totalWrong: 0, nextReview: 0 };
          if (reviewDefs[key] && !defs[key]) defs[key] = reviewDefs[key];
        }
      }

      writeJSON(STORAGE_KEYS.seen, seen);
      writeJSON(STORAGE_KEYS.cycles, cycles);
      writeJSON(STORAGE_KEYS.mastery, mastery);
      writeJSON(STORAGE_KEYS.defs, defs);
      refreshReviewList();
      switchList(state.currentListKey);
      els.statusText.textContent = '记忆文件已导入，进度已更新。';
    }

    function parseWordLine(line) {
      const cleaned = String(line || '')
        .replace(/[★☆*•]/g, ' ')
        .trim();
      if (!cleaned) return null;
      if (/^(UNIT|Part|左栏|右栏|Words?|这张图片|我为你提取|延续之前|单词表|第\d+页|#)/i.test(cleaned)) return null;

      const tabParts = cleaned.split('\t');
      if (tabParts.length >= 2) {
        const word = tabParts[0].trim();
        const meaning = cleanMeaningText(tabParts.slice(1).join(' '));
        if (/^[A-Za-z][A-Za-z\-']*$/.test(word) && /[\u4e00-\u9fff]/.test(meaning)) {
          return { word, meaning, raw: cleaned };
        }
      }

      if (!/[A-Za-z]/.test(cleaned) || !(/[\u4e00-\u9fff]/.test(cleaned))) return null;

      const wordMatch = cleaned.match(/^[A-Za-z][A-Za-z\-']*/);
      if (!wordMatch) return null;
      const word = wordMatch[0];

      let meaning = cleaned.slice(word.length).trim();
      meaning = meaning.replace(/^\[[^\]]*\]\s*/, '');
      meaning = meaning.replace(/^\/[^\/] *\//, '').trim();
      meaning = cleanMeaningText(meaning);
      if (!/[\u4e00-\u9fff]/.test(meaning)) return null;

      return { word, meaning, raw: cleaned };
    }

    function parseWordText(text) {
      return uniqByWord(String(text || '').split(/\r?\n/).map(parseWordLine).filter(Boolean));
    }

    async function loadTextFile(fileName, fallbackText) {
      try {
        const res = await fetch(fileName + '?t=' + Date.now());
        if (!res.ok) throw new Error('fetch failed');
        const text = await res.text();
        if (!text || !text.trim()) return fallbackText;
        return text;
      } catch {
        return fallbackText;
      }
    }

    async function loadBaseLists() {
      const aText = await loadTextFile(LIST_CONFIG.a.file, EMBEDDED_A);
      const bText = await loadTextFile(LIST_CONFIG.b.file, EMBEDDED_B);
      const cText = await loadTextFile(LIST_CONFIG.c.file, EMBEDDED_C);
      const cet6Text = await loadTextFile(LIST_CONFIG.cet6.file, EMBEDDED_CET6);
      const toeflText = await loadTextFile(LIST_CONFIG.toefl.file, EMBEDDED_TOEFL);
      state.lists.a = parseWordText(aText);
      state.lists.b = parseWordText(bText);
      state.lists.c = parseWordText(cText);
      state.lists.cet6 = parseWordText(cet6Text);
      state.lists.toefl = parseWordText(toeflText);
      refreshReviewList();
      els.loadedInfo.textContent = `${state.lists.a.length} / ${state.lists.b.length} / ${state.lists.c.length} / ${state.lists.cet6.length} / ${state.lists.toefl.length}`;
    }

    function refreshReviewList() {
      const masteryMap = getMasteryMap();
      const defs = getReviewDefs();
      const baseMap = new Map();
      [...state.lists.a, ...state.lists.b, ...state.lists.c, ...state.lists.cet6, ...state.lists.toefl].forEach(item => {
        baseMap.set(normalizeWord(item.word), item);
      });

      const now = Date.now();
      const reviewItems = [];
      for (const [wordKey, entry] of Object.entries(masteryMap)) {
        const due = !entry.nextReview || entry.nextReview <= now;
        if (entry.mastery < MASTERY_THRESHOLD && due) {
          const item = baseMap.get(wordKey) || defs[wordKey];
          if (item) {
            reviewItems.push({ ...item, _mastery: entry.mastery, _totalWrong: entry.totalWrong, _nextReview: entry.nextReview });
          }
        }
      }
      // Sort by mastery ASC (weakest first)
      reviewItems.sort((a, b) => (a._mastery || 0) - (b._mastery || 0));
      state.lists.review = uniqByWord(reviewItems);
    }

    function getActiveList() {
      return state.lists[state.currentListKey] || [];
    }

    function isCycleList(listKey) {
      return listKey === 'review';
    }

    function buildCycleQueue(listKey) {
      return getActiveList().map(item => normalizeWord(item.word)).filter(Boolean);
    }

    function ensureCycleState(listKey) {
      if (!isCycleList(listKey)) {
        state.cycle = { active: false, queue: [], index: 0, pass: 0 };
        return;
      }
      const queue = buildCycleQueue(listKey);
      const cycles = getCycles();
      state.cycle = {
        active: true,
        queue,
        index: 0,
        pass: cycles[listKey] || 0
      };
    }

    function finishCycleAndAdvance(listKey) {
      const cycles = getCycles();
      const nextPass = (cycles[listKey] || 0) + 1;
      cycles[listKey] = nextPass;
      saveCycles(cycles);
      state.cycle.pass = nextPass;
      state.cycle.index = 0;
      // Check if any words are not yet due (mastery < threshold but nextReview in future)
      const masteryMap = getMasteryMap();
      const now = Date.now();
      let pendingCount = 0;
      for (const entry of Object.values(masteryMap)) {
        if (entry.mastery < MASTERY_THRESHOLD && entry.nextReview > now) pendingCount++;
      }
      if (pendingCount > 0) {
        alert(`本轮待复习词已全部完成。还有 ${pendingCount} 个词将在后续时间到期，届时再来复习吧。`);
      } else {
        alert('全部掌握！恭喜！');
      }
      const active = getActiveList();
      if (!active.length) {
        showEmpty();
        return true;
      }
      return false;
    }

    function getRemainingPool(listKey) {
      const list = getActiveList();
      if (isCycleList(listKey)) return [...list];
      return list.filter(item => !isSeen(listKey, item.word));
    }

    function buildQuestion(item, listKey) {
      const src = (state.lists[listKey] && state.lists[listKey].length >= 4)
        ? state.lists[listKey]
        : uniqByWord([...state.lists.cet6, ...state.lists.toefl, ...state.lists.review]);
      const distractors = Array.from(new Set(
        src.filter(x => normalizeWord(x.word) !== normalizeWord(item.word) && x.meaning !== item.meaning)
           .map(x => x.meaning)
      ));
      const options = shuffle([item.meaning, ...shuffle(distractors).slice(0, 3)]).slice(0, 4);
      return { item, options, correct: item.meaning };
    }

    function updateMeta() {
      const list = getActiveList();
      const remaining = getRemainingPool(state.currentListKey);
      const masteryMap = getMasteryMap();
      let weakCount = 0;
      for (const entry of Object.values(masteryMap)) {
        if (entry.mastery < 30 && entry.mastery < MASTERY_THRESHOLD) weakCount++;
      }
      els.currentListName.textContent = LIST_CONFIG[state.currentListKey].name;
      els.totalCount.textContent = String(list.length);
      els.remainingCount.textContent = String(remaining.length);
      els.reviewCount.textContent = String(state.lists.review.length);
      els.mistakesCount.textContent = String(weakCount);
    }

    function updateReviewButton() {
      const item = state.currentQuestion && state.currentQuestion.item;
      if (!item) return;
      els.toggleReviewBtn.textContent = isInReview(item.word) ? '移出重点背诵' : '加入重点背诵';
    }

    function renderQuestion(question) {
      state.currentQuestion = question;
      state.answered = false;
      els.quizArea.classList.remove('hidden');
      els.emptyArea.classList.add('hidden');
      els.wordTag.textContent = LIST_CONFIG[state.currentListKey].name;
      els.wordDisplay.textContent = question.item.word;
      if (isCycleList(state.currentListKey)) {
        const total = state.cycle.queue.length || getActiveList().length;
        const position = Math.min((state.cycle.index || 0) + 1, total || 1);
        els.statusText.textContent = `待复习 ${total} 个 · 第 ${position} / ${total} 个`;
      } else {
        els.statusText.textContent = '从 4 个中文意思里选 1 个。';
      }
      els.optionsContainer.innerHTML = '';

      question.options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'option';
        btn.textContent = option;
        btn.addEventListener('click', () => selectOption(option, btn));
        els.optionsContainer.appendChild(btn);
      });

      els.prevBtn.disabled = state.history.length <= 1;
      updateReviewButton();
      updateMeta();
    }

    function markSeen(item) {
      if (state.currentListKey !== 'review') setSeen(state.currentListKey, item.word, true);
    }

    function selectOption(option, btn) {
      if (state.answered) return;
      state.answered = true;
      const q = state.currentQuestion;
      const correct = option === q.correct;
      const inReviewMode = state.currentListKey === 'review';
      const buttons = [...els.optionsContainer.querySelectorAll('button')];
      buttons.forEach(b => {
        if (b.textContent === q.correct) b.classList.add('correct');
        if (b === btn && !correct) b.classList.add('wrong');
        b.disabled = true;
      });
      if (!correct) {
        if (inReviewMode) {
          const entry = getMasteryEntry(q.item.word);
          const mastery = entry ? Math.max(0, entry.mastery - 20) : MASTERY_INITIAL;
          const totalWrong = (entry ? entry.totalWrong : 0) + 1;
          setMasteryEntry(q.item.word, { mastery, lastReviewed: Date.now(), consecutiveCorrect: 0, totalWrong, nextReview: Date.now() + getNextReviewInterval(0) });
          refreshReviewList();
        } else {
          addToReview(q.item);
        }
      } else if (inReviewMode) {
        const entry = getMasteryEntry(q.item.word);
        if (entry) {
          const newConsecutive = (entry.consecutiveCorrect || 0) + 1;
          const newMastery = Math.min(100, (entry.mastery || 0) + 10);
          setMasteryEntry(q.item.word, { mastery: newMastery, lastReviewed: Date.now(), consecutiveCorrect: newConsecutive, nextReview: Date.now() + getNextReviewInterval(newConsecutive) });
          refreshReviewList();
        }
      }
      markSeen(q.item);
      els.statusText.textContent = correct ? '答对了，正在自动切换到下一个。' : '答错了，已自动加入重点背诵。';
      updateReviewButton();
      updateMeta();
      if (correct) {
        setTimeout(() => {
          const currentWord = state.currentQuestion && state.currentQuestion.item && state.currentQuestion.item.word;
          if (currentWord && currentWord === q.item.word) {
            nextQuestion();
          }
        }, 450);
      }
    }

    function handleIdk() {
      const q = state.currentQuestion;
      if (!q || state.answered) return;
      state.answered = true;
      const inReviewMode = state.currentListKey === 'review';
      if (inReviewMode) {
        const entry = getMasteryEntry(q.item.word);
        const mastery = entry ? Math.max(0, entry.mastery - 20) : MASTERY_INITIAL;
        const totalWrong = (entry ? entry.totalWrong : 0) + 1;
        setMasteryEntry(q.item.word, { mastery, lastReviewed: Date.now(), consecutiveCorrect: 0, totalWrong, nextReview: Date.now() + getNextReviewInterval(0) });
        refreshReviewList();
      } else {
        addToReview(q.item);
      }
      markSeen(q.item);
      [...els.optionsContainer.querySelectorAll('button')].forEach(b => {
        if (b.textContent === q.correct) b.classList.add('correct');
        b.disabled = true;
      });
      els.statusText.textContent = '已加入重点背诵。';
      updateReviewButton();
      updateMeta();
    }

    function handleEasy() {
      const q = state.currentQuestion;
      if (!q || state.answered) return;
      state.answered = true;
      const inReviewMode = state.currentListKey === 'review';
      if (inReviewMode) {
        const entry = getMasteryEntry(q.item.word);
        if (entry) {
          const newConsecutive = (entry.consecutiveCorrect || 0) + 1;
          const newMastery = Math.min(100, (entry.mastery || 0) + 25);
          setMasteryEntry(q.item.word, { mastery: newMastery, lastReviewed: Date.now(), consecutiveCorrect: newConsecutive, nextReview: Date.now() + getNextReviewInterval(newConsecutive) });
          refreshReviewList();
        }
      }
      markSeen(q.item);
      [...els.optionsContainer.querySelectorAll('button')].forEach(b => {
        if (b.textContent === q.correct) b.classList.add('correct');
        b.disabled = true;
      });
      els.statusText.textContent = '已标记为认识 / 简单，正在自动切换到下一个。';
      updateReviewButton();
      updateMeta();
      setTimeout(() => {
        const currentWord = state.currentQuestion && state.currentQuestion.item && state.currentQuestion.item.word;
        if (currentWord && currentWord === q.item.word) {
          nextQuestion();
        }
      }, 450);
    }

    function handleGlobalKeydown(event) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;

      if (event.code === 'Space') {
        event.preventDefault();
        handleEasy();
        return;
      }

      const digitMatch = event.code.match(/^(Digit|Numpad)([1-4])$/);
      if (digitMatch && state.currentQuestion && !state.answered) {
        const idx = parseInt(digitMatch[2], 10) - 1;
        const buttons = [...els.optionsContainer.querySelectorAll('button')];
        if (buttons[idx]) {
          event.preventDefault();
          buttons[idx].click();
        }
      }

      if (event.code === 'ArrowRight') {
        event.preventDefault();
        nextQuestion();
        return;
      }
      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        prevQuestion();
        return;
      }
      if (event.code === 'Equal') {
        event.preventDefault();
        toggleReviewCurrent();
        return;
      }
      if (event.code === 'Minus') {
        event.preventDefault();
        toggleReviewCurrent();
        return;
      }
    }

    function toggleReviewCurrent() {
      const item = state.currentQuestion && state.currentQuestion.item;
      if (!item) return;
      if (isInReview(item.word)) {
        setMasteryEntry(item.word, { mastery: MASTERY_THRESHOLD });
        refreshReviewList();
        els.statusText.textContent = '已从重点背诵移除。';
      } else {
        addToReview(item);
        els.statusText.textContent = '已加入重点背诵。';
      }
      updateReviewButton();
      updateMeta();
    }

    function showEmpty() {
      state.currentQuestion = null;
      els.quizArea.classList.add('hidden');
      els.emptyArea.classList.remove('hidden');
      if (state.currentListKey === 'review') {
        const masteryMap = getMasteryMap();
        const now = Date.now();
        let pendingCount = 0;
        for (const entry of Object.values(masteryMap)) {
          if (entry.mastery < MASTERY_THRESHOLD && entry.nextReview && entry.nextReview > now) pendingCount++;
        }
        if (pendingCount > 0) {
          els.emptyArea.innerHTML = `暂无到期的复习词。<br>还有 ${pendingCount} 个词在等待复习间隔到期，稍后再来。`;
        } else {
          els.emptyArea.innerHTML = '暂无需要复习的单词。<br>继续刷其他词表吧，答错会自动加入这里。';
        }
      } else {
        els.emptyArea.innerHTML = '当前词表已经没有可出的单词啦。<br>你可以切换词表，或者重置当前词表进度继续刷。';
      }
      updateMeta();
    }

    function nextQuestion() {
      const listKey = state.currentListKey;
      const pool = getRemainingPool(listKey);
      if (!pool.length) {
        showEmpty();
        return;
      }

      let item;
      if (isCycleList(listKey)) {
        ensureCycleState(listKey);
        if (!state.cycle.queue.length) {
          showEmpty();
          return;
        }
        if (state.cycle.index >= state.cycle.queue.length) {
          const finished = finishCycleAndAdvance(listKey);
          if (finished) return;
        }
        const key = state.cycle.queue[state.cycle.index];
        item = pool.find(x => normalizeWord(x.word) === key) || pool[0];
        state.cycle.index += 1;
      } else {
        item = shuffle(pool)[0];
      }

      state.history.push({ listKey: state.currentListKey, item });
      renderQuestion(buildQuestion(item, state.currentListKey));
    }

    function prevQuestion() {
      if (state.history.length <= 1) return;
      state.history.pop();
      const prev = state.history[state.history.length - 1];
      renderQuestion(buildQuestion(prev.item, prev.listKey));
      els.statusText.textContent = '这是上一个单词。';
    }

    function switchList(listKey) {
      state.currentListKey = listKey;
      state.history = [];
      ensureCycleState(listKey);
      if (!getActiveList().length) {
        showEmpty();
        return;
      }
      nextQuestion();
    }

    async function init() {
      await loadBaseLists();
      migrateOldData();
      refreshReviewList();

      els.listSelect.addEventListener('change', e => switchList(e.target.value));
      els.reloadBtn.addEventListener('click', async () => {
        els.statusText.textContent = '重新读取中...';
        await loadBaseLists();
        switchList(state.currentListKey);
      });
      els.exportMemoryBtn.addEventListener('click', exportMemory);
      els.importMemoryBtn.addEventListener('click', () => els.importMemoryInput.click());
      els.importMemoryInput.addEventListener('change', async e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          await importMemoryFromFile(file);
        } catch (err) {
          console.error(err);
          alert('导入失败：记忆文件格式不正确。');
        } finally {
          e.target.value = '';
        }
      });
      els.resetSeenBtn.addEventListener('click', () => {
        if (state.currentListKey === 'review') {
          alert('重点背诵表不记录已看过进度，不需要重置。');
          return;
        }
        clearSeen(state.currentListKey);
        switchList(state.currentListKey);
      });
      els.clearReviewBtn.addEventListener('click', () => {
        if (!confirm('确定清空重点背诵表吗？所有掌握度记录将被清除。')) return;
        writeJSON(STORAGE_KEYS.mastery, {});
        const cycles = getCycles();
        cycles.review = 0;
        saveCycles(cycles);
        refreshReviewList();
        if (state.currentListKey === 'review') switchList('review');
        else updateMeta();
      });
      els.idkBtn.addEventListener('click', handleIdk);
      els.easyBtn.addEventListener('click', handleEasy);
      document.addEventListener('keydown', handleGlobalKeydown);
      els.toggleReviewBtn.addEventListener('click', toggleReviewCurrent);
      els.nextBtn.addEventListener('click', nextQuestion);
      els.prevBtn.addEventListener('click', prevQuestion);

      if (!state.lists.cet6.length && !state.lists.toefl.length) {
        els.wordDisplay.textContent = '词表加载失败';
        els.statusText.textContent = '没有解析出单词。';
        showEmpty();
        return;
      }

      switchList('a');
    }

    init();
