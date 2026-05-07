const landing = document.querySelector("#landing");
const voidField = document.querySelector("#voidField");
const chineseLine = document.querySelector("#chineseLine");
const chineseCharacters = Array.from(document.querySelectorAll(".chinese-character"));
const landingEnglish = document.querySelector("#landingEnglish");
const scrollField = document.querySelector("#scrollField");
const cursorColumn = document.querySelector("#cursorColumn");
const timeUsed = document.querySelector("#timeUsed");
const peopleHere = document.querySelector("#peopleHere");
const exitMark = document.querySelector("#exitMark");

const STORAGE_KEY = "only-you-scroll-record";
const CLIENT_KEY = "only-you-client-id";
const UNIT = 220;
const PX_PER_CM = 96 / 2.54;
const EXTEND_THRESHOLD = 1800;
const HAS_REALTIME_API = window.location.protocol.startsWith("http");
const SUPABASE_TABLE = "visitor_records";
const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {};
const HAS_SUPABASE_API = Boolean(
  SUPABASE_CONFIG.url &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.anonKey.includes("PASTE_YOUR_SUPABASE")
);

let marksBuilt = 0;
let maxDepth = 0;
let currentDepth = 0;
let startTime = Date.now();
let exitTimer = 0;
let lastSyncAt = 0;
let realtimeStats = null;
let cursorRecordDepths = [];
let landingSequenceStarted = false;
let maxVoidDelay = 0;
let targetLandingProgress = 0;
let smoothLandingProgress = 0;
let progressFrame = 0;
let lastPointerX = window.innerWidth / 2;
let lastPointerY = window.innerHeight / 2;
let previousPointerX = lastPointerX;
let previousPointerY = lastPointerY;
let supabaseStatsTimer = 0;

const clientId = getClientId();
const storedRecord = readRecord();
startTime -= storedRecord.totalSeconds * 1000;
maxDepth = storedRecord.maxDepth || 0;

function getClientId() {
  const existing = localStorage.getItem(CLIENT_KEY);

  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(CLIENT_KEY, id);
  return id;
}

function readRecord() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      totalSeconds: Number(parsed.totalSeconds) || 0,
      maxDepth: Number(parsed.maxDepth) || 0,
      visits: Number(parsed.visits) || 0,
    };
  } catch {
    return { totalSeconds: 0, maxDepth: 0, visits: 0 };
  }
}

function getTotalSeconds() {
  return Math.floor((Date.now() - startTime) / 1000);
}

function writeRecord() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      totalSeconds: getTotalSeconds(),
      maxDepth,
      visits: storedRecord.visits + 1,
      updatedAt: new Date().toISOString(),
    })
  );
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getMainScrollY() {
  return Math.max(0, window.scrollY - landing.offsetHeight);
}

function buildVoidField() {
  const isSmall = window.innerWidth <= 720;
  const columns = isSmall ? 7 : 12;
  const rows = isSmall ? 10 : 10;
  const centerColumn = (columns - 1) / 2;
  const centerRow = (rows - 1) / 2;
  const maxDistance = Math.hypot(centerColumn, centerRow);
  const fragment = document.createDocumentFragment();

  voidField.innerHTML = "";
  maxVoidDelay = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const char = document.createElement("span");
      const distance = Math.hypot(column - centerColumn, row - centerRow);
      const isBehindChinese = !isSmall && row >= 4 && row <= 5 && column >= 3 && column <= 8;
      const delay = Math.max(0, distance - 1.05) * 300;
      const finalOpacity = clamp(0.07 + (1 - distance / maxDistance) * 0.42, 0.08, 0.5);

      maxVoidDelay = Math.max(maxVoidDelay, delay);
      char.className = "void-char";
      char.textContent = "空";
      char.style.setProperty("--delay", `${delay}ms`);
      char.style.setProperty("--final-opacity", isBehindChinese ? "0" : finalOpacity.toFixed(3));
      fragment.appendChild(char);
    }
  }

  voidField.appendChild(fragment);
}

function revealChineseCharacter(character) {
  if (landingSequenceStarted) {
    return;
  }

  character.classList.add("is-revealed");

  if (chineseCharacters.every((item) => item.classList.contains("is-revealed"))) {
    startLandingSequence();
  }
}

function startLandingSequence() {
  landingSequenceStarted = true;
  chineseLine.classList.add("is-complete");

  window.setTimeout(() => {
    voidField.classList.add("is-spreading");
  }, 480);

  window.setTimeout(() => {
    chineseLine.classList.add("is-fading");
  }, maxVoidDelay + 1500);

  window.setTimeout(() => {
    voidField.classList.add("is-english");
    landingEnglish.classList.add("is-visible");
    landingEnglish.setAttribute("aria-hidden", "false");
  }, maxVoidDelay + 2550);

  window.setTimeout(() => {
    document.body.classList.remove("landing-locked");
    document.body.classList.add("landing-complete");
    updateLandingProgress();
  }, maxVoidDelay + 4050);
}

