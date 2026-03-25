const ANIMATION_CAP = 10;
const LOCAL_KEY = "oill_data";
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
let lastModalRank = -1;
let searchDebounceTimer = null;
let editingIndex = -1;
let dragSrcIdx = null;

const dom = {};

function cacheDOM() {
  dom.levelList = document.getElementById("levelList");
  dom.pendingSection = document.getElementById("pendingSection");
  dom.pendingList = document.getElementById("pendingList");
  dom.searchInput = document.getElementById("searchInput");
  dom.filterStatus = document.getElementById("filterStatus");
  dom.filterDuo = document.getElementById("filterDuo");
  dom.sortBtn = document.getElementById("sortBtn");
  dom.statVerified = document.getElementById("statVerified");
  dom.statUnverified = document.getElementById("statUnverified");
  dom.statPercent = document.getElementById("statPercent");
  dom.statPercentSub = document.getElementById("statPercentSub");
  dom.progressFill = document.getElementById("progressFill");
  dom.modal = document.getElementById("modal");
  dom.modalHero = document.getElementById("modalHero");
  dom.modalGrid = document.getElementById("modalGrid");
  dom.toast = document.getElementById("toast");
  dom.editModal = document.getElementById("edit-modal");
}

function migrateLevels(levels) {
  for (const l of levels) {
    if (!l.section || (l.section !== "main" && l.section !== "pending")) {
      l.section = l.onList === false ? "pending" : "main";
    }
    delete l.onList;
    if (!l.showcaseVideos) l.showcaseVideos = [];
    if (l.section === "pending") l.rank = null;
  }
  return levels;
}

function isPending(lvl) {
  return lvl.section === "pending";
}

const dateCache = new Map();
function formatDate(d) {
  if (dateCache.has(d)) return dateCache.get(d);
  if (!d || typeof d !== "string" || d.split("-").length !== 3)
    return "Invalid date";
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

function isVerified(lvl) {
  return lvl.worldRecord && lvl.worldRecord.percentage === 100;
}

function buildThumbHTML(lvl, altText, errorFallback) {
  if (lvl.thumbnail) {
    return `<img src="${lvl.thumbnail}" alt="${altText}" loading="lazy" onerror="${errorFallback}">`;
  }
  let fallbackId = "";
  if (lvl.ids && lvl.ids.length) {
    for (const idObj of lvl.ids) {
      const match = idObj.id.match(/^\d+/);
      if (match) {
        fallbackId = match[0];
        break;
      }
    }
  }
  if (fallbackId) {
    return `<img src="https://levelthumbs.prevter.me/thumbnail/${fallbackId}" alt="${altText}" loading="lazy" onerror="${errorFallback}">`;
  }
  return `<div class="thumb-placeholder"></div>`;
}

function buildRowHTML(lvl, i, isPendingRow) {
  const verified = isVerified(lvl);
  const rowCls = verified ? "verified-row" : "unverified-row";
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
  const rankDisplay = isPendingRow
    ? `<span class="rank-num pending-rank">—</span>`
    : `<span class="rank-num ${getRankClass(lvl.rank)}">#${lvl.rank}</span>`;
  const clickId = isPendingRow ? `pending_${lvl.name}` : lvl.rank;
  const openCall = isPendingRow
    ? `openModalByName('${lvl.name.replace(/'/g, "\\'")}')`
    : `openModal(${lvl.rank})`;

  return `<div class="level-row ${rowCls}" onclick="${openCall}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${openCall};}" role="button" tabindex="0" aria-label="View details for ${lvl.name}"${delay}>
  <div class="rank-col">${rankDisplay}</div>
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
  const verified = isVerified(lvl);
  const parts = [];
  parts.push(
    `<span class="tag ${verified ? "v-yes" : "v-no"}">${verified ? "VERIFIED" : "UNVERIFIED"}</span>`,
  );
  if (lvl.twoPlayer) parts.push(`<span class="tag duo">2-PLAYER</span>`);
  if (lvl.rateStatus)
    parts.push(
      `<span class="tag rate">${esc(lvl.rateStatus).toUpperCase()}</span>`,
    );
  return parts.join("");
}

function renderList() {
  const mainLevels = filtered.filter((l) => !isPending(l));
  const pendingLevels = filtered.filter((l) => isPending(l));

  if (!mainLevels.length) {
    dom.levelList.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>No levels match your search.</p></div>`;
  } else {
    dom.levelList.innerHTML = mainLevels
      .map((lvl, i) => buildRowHTML(lvl, i, false))
      .join("");
  }

  if (pendingLevels.length) {
    dom.pendingSection.style.display = "";
    dom.pendingList.innerHTML = pendingLevels
      .map((lvl, i) => buildRowHTML(lvl, i, true))
      .join("");
  } else {
    dom.pendingSection.style.display = "none";
  }
}

