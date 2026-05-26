const scrollField = document.querySelector("#scrollField");
const timeUsed = document.querySelector("#timeUsed");
const scrollReadout = document.querySelector("#scrollReadout");
const peopleHere = document.querySelector("#peopleHere");
const peopleLine = document.querySelector(".people-line");
const peopleUnit = document.querySelector("#peopleUnit");
const storyRail = document.querySelector("#storyRail");
const feedColumn = document.querySelector("#feedColumn");

const STORAGE_KEY = "scrolling-record";
const CLIENT_KEY = "scrolling-record-client-id";
const UNIT = 1000;
const INITIAL_DISTANCE_PT = 24000;
const EXTEND_THRESHOLD = 3200;
const EXTEND_AMOUNT = 24000;
const INITIAL_POST_COUNT = 36;
const POSTS_PER_EXTENSION = 24;
const BACKGROUND_FADE_DISTANCE_PT = 24000;
const MIN_BACKGROUND_LIGHTNESS = 128;
const FEED_SCROLL_SPEED = 0.34;
const POST_FADE_MIDPOINT = 100;
const POST_FADE_ENDPOINT = 200;
const HAS_REALTIME_API = window.location.protocol.startsWith("http");
const SUPABASE_TABLE = "visitor_records";
const SUPABASE_EXIT_TABLE = "exit_cursor_records";
const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {};
const HAS_SUPABASE_API = Boolean(
  SUPABASE_CONFIG.url &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.anonKey.includes("PASTE_YOUR_SUPABASE")
);

let currentDistance = 0;
let maxDistance = 0;
let pageDistance = INITIAL_DISTANCE_PT;
let startTime = Date.now();
let lastSyncAt = 0;
let realtimeStats = null;
let postsBuilt = 0;
let targetPostCount = INITIAL_POST_COUNT;
let lastExitRecordAt = 0;

const clientId = getClientId();
const storedRecord = readRecord();
startTime -= storedRecord.totalSeconds * 1000;
maxDistance = storedRecord.maxDistance || 0;

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
      maxDistance: Number(parsed.maxDistance) || 0,
      visits: Number(parsed.visits) || 0,
    };
  } catch {
    return { totalSeconds: 0, maxDistance: 0, visits: 0 };
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
      maxDistance,
      visits: storedRecord.visits + 1,
      updatedAt: new Date().toISOString(),
    })
  );
}

