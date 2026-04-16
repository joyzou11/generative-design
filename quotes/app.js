const app = document.getElementById('app');
const canvasLayer = document.getElementById('canvas');
const quoteInput = document.getElementById('quoteInput');
const authorInput = document.getElementById('authorInput');
const send = document.getElementById('send');
const zoomToggle = document.getElementById('zoomToggle');
const zoomStateLabel = document.getElementById('zoomStateLabel');
const SUPABASE_URL = (window.__SUPABASE_URL__ || '').trim();
const SUPABASE_ANON_KEY = (window.__SUPABASE_ANON_KEY__ || '').trim();
const SUPABASE_TABLE = 'quotes';
const supabase =
  window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const FONT_SIZE = 40;
const FONT_WEIGHT = 700;
const FONT_FAMILY = 'Helvetica, Arial, sans-serif';
const LINE_HEIGHT = 1.08;
const CARD_PADDING = 16;
const AUTHOR_SPACE = 22;
const MIN_SIDE = 140;
const MAX_SIDE = 620;

const colorPairs = [
  { bg: '#9EC4D9', fg: '#8E2725' },
  { bg: '#58A6E1', fg: '#99F05C' },
  { bg: '#F43A2A', fg: '#FFF4EF' },
  { bg: '#CDE344', fg: '#6A1F22' },
  { bg: '#E9EDF2', fg: '#113A69' },
  { bg: '#202A44', fg: '#DCEB5B' },
  { bg: '#FFB703', fg: '#2D1E2F' },
  { bg: '#2A9D8F', fg: '#FFECD1' },
  { bg: '#8338EC', fg: '#E2F86A' },
  { bg: '#FB5607', fg: '#D3F8E2' },
  { bg: '#3A86FF', fg: '#FFBE0B' },
  { bg: '#FF006E', fg: '#E0FBFC' },
  { bg: '#00B4D8', fg: '#2B2D42' },
  { bg: '#E63946', fg: '#F1FAEE' },
  { bg: '#8AC926', fg: '#2C2C54' },
  { bg: '#6A4C93', fg: '#F9C74F' },
  { bg: '#4D908E', fg: '#F94144' },
  { bg: '#90BE6D', fg: '#3D405B' },
  { bg: '#F9844A', fg: '#1D3557' },
  { bg: '#577590', fg: '#F3722C' }
];

const cards = [];
let nextId = 1;
let zoomEnabled = true;
let hasShownSyncWarning = false;

const camera = {
  x: 0,
  y: 0,
  z: -1500,
  zoom: 1
};
const projection = {
  focalLength: 760
};
const depthConfig = {
  nearZ: 3600,
  farZ: -900
};

let panState = null;
let dragState = null;

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');
measureCtx.font = `${FONT_WEIGHT} ${FONT_SIZE}px ${FONT_FAMILY}`;

function randomPair() {
  return colorPairs[Math.floor(Math.random() * colorPairs.length)];
}

function worldToScreen(x, y, z) {
  const dz = z - camera.z;
  if (dz <= 40) {
    return null;
  }

  const perspective = (projection.focalLength / dz) * camera.zoom;
  return {
    x: (x - camera.x) * perspective + window.innerWidth / 2,
    y: (y - camera.y) * perspective + window.innerHeight / 2,
    scale: perspective,
    depth: dz
  };
}

function screenToWorldAtZ(x, y, z) {
  const dz = z - camera.z;
  const perspective = (projection.focalLength / dz) * camera.zoom;
  return {
    x: (x - window.innerWidth / 2) / perspective + camera.x,
    y: (y - window.innerHeight / 2) / perspective + camera.y
  };
}