function updateStats() {
  const mainLevels = LEVELS.filter((l) => !isPending(l));
  const total = mainLevels.length;
  let verified = 0;
  let totalProgress = 0;

  for (const l of mainLevels) {
    if (isVerified(l)) verified++;
    if (l.worldRecord && l.worldRecord.percentage) {
      totalProgress += l.worldRecord.percentage;
    }
  }

  const avg = total ? totalProgress / total : 0;
  const pct = Math.round(avg * 100);

  requestAnimationFrame(() => {
    dom.statVerified.textContent = verified;
    dom.statUnverified.textContent = total - verified;
    dom.statPercent.textContent = avg.toFixed(2) + "%";
    dom.statPercentSub.textContent = "completed";
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
    )
      return false;
    if (status === "verified" && !isVerified(lvl)) return false;
    if (status === "unverified" && isVerified(lvl)) return false;
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

function openModalByName(name) {
  const lvl = LEVELS.find((l) => l.name === name);
  if (!lvl) return;
  openModalForLevel(lvl);
}

function openModal(rank) {
  const lvl = rankMap.get(rank);
  if (!lvl) return;
  if (rank === lastModalRank && dom.modal.classList.contains("open")) return;
  openModalForLevel(lvl);
}

function openModalForLevel(lvl) {
  lastModalRank = lvl.rank;
  const thumb = buildThumbHTML(
    lvl,
    lvl.name,
    "this.onerror=null;this.parentElement.innerHTML='<div style=\\'font-size:50px\\'></div>'",
  );
  const wrPct = lvl.worldRecord ? lvl.worldRecord.percentage : null;
  const wrHolder = lvl.worldRecord ? lvl.worldRecord.holder : null;
  const wrVideo = lvl.worldRecord ? lvl.worldRecord.video : null;
  const wr = wrPct === 100 ? "100%" : !wrPct ? "None" : wrPct + "%";
  const tags = buildTagsHTML(lvl);

  const idsHTML =
    lvl.ids && lvl.ids.length
      ? `<div class="modal-ids-list">${lvl.ids
          .map(
            (entry) =>
              `<div class="modal-id-row"><span class="detail-val code">${entry.id}</span>${entry.label ? `<span class="modal-id-label">${esc(entry.label)}</span>` : ""}</div>`,
          )
          .join("")}</div>`
      : `<span class="detail-val" style="color:var(--muted)">—</span>`;

  const progressPct = wrPct != null ? wrPct : 0;
  const progressCls = wrPct === 100 ? "complete" : "";

  const rankBadge = isPending(lvl)
    ? `<div class="modal-rank-badge pending-badge">PENDING</div>`
    : `<div class="modal-rank-badge">RANK #${lvl.rank}</div>`;

  const wrVideoHTML = wrVideo
    ? `<a href="${esc(wrVideo)}" target="_blank" rel="noopener" class="wr-video-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Watch completion video
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>`
    : "";

  const showcaseHTML =
    lvl.showcaseVideos && lvl.showcaseVideos.length
      ? `<div class="modal-showcase-section">
          <div class="detail-key" style="margin-bottom:10px">Showcase Videos</div>
          <div class="modal-showcase-grid">
            ${lvl.showcaseVideos
              .map((v, i) => {
                const ytMatch = v.url.match(
                  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
                );
                const thumbSrc = ytMatch
                  ? `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`
                  : "";
                const thumbEl = thumbSrc
                  ? `<img class="showcase-card-thumb" src="${thumbSrc}" alt="Showcase ${i + 1}" loading="lazy" onerror="this.style.display='none'">`
                  : `<div class="showcase-card-thumb no-thumb"></div>`;
                return `<a href="${esc(v.url)}" target="_blank" rel="noopener" class="showcase-card-link">
                  ${thumbEl}
                  <div class="showcase-card-label">
                    Showcase ${i + 1}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </div>
                </a>`;
              })
              .join("")}
          </div>
        </div>`
      : "";

  dom.modalHero.innerHTML = `
  <div class="modal-thumb">${thumb}</div>
  <div class="modal-title-area">
    ${rankBadge}
    <div class="modal-name">${lvl.name}</div>
    <div class="modal-creators-line">by ${lvl.creators.join(", ")}</div>
    <div class="modal-tags-row">${tags}</div>
  </div>`;

  dom.modalGrid.innerHTML = `
  <div class="modal-progress-section">
    <div class="modal-progress-header">
      <span class="modal-progress-pct ${progressCls}">${wrPct != null ? wrPct + "%" : "—"}</span>
      <span class="modal-progress-label">World Record</span>
    </div>
    <div class="modal-progress-track"><div class="modal-progress-fill ${progressCls}" style="width:${progressPct}%"></div></div>
    ${wrHolder ? `<div class="modal-wr-holder">Held by <strong>${esc(wrHolder)}</strong></div>` : ""}
    ${wrVideoHTML}
  </div>
  <div class="modal-details-grid">
    <div class="detail-block"><div class="detail-key">Date Uploaded</div><div class="detail-val">${formatDate(lvl.dateUploaded)}</div></div>
    <div class="detail-block"><div class="detail-key">2-Player</div><div class="detail-val">${lvl.twoPlayer ? "Yes" : "No"}</div></div>
    <div class="detail-block"><div class="detail-key">Rate Status</div><div class="detail-val" style="color:var(--purple-light)">${lvl.rateStatus ? esc(lvl.rateStatus) : "—"}</div></div>
    <div class="detail-block full"><div class="detail-key">Level IDs</div>${idsHTML}</div>
    <div class="detail-block half"><div class="detail-key">Creators</div><div class="detail-val">${lvl.creators.join(", ")}</div></div>
  </div>
  ${showcaseHTML}`;

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
  rankMap = new Map(
    LEVELS.filter((l) => l.rank != null).map((l) => [l.rank, l]),
  );
}

function saveLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ levels: LEVELS }));
}