function updateLandingProgress() {
  const availableScroll = Math.max(1, landing.offsetHeight - window.innerHeight);
  targetLandingProgress = clamp(window.scrollY / availableScroll, 0, 1);

  if (!progressFrame) {
    progressFrame = window.requestAnimationFrame(animateLandingProgress);
  }
}

function animateLandingProgress() {
  smoothLandingProgress += (targetLandingProgress - smoothLandingProgress) * 0.12;

  if (Math.abs(targetLandingProgress - smoothLandingProgress) < 0.001) {
    smoothLandingProgress = targetLandingProgress;
  }

  document.documentElement.style.setProperty("--landing-progress", smoothLandingProgress.toFixed(4));

  if (document.body.classList.contains("landing-complete") && smoothLandingProgress >= 0.965) {
    landingEnglish.classList.add("is-fixed");
  }

  if (smoothLandingProgress !== targetLandingProgress) {
    progressFrame = window.requestAnimationFrame(animateLandingProgress);
  } else {
    progressFrame = 0;
  }
}

function simulatedPeopleAtDepth(depth) {
  const level = Math.max(0, Math.floor(depth / UNIT));
  const base = Math.max(1, 9842 - Math.floor(Math.pow(level, 1.42) * 37));
  const ripple = Math.abs(Math.sin(level * 12.9898) * 183) | 0;
  const personalTrace = depth <= maxDepth ? 1 : 0;

  return Math.max(1, base + ripple + personalTrace);
}

function realtimePeopleAtDepth(depth) {
  if (!realtimeStats) {
    return simulatedPeopleAtDepth(depth);
  }

  const depthLevel = Math.floor(depth / UNIT);
  const reached = realtimeStats.depthCounts
    .filter((item) => item.level >= depthLevel)
    .reduce((sum, item) => sum + item.count, 0);

  return Math.max(1, reached);
}

function renderCursorRecords() {
  const fragment = document.createDocumentFragment();
  const depths = cursorRecordDepths.length
    ? cursorRecordDepths
    : !HAS_SUPABASE_API && !realtimeStats
      ? [maxDepth].filter((depth) => depth > 0)
      : [];

  cursorColumn.innerHTML = "";

  depths.forEach((depth, index) => {
    const mark = document.createElement("span");

    mark.className = "cursor-mark";
    mark.dataset.depth = String(depth);
    mark.style.top = `${Math.max(0, depth)}px`;
    mark.style.opacity = `${Math.max(0.3, 0.82 - index * 0.025)}`;
    mark.innerHTML = '<img src="assets/vector-cursor.svg" alt="" />';
    fragment.appendChild(mark);
  });

  cursorColumn.appendChild(fragment);
}

function formatDepth(depth) {
  return `${(depth / PX_PER_CM).toFixed(1)}cm`;
}

function extendPageIfNeeded() {
  const remaining = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;

  if (remaining > EXTEND_THRESHOLD) {
    return;
  }

  const currentHeight = scrollField.offsetHeight;
  const nextHeight = currentHeight + window.innerHeight * 2.7;
  scrollField.style.minHeight = `${nextHeight}px`;
}

function updateData() {
  currentDepth = Math.max(0, Math.round(getMainScrollY() + window.innerHeight / 2));
  maxDepth = Math.max(maxDepth, currentDepth);
  timeUsed.textContent = formatDepth(currentDepth);
  peopleHere.textContent = realtimePeopleAtDepth(currentDepth).toLocaleString("en-US");
  renderCursorRecords();
}