function wrapTextToWidth(text, maxWidth) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return wrapChars(text.trim(), maxWidth);
  }

  const lines = [];
  let current = '';

  for (const word of words) {
    const proposal = current ? `${current} ${word}` : word;
    if (measureCtx.measureText(proposal).width <= maxWidth) {
      current = proposal;
      continue;
    }

    if (!current) {
      lines.push(...wrapChars(word, maxWidth));
    } else {
      lines.push(current);
      if (measureCtx.measureText(word).width <= maxWidth) {
        current = word;
      } else {
        const chunked = wrapChars(word, maxWidth);
        current = chunked.pop() || '';
        lines.push(...chunked);
      }
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : wrapChars(text.trim(), maxWidth);
}

function wrapChars(text, maxWidth) {
  const lines = [];
  const chars = Array.from(text.trim());
  let line = '';

  for (const char of chars) {
    const proposal = line + char;
    if (!line || measureCtx.measureText(proposal).width <= maxWidth) {
      line = proposal;
    } else {
      lines.push(line);
      line = char;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function computeCardLayout(rawText) {
  const text = rawText.trim();
  let side = Math.max(MIN_SIDE, Math.min(MAX_SIDE, 160 + Math.sqrt(text.length) * 62));

  const lineHeightPx = FONT_SIZE * LINE_HEIGHT;

  for (let i = 0; i < 24; i += 1) {
    const maxTextWidth = Math.max(20, side - CARD_PADDING * 2);
    const lines = wrapTextToWidth(text, maxTextWidth);
    const maxLineWidth = lines.reduce((max, line) => Math.max(max, measureCtx.measureText(line).width), 0);
    const textHeight = lines.length * lineHeightPx;

    const needsWidth = maxLineWidth + CARD_PADDING * 2;
    const needsHeight = textHeight + CARD_PADDING * 2 + AUTHOR_SPACE;
    const required = Math.max(MIN_SIDE, needsWidth, needsHeight);

    if (required <= side + 0.5 || side >= MAX_SIDE) {
      return {
        side: Math.min(MAX_SIDE, Math.ceil(Math.max(side, required))),
        lines
      };
    }

    side = Math.min(MAX_SIDE, required + 2);
  }

  const finalMaxTextWidth = Math.max(20, side - CARD_PADDING * 2);
  return {
    side: Math.ceil(side),
    lines: wrapTextToWidth(text, finalMaxTextWidth)
  };
}

function render() {
  const frag = document.createDocumentFragment();

  const drawList = [...cards].sort((a, b) => a.z - b.z);
  for (const card of drawList) {
    const screen = worldToScreen(card.x, card.y, card.z);
    if (!screen) continue;

    const blurPx = clamp((screen.depth - 900) / 950, 0, 2.8);
    const shadowY = Math.round(clamp(6 + screen.scale * 11, 6, 24));
    const shadowBlur = Math.round(clamp(14 + screen.scale * 32, 14, 44));

    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.dataset.id = String(card.id);
    cardEl.style.width = `${card.size}px`;
    cardEl.style.height = `${card.size}px`;
    cardEl.style.background = card.bg;
    cardEl.style.color = card.fg;
    cardEl.style.opacity = '1';
    cardEl.style.filter = blurPx > 0 ? `blur(${blurPx.toFixed(2)}px)` : 'none';
    cardEl.style.boxShadow = `0 ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, 0.14)`;
    cardEl.style.transform = `translate(${screen.x}px, ${screen.y}px) scale(${screen.scale})`;

    cardEl.textContent = card.lines.join('\n');

    const q1 = document.createElement('span');
    q1.className = 'quote left';
    q1.textContent = '“';
    q1.style.color = card.fg;

    const q2 = document.createElement('span');
    q2.className = 'quote right';
    q2.textContent = '”';
    q2.style.color = card.fg;

    if (card.author) {
      const authorEl = document.createElement('span');
      authorEl.className = 'card-author';
      authorEl.textContent = `by ${card.author}`;
      authorEl.style.color = card.fg;
      cardEl.appendChild(authorEl);
    }

    cardEl.appendChild(q1);
    cardEl.appendChild(q2);
    frag.appendChild(cardEl);
  }

  canvasLayer.replaceChildren(frag);
}

async function saveQuoteToSupabase(text, author) {
  if (!supabase) return;
  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), ms);
      })
    ]);

  const { error } = await withTimeout(
    supabase.from(SUPABASE_TABLE).insert([
      {
        text,
        author: author || null
      }
    ]),
    4000
  );

  if (error) {
    throw new Error(error.message);
  }
}

function addCardToCanvas(text, author) {
  const layout = computeCardLayout(text);
  const pair = randomPair();

  // Spawn cards across depth layers to emphasize 3D space.
  const z = Math.round(depthConfig.farZ + Math.random() * (depthConfig.nearZ - depthConfig.farZ));
  const centerWorld = screenToWorldAtZ(window.innerWidth / 2, window.innerHeight / 2, z);
  const depthSpread = clamp((z - depthConfig.farZ) / (depthConfig.nearZ - depthConfig.farZ), 0.2, 1);
  const jitterX = (Math.random() - 0.5) * (320 + depthSpread * 380);
  const jitterY = (Math.random() - 0.5) * (240 + depthSpread * 300);

  cards.push({
    id: nextId++,
    text,
    author,
    lines: layout.lines,
    size: layout.side,
    bg: pair.bg,
    fg: pair.fg,
    z,
    x: centerWorld.x + jitterX - layout.side / 2,
    y: centerWorld.y + jitterY - layout.side / 2
  });

  render();
}

