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
let editMode = false;
let toastTimer = null;
let hasUnsavedChanges = false;

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
  dom.editOverlay = document.getElementById("editOverlay");
  dom.editList = document.getElementById("editList");
  dom.editCount = document.getElementById("editCount");
  dom.editSearch = document.getElementById("editSearch");
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
    return `<img src="${lvl.thumbnail}" alt="${altText}" loading="lazy" decoding="async">`;
  }
  let fallbackId = "";
  if (lvl.ids && lvl.ids.length) {
    const raw = lvl.ids[0].id ? String(lvl.ids[0].id) : String(lvl.ids[0]);
    const m = raw.match(/^\d+/);
    if (m) fallbackId = m[0];
  } else if (lvl.id) {
    const m = String(lvl.id).match(/^\d+/);
    if (m) fallbackId = m[0];
  }
  if (fallbackId) {
    const url = `https://levelthumbs.prevter.me/thumbnail/${fallbackId}/small`;
    return `<img src="${url}" alt="${altText}" loading="lazy" decoding="async" onerror="${errorFallback}">`;
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
  const wr = wrPct === 100 ? "100%" : !wrPct ? "—" : wrPct + "%";
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
  if (lvl.twoPlayer) parts.push(`<span class="tag duo">2-PLAYER</span>`);
  return parts.join("");
}