function loadLevels() {
  const saved = localStorage.getItem(LOCAL_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      LEVELS = migrateLevels(parsed.levels || []);
      rebuildRankMap();
      updateStats();
      applyFilters();
      return Promise.resolve();
    } catch (e) {}
  }
  return fetch("levels.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      LEVELS = migrateLevels(data.levels || []);
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
      if (dom.editModal && dom.editModal.classList.contains("open")) {
        closeEditMenu();
      } else {
        closeModalDirect();
      }
    }
    if (e.shiftKey && e.key === "M") {
      e.preventDefault();
      if (dom.editModal && dom.editModal.classList.contains("open")) {
        closeEditMenu();
      } else {
        openEditMenu();
      }
    }
  });

  loadLevels();
}

init();

function openEditMenu() {
  dom.editModal.classList.add("open");
  document.body.style.overflow = "hidden";
  showEditView("list");
  renderEditTable();
}

function closeEditMenu() {
  dom.editModal.classList.remove("open");
  document.body.style.overflow = "";
}

function showEditView(name) {
  document
    .querySelectorAll(".edit-view")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("edit-view-" + name).classList.add("active");
}

function renderEditTable(filterQ) {
  const tbody = document.getElementById("edit-table-body");
  let data = LEVELS;
  if (filterQ) {
    const q = filterQ.toLowerCase();
    data = LEVELS.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.creators.some((c) => c.toLowerCase().includes(q)) ||
        (l.ids && l.ids.some((id) => id.id.toLowerCase().includes(q))),
    );
  }
  if (!data.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--muted);font-size:13px">No levels found</td></tr>';
    return;
  }
  tbody.innerHTML = data
    .map((lvl) => {
      const idx = LEVELS.indexOf(lvl);
      const firstId = lvl.ids && lvl.ids.length ? lvl.ids[0].id : "—";
      const verified = isVerified(lvl);
      const pending = isPending(lvl);
      return `<tr
      draggable="true"
      data-idx="${idx}"
      ondragstart="onDragStart(event, ${idx})"
      ondragover="onDragOver(event)"
      ondragleave="onDragLeave(event)"
      ondrop="onDrop(event, ${idx})"
      ondragend="onDragEnd(event)"
      class="edit-drag-row"
    >
      <td class="edit-td-rank drag-handle" title="Drag to reorder">⠿ ${lvl.rank ?? "—"}</td>
      <td class="edit-td-name">${esc(lvl.name)}</td>
      <td class="edit-td-creator">${esc(lvl.creators.join(", "))}</td>
      <td class="edit-td-id">${esc(firstId)}</td>
      <td class="edit-td-section" style="${pending ? "color:var(--muted);font-style:italic" : ""}">
        ${pending ? "Pending" : "Main"}
      </td>
      <td class="edit-td-status" style="color:${verified ? "var(--verified)" : "var(--unverified)"}">
        ${verified ? "✓ Verified" : "✗ Unverified"}
      </td>
      <td class="edit-td-actions">
        <button class="ebtn ebtn-ghost ebtn-sm" onclick="openLevelForm(${idx})">Edit</button>
        <button class="ebtn ebtn-red ebtn-sm" onclick="deleteLevelByIndex(${idx})">Delete</button>
      </td>
    </tr>`;
    })
    .join("");
}

