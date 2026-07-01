// Stroke paths are loaded from KanjiVG: https://kanjivg.tagaini.net
const KANJIVG_BASE_URL = 'https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji';
const KANJI_VIEWBOX = 109;

const AppState = {
  deckData: [],
  currentCardRef: null,
  navHistory: [],
  cardsView: {
    allCards: [],
    loadedCount: 0,
    batchSize: 72,
    isLoading: false,
    activeChapter: null,
    io: null,
    pendingCard: null,
  },
  scroll: {
    restoreHomeChapter: null,
  },
  quizState: {
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    config: { count: 10, scope: 'all', order: 'random' },
    active: null,
  },
  strokeCache: new Map(),
};

const Router = {
  parseHash() {
    const hash = window.location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    return { path: hash, parts };
  },
  navigate(path) {
    const current = window.location.hash.slice(1) || '/';
    if (current !== path) AppState.navHistory.push(current);
    window.location.hash = path;
  },
  handleRoute() {
    const { parts } = this.parseHash();
    if (!AppState.deckData.length) return;

    if (parts.length === 0) {
      renderHome();
      showScreen('home');
      restoreHomeScroll();
      return;
    }

    if (parts[0] === 'chapter' && parts[1]) {
      const chapterIndex = Number.parseInt(parts[1], 10);
      if (parts[2] === 'card' && parts[3]) {
        AppState.cardsView.pendingCard = { chapterIndex, cardIndex: Number.parseInt(parts[3], 10) };
      }
      showCardsView(chapterIndex);
      return;
    }

    if (parts[0] === 'view' && parts[1] === 'all') {
      showCardsView(null);
      return;
    }

    if (parts[0] === 'quiz') {
      if (parts[1] === 'config') {
        AppState.quizState.config.scope = parts[2] === 'chapter' && parts[3] ? Number.parseInt(parts[3], 10) : 'all';
        showQuizConfig();
        return;
      }
      if (parts[1] === 'active') {
        showScreen('quiz');
        updateHeader('Quiz', true);
        return;
      }
      if (parts[1] === 'results') {
        renderQuizResults();
        return;
      }
    }

    this.navigate('/');
  },
};

async function init() {
  setupEventHandlers();
  showLoading();
  try {
    AppState.deckData = await loadKdltDeck();
    sortDeckChapters(AppState.deckData);
    normalizeDeckUrls(AppState.deckData);
    Router.handleRoute();
  } catch (error) {
    showLoadError(error);
  }
}

async function loadKdltDeck() {
  const urls = ['./KDLT.json'];
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const deck = await response.json();
      if (!Array.isArray(deck)) throw new Error('Format KDLT invalide');
      return deck;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('KDLT.json introuvable');
}

function sortDeckChapters(deck) {
  deck.sort((a, b) => getChapterNumber(a.chapter) - getChapterNumber(b.chapter));
}

