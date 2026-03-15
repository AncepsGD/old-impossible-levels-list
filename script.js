let BATCH_SIZE = 30;
const ANIMATION_CAP = 10;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

let LEVELS = [];
let rankMap = new Map();
let sortAsc = true;
let filtered = [];
let renderedCount = 0;
let lastModalRank = -1;
let searchDebounceTimer = null;
let sentinel = null;
let sentinelObserver = null;

const dom = {};

function cacheDOM() {
  dom.levelList = document.getElementById("levelList");
  dom.searchInput = document.getElementById("searchInput");
  dom.filterStatus = document.getElementById("filterStatus");
  dom.filterDuo = document.getElementById("filterDuo");
  dom.sortBtn = document.getElementById("sortBtn");
  dom.statVerified = document.getElementById("statVerified");
  dom.statUnverified = document.getElementById("statUnverified");
  dom.statPercent = document.getElementById("statPercent");
  dom.progressFill = document.getElementById("progressFill");
  dom.modal = document.getElementById("modal");
  dom.modalHero = document.getElementById("modalHero");
  dom.modalGrid = document.getElementById("modalGrid");
  dom.toast = document.getElementById("toast");
}

const dateCache = new Map();
function formatDate(d) {
  if (dateCache.has(d)) return dateCache.get(d);
  if (!d || typeof d !== "string" || d.split("-").length !== 3) {
    return "Invalid date";
  }
  const [y, m, day] = d.split("-");
  const result = `${MONTHS[+m - 1]} ${+day}, ${y}`;
  dateCache.set(d, result);
  return result;
}

function getRankClass(r) {
  if (r === 1) return "rank1";
  if (r <= 3) return "top3";
  if (r <= 10) return "top10";
  return "";
}

function buildThumbHTML(lvl, altText, errorFallback) {
  if (lvl.thumbnail) {
    return `<img src="${lvl.thumbnail}" alt="${altText}" loading="lazy" onerror="${errorFallback}">`;
  }
  let fallbackId = "";
  if (lvl.ids && lvl.ids.length) {
    fallbackId = lvl.ids[0].id;
  } else if (lvl.name) {
    fallbackId = lvl.name.slice(0, 2).toUpperCase();
  }
  if (fallbackId) {
    return `<div class="thumb-placeholder">${fallbackId}</div>`;
  }
  return `<div class="thumb-placeholder"></div>`;
}

function buildRowHTML(lvl, i) {
  const rCls = getRankClass(lvl.rank);
  const rowCls = lvl.verified ? "verified-row" : "unverified-row";
  const thumb = buildThumbHTML(
    lvl,
    lvl.name,
    "this.onerror=null;this.parentElement.innerHTML='<div class=\\'thumb-placeholder\\'></div>'",
  );
  const wrPct = lvl.worldRecord ? lvl.worldRecord.percentage : null;
  const wrHolder = lvl.worldRecord ? lvl.worldRecord.holder : null;
  const wr = wrPct === 100 ? "100%" : !wrPct ? "" : wrPct + "%";
  const wrCls = wrPct === 100 ? "complete" : !wrPct ? "none" : "";
  const delay =
    i < ANIMATION_CAP ? ` style="animation-delay:${i * 0.05}s"` : "";
  const tags = buildTagsHTML(lvl);
  const firstId = lvl.ids && lvl.ids.length ? lvl.ids[0] : null;

  return `<div class="level-row ${rowCls}" onclick="openModal(${lvl.rank})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal(${lvl.rank});}" role="button" tabindex="0" aria-label="View details for ${lvl.name}"${delay}>
  <div class="rank-col"><span class="rank-num ${rCls}">#${lvl.rank}</span></div>
  <div class="thumb-col"><div class="thumb-inner">${thumb}</div></div>
  <div class="info-col">
    <div class="level-name">${lvl.name}</div>
    <div class="level-creators">by ${lvl.creators.join(", ")}</div>
    <div class="level-meta-row">
      <span class="meta-chip"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 2v4m8-4v4M3 10h18"/></svg>${formatDate(lvl.dateUploaded)}</span>
      ${firstId ? `<span class="meta-chip">ID: ${firstId.id}${firstId.label ? ` <em style="opacity:.6">(${firstId.label})</em>` : ""}</span>` : ""}
    </div>
    <div class="level-tags">${tags}</div>
  </div>
  <div class="wr-col">
    <span class="wr-label">World Record</span>
    <span class="wr-pct ${wrCls}">${wr}</span>
    <span class="wr-holder">${wrHolder ? "by " + wrHolder : "No record"}</span>
  </div>
</div>`;
}