function onDragStart(e, idx) {
  dragSrcIdx = idx;
  e.dataTransfer.effectAllowed = "move";
  e.currentTarget.classList.add("dragging");
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function onDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function onDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;

  const moved = LEVELS.splice(dragSrcIdx, 1)[0];
  LEVELS.splice(targetIdx, 0, moved);

  let rankCounter = 1;
  for (const lvl of LEVELS) {
    if (!isPending(lvl)) {
      lvl.rank = rankCounter++;
    } else {
      lvl.rank = null;
    }
  }

  rebuildRankMap();
  saveLocal();
  updateStats();
  applyFilters();
  renderEditTable(document.getElementById("edit-search").value);
  flashMessage("✓ REORDERED");
}

function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document
    .querySelectorAll(".drag-over")
    .forEach((el) => el.classList.remove("drag-over"));
  dragSrcIdx = null;
}

function openLevelForm(idx) {
  editingIndex = idx;
  const isNew = idx === -1;

  document.getElementById("form-title").textContent = isNew
    ? "Add Level"
    : `Editing: ${LEVELS[idx].name}`;
  document.getElementById("form-delete-btn").style.display = isNew
    ? "none"
    : "";

  const item = isNew
    ? {
        rank: null,
        section: "main",
        name: "",
        ids: [{ id: "", label: null }],
        worldRecord: { percentage: 0, holder: null, video: null },
        dateUploaded: null,
        creators: [],
        twoPlayer: false,
        rateStatus: null,
        video: null,
        showcaseVideos: [],
      }
    : LEVELS[idx];

  document.getElementById("f-name").value = item.name || "";
  document.getElementById("f-creators").value = item.creators.join(", ");
  document.getElementById("f-rank").value = item.rank ?? "";
  document.getElementById("f-section").value = item.section || "main";
  document.getElementById("f-twoplayer").value = String(!!item.twoPlayer);
  document.getElementById("f-date").value = item.dateUploaded || "";
  document.getElementById("f-ratestatus").value = item.rateStatus || "";
  document.getElementById("f-wr-pct").value =
    item.worldRecord?.percentage ?? "";
  document.getElementById("f-wr-holder").value = item.worldRecord?.holder || "";
  document.getElementById("f-wr-video").value = item.worldRecord?.video || "";

  const idsList = document.getElementById("ids-list");
  idsList.innerHTML = "";
  (item.ids || []).forEach((entry) => addIdRow(entry.id, entry.label));
  if (!(item.ids && item.ids.length)) addIdRow();

  const showcaseList = document.getElementById("showcase-list");
  showcaseList.innerHTML = "";
  (item.showcaseVideos || []).forEach((v) => addShowcaseRow(v.url));

  showEditView("form");
  document.getElementById("edit-modal").scrollTop = 0;
}

function addIdRow(id, label) {
  const list = document.getElementById("ids-list");
  const div = document.createElement("div");
  div.className = "id-entry";
  div.innerHTML = `<div class="id-entry-grid">
    <div class="form-group">
      <label class="form-label">ID</label>
      <input class="form-input" data-field="id" type="text" value="${esc(String(id || ""))}" placeholder="e.g. 12345678">
    </div>
    <div class="form-group">
      <label class="form-label">Label</label>
      <input class="form-input" data-field="label" type="text" value="${esc(String(label || ""))}" placeholder="Fix / Original / Reupload">
    </div>
    <button class="ebtn ebtn-red ebtn-sm id-remove-btn" onclick="this.closest('.id-entry').remove()">✕</button>
  </div>`;
  list.appendChild(div);
}

