const EMBEDDED_CET6 = window.EMBEDDED_CET6_DATA || '';
const EMBEDDED_TOEFL = window.EMBEDDED_TOEFL_DATA || '';

const STORAGE_KEYS = {
      review: 'vocab.review.words.v2',
      seen: 'vocab.seen.byList.v2',
      defs: 'vocab.review.defs.v2',
      mistakes: 'vocab.mistakes.words.v1',
      cycles: 'vocab.cycles.v1'
    };

    const LIST_CONFIG = {
      cet6: { name: '六级词表', file: 'wordlist.txt', embedded: EMBEDDED_CET6 },
      toefl: { name: '托福词表', file: 'toefl.txt', embedded: EMBEDDED_TOEFL },
      review: { name: '重点背诵表', file: null, embedded: '' },
      mistakes: { name: '错词总表', file: null, embedded: '' }
    };

    const state = {
      lists: { cet6: [], toefl: [], review: [], mistakes: [] },
      currentListKey: 'cet6',
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
      clearMistakesBtn: document.getElementById('clearMistakesBtn'),
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

    function getReviewSet() { return new Set(readJSON(STORAGE_KEYS.review, [])); }
    function saveReviewSet(setObj) { writeJSON(STORAGE_KEYS.review, Array.from(setObj)); }
    function getReviewDefs() { return readJSON(STORAGE_KEYS.defs, {}); }
    function getMistakesSet() { return new Set(readJSON(STORAGE_KEYS.mistakes, [])); }
    function saveMistakesSet(setObj) { writeJSON(STORAGE_KEYS.mistakes, Array.from(setObj)); }
    function getCycles() { return readJSON(STORAGE_KEYS.cycles, { review: 0, mistakes: 0 }); }
    function saveCycles(cycles) { writeJSON(STORAGE_KEYS.cycles, cycles); }
    function saveReviewDef(item) {
      const defs = getReviewDefs();
      defs[normalizeWord(item.word)] = item;
      writeJSON(STORAGE_KEYS.defs, defs);
    }

    function addToReview(item) {
      const s = getReviewSet();
      s.add(normalizeWord(item.word));
      saveReviewSet(s);
      saveReviewDef(item);
      refreshReviewList();
    }

    function addToMistakes(item) {
      const s = getMistakesSet();
      s.add(normalizeWord(item.word));
      saveMistakesSet(s);
      saveReviewDef(item);
      refreshReviewList();
    }

    function removeFromReview(word) {
      const s = getReviewSet();
      s.delete(normalizeWord(word));
      saveReviewSet(s);
      refreshReviewList();
    }

    function isInReview(word) {
      return getReviewSet().has(normalizeWord(word));
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
        version: 2,
        updatedAt: new Date().toISOString(),
        seen: getSeenMap(),
        review: {
          words: Array.from(getReviewSet()),
          defs: getReviewDefs()
        },
        mistakes: {
          words: Array.from(getMistakesSet())
        },
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
      const reviewWords = Array.isArray(data.review && data.review.words) ? data.review.words : [];
      const reviewDefs = data.review && typeof data.review.defs === 'object' ? data.review.defs : {};
      const mistakesWords = Array.isArray(data.mistakes && data.mistakes.words) ? data.mistakes.words : [];
      const cycles = data.cycles && typeof data.cycles === 'object' ? data.cycles : { review: 0, mistakes: 0 };

      writeJSON(STORAGE_KEYS.seen, seen);
      writeJSON(STORAGE_KEYS.review, reviewWords);
      writeJSON(STORAGE_KEYS.defs, reviewDefs);
      writeJSON(STORAGE_KEYS.mistakes, mistakesWords);
      writeJSON(STORAGE_KEYS.cycles, cycles);
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
      const cet6Text = await loadTextFile(LIST_CONFIG.cet6.file, EMBEDDED_CET6);
      const toeflText = await loadTextFile(LIST_CONFIG.toefl.file, EMBEDDED_TOEFL);
      state.lists.cet6 = parseWordText(cet6Text);
      state.lists.toefl = parseWordText(toeflText);
      refreshReviewList();
      els.loadedInfo.textContent = `${state.lists.cet6.length} / ${state.lists.toefl.length}`;
    }

    function refreshReviewList() {
      const reviewSet = getReviewSet();
      const mistakeSet = getMistakesSet();
      const defs = getReviewDefs();
      const baseMap = new Map();
      [...state.lists.cet6, ...state.lists.toefl].forEach(item => {
        baseMap.set(normalizeWord(item.word), item);
      });
      const reviewResult = [];
      for (const word of reviewSet) {
        const item = baseMap.get(word) || defs[word];
        if (item) reviewResult.push(item);
      }
      const mistakesResult = [];
      for (const word of mistakeSet) {
        const item = baseMap.get(word) || defs[word];
        if (item) mistakesResult.push(item);
      }
      state.lists.review = uniqByWord(reviewResult);
      state.lists.mistakes = uniqByWord(mistakesResult);
    }

    function getActiveList() {
      return state.lists[state.currentListKey] || [];
    }

    function isCycleList(listKey) {
      return listKey === 'review' || listKey === 'mistakes';
    }

    function getCycleLabel(listKey) {
      return listKey === 'review' ? '重点背诵表' : '错词总表';
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
      alert(`${getCycleLabel(listKey)}已经完整过了 ${nextPass} 遍。`);
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
      els.currentListName.textContent = LIST_CONFIG[state.currentListKey].name;
      els.totalCount.textContent = String(list.length);
      els.remainingCount.textContent = String(remaining.length);
      els.reviewCount.textContent = String(state.lists.review.length);
      els.mistakesCount.textContent = String(state.lists.mistakes.length);
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
        const currentRound = (state.cycle.pass || 0) + 1;
        const position = Math.min((state.cycle.index || 0) + 1, total || 1);
        els.statusText.textContent = `第 ${currentRound} 轮 · 第 ${position} / ${total} 个`;
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
      const buttons = [...els.optionsContainer.querySelectorAll('button')];
      buttons.forEach(b => {
        if (b.textContent === q.correct) b.classList.add('correct');
        if (b === btn && !correct) b.classList.add('wrong');
        b.disabled = true;
      });
      if (!correct) {
        addToReview(q.item);
        addToMistakes(q.item);
      }
      markSeen(q.item);
      els.statusText.textContent = correct ? '答对了，正在自动切换到下一个。' : '答错了，已自动加入重点背诵和错词总表。';
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
      addToReview(q.item);
      addToMistakes(q.item);
      markSeen(q.item);
      [...els.optionsContainer.querySelectorAll('button')].forEach(b => {
        if (b.textContent === q.correct) b.classList.add('correct');
        b.disabled = true;
      });
      els.statusText.textContent = '已加入重点背诵和错词总表。';
      updateReviewButton();
      updateMeta();
    }

    function handleEasy() {
      const q = state.currentQuestion;
      if (!q || state.answered) return;
      state.answered = true;
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

    function toggleReviewCurrent() {
      const item = state.currentQuestion && state.currentQuestion.item;
      if (!item) return;
      if (isInReview(item.word)) {
        removeFromReview(item.word);
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
        if (!state.cycle.active || !state.cycle.queue.length) {
          ensureCycleState(listKey);
        }
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
        if (state.currentListKey === 'review' || state.currentListKey === 'mistakes') {
          alert('循环词表不记录已看过进度，不需要重置。');
          return;
        }
        clearSeen(state.currentListKey);
        switchList(state.currentListKey);
      });
      els.clearReviewBtn.addEventListener('click', () => {
        if (!confirm('确定清空重点背诵表吗？')) return;
        saveReviewSet(new Set());
        const cycles = getCycles();
        cycles.review = 0;
        saveCycles(cycles);
        refreshReviewList();
        if (state.currentListKey === 'review') switchList('review');
        else updateMeta();
      });
      els.clearMistakesBtn.addEventListener('click', () => {
        if (!confirm('确定清空错词总表吗？')) return;
        saveMistakesSet(new Set());
        const cycles = getCycles();
        cycles.mistakes = 0;
        saveCycles(cycles);
        refreshReviewList();
        if (state.currentListKey === 'mistakes') switchList('mistakes');
        else updateMeta();
      });
      els.idkBtn.addEventListener('click', handleIdk);
      els.easyBtn.addEventListener('click', handleEasy);
      els.toggleReviewBtn.addEventListener('click', toggleReviewCurrent);
      els.nextBtn.addEventListener('click', nextQuestion);
      els.prevBtn.addEventListener('click', prevQuestion);

      if (!state.lists.cet6.length && !state.lists.toefl.length) {
        els.wordDisplay.textContent = '词表加载失败';
        els.statusText.textContent = '没有解析出单词。';
        showEmpty();
        return;
      }

      switchList('cet6');
    }

    init();