function addCard() {
  const value = quoteInput.value.trim();
  if (!value) return;
  const author = authorInput.value.trim();

  // Optimistic UI: always add locally first.
  addCardToCanvas(value, author);

  if (supabase) {
    saveQuoteToSupabase(value, author).catch((error) => {
      if (!hasShownSyncWarning) {
        hasShownSyncWarning = true;
        alert(`Supabase sync failed, saved locally only: ${error.message}`);
      }
    });
  }

  quoteInput.value = '';
  authorInput.value = '';
}

async function loadQuotesFromSupabase() {
  if (!supabase) {
    return false;
  }

  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), ms);
      })
    ]);

  try {
    const { data, error } = await withTimeout(
      supabase
        .from(SUPABASE_TABLE)
        .select('text, author, created_at')
        .order('created_at', { ascending: false })
        .limit(120),
      4000
    );

    if (error) {
      console.error('Failed to load quotes from Supabase:', error.message);
      return false;
    }

    if (!data || data.length === 0) {
      return false;
    }

    const ordered = [...data].reverse();
    ordered.forEach((item, index) => {
      if (!item.text) return;
      addSeedCard(
        {
          text: item.text,
          author: item.author || ''
        },
        index
      );
    });
    render();
    return true;
  } catch (error) {
    console.error('Supabase request crashed, using fallback quotes:', error);
    return false;
  }
}

const seedSlots = [
  { x: 0.03, y: 0.20, z: 640 },
  { x: 0.20, y: 0.10, z: 1050 },
  { x: 0.37, y: 0.14, z: 420 },
  { x: 0.56, y: 0.11, z: 1480 },
  { x: 0.74, y: 0.16, z: 520 },
  { x: 0.93, y: 0.24, z: 980 },
  { x: 0.08, y: 0.37, z: 260 },
  { x: 0.25, y: 0.33, z: 1280 },
  { x: 0.44, y: 0.30, z: 360 },
  { x: 0.64, y: 0.36, z: 1140 },
  { x: 0.86, y: 0.40, z: 240 },
  { x: 0.12, y: 0.55, z: 620 },
  { x: 0.31, y: 0.53, z: 200 },
  { x: 0.51, y: 0.50, z: 1720 },
  { x: 0.71, y: 0.57, z: 460 },
  { x: 0.92, y: 0.62, z: 990 },
  { x: 0.05, y: 0.78, z: 280 },
  { x: 0.22, y: 0.84, z: 860 },
  { x: 0.42, y: 0.80, z: 420 },
  { x: 0.63, y: 0.88, z: 1220 }
];

function addSeedCard(item, index) {
  const layout = computeCardLayout(item.text);
  const pair = randomPair();
  const slot = seedSlots[index % seedSlots.length];
  let z = slot.z + Math.round((Math.random() - 0.5) * 520);
  z = clamp(z, depthConfig.farZ + 140, depthConfig.nearZ - 120);
  let world = screenToWorldAtZ(window.innerWidth * slot.x, window.innerHeight * slot.y, z);

  for (let attempt = 0; attempt < 26; attempt += 1) {
    const depthSpread = clamp((z - depthConfig.farZ) / (depthConfig.nearZ - depthConfig.farZ), 0.28, 1);
    const rx = clamp(window.innerWidth * slot.x + (Math.random() - 0.5) * (90 + depthSpread * 260), 20, window.innerWidth - 20);
    const ry = clamp(window.innerHeight * slot.y + (Math.random() - 0.5) * (80 + depthSpread * 220), 20, window.innerHeight - 20);
    const candidate = screenToWorldAtZ(rx, ry, z);
    const a = worldToScreen(candidate.x, candidate.y, z);
    if (!a) continue;
    const conflict = cards.some((card) => {
      const b = worldToScreen(card.x, card.y, card.z);
      if (!b) return false;
      const minDist = (layout.side * a.scale + card.size * b.scale) * 0.34;
      return Math.hypot(a.x - b.x, a.y - b.y) < minDist;
    });
    if (!conflict) {
      world = candidate;
      break;
    }
  }

  cards.push({
    id: nextId++,
    text: item.text,
    author: item.author,
    lines: layout.lines,
    size: layout.side,
    bg: pair.bg,
    fg: pair.fg,
    z,
    x: world.x - layout.side / 2,
    y: world.y - layout.side / 2
  });
}