function getChapterNumber(title) {
  const match = String(title || '').match(/chapitre\s+(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function normalizeDeckUrls(deck) {
  deck.forEach((chapter, chapterIndex) => {
    (chapter.cards || []).forEach((card, cardIndex) => {
      card.url = `#/chapter/${chapterIndex}/card/${cardIndex}`;
    });
  });
}

function showLoading() {
  const home = document.getElementById('homeScreen');
  home.innerHTML = '<div class="deck-info"><h2>漢字</h2><p class="deck-stats">Chargement de KDLT...</p></div>';
  showScreen('home');
  updateHeader('漢字', false);
}

function showLoadError(error) {
  const home = document.getElementById('homeScreen');
  home.innerHTML = `
    <div class="deck-info">
      <h2>Impossible de charger KDLT.json</h2>
      <p class="deck-stats">${escapeHtml(error.message || String(error))}</p>
    </div>`;
  showScreen('home');
  updateHeader('漢字', false);
}

function renderHome() {
  const totalCards = AppState.deckData.reduce((sum, chapter) => sum + chapter.cards.length, 0);
  const home = document.getElementById('homeScreen');
  home.innerHTML = `
    <div class="deck-info home-info">
      <h2>漢字</h2>
      <p class="deck-stats">${AppState.deckData.length} chapitres - ${totalCards} cartes</p>
    </div>
    <div class="action-buttons">
      <button class="action-btn secondary" id="viewAllBtn"><span>Voir les cartes</span></button>
      <button class="action-btn secondary" id="quizAllBtn"><span>Quiz</span></button>
    </div>
    <div class="search-section">
      <input type="text" id="searchInput" class="search-input" placeholder="Chercher un kanji ou un mot-clé">
      <button type="button" id="searchClear" class="search-clear" aria-label="Effacer la recherche">x</button>
      <div id="searchResults" class="search-results" style="display:none;"></div>
    </div>
    <div class="section-header"><h3>Chapitres</h3></div>
    <div id="chapterList" class="chapter-list">
      ${AppState.deckData.map((chapter, index) => `
        <div class="chapter-item" data-chapter="${index}">
          <h4>${escapeHtml(chapter.chapter)}</h4>
          <p>${chapter.cards.length} cartes</p>
        </div>`).join('')}
    </div>`;

  updateHeader('漢字', false);
  home.querySelectorAll('.chapter-item').forEach((item) => {
    item.addEventListener('click', () => {
      AppState.scroll.restoreHomeChapter = Number.parseInt(item.dataset.chapter, 10);
      AppState.cardsView.pendingCard = null;
      Router.navigate(`/chapter/${item.dataset.chapter}`);
    });
  });
  document.getElementById('viewAllBtn').addEventListener('click', () => {
    AppState.scroll.restoreHomeChapter = null;
    AppState.cardsView.pendingCard = null;
    Router.navigate('/view/all');
  });
  document.getElementById('quizAllBtn').addEventListener('click', () => {
    AppState.scroll.restoreHomeChapter = null;
    AppState.quizState.config.scope = 'all';
    Router.navigate('/quiz/config');
  });
  setupSearch();
}

function restoreHomeScroll() {
  const chapterIndex = AppState.scroll.restoreHomeChapter;
  AppState.scroll.restoreHomeChapter = null;
  window.setTimeout(() => {
    if (Number.isInteger(chapterIndex)) {
      const item = document.querySelector(`.chapter-item[data-chapter="${chapterIndex}"]`);
      if (item) {
        item.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, 0);
}

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchClear = document.getElementById('searchClear');
  if (!searchInput || !searchResults) return;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
      searchResults.style.display = 'none';
      if (searchClear) searchClear.style.display = 'none';
      return;
    }
    if (searchClear) searchClear.style.display = 'flex';
    const results = [];
    AppState.deckData.forEach((chapter, chapterIndex) => {
      chapter.cards.forEach((card, cardIndex) => {
        if (card.front.toLowerCase().includes(query) || card.back.toLowerCase().includes(query)) {
          results.push({ chapter, chapterIndex, card, cardIndex });
        }
      });
    });
    searchResults.innerHTML = results.length
      ? results.slice(0, 60).map((result) => `
        <div class="search-result-item" data-chapter="${result.chapterIndex}" data-card="${result.cardIndex}">
          <div class="search-result-kanji">${escapeHtml(result.card.back)}</div>
          <div class="search-result-text">${escapeHtml(result.card.front)}</div>
          <div class="search-result-chapter">${escapeHtml(result.chapter.chapter)}</div>
        </div>`).join('')
      : '<div class="search-no-results">Aucune carte trouvée</div>';
    searchResults.style.display = 'block';
      searchResults.querySelectorAll('.search-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        AppState.scroll.restoreHomeChapter = Number.parseInt(item.dataset.chapter, 10);
        Router.navigate(`/chapter/${item.dataset.chapter}/card/${item.dataset.card}`);
      });
    });
  });

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.focus();
      searchResults.style.display = 'none';
      searchClear.style.display = 'none';
    });
  }
}