function addShowcaseRow(url) {
  const list = document.getElementById("showcase-list");
  const div = document.createElement("div");
  div.className = "showcase-entry";
  div.innerHTML = `<div class="showcase-entry-row">
    <input class="form-input" data-field="url" type="text" value="${esc(String(url || ""))}" placeholder="https://youtube.com/...">
    <button class="ebtn ebtn-red ebtn-sm" onclick="this.closest('.showcase-entry').remove()">✕</button>
  </div>`;
  list.appendChild(div);
}

function saveLevelForm() {
  const name = document.getElementById("f-name").value.trim();
  if (!name) {
    alert("Level name is required.");
    return;
  }

  const creatorsRaw = document.getElementById("f-creators").value;
  const creators = creatorsRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const section = document.getElementById("f-section").value;
  const rankVal = document.getElementById("f-rank").value.trim();
  const rank =
    section === "pending" || rankVal === "" ? null : parseInt(rankVal);

  const ids = Array.from(document.querySelectorAll(".id-entry"))
    .map((el) => ({
      id: el.querySelector('[data-field="id"]').value.trim(),
      label: el.querySelector('[data-field="label"]').value.trim() || null,
    }))
    .filter((entry) => entry.id);

  const showcaseVideos = Array.from(
    document.querySelectorAll(".showcase-entry"),
  )
    .map((el) => ({ url: el.querySelector('[data-field="url"]').value.trim() }))
    .filter((entry) => entry.url);

  const wrPct = parseFloat(document.getElementById("f-wr-pct").value);
  const wrHolder = document.getElementById("f-wr-holder").value.trim() || null;
  const wrVideo = document.getElementById("f-wr-video").value.trim() || null;

  const item = {
    rank,
    section,
    name,
    ids,
    worldRecord: {
      percentage: isNaN(wrPct) ? 0 : wrPct,
      holder: wrHolder,
      video: wrVideo,
    },
    dateUploaded: document.getElementById("f-date").value.trim() || null,
    creators,
    twoPlayer: document.getElementById("f-twoplayer").value === "true",
    rateStatus: document.getElementById("f-ratestatus").value.trim() || null,
    video: null,
    showcaseVideos,
  };

  if (editingIndex === -1) {
    LEVELS.push(item);
  } else {
    LEVELS[editingIndex] = item;
  }

  LEVELS.sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank;
    if (a.rank != null) return -1;
    if (b.rank != null) return 1;
    return 0;
  });

  rebuildRankMap();
  saveLocal();
  updateStats();
  applyFilters();
  showEditView("list");
  renderEditTable(document.getElementById("edit-search").value);
  flashMessage("✓ SAVED");
}

function deleteLevelByIndex(idx) {
  if (!confirm(`Delete "${LEVELS[idx].name}"?`)) return;
  LEVELS.splice(idx, 1);
  rebuildRankMap();
  saveLocal();
  updateStats();
  applyFilters();
  renderEditTable(document.getElementById("edit-search").value);
  flashMessage("✓ DELETED");
}

function deleteCurrentLevel() {
  if (editingIndex === -1) return;
  if (!confirm(`Delete "${LEVELS[editingIndex].name}"?`)) return;
  LEVELS.splice(editingIndex, 1);
  rebuildRankMap();
  saveLocal();
  updateStats();
  applyFilters();
  showEditView("list");
  renderEditTable(document.getElementById("edit-search").value);
  flashMessage("✓ DELETED");
}

function exportJSON() {
  const out = JSON.stringify({ levels: LEVELS }, null, 2);
  navigator.clipboard
    .writeText(out)
    .then(() => flashMessage("✓ COPIED TO CLIPBOARD"))
    .catch(() => {
      const blob = new Blob([out], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "levels.json";
      a.click();
      flashMessage("✓ DOWNLOADED");
    });
}

function resetToOriginal() {
  if (!confirm("Clear all local edits and reload from levels.json?")) return;
  localStorage.removeItem(LOCAL_KEY);
  fetch("levels.json")
    .then((r) => r.json())
    .then((data) => {
      LEVELS = migrateLevels(data.levels || []);
      rebuildRankMap();
      updateStats();
      applyFilters();
      renderEditTable();
      flashMessage("✓ RESET TO ORIGINAL");
    })
    .catch(() => flashMessage("✗ FAILED TO FETCH"));
}

function flashMessage(msg) {
  const el = document.getElementById("save-flash");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