function updateZoomUI() {
  zoomToggle.classList.toggle('on', zoomEnabled);
  zoomToggle.setAttribute('aria-checked', String(zoomEnabled));
  zoomStateLabel.textContent = `Scroll to zoom ${zoomEnabled ? 'ON' : 'OFF'}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function zoomAt(clientX, clientY, deltaY) {
  const before = screenToWorldAtZ(clientX, clientY, 0);
  const nextZ = clamp(camera.z - deltaY * 2.8, -9000, 1700);
  if (nextZ === camera.z) return;

  camera.z = nextZ;
  const after = screenToWorldAtZ(clientX, clientY, 0);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

send.addEventListener('click', addCard);
quoteInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addCard();
  }
});
authorInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addCard();
  }
});
zoomToggle.addEventListener('click', () => {
  zoomEnabled = !zoomEnabled;
  updateZoomUI();
});
app.addEventListener(
  'wheel',
  (event) => {
    if (!zoomEnabled) return;
    if (event.target.closest('.composer') || event.target.closest('.zoom-control')) return;
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY);
    render();
  },
  { passive: false }
);

app.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.composer') || event.target.closest('.zoom-control')) {
    return;
  }

  const cardEl = event.target.closest('.card');

  if (cardEl) {
    const id = Number(cardEl.dataset.id);
    const card = cards.find((item) => item.id === id);
    if (!card) return;

    const pointerWorld = screenToWorldAtZ(event.clientX, event.clientY, card.z);
    dragState = {
      id,
      z: card.z,
      offsetX: pointerWorld.x - card.x,
      offsetY: pointerWorld.y - card.y
    };

    const idx = cards.indexOf(card);
    if (idx >= 0) {
      cards.splice(idx, 1);
      cards.push(card);
    }

    app.setPointerCapture(event.pointerId);
    render();
    return;
  }

  panState = {
    startX: event.clientX,
    startY: event.clientY,
    cameraX: camera.x,
    cameraY: camera.y
  };
  app.classList.add('panning');
  app.setPointerCapture(event.pointerId);
});

app.addEventListener('pointermove', (event) => {
  if (dragState) {
    const card = cards.find((item) => item.id === dragState.id);
    if (!card) return;

    const pointerWorld = screenToWorldAtZ(event.clientX, event.clientY, dragState.z);
    card.x = pointerWorld.x - dragState.offsetX;
    card.y = pointerWorld.y - dragState.offsetY;
    render();
    return;
  }

  if (panState) {
    const dz = 0 - camera.z;
    const perspective = (projection.focalLength / dz) * camera.zoom;
    camera.x = panState.cameraX - (event.clientX - panState.startX) / perspective;
    camera.y = panState.cameraY - (event.clientY - panState.startY) / perspective;
    render();
  }
});

app.addEventListener('pointerup', () => {
  dragState = null;
  panState = null;
  app.classList.remove('panning');
});

app.addEventListener('pointercancel', () => {
  dragState = null;
  panState = null;
  app.classList.remove('panning');
});

window.addEventListener('resize', render);

const fallbackQuotes = [
  { text: 'You are not a mess. You are a limited edition disaster.', author: '@unspirational' },
  { text: 'If opportunity does not knock, maybe everyone changed their number.', author: '@unspirational' },
  { text: 'Your comfort zone is a beautiful place to stay forever.', author: '@unspirational' },
  { text: 'Shoot for the moon. Miss quietly.', author: '@unspirational' },
  { text: 'Big goals, low stamina.', author: '@unspirational' },
  { text: 'Be yourself. Unless that is not working.', author: '@unspirational' },
  { text: 'The journey matters. The destination is still bills.', author: '@unspirational' },
  { text: 'Keep going. Stopping is also fine.', author: '@unspirational' },
  { text: 'Your best is enough for today and probably for tomorrow too.', author: '@unspirational' },
  { text: 'No one has it all figured out. Especially not you.', author: '@unspirational' },
  { text: 'Plan less. Panic more efficiently.', author: '@unspirational' },
  { text: 'You can be anything, but not all at once.', author: '@unspirational' },
  { text: 'Success is mostly timing and good Wi-Fi.', author: '@unspirational' },
  { text: 'Trust the process. Question the results.', author: '@unspirational' },
  { text: 'Nothing changes if nothing changes. So nap first.', author: '@unspirational' },
  { text: 'Try again. Lower your expectations this time.', author: '@unspirational' },
  { text: 'Life is short. Meetings are longer.', author: '@unspirational' },
  { text: 'Do it scared, tired, and slightly confused.', author: '@unspirational' },
  { text: 'Motivation is temporary. Deadlines are forever.', author: '@unspirational' },
  { text: 'You are doing great for someone winging everything.', author: '@unspirational' }
];

async function init() {
  quoteInput.value = '';
  authorInput.value = '';
  updateZoomUI();
  quoteInput.focus();

  const loadedFromSupabase = await loadQuotesFromSupabase();
  if (!loadedFromSupabase) {
    fallbackQuotes.forEach((item, index) => {
      addSeedCard(item, index);
    });
    render();
  }
}

init();