function formatSiteTime() {
  const totalSeconds = getTotalSeconds();
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPt(depth) {
  return `${Math.round(depth).toLocaleString("en-US")}pt`;
}

function updateBackground(depth) {
  const progress = Math.min(1, Math.max(0, depth / BACKGROUND_FADE_DISTANCE_PT));
  const channel = Math.round(255 - (255 - MIN_BACKGROUND_LIGHTNESS) * progress);
  document.documentElement.style.setProperty("--bg", `rgb(${channel}, ${channel}, ${channel})`);
}

function simulatedPeopleAtDistance() {
  return 1;
}

function realtimePeopleAtDistance(depth) {
  if (!realtimeStats) {
    return simulatedPeopleAtDistance(depth);
  }

  const depthLevel = Math.floor(depth / UNIT);
  const reached = realtimeStats.depthCounts
    .filter((item) => item.level >= depthLevel)
    .reduce((sum, item) => sum + item.count, 0);

  return Math.max(1, reached);
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

  return {
    totalVisitors: recentRecords.length,
    activeVisitors: recentRecords.filter((record) => {
      return record.visible && now - new Date(record.updated_at).getTime() < 1000 * 20;
    }).length,
    depthCounts: Array.from(depthMap, ([level, count]) => ({ level, count })).sort((a, b) => a.level - b.level),
  };
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

function connectRealtime() {
  if (HAS_SUPABASE_API) {
    fetchSupabaseStats();
    window.setInterval(fetchSupabaseStats, 2000);
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

function getPayload(visibleOverride) {
  return {
    clientId,
    currentDepth: currentDistance,
    maxDepth: maxDistance,
    totalSeconds: getTotalSeconds(),
    visible: typeof visibleOverride === "boolean" ? visibleOverride : !document.hidden,
  };
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

function recordSupabaseExitDepth() {
  if (!HAS_SUPABASE_API) {
    return;
  }

  const now = Date.now();

  if (now - lastExitRecordAt < 1500) {
    return;
  }

  lastExitRecordAt = now;

  fetch(getSupabaseUrl(SUPABASE_EXIT_TABLE), {
    method: "POST",
    headers: getSupabaseHeaders(),
    body: JSON.stringify({
      client_id: clientId,
      depth_pt: currentDistance,
      max_depth_pt: maxDistance,
      total_seconds: getTotalSeconds(),
      created_at: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => {});
}

function syncRealtime(force = false, visibleOverride) {
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

  const payload = getPayload(visibleOverride);
  navigator.sendBeacon?.(
    "/api/record",
    new Blob([JSON.stringify(payload)], { type: "application/json" })
  ) || fetch("/api/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function setPageLength() {
  while (pageDistance < window.scrollY + window.innerHeight + EXTEND_THRESHOLD) {
    pageDistance += EXTEND_AMOUNT;
    targetPostCount += POSTS_PER_EXTENSION;
  }

  const height = pageDistance + window.innerHeight;
  scrollField.style.minHeight = `${height}px`;
}

function extendPageIfNeeded() {
  const remaining = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;

  if (remaining > EXTEND_THRESHOLD) {
    return;
  }

  pageDistance += EXTEND_AMOUNT;
  targetPostCount += POSTS_PER_EXTENSION;
  ensurePosts();
  setPageLength();
}

function makeAvatarVars(index) {
  const palettes = [
    ["#ff7a59", "#7f5cff", "#f7d154"],
    ["#2a9d8f", "#264653", "#e9c46a"],
    ["#ef476f", "#06d6a0", "#118ab2"],
    ["#111111", "#707070", "#d9d9d9"],
    ["#f15bb5", "#00bbf9", "#fee440"],
    ["#8ac926", "#1982c4", "#ffca3a"],
  ];
  const palette = palettes[index % palettes.length];
  return `--a:${palette[0]};--b:${palette[1]};--c:${palette[2] || palette[0]};`;
}

function buildInstagramHome() {
  const storyNames = ["001", "002", "003", "004", "005", "006"];

  feedColumn.innerHTML = "";
  postsBuilt = 0;
  targetPostCount = INITIAL_POST_COUNT;

  storyRail.innerHTML = storyNames
    .map((name, index) => {
      const addClass = index === 0 ? " add" : "";
      const plus = "";
      return `<div class="story${addClass}"><div class="avatar plus">${plus}</div><div class="label">${name}</div></div>`;
    })
    .join("");

  ensurePosts();
}

function buildPost(index) {
  const postNumber = String(index + 1).padStart(3, "0");
  const captionNumber = String(index + 1).padStart(6, "0");
  const postBackground = getPostBackground(index);

  return `
    <article class="post">
      <header class="post-header">
        <div class="post-avatar"></div>
        <div class="post-user">${postNumber}</div>
        <div class="post-more">•••</div>
      </header>

      <div class="post-media" style="--post-bg: ${postBackground};"></div>

      <div class="post-actions">
        <div class="left-actions">
          <button class="icon-btn like" aria-label="Like">
            <svg xmlns="http://www.w3.org/2000/svg" width="23" height="20" viewBox="0 0 23 20" fill="none" aria-hidden="true">
              <path d="M13.002 2.42676C14.8649 0.732937 17.2779 0.459446 19.0996 1.55469C21.0143 2.70675 22.0205 5.17248 21.4326 7.53906V7.54004C20.8747 9.78771 19.5094 11.6029 17.8506 13.3975C15.8957 15.5122 13.6309 17.2977 11.2539 19.0283C8.20074 16.7958 5.32529 14.5207 3.12109 11.5801L2.67676 10.9648L2.30469 10.4072C1.47642 9.10259 0.930513 7.76852 0.901367 6.28809C0.858732 4.12604 2.0417 2.18801 3.76465 1.35742L3.93262 1.28027C5.74193 0.499061 8.00088 0.953862 9.6416 2.56152C9.96337 2.877 10.2943 3.19503 10.6641 3.55371L11.3145 4.18359L11.9404 3.53027C12.2561 3.20101 12.4912 2.93051 12.7422 2.67676L13.002 2.42676Z" fill="none" stroke="black" stroke-width="1.8"/>
            </svg>
          </button>
          <button class="icon-btn comment" aria-label="Comment">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <mask id="comment-path-inside" fill="white">
                <path d="M12 1C18.0751 1 23 5.92487 23 12C23 14.0572 22.4331 15.9811 21.4502 17.6279L22.8477 22.8408L17.6377 21.4443C15.9887 22.4308 14.0612 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1Z"/>
              </mask>
              <path d="M21.4502 17.6279L19.9045 16.7055C19.6552 17.1232 19.5856 17.6241 19.7116 18.094L21.4502 17.6279ZM22.8477 22.8408L22.3816 24.5794C23.0028 24.746 23.6657 24.5684 24.1205 24.1136C24.5752 23.6588 24.7528 22.9959 24.5863 22.3747L22.8477 22.8408ZM17.6377 21.4443L18.1037 19.7057C17.6332 19.5796 17.1317 19.6496 16.7136 19.8996L17.6377 21.4443ZM12 1V2.8C17.081 2.8 21.2 6.91898 21.2 12H23H24.8C24.8 4.93076 19.0692 -0.8 12 -0.8V1ZM23 12H21.2C21.2 13.7219 20.7264 15.3284 19.9045 16.7055L21.4502 17.6279L22.9958 18.5504C24.1397 16.6338 24.8 14.3925 24.8 12H23ZM21.4502 17.6279L19.7116 18.094L21.109 23.3069L22.8477 22.8408L24.5863 22.3747L23.1888 17.1618L21.4502 17.6279ZM22.8477 22.8408L23.3137 21.1022L18.1037 19.7057L17.6377 21.4443L17.1717 23.183L22.3816 24.5794L22.8477 22.8408ZM17.6377 21.4443L16.7136 19.8996C15.3347 20.7245 13.7253 21.2 12 21.2V23V24.8C14.3972 24.8 16.6427 24.1371 18.5618 22.989L17.6377 21.4443ZM12 23V21.2C6.91898 21.2 2.8 17.081 2.8 12H1H-0.8C-0.8 19.0692 4.93076 24.8 12 24.8V23ZM1 12H2.8C2.8 6.91898 6.91898 2.8 12 2.8V1V-0.8C4.93076 -0.8 -0.8 4.93076 -0.8 12H1Z" fill="black" mask="url(#comment-path-inside)"/>
            </svg>
          </button>
          <button class="icon-btn dm" aria-label="Share">
            <svg xmlns="http://www.w3.org/2000/svg" width="23" height="20" viewBox="0 0 23 20" fill="none" aria-hidden="true">
              <path d="M7.66705 7.31168L1.68199 0.900333L18.7688 0.899836L7.66705 7.31168ZM11.1249 17.2559L8.56695 8.87036L19.667 2.45949L11.1249 17.2559Z" stroke="black" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="right-actions">
          <button class="icon-btn save" aria-label="Save">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20.0996 1.90039V21.0781L12.5762 14.8086C12.2424 14.5305 11.7576 14.5305 11.4238 14.8086L3.90039 21.0781L3.90039 1.90039L20.0996 1.90039Z" stroke="black" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="post-meta">
        <div class="likes">100 Likes</div>
        <div class="caption"><strong>${postNumber}</strong> ${captionNumber}</div>
      </div>
    </article>
  `;
}

function toggleLike(event) {
  const likeButton = event.target.closest(".icon-btn.like");

  if (!likeButton) {
    return;
  }

  likeButton.classList.toggle("is-liked");
}

function getPostBackground(index) {
  const postIndex = index + 1;

  if (postIndex >= POST_FADE_ENDPOINT) {
    return "rgb(0, 0, 0)";
  }

  if (postIndex <= POST_FADE_MIDPOINT) {
    const progress = (postIndex - 1) / (POST_FADE_MIDPOINT - 1);
    const channel = Math.round(255 - progress * (255 - MIN_BACKGROUND_LIGHTNESS));
    return `rgb(${channel}, ${channel}, ${channel})`;
  }

  const progress = (postIndex - POST_FADE_MIDPOINT) / (POST_FADE_ENDPOINT - POST_FADE_MIDPOINT);
  const channel = Math.round(MIN_BACKGROUND_LIGHTNESS - progress * MIN_BACKGROUND_LIGHTNESS);
  return `rgb(${channel}, ${channel}, ${channel})`;
}

function ensurePosts() {
  const fragment = document.createDocumentFragment();

  while (postsBuilt < targetPostCount) {
    const template = document.createElement("template");
    template.innerHTML = buildPost(postsBuilt).trim();
    fragment.appendChild(template.content.firstElementChild);
    postsBuilt += 1;
  }

  feedColumn.appendChild(fragment);
}

function updateData() {
  currentDistance = Math.max(0, Math.round(window.scrollY));
  maxDistance = Math.max(maxDistance, currentDistance);

  const feedShift = Math.round(currentDistance * FEED_SCROLL_SPEED);

  document.documentElement.style.setProperty("--feed-shift", `${feedShift}px`);
  updateBackground(currentDistance);
  timeUsed.textContent = formatSiteTime();
  scrollReadout.textContent = formatPt(currentDistance);
  const peopleCount = realtimePeopleAtDistance(currentDistance);
  peopleHere.textContent = peopleCount.toLocaleString("en-US");
  peopleLine.classList.toggle("is-alone", peopleCount === 1);
  peopleUnit.textContent = peopleCount === 1 ? "PERSON" : "PEOPLE";
}

setPageLength();
buildInstagramHome();
connectRealtime();
updateData();
syncRealtime(true);

window.addEventListener("scroll", () => {
  extendPageIfNeeded();
  ensurePosts();
  updateData();
  syncRealtime();
}, { passive: true });

window.addEventListener("resize", () => {
  setPageLength();
  ensurePosts();
  updateData();
});

feedColumn.addEventListener("click", toggleLike);

document.addEventListener("visibilitychange", () => {
  writeRecord();
  syncRealtime(true, !document.hidden);

  if (document.hidden) {
    recordSupabaseExitDepth();
  }
});

window.addEventListener("beforeunload", () => {
  writeRecord();
  syncRealtime(true, false);
  recordSupabaseExitDepth();
});

window.setInterval(() => {
  updateData();
  writeRecord();
  syncRealtime(true);
}, 1000);