function showCardsView(chapterIndex) {
  const chapterControls = document.getElementById('chapterControls');
  const container = document.getElementById('cardsContainer');
  const isSame = AppState.cardsView.activeChapter === chapterIndex && AppState.cardsView.loadedCount > 0;

  if (chapterIndex !== null) {
    const chapter = AppState.deckData[chapterIndex];
    if (!chapter) {
      Router.navigate('/');
      return;
    }
    chapterControls.style.display = 'block';
    document.getElementById('chapterTitle').textContent = chapter.chapter;
    document.getElementById('chapterStats').textContent = `${chapter.cards.length} cartes`;
    document.querySelector('.cards-controls').style.display = 'none';
    document.getElementById('quizChapterBtn').onclick = () => Router.navigate(`/quiz/config/chapter/${chapterIndex}`);
  } else {
    chapterControls.style.display = 'none';
    document.querySelector('.cards-controls').style.display = 'flex';
  }

  if (!isSame) {
    const cards = chapterIndex === null
      ? AppState.deckData.flatMap((chapter, ci) => chapter.cards.map((card, cardIndex) => ({ chapterIndex: ci, cardIndex })))
      : AppState.deckData[chapterIndex].cards.map((card, cardIndex) => ({ chapterIndex, cardIndex }));

    AppState.cardsView.allCards = cards;
    AppState.cardsView.loadedCount = 0;
    AppState.cardsView.activeChapter = chapterIndex;
    container.innerHTML = '<div id="scrollSentinel"></div>';
    document.getElementById('cardProgress').textContent = `${cards.length} cartes`;
    loadMoreCards();
    setupInfiniteScroll();
  }

  showScreen('cards');
  updateHeader(chapterIndex === null ? 'Toutes les cartes' : AppState.deckData[chapterIndex].chapter, true);

  const pending = AppState.cardsView.pendingCard;
  if (pending && pending.chapterIndex === chapterIndex) {
    while (AppState.cardsView.loadedCount <= pending.cardIndex && AppState.cardsView.loadedCount < AppState.cardsView.allCards.length) {
      loadMoreCards();
    }
    window.setTimeout(() => {
      const card = document.querySelector(`.flashcard[data-chapter="${pending.chapterIndex}"][data-card="${pending.cardIndex}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      AppState.cardsView.pendingCard = null;
    }, 50);
  } else {
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }), 0);
  }
}

function loadMoreCards() {
  if (AppState.cardsView.isLoading) return;
  const { allCards, loadedCount, batchSize } = AppState.cardsView;
  if (loadedCount >= allCards.length) return;
  AppState.cardsView.isLoading = true;
  const container = document.getElementById('cardsContainer');
  const sentinel = document.getElementById('scrollSentinel');
  const fragment = document.createDocumentFragment();

  allCards.slice(loadedCount, loadedCount + batchSize).forEach((ref) => {
    const card = AppState.deckData[ref.chapterIndex].cards[ref.cardIndex];
    const cardDiv = document.createElement('div');
    cardDiv.className = 'flashcard';
    cardDiv.dataset.chapter = ref.chapterIndex;
    cardDiv.dataset.card = ref.cardIndex;
    cardDiv.innerHTML = `
      <div class="flashcard-front">${escapeHtml(card.front)}</div>
      <div class="flashcard-back">${escapeHtml(card.back)}</div>`;
    cardDiv.addEventListener('click', () => showCardDetail(ref.chapterIndex, ref.cardIndex));
    fragment.appendChild(cardDiv);
  });

  if (sentinel) container.insertBefore(fragment, sentinel);
  else container.appendChild(fragment);
  AppState.cardsView.loadedCount += Math.min(batchSize, allCards.length - loadedCount);
  AppState.cardsView.isLoading = false;
}

function setupInfiniteScroll() {
  if (AppState.cardsView.io) AppState.cardsView.io.disconnect();
  const sentinel = document.getElementById('scrollSentinel');
  if (!sentinel) return;
  AppState.cardsView.io = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMoreCards();
  }, { rootMargin: '700px' });
  AppState.cardsView.io.observe(sentinel);
}

function freeCardsView() {
  if (AppState.cardsView.io) AppState.cardsView.io.disconnect();
  AppState.cardsView.io = null;
}

function showCardDetail(chapterIndex, cardIndex) {
  const card = AppState.deckData[chapterIndex].cards[cardIndex];
  const detail = document.getElementById('detailCard');
  detail.querySelector('.card-detail-front').textContent = card.front;
  detail.querySelector('.card-detail-back').textContent = card.back;
  document.getElementById('cardDetailScreen').style.display = 'flex';
}

function showQuizConfig() {
  const scope = AppState.quizState.config.scope;
  const cards = getCardsForScope(scope);
  document.getElementById('quizConfigTitle').textContent = scope === 'all' ? 'Quiz - Toutes les cartes' : `Quiz - ${AppState.deckData[scope].chapter}`;
  document.getElementById('questionCount').max = cards.length;
  document.getElementById('quickMaxBtn').textContent = String(cards.length);
  document.getElementById('questionCount').value = Math.min(AppState.quizState.config.count, cards.length);
  document.getElementById('orderRandomBtn').classList.toggle('active', AppState.quizState.config.order === 'random');
  document.getElementById('orderSequentialBtn').classList.toggle('active', AppState.quizState.config.order === 'sequential');
  showScreen('quizConfig');
  updateHeader('Configuration', true);
}

function getCardsForScope(scope) {
  if (scope === 'all') return AppState.deckData.flatMap((chapter) => chapter.cards);
  const chapter = AppState.deckData[scope];
  return chapter ? chapter.cards : [];
}

function startQuiz() {
  const input = document.getElementById('questionCount');
  const cards = getCardsForScope(AppState.quizState.config.scope).filter((card) => getSingleKanji(card.back));
  const requested = Number.parseInt(input.value, 10) || AppState.quizState.config.count;
  const count = Math.max(1, Math.min(requested, cards.length));
  const selected = AppState.quizState.config.order === 'random'
    ? [...cards].sort(() => Math.random() - 0.5).slice(0, count)
    : cards.slice(0, count);

  AppState.quizState.questions = selected;
  AppState.quizState.currentQuestionIndex = 0;
  AppState.quizState.answers = [];
  AppState.quizState.config.count = count;
  Router.navigate('/quiz/active');
  renderQuizQuestion();
}

async function renderQuizQuestion() {
  const { questions, currentQuestionIndex, answers } = AppState.quizState;
  const question = questions[currentQuestionIndex];
  if (!question) {
    Router.navigate('/quiz/results');
    renderQuizResults();
    return;
  }

  const correctCount = answers.filter((answer) => answer.correct).length;
  document.getElementById('quizProgress').textContent = `Question ${currentQuestionIndex + 1} / ${questions.length}`;
  document.getElementById('quizProgressBar').style.width = `${(currentQuestionIndex / questions.length) * 100}%`;
  document.getElementById('quizScore').textContent = `${correctCount} / ${answers.length}`;
  document.getElementById('quizPrompt').textContent = question.front;
  document.getElementById('quizAnswer').textContent = question.back;
  document.getElementById('quizAnswer').style.display = 'none';
  document.getElementById('quizFeedback').textContent = '';
  document.getElementById('showAnswerBtn').style.display = 'block';
  document.getElementById('nextQuestionBtn').style.display = 'none';

  showScreen('quiz');
  updateHeader(`Quiz ${currentQuestionIndex + 1}/${questions.length}`, true);

  const kanji = getSingleKanji(question.back);
  const active = createQuizDrawingState(question, kanji);
  AppState.quizState.active = active;
  setupDrawingCanvas(active);

  try {
    active.strokeData = await loadStrokeData(kanji);
    active.status = 'ready';
    updateQuizStrokeProgress(active);
  } catch (error) {
    active.status = 'error';
    document.getElementById('quizFeedback').textContent = '';
    console.error('KanjiVG load error:', error);
  }
  redrawQuizCanvas();
}

function createQuizDrawingState(card, kanji) {
  return {
    card,
    kanji,
    strokeData: null,
    currentStrokeIndex: 0,
    wrongAttempts: 0,
    showHint: false,
    isDrawing: false,
    points: [],
    status: 'loading',
    revealed: false,
    completed: false,
  };
}

async function loadStrokeData(kanji) {
  if (AppState.strokeCache.has(kanji)) return AppState.strokeCache.get(kanji);
  const code = kanji.codePointAt(0).toString(16).padStart(5, '0');
  const response = await fetch(`${KANJIVG_BASE_URL}/${code}.svg`);
  if (!response.ok) throw new Error(`KanjiVG ${response.status}`);
  const text = await response.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const strokes = [...doc.querySelectorAll('path[d]')].map((path, index) => ({
    d: path.getAttribute('d'),
    number: index + 1,
  }));
  if (!strokes.length) throw new Error('Aucun trait trouvé');

  const data = { kanji, strokes };
  AppState.strokeCache.set(kanji, data);
  return data;
}

function setupDrawingCanvas(active) {
  const canvas = document.getElementById('writingCanvas');
  const ctx = canvas.getContext('2d');
  const size = Math.floor(canvas.getBoundingClientRect().width * window.devicePixelRatio);
  canvas.width = size;
  canvas.height = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  canvas.onpointerdown = (event) => {
    if (active.status !== 'ready' || active.revealed || active.completed) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    active.isDrawing = true;
    active.points = [eventToKanjiPoint(event, canvas)];
    redrawQuizCanvas();
  };
  canvas.onpointermove = (event) => {
    if (!active.isDrawing) return;
    event.preventDefault();
    active.points.push(eventToKanjiPoint(event, canvas));
    redrawQuizCanvas();
  };
  canvas.onpointerup = (event) => finishStroke(event, canvas, active);
  canvas.onpointercancel = (event) => finishStroke(event, canvas, active);
  redrawQuizCanvas();
}

function eventToKanjiPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * KANJI_VIEWBOX,
    y: ((event.clientY - rect.top) / rect.height) * KANJI_VIEWBOX,
  };
}

function finishStroke(event, canvas, active) {
  if (!active.isDrawing) return;
  event.preventDefault();
  active.points.push(eventToKanjiPoint(event, canvas));
  active.isDrawing = false;
  canvas.releasePointerCapture(event.pointerId);
  const isValid = validateDrawnStroke(active);
  if (isValid) {
    active.currentStrokeIndex += 1;
    active.wrongAttempts = 0;
    active.showHint = false;
    active.points = [];
    if (active.currentStrokeIndex >= active.strokeData.strokes.length) {
      active.completed = true;
      updateQuizStrokeProgress(active);
      document.getElementById('showAnswerBtn').style.display = 'none';
      document.getElementById('nextQuestionBtn').style.display = 'block';
      redrawQuizCanvas();
      return;
    }
    updateQuizStrokeProgress(active);
  } else {
    active.wrongAttempts += 1;
    active.showHint = active.wrongAttempts >= 3;
    active.points = [];
    updateQuizStrokeProgress(active);
  }
  redrawQuizCanvas();
}

function updateQuizStrokeProgress(active) {
  if (!active || !active.strokeData) {
    document.getElementById('quizFeedback').textContent = '';
    return;
  }
  const current = Math.min(active.currentStrokeIndex + 1, active.strokeData.strokes.length);
  document.getElementById('quizFeedback').textContent = `Trait ${current} / ${active.strokeData.strokes.length}`;
}

function validateDrawnStroke(active) {
  if (!active.strokeData || active.points.length < 2) return false;
  const targetStroke = active.strokeData.strokes[active.currentStrokeIndex];
  const drawn = normalizeBounds(getPointBounds(active.points));
  const target = getStrokeBounds(targetStroke.d);
  const pixelScore = getStrokeMatchScore(active.points, targetStroke.d);
  const centerDistance = distance(drawn.center, target.center);
  const sizeRatio = Math.min(drawn.diagonal, target.diagonal) / Math.max(drawn.diagonal, target.diagonal);
  const overlap = rectOverlapRatio(drawn, target);
  const directionOk = validateStrokeDirection(active.points, targetStroke.d);
  const shapeOk = validateStrokeShape(drawn, target);
  return directionOk && shapeOk && (
    pixelScore.coverage > 0.3 ||
    (centerDistance < 30 && sizeRatio > 0.28 && overlap > 0.06 && pixelScore.hitRatio > 0.22)
  );
}

function validateStrokeShape(drawn, target) {
  const drawnAspect = drawn.width / drawn.height;
  const targetAspect = target.width / target.height;
  const aspectSimilarity = Math.min(drawnAspect, targetAspect) / Math.max(drawnAspect, targetAspect);
  const drawnAxis = Math.abs(drawn.width - drawn.height) / Math.max(drawn.width, drawn.height);
  const targetAxis = Math.abs(target.width - target.height) / Math.max(target.width, target.height);
  const axisDifference = Math.abs(drawnAxis - targetAxis);
  return aspectSimilarity > 0.28 || axisDifference < 0.34;
}

function getStrokeMatchScore(points, d) {
  const canvas = document.getElementById('measureCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const scale = canvas.width / KANJI_VIEWBOX;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 10;
  ctx.stroke(new Path2D(d));
  ctx.restore();
  const targetData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
  ctx.restore();
  const drawnData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let targetPixels = 0;
  let drawnPixels = 0;
  let intersection = 0;
  for (let i = 3; i < targetData.length; i += 4) {
    const hasTarget = targetData[i] > 0;
    const hasDrawn = drawnData[i] > 0;
    if (hasTarget) targetPixels += 1;
    if (hasDrawn) drawnPixels += 1;
    if (hasTarget && hasDrawn) intersection += 1;
  }
  return {
    coverage: targetPixels ? intersection / targetPixels : 0,
    hitRatio: drawnPixels ? intersection / drawnPixels : 0,
  };
}

function getStrokeBounds(d) {
  const canvas = document.getElementById('measureCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const scale = canvas.width / KANJI_VIEWBOX;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.stroke(new Path2D(d));
  ctx.restore();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
        minX = Math.min(minX, x / scale);
        minY = Math.min(minY, y / scale);
        maxX = Math.max(maxX, x / scale);
        maxY = Math.max(maxY, y / scale);
      }
    }
  }
  return normalizeBounds({ minX, minY, maxX, maxY });
}

function getPointBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function normalizeBounds(bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  return {
    ...bounds,
    width,
    height,
    diagonal: Math.hypot(width, height),
    center: { x: bounds.minX + width / 2, y: bounds.minY + height / 2 },
  };
}

function validateStrokeDirection(points, d) {
  const drawnVector = {
    x: points[points.length - 1].x - points[0].x,
    y: points[points.length - 1].y - points[0].y,
  };
  const targetVector = getPathDirection(d);
  const drawnLength = Math.hypot(drawnVector.x, drawnVector.y);
  const targetLength = Math.hypot(targetVector.x, targetVector.y);
  if (drawnLength < 8 || targetLength < 6) return true;
  const dot = (drawnVector.x * targetVector.x + drawnVector.y * targetVector.y) / (drawnLength * targetLength);
  return dot > 0.28;
}

function getPathDirection(d) {
  const svg = document.getElementById('measureSvg');
  svg.innerHTML = `<path id="measurePath" d="${escapeAttribute(d)}"></path>`;
  const path = document.getElementById('measurePath');
  const length = path.getTotalLength();
  const start = path.getPointAtLength(Math.min(2, length));
  const end = path.getPointAtLength(Math.max(0, length - 2));
  return { x: end.x - start.x, y: end.y - start.y };
}

function rectOverlapRatio(a, b) {
  const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const overlapY = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const overlapArea = overlapX * overlapY;
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 ? overlapArea / smallerArea : 0;
}

function redrawQuizCanvas() {
  const canvas = document.getElementById('writingCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ratio = canvas.width / KANJI_VIEWBOX;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, canvas.width, canvas.height);
  const active = AppState.quizState.active;
  if (!active || !active.strokeData) return;

  ctx.save();
  ctx.scale(ratio, ratio);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4.2;

  active.strokeData.strokes.slice(0, active.currentStrokeIndex).forEach((stroke) => {
    ctx.strokeStyle = '#1d1d1f';
    ctx.stroke(new Path2D(stroke.d));
  });

  if (active.showHint || active.revealed) {
    const remaining = active.revealed
      ? active.strokeData.strokes.slice(active.currentStrokeIndex)
      : [active.strokeData.strokes[active.currentStrokeIndex]];
    remaining.forEach((stroke) => {
      ctx.strokeStyle = active.revealed ? 'rgba(0, 122, 255, 0.85)' : 'rgba(255, 149, 0, 0.95)';
      ctx.lineWidth = active.revealed ? 3.4 : 5.4;
      ctx.stroke(new Path2D(stroke.d));
    });
    ctx.lineWidth = 4.2;
  }

  if (active.points.length > 1) {
    ctx.strokeStyle = '#007aff';
    ctx.lineWidth = 4.8;
    ctx.beginPath();
    ctx.moveTo(active.points[0].x, active.points[0].y);
    active.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  }
  ctx.restore();
}

function drawGrid(ctx, width, height) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#e8e8ed';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.moveTo(0, 0);
  ctx.lineTo(width, height);
  ctx.moveTo(width, 0);
  ctx.lineTo(0, height);
  ctx.stroke();
}

function revealQuizAnswer() {
  const active = AppState.quizState.active;
  if (!active) return;
  active.revealed = true;
  active.showHint = true;
  document.getElementById('quizAnswer').style.display = 'block';
  document.getElementById('showAnswerBtn').style.display = 'none';
  document.getElementById('nextQuestionBtn').style.display = 'block';
  redrawQuizCanvas();
}

function submitQuizAnswer(isCorrect) {
  AppState.quizState.answers.push({ correct: isCorrect });
  AppState.quizState.currentQuestionIndex += 1;
  renderQuizQuestion();
}

function goToNextQuestion() {
  const active = AppState.quizState.active;
  submitQuizAnswer(Boolean(active && active.completed));
}

function renderQuizResults() {
  const answers = AppState.quizState.answers;
  const correct = answers.filter((answer) => answer.correct).length;
  document.getElementById('correctCount').textContent = correct;
  document.getElementById('incorrectCount').textContent = answers.length - correct;
  document.getElementById('quizProgressBar').style.width = '100%';
  showScreen('quizResults');
  updateHeader('Résultats', false);
}

function getSingleKanji(value) {
  const match = String(value || '').match(/\p{Script=Han}/u);
  return match ? match[0] : null;
}

function showScreen(name) {
  const map = {
    home: 'homeScreen',
    cards: 'cardsScreen',
    cardDetail: 'cardDetailScreen',
    quizConfig: 'quizConfigScreen',
    quiz: 'quizScreen',
    quizResults: 'quizResultsScreen',
  };
  Object.values(map).forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.style.display = id === map[name] ? 'block' : 'none';
  });
  if (name !== 'cards') freeCardsView();
}

function updateHeader(title, showBack) {
  document.getElementById('headerTitle').textContent = title;
  const backBtn = document.getElementById('backBtn');
  backBtn.style.display = 'flex';
  backBtn.style.visibility = showBack ? 'visible' : 'hidden';
  backBtn.disabled = !showBack;
}

function setupEventHandlers() {
  document.getElementById('backBtn').addEventListener('click', smartBack);
  document.getElementById('closeCardDetail').addEventListener('click', () => {
    document.getElementById('cardDetailScreen').style.display = 'none';
  });
  document.getElementById('cardDetailScreen').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
      document.getElementById('cardDetailScreen').style.display = 'none';
    }
  });
  document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
  document.getElementById('showAnswerBtn').addEventListener('click', revealQuizAnswer);
  document.getElementById('nextQuestionBtn').addEventListener('click', goToNextQuestion);
  document.getElementById('orderRandomBtn').addEventListener('click', () => setQuizOrder('random'));
  document.getElementById('orderSequentialBtn').addEventListener('click', () => setQuizOrder('sequential'));
  document.querySelectorAll('.quick-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById('questionCount');
      const max = Number.parseInt(input.max, 10) || 1;
      const value = button.dataset.value === 'max' ? max : Number.parseInt(button.dataset.value, 10);
      input.value = Math.min(value, max);
      AppState.quizState.config.count = Number.parseInt(input.value, 10);
    });
  });
  document.getElementById('questionCount').addEventListener('input', (event) => {
    AppState.quizState.config.count = Number.parseInt(event.target.value, 10) || 1;
  });
  window.addEventListener('hashchange', () => Router.handleRoute());
  window.addEventListener('resize', redrawQuizCanvas);
}

function setQuizOrder(order) {
  AppState.quizState.config.order = order;
  document.getElementById('orderRandomBtn').classList.toggle('active', order === 'random');
  document.getElementById('orderSequentialBtn').classList.toggle('active', order === 'sequential');
}

function smartBack() {
  if (document.getElementById('cardDetailScreen').style.display !== 'none') {
    document.getElementById('cardDetailScreen').style.display = 'none';
    return;
  }
  const { parts } = Router.parseHash();
  if (parts[0] === 'chapter' || (parts[0] === 'view' && parts[1] === 'all') || parts[0] === 'quiz') {
    if (parts[0] === 'chapter' && parts[1]) {
      AppState.scroll.restoreHomeChapter = Number.parseInt(parts[1], 10);
    } else {
      AppState.scroll.restoreHomeChapter = null;
    }
    Router.navigate('/');
  } else {
    Router.navigate('/');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, '&quot;');
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