function buildTagsHTML(lvl) {
  const parts = [];
  parts.push(
    `<span class="tag ${lvl.verified ? "v-yes" : "v-no"}">${lvl.verified ? "VERIFIED" : "UNVERIFIED"}</span>`,
  );
  if (lvl.twoPlayer) {
    parts.push(`<span class="tag duo">2-PLAYER</span>`);
  }
  return parts.join("");
}

function renderList() {
  disconnectSentinel();
  renderedCount = 0;

  if (!filtered.length) {
    dom.levelList.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>No levels match your search.</p></div>`;
    return;
  }

  const slice = filtered.slice(0, BATCH_SIZE);
  dom.levelList.innerHTML = slice
    .map((lvl, i) => buildRowHTML(lvl, i))
    .join("");
  renderedCount = slice.length;

  if (renderedCount < filtered.length) {
    attachSentinel();
  }
}

function renderNextBatch() {
  if (renderedCount >= filtered.length) {
    disconnectSentinel();
    return;
  }
  const slice = filtered.slice(renderedCount, renderedCount + BATCH_SIZE);
  const frag = document.createDocumentFragment();
  const tmp = document.createElement("div");
  tmp.innerHTML = slice
    .map((lvl, i) => buildRowHTML(lvl, renderedCount + i))
    .join("");
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);

  disconnectSentinel();

  if (sentinel && dom.levelList.contains(sentinel)) {
    dom.levelList.insertBefore(frag, sentinel);
  } else {
    dom.levelList.appendChild(frag);
  }
  renderedCount += slice.length;

  if (renderedCount < filtered.length) {
    attachSentinel();
  }
}

function attachSentinel() {
  sentinel = document.createElement("div");
  sentinel.style.cssText = "height:1px;width:100%;";
  dom.levelList.appendChild(sentinel);

  sentinelObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        renderNextBatch();
      }
    },
    { rootMargin: "200px" },
  );
  sentinelObserver.observe(sentinel);
}

function disconnectSentinel() {
  if (sentinelObserver) {
    sentinelObserver.disconnect();
    sentinelObserver = null;
  }
  if (sentinel && sentinel.parentNode) {
    sentinel.parentNode.removeChild(sentinel);
    sentinel = null;
  }
}

function updateStats() {
  const total = LEVELS.length;
  let verified = 0;
  let totalProgress = 0;

  for (const l of LEVELS) {
    if (l.verified) verified++;
    if (l.worldRecord && l.worldRecord.percentage) {
      totalProgress += l.worldRecord.percentage;
    }
  }

  const pct = total ? Math.round((totalProgress / total) * 100) : 0;

  requestAnimationFrame(() => {
    dom.statVerified.textContent = verified;
    dom.statUnverified.textContent = total - verified;
    dom.statPercent.textContent = pct;
    dom.progressFill.style.width = `${pct}%`;
  });
}

function applyFilters() {
  const q = dom.searchInput.value.toLowerCase();
  const status = dom.filterStatus.value;
  const duo = dom.filterDuo.value;

  filtered = LEVELS.filter((lvl) => {
    if (
      q &&
      !lvl.name.toLowerCase().includes(q) &&
      !lvl.creators.some((c) => c.toLowerCase().includes(q)) &&
      !(lvl.ids && lvl.ids.some((id) => id.id.toLowerCase().includes(q)))
    ) {
      return false;
    }
    if (status === "verified" && !lvl.verified) return false;
    if (status === "unverified" && lvl.verified) return false;
    if (duo === "solo" && lvl.twoPlayer) return false;
    if (duo === "duo" && !lvl.twoPlayer) return false;
    return true;
  });

  if (!sortAsc) filtered.reverse();
  renderList();
}

function toggleSort() {
  sortAsc = !sortAsc;
  dom.sortBtn.textContent = (sortAsc ? "" : "") + " RANK";
  dom.sortBtn.classList.toggle("desc", !sortAsc);
  filtered.reverse();
  renderList();
}

function openModal(rank) {
  if (rank === lastModalRank && dom.modal.classList.contains("open")) {
    return;
  }
  const lvl = rankMap.get(rank);
  if (!lvl) return;

  lastModalRank = rank;
  const thumb = buildThumbHTML(
    lvl,
    lvl.name,
    "this.onerror=null;this.parentElement.innerHTML='<div style=\\'font-size:50px\\'></div>'",
  );
  const wrPct = lvl.worldRecord ? lvl.worldRecord.percentage : null;
  const wrHolder = lvl.worldRecord ? lvl.worldRecord.holder : null;
  const wr = wrPct === 100 ? "100%" : !wrPct ? "None" : wrPct + "%";
  const tags = buildTagsHTML(lvl);
  const idsHTML =
    lvl.ids && lvl.ids.length
      ? lvl.ids
          .map(
            (entry) =>
              `<span class="detail-val code" style="display:block;margin-bottom:4px">${entry.id}${entry.label ? `<span style="font-family:sans-serif;font-size:10px;color:var(--muted);margin-left:8px;letter-spacing:0">${entry.label}</span>` : ""}</span>`,
          )
          .join("")
      : `<span class="detail-val" style="color:var(--muted)"></span>`;

  const progressDisplay = wrPct != null ? wrPct + "%" : "";
  const progressCls =
    wrPct === 100 ? "big green" : wrPct != null ? "big" : "detail-val";
  const verifiedNote =
    wrPct === 100 ? `<div class="progress-verified-note"> Verified</div>` : "";

  dom.modalHero.innerHTML = `
  <div class="modal-thumb">${thumb}</div>
  <div class="modal-title-area">
    <div class="modal-rank-badge">RANK #${lvl.rank}</div>
    <div class="modal-name">${lvl.name}</div>
    <div class="modal-creators-line">by ${lvl.creators.join(", ")}</div>
    <div class="modal-tags-row">${tags}</div>
  </div>`;

  dom.modalGrid.innerHTML = `
  <div class="detail-block"><div class="detail-key">Progress</div><div class="detail-val ${progressCls}">${progressDisplay}</div>${verifiedNote}</div>
  <div class="detail-block"><div class="detail-key">Record Holder</div><div class="detail-val">${wrHolder || ""}</div></div>
  <div class="detail-block full"><div class="detail-key">Level IDs</div>${idsHTML}</div>
  <div class="detail-block"><div class="detail-key">Date Uploaded</div><div class="detail-val">${formatDate(lvl.dateUploaded)}</div></div>
  <div class="detail-block"><div class="detail-key">2-Player</div><div class="detail-val">${lvl.twoPlayer ? "Yes" : "No"}</div></div>
  <div class="detail-block half"><div class="detail-key">Creators</div><div class="detail-val">${lvl.creators.join("  ")}</div></div>`;

  dom.modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(e) {
  if (e.target === dom.modal) {
    closeModalDirect();
  }
}

function closeModalDirect() {
  dom.modal.classList.remove("open");
  document.body.style.overflow = "";
  lastModalRank = -1;
}

function rebuildRankMap() {
  rankMap = new Map(LEVELS.map((l) => [l.rank, l]));
}

function loadLevels() {
  return fetch("levels.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      LEVELS = data.levels || [];
      rebuildRankMap();
      updateStats();
      applyFilters();
    })
    .catch((err) => {
      console.error("Failed to load levels:", err);
      dom.levelList.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>Failed to load levels. Check console for details.</p></div>`;
    });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function init() {
  cacheDOM();

  dom.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(applyFilters, 250);
  });

  [dom.filterStatus, dom.filterDuo].forEach((el) => {
    el.addEventListener("change", applyFilters);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModalDirect();
    }
  });

  loadLevels();
}

init();