function getSupabaseHeaders(prefer) {
  const headers = {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    "Content-Type": "application/json",
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function getSupabaseUrl(path, query = "") {
  return `${SUPABASE_CONFIG.url.replace(/\/$/, "")}/rest/v1/${path}${query}`;
}

function syncRealtime(force = false, visibleOverride) {
  if (!document.body.classList.contains("landing-complete") || window.scrollY < landing.offsetHeight - 1) {
    return;
  }

  const now = Date.now();

  if (!force && now - lastSyncAt < 650) {
    return;
  }

  lastSyncAt = now;

  if (HAS_SUPABASE_API) {
    syncSupabaseRecord(visibleOverride);
    return;
  }

  if (!HAS_REALTIME_API) {
    return;
  }

  navigator.sendBeacon?.(
    "/api/record",
    new Blob([JSON.stringify(getPayload(visibleOverride))], { type: "application/json" })
  ) || fetch("/api/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(getPayload(visibleOverride)),
    keepalive: true,
  }).catch(() => {});
}

function syncSupabaseRecord(visibleOverride) {
  const payload = getPayload(visibleOverride);

  fetch(getSupabaseUrl(`${SUPABASE_TABLE}?on_conflict=client_id`), {
    method: "POST",
    headers: getSupabaseHeaders("resolution=merge-duplicates"),
    body: JSON.stringify({
      client_id: payload.clientId,
      current_depth: payload.currentDepth,
      max_depth: payload.maxDepth,
      total_seconds: payload.totalSeconds,
      visible: payload.visible,
      updated_at: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => {});
}

function getPayload(visibleOverride) {
  return {
    clientId,
    currentDepth,
    maxDepth,
    totalSeconds: getTotalSeconds(),
    visible: typeof visibleOverride === "boolean" ? visibleOverride : !document.hidden,
  };
}

function connectRealtime() {
  if (HAS_SUPABASE_API) {
    fetchSupabaseStats();
    supabaseStatsTimer = window.setInterval(fetchSupabaseStats, 2000);
    return;
  }

  if (!HAS_REALTIME_API || !window.EventSource) {
    return;
  }

  const events = new EventSource("/api/events");

  events.addEventListener("stats", (event) => {
    realtimeStats = JSON.parse(event.data);
    updateData();
  });

  events.addEventListener("error", () => {
    realtimeStats = null;
  });
}

function fetchSupabaseStats() {
  const query = "?select=max_depth,updated_at,visible&max_depth=gt.0&order=updated_at.desc&limit=200";

  fetch(getSupabaseUrl(SUPABASE_TABLE, query), {
    headers: getSupabaseHeaders(),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Unable to fetch Supabase stats");
      }

      return response.json();
    })
    .then((records) => {
      realtimeStats = buildStatsFromRecords(records);
      updateData();
    })
    .catch(() => {
      realtimeStats = null;
    });
}

function buildStatsFromRecords(records) {
  const now = Date.now();
  const depthMap = new Map();
  const recentRecords = records.filter((record) => {
    return now - new Date(record.updated_at).getTime() < 1000 * 60 * 60 * 24 * 30;
  });

  recentRecords.forEach((record) => {
    const level = Math.floor((Number(record.max_depth) || 0) / UNIT);
    depthMap.set(level, (depthMap.get(level) || 0) + 1);
  });

  cursorRecordDepths = recentRecords
    .filter((record) => !record.visible)
    .map((record) => Number(record.max_depth) || 0)
    .filter((depth) => depth > 0)
    .sort((a, b) => a - b);

  return {
    totalVisitors: recentRecords.length,
    activeVisitors: recentRecords.filter((record) => {
      return record.visible && now - new Date(record.updated_at).getTime() < 1000 * 20;
    }).length,
    depthCounts: Array.from(depthMap, ([level, count]) => ({ level, count })).sort((a, b) => a.level - b.level),
  };
}

function revealMetricsOnScroll() {
  if (!document.body.classList.contains("landing-complete") || getMainScrollY() <= 0) {
    return;
  }

  landingEnglish.classList.add("is-fixed");
  document.body.classList.add("has-main-scroll");
  document.body.classList.add("has-started-scroll");
  window.removeEventListener("scroll", revealMetricsOnScroll);
}

function updatePointerDirection(event) {
  previousPointerX = lastPointerX;
  previousPointerY = lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
}

function getExitAngle(event) {
  const x = event?.clientX ?? lastPointerX;
  const y = event?.clientY ?? lastPointerY;
  let dx = x - previousPointerX;
  let dy = y - previousPointerY;

  if (Math.hypot(dx, dy) < 0.5) {
    dx = x - window.innerWidth / 2;
    dy = y - window.innerHeight / 2;
  }

  return Math.atan2(dy, dx) * (180 / Math.PI);
}

function showExitMark(event) {
  window.clearTimeout(exitTimer);
  exitMark.style.setProperty("--exit-angle", `${getExitAngle(event)}deg`);
  exitMark.classList.add("is-visible");
}

function hideExitMarkSoon() {
  window.clearTimeout(exitTimer);
  exitTimer = window.setTimeout(() => {
    exitMark.classList.remove("is-visible");
  }, 260);
}

buildVoidField();
chineseCharacters.forEach((character) => {
  character.addEventListener("pointerenter", () => revealChineseCharacter(character));
  character.addEventListener("click", () => revealChineseCharacter(character));
  character.addEventListener("focus", () => revealChineseCharacter(character));
});

renderCursorRecords();
connectRealtime();
updateData();
syncRealtime(true);

window.addEventListener("scroll", () => {
  updateLandingProgress();
  extendPageIfNeeded();
  updateData();
  syncRealtime();
});
window.addEventListener("scroll", revealMetricsOnScroll);

window.addEventListener("resize", () => {
  if (!landingSequenceStarted) {
    buildVoidField();
  }

  updateLandingProgress();
  extendPageIfNeeded();
  updateData();
  syncRealtime();
});

window.addEventListener("pointermove", updatePointerDirection);
document.addEventListener("mouseleave", showExitMark);
document.addEventListener("mouseenter", hideExitMarkSoon);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    showExitMark();
    writeRecord();
    syncRealtime(true, false);
  } else {
    hideExitMarkSoon();
    syncRealtime(true, true);
  }
});

window.addEventListener("beforeunload", () => {
  writeRecord();
  syncRealtime(true, false);
});

window.setInterval(() => {
  updateData();
  writeRecord();
  syncRealtime(true);
}, 1000);