function renderList() {
  disconnectSentinel();
  renderedCount = 0;

  if (!filtered.length) {
    dom.levelList.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>No levels match<br>your filters.</p></div>`;
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
      if (entries[0].isIntersecting) renderNextBatch();
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
    const fromVerified = l.verified ? 100 : 0;
    const fromWR =
      l.worldRecord && l.worldRecord.percentage != null
        ? l.worldRecord.percentage
        : 0;
    totalProgress += Math.max(fromVerified, fromWR) / 100;
  }

  const pct = total ? Math.round((totalProgress / total) * 100) : 0;

  requestAnimationFrame(() => {
    dom.statVerified.textContent = verified;
    dom.statUnverified.textContent = total - verified;
    dom.statPercent.textContent = pct + "%";
    setTimeout(() => {
      dom.progressFill.style.width = pct + "%";
    }, 150);
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
      !(lvl.ids && lvl.ids.some((i) => i.id.includes(q))) &&
      !lvl.creators.some((c) => c.toLowerCase().includes(q))
    )
      return false;
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
  dom.sortBtn.textContent = (sortAsc ? "▲" : "▼") + " RANK";
  dom.sortBtn.classList.toggle("desc", !sortAsc);
  filtered.reverse();
  renderList();
}

function openModal(rank) {
  if (rank === lastModalRank && dom.modal.classList.contains("open")) return;
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
      : `<span class="detail-val" style="color:var(--muted)">—</span>`;

  const progressDisplay = wrPct != null ? wrPct + "%" : "—";
  const progressCls =
    wrPct === 100 ? "big green" : wrPct != null ? "big" : "detail-val";
  const verifiedNote =
    wrPct === 100 ? `<div class="progress-verified-note">✓ Verified</div>` : "";

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
  <div class="detail-block"><div class="detail-key">Record Holder</div><div class="detail-val">${wrHolder || "—"}</div></div>
  <div class="detail-block full"><div class="detail-key">Level IDs</div>${idsHTML}</div>
  <div class="detail-block"><div class="detail-key">Date Uploaded</div><div class="detail-val">${formatDate(lvl.dateUploaded)}</div></div>
  <div class="detail-block"><div class="detail-key">2-Player</div><div class="detail-val">${lvl.twoPlayer ? "Yes" : "No"}</div></div>
  <div class="detail-block half"><div class="detail-key">Creators</div><div class="detail-val">${lvl.creators.join(" · ")}</div></div>`;

  dom.modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(e) {
  if (e.target === dom.modal) closeModalDirect();
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
      if (!r.ok) throw new Error("Failed to load levels.json");
      return r.json();
    })
    .then((data) => {
      LEVELS = data.levels;
      BATCH_SIZE = LEVELS.length;
      rebuildRankMap();
      updateStats();
      applyFilters();
    })
    .catch((err) => {
      dom.levelList.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load levels.<br>${err.message}</p></div>`;
    });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markDirty() {
  hasUnsavedChanges = true;
}

function openEditMode() {
  closeModalDirect();
  editMode = true;
  hasUnsavedChanges = false;
  renderEditList();
  dom.editOverlay.classList.add("open");
  document.body.style.overflow = "hidden";
  if (dom.editSearch) {
    dom.editSearch.value = "";
    dom.editSearch.focus();
  }
}

function closeEditMode() {
  if (
    hasUnsavedChanges &&
    !confirm("You have unsaved changes. Close without copying JSON?")
  ) {
    return;
  }
  editMode = false;
  hasUnsavedChanges = false;
  dom.editOverlay.classList.remove("open");
  document.body.style.overflow = "";
  rebuildRankMap();
  updateStats();
  applyFilters();
}

function renderEditList() {
  dom.editCount.textContent = `${LEVELS.length} level${LEVELS.length !== 1 ? "s" : ""}`;
  dom.editList.innerHTML = LEVELS.map((lvl, i) => buildEditCard(lvl, i)).join(
    "",
  );
  if (dom.editSearch && dom.editSearch.value) {
    filterEditList(dom.editSearch.value);
  }

  const cards = dom.editList.querySelectorAll(".edit-card");
  cards.forEach((card) => card.classList.add("expanded"));
}

function filterEditList(q) {
  const query = q.toLowerCase().trim();
  const cards = dom.editList.querySelectorAll(".edit-card");
  cards.forEach((card, i) => {
    const lvl = LEVELS[i];
    if (!lvl) return;
    const match =
      !query ||
      lvl.name.toLowerCase().includes(query) ||
      (lvl.creators || []).some((c) => c.toLowerCase().includes(query)) ||
      (lvl.ids || []).some((entry) => entry.id.includes(query)) ||
      String(lvl.rank).includes(query);
    card.style.display = match ? "" : "none";
  });
}

function buildIdsRowsHTML(idx) {
  return (LEVELS[idx].ids || [])
    .map(
      (entry, i) => `
      <div class="edit-id-row">
        <input class="edit-input" type="text" value="${esc(entry.id)}" placeholder="Level ID"
          oninput="updateIdField(${idx},${i},'id',this.value)">
        <input class="edit-input" type="text" value="${esc(entry.label || "")}" placeholder="Label (optional)"
          oninput="updateIdField(${idx},${i},'label',this.value)">
        <button class="edit-id-remove" onclick="removeId(${idx},${i})" title="Remove">−</button>
      </div>`,
    )
    .join("");
}

function reRenderIdsList(idx) {
  const list = document.getElementById("ids-list-" + idx);
  if (!list) return;
  list.innerHTML = buildIdsRowsHTML(idx);
}

function buildEditCard(lvl, idx) {
  const wrPct =
    lvl.worldRecord && lvl.worldRecord.percentage != null
      ? lvl.worldRecord.percentage
      : "";
  const wrHolder = lvl.worldRecord ? lvl.worldRecord.holder || "" : "";
  const wrDisplay = wrPct !== "" ? wrPct + "%" : "—";
  const isVerified = lvl.verified;

  const idsHTML = buildIdsRowsHTML(idx);

  return `<div class="edit-card expanded" id="edit-card-${idx}">
  <div class="edit-card-bar">
    <span class="edit-card-rank">#${lvl.rank}</span>
    <span class="edit-card-name">${esc(lvl.name)}</span>
    <span class="tag ${isVerified ? "v-yes" : "v-no"}" style="flex-shrink:0;font-size:9px">${isVerified ? "VERIFIED" : "UNVERIFIED"}</span>
    <span class="edit-card-wr">${wrDisplay}</span>
    <button class="edit-card-del-btn" onclick="event.stopPropagation();deleteLevel(${idx})">Delete</button>
  </div>
  <div class="edit-body">
    <div class="edit-row" style="padding-top:10px">
      <div class="edit-field">
        <span class="edit-label">Rank</span>
        <input class="edit-input" type="number" min="1" value="${esc(lvl.rank)}"
          oninput="updateFieldLive(${idx},'rank',+this.value||1,'edit-card-rank','#'+value)">
      </div>
      <div class="edit-field grow">
        <span class="edit-label">Name</span>
        <input class="edit-input" type="text" value="${esc(lvl.name)}"
          oninput="updateFieldLive(${idx},'name',this.value,'edit-card-name',value)">
      </div>
      <div class="edit-field">
        <span class="edit-label">Date Uploaded</span>
        <input class="edit-input" type="date" value="${esc(lvl.dateUploaded || "")}"
          onchange="updateField(${idx},'dateUploaded',this.value)">
      </div>
    </div>
    <div class="edit-row">
      <div class="edit-field grow">
        <span class="edit-label">Creators (comma-separated)</span>
        <input class="edit-input" type="text" value="${esc((lvl.creators || []).join(", "))}"
          oninput="updateCreators(${idx},this.value)">
      </div>
    </div>
    <div class="edit-row">
      <div class="edit-field">
        <span class="edit-label">Verified</span>
        <label class="edit-check-group">
          <input type="checkbox" ${lvl.verified ? "checked" : ""}
            onchange="updateField(${idx},'verified',this.checked);syncVerifiedBadge(${idx},this.checked)">
          <span class="edit-check-label">Yes</span>
        </label>
      </div>
      <div class="edit-field">
        <span class="edit-label">2-Player</span>
        <label class="edit-check-group">
          <input type="checkbox" ${lvl.twoPlayer ? "checked" : ""}
            onchange="updateField(${idx},'twoPlayer',this.checked)">
          <span class="edit-check-label">Yes</span>
        </label>
      </div>
    </div>
    <div class="edit-row">
      <div class="edit-field grow">
        <span class="edit-label">Thumbnail URL</span>
        <input class="edit-input" type="text" value="${esc(lvl.thumbnail || "")}"
          oninput="updateField(${idx},'thumbnail',this.value||null)">
      </div>
    </div>
    <div class="edit-field" style="gap:6px">
      <span class="edit-section-label">Level IDs</span>
      <div class="edit-ids-list" id="ids-list-${idx}">${idsHTML}</div>
      <button class="edit-add-id-btn" onclick="addId(${idx})">+ Add ID</button>
    </div>
    <div class="edit-row">
      <div class="edit-field">
        <span class="edit-label">WR %</span>
        <input class="edit-input" type="number" min="0" max="100" value="${esc(wrPct)}" placeholder="—"
          oninput="updateWR(${idx},'percentage',this.value===''?null:+this.value);syncWRDisplay(${idx},this.value)">
      </div>
      <div class="edit-field grow">
        <span class="edit-label">WR Holder</span>
        <input class="edit-input" type="text" value="${esc(wrHolder)}" placeholder="Player name"
          oninput="updateWR(${idx},'holder',this.value)">
      </div>
    </div>
    <button class="edit-delete-level-btn" onclick="deleteLevel(${idx})">🗑 Delete Level</button>
  </div>
</div>`;
}

function updateField(idx, field, value) {
  if (!LEVELS[idx]) return;
  LEVELS[idx][field] = value;
  markDirty();
}

function updateFieldLive(idx, field, value, queryCls, display) {
  if (!LEVELS[idx]) return;
  LEVELS[idx][field] = value;
  const card = document.getElementById("edit-card-" + idx);
  if (!card) return;
  const el = card.querySelector("." + queryCls);
  if (el) el.textContent = display;
  markDirty();
}

function updateCreators(idx, value) {
  if (!LEVELS[idx]) return;
  LEVELS[idx].creators = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  markDirty();
}

function updateWR(idx, field, value) {
  if (!LEVELS[idx]) return;
  if (!LEVELS[idx].worldRecord) {
    LEVELS[idx].worldRecord = { percentage: null, holder: "" };
  }
  LEVELS[idx].worldRecord[field] = value;
  if (
    LEVELS[idx].worldRecord.percentage === null &&
    !LEVELS[idx].worldRecord.holder
  ) {
    LEVELS[idx].worldRecord = null;
  }
  markDirty();
}

function syncWRDisplay(idx, rawValue) {
  const card = document.getElementById("edit-card-" + idx);
  if (!card) return;
  const el = card.querySelector(".edit-card-wr");
  if (el) el.textContent = rawValue !== "" ? rawValue + "%" : "—";
}

function syncVerifiedBadge(idx, verified) {
  const card = document.getElementById("edit-card-" + idx);
  if (!card) return;
  const badge = card.querySelector(".edit-card-bar .tag");
  if (!badge) return;
  badge.className = "tag " + (verified ? "v-yes" : "v-no");
  badge.textContent = verified ? "VERIFIED" : "UNVERIFIED";
}

function updateIdField(idx, idIdx, field, value) {
  if (!LEVELS[idx] || !LEVELS[idx].ids || !LEVELS[idx].ids[idIdx]) return;
  LEVELS[idx].ids[idIdx][field] = value;
  markDirty();
}

function addId(idx) {
  if (!LEVELS[idx]) return;
  if (!LEVELS[idx].ids) LEVELS[idx].ids = [];
  LEVELS[idx].ids.push({ id: "", label: "" });
  reRenderIdsList(idx);
  const list = document.getElementById("ids-list-" + idx);
  if (list && list.lastElementChild) {
    list.lastElementChild.querySelector("input")?.focus();
  }
  markDirty();
}

function removeId(idx, idIdx) {
  if (!LEVELS[idx] || !LEVELS[idx].ids) return;
  LEVELS[idx].ids.splice(idIdx, 1);
  reRenderIdsList(idx);
  markDirty();
}

function addLevel() {
  const maxRank = LEVELS.reduce((max, l) => (l.rank > max ? l.rank : max), 0);
  LEVELS.push({
    rank: maxRank + 1,
    name: "New Level",
    creators: [],
    verified: false,
    twoPlayer: false,
    thumbnail: null,
    ids: [],
    dateUploaded: new Date().toISOString().slice(0, 10),
    worldRecord: null,
  });
  markDirty();
  renderEditList();
  setTimeout(() => {
    const newIdx = LEVELS.length - 1;
    const card = document.getElementById("edit-card-" + newIdx);
    if (card) {
      card.classList.add("expanded");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 30);
}

function deleteLevel(idx) {
  const name = LEVELS[idx]?.name || "this level";
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  LEVELS.splice(idx, 1);
  markDirty();
  renderEditList();
}

function copyJSON() {
  const sorted = [...LEVELS].sort((a, b) => a.rank - b.rank);
  const json = JSON.stringify({ levels: sorted }, null, 2);
  const doFallback = () => {
    const ta = document.createElement("textarea");
    ta.value = json;
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    document.body.removeChild(ta);
    showToast("✓ JSON copied to clipboard");
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(json)
      .then(() => {
        showToast("✓ JSON copied to clipboard");
        hasUnsavedChanges = false;
      })
      .catch(doFallback);
  } else {
    doFallback();
    hasUnsavedChanges = false;
  }
}

function importJSON() {
  const raw = prompt(
    'Paste your levels.json content below (must be { "levels": [...] }):',
  );
  if (raw == null || raw.trim() === "") return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    alert("Invalid JSON: " + e.message);
    return;
  }
  if (!data.levels || !Array.isArray(data.levels)) {
    alert('Expected an object with a "levels" array.');
    return;
  }
  LEVELS = data.levels;
  hasUnsavedChanges = false;
  renderEditList();
  showToast(
    `✓ Imported ${LEVELS.length} level${LEVELS.length !== 1 ? "s" : ""}`,
  );
}

function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2500);
}

function init() {
  cacheDOM();

  dom.searchInput.addEventListener("input", () => {
    if (dom.searchInput.value.trim().toLowerCase() === "edit") {
      dom.searchInput.value = "";
      openEditMode();
      return;
    }
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(applyFilters, 250);
  });

  [dom.filterStatus, dom.filterDuo].forEach((el) => {
    el.addEventListener("change", applyFilters);
  });

  if (dom.editSearch) {
    dom.editSearch.addEventListener("input", () => {
      filterEditList(dom.editSearch.value);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (editMode) closeEditMode();
      else closeModalDirect();
    }
    if (e.shiftKey && e.key === "M") {
      e.preventDefault();
      if (editMode) closeEditMode();
      else openEditMode();
    }
  });

  loadLevels();
}

init();
