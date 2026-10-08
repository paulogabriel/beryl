/* Beryl: dashboard, graph and timeline. Uses the helpers in common.js and the texts in i18n.js. */
let DATA = [], byId = {}, back = {}, projects = [], META = {editable:false, statuses:[], generated:""};

const $ = id => document.getElementById(id);

function index(payload){
  META = {editable: !!payload.editable, statuses: payload.statuses || [], generated: payload.generated || "", vault: payload.vault || "",
          galaxyCore: payload.galaxy_core || null, language: payload.language || "auto", areaOrder: payload.area_order || [], claudeFolder: payload.claude_folder || null, exportWarnDays: +(payload.export_warn_days ?? 14), sources: payload.sources || {notes: true}};
  DATA = payload.notes;
  byId = Object.fromEntries(DATA.map(n => [n.id, n]));
  back = {}; DATA.forEach(n => n.links.forEach(l => (back[l] = back[l] || []).push(n.id)));
  projects = DATA.filter(n => n.project);
  setTexts(payload.language, payload.texts);
  setStatusGroups(payload.status_groups, payload.status_words);
  indexFolders();
}

/* real notes (neither conversations nor projects inferred from Code sessions) */
const isAuto = n => n.kind === "projeto-auto";
const isNote = n => !isConv(n) && !isAuto(n);
const inClaude = n => !!META.claudeFolder && n.path.startsWith(META.claudeFolder + "/");
/* supporting notes: those in Claude's folder and at the root, or every non-project note if there's no Claude folder */
const isDoc = n => isNote(n) && !n.project && (META.claudeFolder ? inClaude(n) || n.group === "" : true);
/* top-level folder; folders named like "A01 Name" group by their letter */
const folderKey = n => (/^([A-Z])\d\d\b/.exec(n.group) || [])[1] || n.group || "raiz";
const PALETTE = ["var(--a)", "var(--b)", "var(--c)", "var(--idea)", "var(--wait)"];
function indexFolders(){
  const keys = Object.entries(countBy(DATA.filter(isNote), folderKey)).filter(([k]) => k !== "raiz")
    .sort((a, b) => b[1] - a[1]).slice(0, PALETTE.length).map(([k]) => k).sort();
  const color = (k, i) => PALETTE[/^[A-E]$/.test(k) ? k.charCodeAt(0) - 65 : i];   // A, B, C… always keep the same color
  COLORS.pasta = {...Object.fromEntries(keys.map((k, i) => [k, color(k, i)])), raiz: "var(--faint)", outro: "var(--faint)"};
  LEG.pasta = [...keys.map(k => [k, k]), ["raiz", t("leg_root")]];
}

/* status groups: color and name in plural (status bar) and singular (graph legend) */
const STATUS_COLOR = {ativo:"var(--ok)", pausado:"var(--wait)", continuo:"var(--cont)", ideia:"var(--idea)", encerrado:"var(--done)"};
const STATUS = Object.fromEntries(Object.entries(STATUS_COLOR).map(([k, color]) =>
  [k, {color, get plural(){ return t(`st_${k}_plural`); }, get one(){ return t(`st_${k}_one`); }}]));
const pending = n => /\?/.test(n.status || "");        // status to confirm
const orig = n => { const o = [].concat(n.origem || []); const c = o.some(x => /code/.test(x)), h = o.some(x => /chat/.test(x)); return c && h ? "ambos" : c ? "code" : h ? "chat" : ""; };
const statusLabel = s => (s || t("no_status")).replace("?", "");
const fmt = d => d ? esc(t("date", {d: d.slice(8,10), m: d.slice(5,7)})) : "—";
const areaRank = a => { const i = META.areaOrder.indexOf(a); return i < 0 ? 99 : i; };   // area order: area_order from the settings, then alphabetical
const AUTO_AREA = "Claude Code";
/* area in the dashboard and timeline: inferred projects (and their conversations) stay together in one group */
const areaOf = n => isAuto(n) || (isConv(n) && byId[n.links[0]] && isAuto(byId[n.links[0]])) ? AUTO_AREA : n.area || "";
const byArea = (a, b) => areaRank(a) - areaRank(b) || a.localeCompare(b, "pt");
const byTitle = (a, b) => a.title.localeCompare(b.title, "pt");
const areasOf = (list, key = areaOf) => [...new Set(list.map(key))].sort(byArea);
const groupBy = (list, key) => list.reduce((g, x) => ((g[key(x)] = g[key(x)] || []).push(x), g), {});
const countBy = (list, key) => list.reduce((c, x) => (c[key(x)] = (c[key(x)] || 0) + 1, c), {});
const fold = s => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const EMPTY = () => `<div class="empty">${t("empty")}</div>`;
const SETUP = () => `<div class="empty">${t("setup")}</div>`;

/* preferences of this browser; without localStorage (private window), the page works the same */
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};
/* marks the active button of a button group */
const press = (group, on) => document.querySelectorAll(`#${group} button`).forEach(b => b.setAttribute("aria-pressed", on(b)));
/* write to the Beryl server */
async function post(path, body, fallback){
  const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || fallback);
  return j;
}

const st = {status:"", origem:"", area:"", sort:"last", q:"", view: store.get("beryl-view") === "accordion" ? "accordion" : "cards"};
let accOpen = null;                         // null: only the first area open
try { const s = JSON.parse(store.get("beryl-acc") || "null"); if (Array.isArray(s)) accOpen = new Set(s); } catch (e) {}
const saveAcc = () => store.set("beryl-acc", JSON.stringify([...accOpen]));

function pills(n){
  const b = bucket(n.status), o = orig(n);
  let h = `<span class="pill st-${b}${pending(n) ? " q" : ""}">${esc(statusLabel(n.status))}</span>`;
  if (o === "code" || o === "ambos") h += `<span class="stamp o-code">Code</span>`;
  if (o === "chat" || o === "ambos") h += `<span class="stamp o-chat">Chat</span>`;
  return h;
}
function matches(n){
  if (!st.q) return true;
  return fold(n.title + " " + n.summary + " " + n.body + " " + n.area).includes(fold(st.q));
}

/* ---------- dashboard ---------- */
function renderMeta(){
  const convs = DATA.filter(n => n.kind === "chat").length, sess = DATA.filter(n => n.kind === "code").length;
  const item = (n, key) => `<div><b>${n}</b><span>${t(key)}</span></div>`;
  $("sum").innerHTML = item(projects.length, "sum_projects") + (META.sources.claude_export || convs ? item(convs, "sum_convs") : "")
    + (META.sources.claude_code || sess ? item(sess, "sum_sessions") : "");
  $("roTag").hidden = META.editable; $("roTag").textContent = t("readonly", {date: META.generated});
  $("stop").hidden = !META.editable;
  $("meta").hidden = true;
}
async function stopServer(){
  try { await post("/api/stop", {}); } catch (e) {}
  stopped = true;
  $("offStrip").hidden = false; $("stop").disabled = true; $("q").disabled = true;
  if (openId) openNote(openId, true);
}
$("stop").onclick = stopServer;
function renderStatusbar(){
  const c = countBy(projects, n => bucket(n.status));
  $("statusbar").innerHTML = Object.keys(STATUS).filter(k => c[k]).map(k =>
    `<button class="sbtn" data-s="${k}" aria-pressed="${st.status === k}"><i style="background:${STATUS[k].color}"></i><span class="n">${c[k]}</span><span class="l">${STATUS[k].plural}</span></button>`).join("") + `<span class="sbhint">${t("sb_hint")}</span>`;
}
/* conversations linked to a project (those that point to it) */
const convsOf = id => (back[id] || []).map(x => byId[x]).filter(x => x && isConv(x)).sort(byLast);
let maxConv = 1;
const led = v => { const lit = Math.max(v ? 1 : 0, Math.round(v / maxConv * 10)); return `<span class="led" aria-hidden="true">${Array.from({length: 10}, (_, i) => `<i${i < lit ? ' class="on"' : ""}></i>`).join("")}</span>`; };
function cardHtml(n){
  const cv = convsOf(n.id).length;
  return `<button class="card${bucket(n.status) === "encerrado" ? " dim" : ""}" data-id="${esc(n.id)}">
    <span class="l1"><h3>${esc(n.title)}</h3><span class="date">${fmt(n.last)}</span></span>
    <span class="l2">${pills(n)}<span class="ar">${esc(areaName(areaOf(n)))}</span><span class="cv">${t("conv_short", {n: cv})}${led(cv)}</span></span>
  </button>`;
}
function renderAreas(){
  const list = projects.filter(n => (!st.status || bucket(n.status) === st.status) && (!st.origem || orig(n) === st.origem) && (!st.area || areaOf(n) === st.area) && matches(n));
  const groups = groupBy(list, areaOf);
  const sortFn = st.sort === "name" ? byTitle : byLast;
  maxConv = Math.max(1, ...projects.map(n => convsOf(n.id).length));
  press("sort", b => b.dataset.so === st.sort);
  $("accTools").hidden = st.view !== "accordion";
  press("pview", b => b.dataset.pv === st.view);
  if (st.view === "accordion") return renderAccordion(groups, sortFn);
  const keys = Object.keys(groups).sort(byArea);
  if (!Object.values(META.sources).some(Boolean)) return $("areas").innerHTML = SETUP();
  $("areas").innerHTML = (keys.length ? keys.map(k => `
    <div class="area"><h2>${esc(areaName(k))}<span>${groups[k].length}</span></h2>
      <div class="cards">${groups[k].sort(sortFn).map(cardHtml).join("")}</div></div>`).join("")
    : EMPTY()) + convResults();
}
/* with a search, the matching conversations too (without a project, a conversation would otherwise appear only in the graph) */
const MAX_RESULTS = 30;
function convResults(){
  if (!st.q) return "";
  const found = DATA.filter(n => isConv(n) && matches(n)).sort(byLast);
  if (!found.length) return "";
  const items = found.slice(0, MAX_RESULTS).map(c => `<li><button data-id="${esc(c.id)}"><span class="d">${fmt(c.last)}</span><span class="t">${esc(c.title)}</span></button></li>`);
  const more = found.length > MAX_RESULTS ? `<p class="muted">${t("more", {n: found.length - MAX_RESULTS})}</p>` : "";
  return `<div class="box conv-results"><h3>${t("convs_found", {n: found.length})}</h3><ul>${items.join("")}</ul>${more}</div>`;
}
const ACC_ORDER = ["ativo","continuo","ideia","pausado","encerrado"];
const accLabel = k => k === "encerrado" ? t("acc_archived") : STATUS[k].plural.toLowerCase();
function renderAccordion(groups, sortFn){
  const filtering = !!(st.status || st.origem || st.area || st.q);
  const areas = areasOf(projects).filter(a => !filtering || groups[a]);
  accOpen = accOpen || new Set(areas.slice(0, 1));
  const convs = DATA.filter(isConv);
  const row = n => `<button class="prow" data-id="${esc(n.id)}"><span class="nm">${esc(n.title)}</span><span class="pl">${pills(n)}</span><em>${t("conv_short", {n: convsOf(n.id).length})}</em><em>${fmt(n.last)}</em></button>`;
  $("areas").innerHTML = (areas.length ? `<div class="acc">${areas.map(a => {
    const all = projects.filter(n => areaOf(n) === a), shown = (groups[a] || []).sort(sortFn);
    const areaConvs = convs.filter(c => areaOf(c) === a).sort(byLast);
    const last = [...all.map(n => n.last), areaConvs[0] && areaConvs[0].last].filter(Boolean).sort().pop();
    const open = filtering || accOpen.has(a), id = "acc-" + (a || "x").replace(/\W+/g, "-");
    return `<section class="acc-area${open ? " open" : ""}" data-acc="${esc(a)}">
      <h2><button class="acc-head" aria-expanded="${open}" aria-controls="${id}">
        <svg class="acc-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        <span class="acc-title"><strong>${esc(areaName(a))}</strong><span class="counts">${t("m_projects", {n: all.length})}${areaConvs.length ? ` · ${t("m_convs", {n: areaConvs.length})}` : ""}</span></span>
        <span class="acc-right"><span class="acc-when">${t("acc_last", {date: fmt(last)})}</span></span>
      </button></h2>
      <div class="acc-body" id="${id}" role="region"><div class="acc-inner"><div class="acc-pad">
        <div class="rows">${shown.map(row).join("") || EMPTY()}</div>
        <div class="acc-recent"><h4>${t("acc_recent")}</h4>
          ${areaConvs.length ? `<p class="sub">${areaConvs.length} ${t("acc_archived")} · ${t("acc_last", {date: fmt(areaConvs[0].last)})}</p><ul>${areaConvs.slice(0, 6).map(c => { const p = byId[c.links[0]];
            return `<li><button data-id="${esc(c.id)}"><span class="d">${fmt(c.last)}</span><span class="t">${esc(c.title)}</span><span class="p">${p ? esc(p.title) + " · " : ""}${c.kind === "code" ? "Claude Code" : "chat"}</span></button></li>`; }).join("")}</ul>`
            : `<p class="none">${t("acc_none")}</p>`}
        </div>
      </div></div></div>
    </section>`; }).join("")}</div>` : EMPTY()) + convResults();
}
$("areas").addEventListener("click", e => {
  const h = e.target.closest(".acc-head"); if (!h) return;
  const sec = h.closest(".acc-area"), a = sec.dataset.acc, on = !sec.classList.contains("open");
  sec.classList.toggle("open", on); h.setAttribute("aria-expanded", on);
  on ? accOpen.add(a) : accOpen.delete(a); saveAcc();
});
seg("pview", b => { st.view = b.dataset.pv; store.set("beryl-view", st.view); renderAreas(); });
$("accOpen").onclick = () => { accOpen = new Set(projects.map(areaOf)); saveAcc(); renderAreas(); };
$("accClose").onclick = () => { accOpen = new Set(); saveAcc(); renderAreas(); };
/* the claude.ai export only has what existed when it was made: warns when it's getting old */
function renderExportNotice(){
  const box = $("exportNotice"), chats = DATA.filter(n => n.kind === "chat" && n.last).map(n => n.last).sort();
  const newest = chats[chats.length - 1], days = newest ? Math.floor((new Date(META.generated) - new Date(newest.slice(0, 10))) / 864e5) : 0;
  box.hidden = !(META.editable && META.sources.claude_export && META.exportWarnDays > 0 && newest && days > META.exportWarnDays);
  if (!box.hidden) box.textContent = t("export_old", {n: days, date: fmt(newest)});
}
/* claude.ai conversations still without area or project: suggests /beryl:organize */
function renderUnsortedNotice(){
  const box = $("unsortedNotice"), n = DATA.filter(x => x.kind === "chat" && !x.area && !x.links.length).length;
  box.hidden = !(META.editable && n);
  if (n) box.textContent = t("unsorted", {n});
}
const lineItem = (id, top, mid, low) => `<li><button data-id="${esc(id)}">${top ? `<span class="m">${top}</span>` : ""}${mid ? `<span class="t">${mid}</span>` : ""}${low ? `<span class="m low">${low}</span>` : ""}</button></li>`;
function renderAside(){
  renderExportNotice(); renderUnsortedNotice();
  const d = DATA.filter(n => n.kind === "daily").sort(byLast).slice(0, 5);
  $("boxDailies").hidden = !META.sources.notes || !d.length;
  $("dailies").innerHTML = d.map(n => lineItem(n.id, esc(n.last), esc(n.summary))).join("");
  const c = projects.filter(pending).sort(byTitle);
  $("boxConfirm").hidden = !META.sources.notes || !c.length;
  $("confirm").innerHTML = c.map(n => lineItem(n.id, "", esc(n.title), `${esc(areaName(areaOf(n)))} · ${t("since", {date: fmt(n.first || n.last)})}`)).join("");
  const convs = DATA.filter(isConv).sort(byLast).slice(0, 6), r = [...projects].sort(byLast).slice(0, 7);
  $("boxRecent").hidden = !(convs.length || r.length);
  $("recent").innerHTML = convs.length ? convs.map(x => { const p = byId[x.links[0]], code = x.kind === "code";
    return lineItem(x.id, `${fmt(x.last)} <span class="stamp o-${code ? "code" : "chat"}">${code ? "Code" : "Chat"}</span>`, p ? esc(p.title) : "", esc(x.title)); }).join("")
    : r.map(n => lineItem(n.id, fmt(n.last), esc(n.title))).join("");
  const docs = DATA.filter(n => META.claudeFolder && isDoc(n)).sort(byTitle);
  $("boxClaude").hidden = !META.claudeFolder || !docs.length;
  $("claudeDocs").innerHTML = docs.map(n => lineItem(n.id, `${esc(n.folder.split("/")[1] || "raiz")} · ${fmt(n.last)}`, esc(n.title))).join("");
}
function renderAreaSelect(){
  const sel = $("area"), cur = sel.value;
  sel.innerHTML = `<option value="">${t("all")}</option>` + areasOf(projects).map(a => `<option value="${esc(a)}">${esc(areaName(a))}</option>`).join("");
  sel.value = cur;
}

/* ---------- markdown ---------- */
function inline(s){
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, t, a) => {
    const id = t.split("#")[0].split("/").pop().trim(); const ok = byId[id];
    return `<button class="wl${ok ? "" : " dead"}" ${ok ? `data-id="${esc(id)}"` : "disabled"}>${a || t.split("/").pop()}</button>`;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+|claude:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s;
}
/* Obsidian comments are dropped; repeated until none is left, so a comment inside another can't leave a "<!--" behind (what is shown is escaped anyway) */
function dropComments(s){ let prev; do { prev = s; s = s.replace(/<!--[\s\S]*?-->/g, ""); } while (s !== prev); return s; }
function md(src){
  const L = dropComments(src).split("\n"); let h = "", i = 0;
  while (i < L.length){
    const l = L[i];
    if (/^#{1,4} /.test(l)){ const k = l.match(/^#+/)[0].length; h += `<h${k}>${inline(l.slice(k + 1))}</h${k}>`; i++; continue; }
    if (/^\|/.test(l)){
      const rows = []; while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
      const cells = r => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const body = rows.filter((r, j) => !(j === 1 && /^\|[\s:|-]+\|$/.test(r)));
      h += `<div class="tw"><table><thead><tr>${cells(body[0]).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.slice(1).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      continue;
    }
    if (/^\s*([-*]|\d+\.) /.test(l)){
      let out = "<ul>", depth = 0;
      while (i < L.length && /^\s*([-*]|\d+\.) /.test(L[i])){
        const d = Math.floor(L[i].match(/^\s*/)[0].length / 2);
        while (d > depth){ out += "<ul>"; depth++; } while (d < depth){ out += "</ul>"; depth--; }
        out += `<li>${inline(L[i].replace(/^\s*([-*]|\d+\.) /, "").replace(/^\[ \] ?/, "☐ ").replace(/^\[x\] ?/i, "☑ "))}</li>`; i++;
      }
      while (depth-- > 0) out += "</ul>"; h += out + "</ul>"; continue;
    }
    if (/^> /.test(l)){ h += `<blockquote>${inline(l.slice(2))}</blockquote>`; i++; continue; }
    if (/^```/.test(l)){ let c = ""; i++; while (i < L.length && !/^```/.test(L[i])) c += esc(L[i++]) + "\n"; i++; h += `<pre class="tw"><code>${c}</code></pre>`; continue; }
    if (!l.trim()){ i++; continue; }
    const p = []; while (i < L.length && L[i].trim() && !/^(#{1,4} |\||\s*([-*]|\d+\.) |> |```)/.test(L[i])) p.push(L[i++]);
    h += `<p>${p.map(inline).join("<br>")}</p>`;
  }
  return h;
}

/* ---------- details window ---------- */
const drawer = $("drawer"), win = $("win");
let openId = null, lastFocus = null;
const narrow = () => matchMedia("(max-width:760px)").matches;
/* title bars are handles: the window can be dragged by them (not on a phone, where it fills the screen) */
function dragBar(box, bar){
  let ox = 0, oy = 0, sx = 0, sy = 0, lim = null, on = false;
  bar.addEventListener("pointerdown", e => {
    if (narrow() || e.target.closest("button")) return;
    const r = box.getBoundingClientRect(), w = box.parentElement.getBoundingClientRect();
    lim = [w.left - r.left + ox, w.right - r.right + ox, w.top - r.top + oy, w.bottom - r.bottom + oy];
    sx = e.clientX - ox; sy = e.clientY - oy; on = true; bar.setPointerCapture(e.pointerId); bar.classList.add("drag");
  });
  bar.addEventListener("pointermove", e => { if (!on) return;
    ox = Math.min(lim[1], Math.max(lim[0], e.clientX - sx)); oy = Math.min(lim[3], Math.max(lim[2], e.clientY - sy)); box.style.translate = `${ox}px ${oy}px`; });
  const end = () => { on = false; bar.classList.remove("drag"); };
  bar.addEventListener("pointerup", end); bar.addEventListener("pointercancel", end);
  return () => { ox = oy = 0; box.style.translate = ""; };
}
const resetWin = dragBar(win, $("wbar")), resetConfirm = dragBar($("cfWin"), $("cfBar"));
function openNote(id, keepScroll){
  const n = byId[id]; if (!n) return;
  if (!openId) lastFocus = document.activeElement;
  openId = id;
  $("dpath").textContent = n.path;
  $("dtitle").textContent = n.title;
  $("wbarT").textContent = t("win_detail", {title: n.title});
  $("dtags").innerHTML = n.project ? pills(n) + (n.area ? `<span class="pill st-encerrado">${esc(n.area)}</span>` : "") : `<span class="pill st-encerrado">${esc(n.kind)}</span>`;
  $("dstatus").innerHTML = statusControl(n);
  const all = (back[id] || []).map(x => byId[x]).filter(Boolean);
  const b = all.filter(x => !isConv(x)), cv = all.filter(isConv).sort(byLast);
  const cell = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  $("dgrid").innerHTML = cell(t("last_activity"), fmt(n.last))
    + (n.project ? cell(t("sum_convs"), cv.filter(c => c.kind === "chat").length) + cell(t("sum_sessions"), cv.filter(c => c.kind === "code").length) : "")
    + cell(t("folder"), esc(n.folder || "—"));
  $("dbodyT").textContent = t(isNote(n) ? "sec_note" : "sec_summary");
  $("dbody").innerHTML = md(n.body);
  $("dconvsBox").hidden = !cv.length;
  $("dconvsT").textContent = t("sec_convs");
  $("dconvs").innerHTML = cv.map(c => `<li><button data-id="${esc(c.id)}"><span class="d">${fmt(c.last)}</span><span class="t">${esc(c.title)}</span><span class="stamp o-${c.kind === "code" ? "code" : "chat"}">${c.kind === "code" ? "Code" : "Chat"}</span></button></li>`).join("");
  $("dbackT").textContent = t("backlinks", {n: b.length});
  $("dback").innerHTML = b.map(x => `<button class="chip" data-id="${esc(x.id)}">${esc(x.title)}</button>`).join("") || `<span class="muted">${t("no_backlinks")}</span>`;
  const del = deleteControl(n); $("ddanger").innerHTML = del; $("ddanger").hidden = !del;
  drawer.classList.add("on"); drawer.setAttribute("aria-hidden", "false");
  if (!keepScroll){ resetWin(); win.querySelector(".db").scrollTop = 0; $("dtitle").focus({preventScroll:true}); }
}
function statusControl(n){
  if (!n.project) return "";
  if (!META.editable) return `<span class="ro">${t("ro_build")}</span>`;
  if (isAuto(n)) return `<span class="ro">${t("ro_auto")}</span>`;
  if (!n.writable) return `<span class="ro">${t("ro_note")}</span>`;
  const cur = (n.status || "").replace("?", ""), q = pending(n);
  const opts = META.statuses.map(s => `<option value="${esc(s)}"${s === cur && !q ? " selected" : ""}>${esc(s)}</option>`).join("");
  const placeholder = q || !META.statuses.includes(cur) ? `<option value="" selected disabled>${esc(statusLabel(n.status))}${q ? t("to_confirm") : ""}</option>` : "";
  return `<label for="stsel">${t("status")}</label><select id="stsel" data-note="${esc(n.id)}"${stopped ? " disabled" : ""}>${placeholder}${opts}</select>`;
}
function deleteControl(n){
  if (!META.editable || stopped || (!isConv(n) && !n.writable)) return "";
  return `<button class="btn" data-del="${esc(n.id)}">${t("del_open")}</button><p>${t("del_hint")}</p>`;
}
let pendingDelete = null;
document.addEventListener("click", e => {
  const b = e.target.closest("[data-del]"); if (!b) return;
  e.stopPropagation();
  const n = byId[b.dataset.del]; if (!n) return;
  pendingDelete = n.id;
  $("cfText").textContent = isConv(n) ? t("del_conv", {title: n.title, where: t(n.kind === "chat" ? "where_chat" : "where_code")}) : t("del_note", {title: n.title});
  delOpener = b; resetConfirm();
  $("delModal").hidden = false; $("cfNo").focus();
}, true);
let delOpener = null;
function closeConfirm(){ $("delModal").hidden = true; pendingDelete = null; if (delOpener && delOpener.isConnected) delOpener.focus(); delOpener = null; }
$("cfNo").onclick = closeConfirm;
$("delModal").addEventListener("click", e => { if (e.target.id === "delModal") closeConfirm(); });
$("cfYes").onclick = async () => {
  const id = pendingDelete; if (!id) return;
  const title = byId[id] ? byId[id].title : id;
  $("cfYes").disabled = true;
  try {
    const j = await post("/api/delete", {id}, t("err_delete"));
    closeConfirm(); closeNote();
    await load(); renderAll();
    toast(t(j.done === "trash" ? "deleted_trash" : "deleted_hidden", {title}));
  } catch (err){ toast(err.message, true); }
  finally { $("cfYes").disabled = false; }
};

function closeNote(){ if (!openId) return; drawer.classList.remove("on"); drawer.setAttribute("aria-hidden", "true"); openId = null;
  g3?.select?.(null); if (lastFocus && lastFocus.isConnected) lastFocus.focus(); lastFocus = null; }
$("dclose").onclick = closeNote;
document.addEventListener("click", e => { const t = e.target.closest("[data-id]"); if (t && !t.disabled) openNote(t.dataset.id); });

document.addEventListener("change", async e => {
  if (e.target.id !== "stsel") return;
  const id = e.target.dataset.note, status = e.target.value;
  e.target.disabled = true;
  try {
    const j = await post("/api/status", {id, status}, t("err_save"));
    Object.assign(byId[id], {status:j.status, last:j.last});
    renderAll(); openNote(id, true);
    toast(t("saved_status", {title: byId[id].title, status: j.status}));
  } catch (err){
    toast(err.message, true); e.target.disabled = false;
  }
});

let toastT;
function toast(msg, err){ const t = $("toast"); t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2800); }

/* ---------- graph ---------- */
const gState = {color:"origem", daily:true, docs:false, mode:"galaxy", depth:false, spin:true, chats:true, sonar: store.get("beryl-sonar") !== "off"};
let sim = null, gSel = null, g3 = null;
const statusColors = Object.fromEntries(Object.entries(STATUS).map(([k, s]) => [k, s.color]));
const COLORS = {
  origem:{code:"var(--a)", chat:"var(--b)", ambos:"var(--c)", outro:"var(--faint)"},
  status:{...statusColors, outro:"var(--faint)"},
  pasta:{}                                  // built by indexFolders from the notes' folders
};
const LEG = {
  get origem(){ return [["code", t("leg_code")], ["chat", t("leg_chat")], ["ambos", t("leg_both")], ["outro", t("leg_other")]]; },
  get status(){ return [...Object.entries(STATUS).map(([k, s]) => [k, s.one]), ["outro", t("leg_other")]]; },
  pasta:[]
};
function nodeColor(n){
  const m = COLORS[gState.color];
  if (isConv(n)) return gState.color === "origem" ? (m[orig(n)] || m.outro) : gState.color === "status" && byId[n.links[0]] ? m[bucket(byId[n.links[0]].status)] : m.outro;
  if (gState.color === "pasta") return isNote(n) ? m[folderKey(n)] || m.outro : m.outro;
  if (!n.project) return m.outro;
  return gState.color === "origem" ? (m[orig(n)] || m.outro) : m[bucket(n.status)];
}
function renderLegend(){ $("legend").innerHTML = LEG[gState.color].map(([k, l]) => `<span><i style="background:${COLORS[gState.color][k]}"></i>${esc(l)}</span>`).join(""); }
/* the most recent conversation with Claude (claude.ai or Code), by exact time */
function latestConvId(){
  let best = null;
  DATA.forEach(n => { if (isConv(n) && (!best || (n.lastAt || n.last || "") > (best.lastAt || best.last || ""))) best = n; });
  return best ? best.id : null;
}
function graphData(){
  const latest = gState.mode === "3d" ? latestConvId() : null;   // in 3D, only the latest session joins among the conversations
  const keep = n => n.project || n.kind === "indice" || n.id === latest || (gState.daily && n.kind === "daily") || (gState.docs && isDoc(n));
  const nodes = DATA.filter(keep).map(n => ({...n}));
  const idx = new Set(nodes.map(n => n.id));
  const links = []; nodes.forEach(n => n.links.forEach(l => { if (idx.has(l)) links.push({source:n.id, target:l}); }));
  const deg = countBy(links.flatMap(l => [l.source, l.target]), x => x);
  const r = n => n.kind === "indice" ? 11 : 5 + Math.min(9, Math.sqrt(deg[n.id] || 0) * 2.2);
  return {nodes, links, r};
}

function drawGraph(){
  const svgEl = $("graph"), box = $("graph3d"), mode = gState.mode;
  const view = g3 && g3.mode === mode && g3.getView ? g3.getView() : null;   // redrawing the same view keeps the zoom and angle
  if (g3){ g3.destroy(); g3 = null; }
  if (sim){ sim.stop(); sim = null; }
  d3.select(svgEl).selectAll("*").remove(); gSel = null;
  const opt = (el, on, why) => { el.disabled = !on; el.title = on ? "" : why; };
  opt($("gdepth"), mode === "3d", t("only_3d"));
  $("glatest").hidden = !latestConvId(); opt($("glatest"), mode !== "2d", t("only_gal3d"));
  $("gdocs").hidden = !META.sources.notes; opt($("gdocs"), mode !== "galaxy", t("only_2d3d"));
  $("gdocs").textContent = t(META.claudeFolder ? "docs_claude" : "docs_other");
  $("gdaily").hidden = !META.sources.notes || !DATA.some(n => n.kind === "daily");    // daily notes only exist with a notes folder
  $("gshow").closest(".fgroup").hidden = [...$("gshow").children].every(b => b.hidden);  // no options left: no "Show" label either
  opt($("gchats"), mode === "galaxy", t("only_gal")); opt($("gspin"), mode === "galaxy", t("only_gal"));
  box.classList.toggle("galaxy", mode === "galaxy");
  svgEl.toggleAttribute("hidden", mode !== "2d"); box.hidden = mode === "2d";
  if (mode === "2d") draw2d(svgEl);
  else {
    g3 = window.THREE ? (mode === "galaxy" ? mountGalaxy : mount3d)(box) : null;
    if (!g3){                                  // no WebGL: back to 2D
      gState.mode = "2d"; press("gmode", x => x.dataset.m === "2d");
      toast(t("no_webgl", {view: t(mode === "galaxy" ? "view_galaxy" : "view_3d")}), true);
      return drawGraph();
    }
  }
  if (g3){ g3.mode = mode; if (view) g3.setView(view); }
  $("ghint").textContent = t(mode === "galaxy" && isCrt() ? "hint_galaxy_crt" : "hint_" + mode);
  renderLegend(); markGraph();
}
/* what a screen reader hears for the focused star: name, kind, area and date */
const describe = n => [n.title, t("kind_" + (n.project ? "project" : n.kind === "chat" || n.kind === "code" ? n.kind : "note")),
  n.area && areaName(n.area), n.last && t("date", {d: n.last.slice(8, 10), m: n.last.slice(5, 7)})].filter(Boolean).join(", ");
/* the CRT themes draw the Galaxy as a flat instrument screen (galaxy-crt.js); the other themes keep the 3D one */
const isCrt = () => (document.documentElement.dataset.theme || "").startsWith("crt");
function mountGalaxy(box){
  return (isCrt() && window.GalaxyCRT ? GalaxyCRT : Galaxy).mount(box, {label: t("label_galaxy"), describe, notes: DATA, areas: areasOf(projects.concat(DATA.filter(n => isConv(n) && n.area)), n => n.area || ""), coreId: META.galaxyCore, color: nodeColor,
    showDaily: gState.daily, showChats: gState.chats, spin: gState.spin, latestId: latestConvId(), sonar: gState.sonar, onClick: id => openNote(id)});
}
function mount3d(box){
  const {nodes, links, r} = graphData();
  return Graph3D.mount(box, {label: t("label_3d"), describe, nodes, links, radius: r, color: nodeColor, latestId: latestConvId(), sonar: gState.sonar,
    dim: n => n.project && bucket(n.status) === "encerrado", depthTime: gState.depth, onClick: id => openNote(id)});
}
function draw2d(svgEl){
  const svg = d3.select(svgEl);
  const W = svgEl.clientWidth, H = svgEl.clientHeight;
  const {nodes, links, r} = graphData();
  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([.3, 4]).on("zoom", e => g.attr("transform", e.transform)));
  const link = g.append("g").selectAll("line").data(links).join("line").attr("class", "gl");
  const node = g.append("g").selectAll("g").data(nodes).join("g").attr("class", "gn");
  node.append("circle").attr("r", r).attr("fill", nodeColor);
  node.append("text").attr("dy", d => r(d) + 12).attr("text-anchor", "middle").text(d => d.title.length > 26 ? d.title.slice(0, 25) + "…" : d.title);
  const nb = {}; links.forEach(l => { (nb[l.source] = nb[l.source] || new Set()).add(l.target); (nb[l.target] = nb[l.target] || new Set()).add(l.source); });
  const light = (on, isOn) => { node.classed("hi", n => on && isOn(n)).classed("lo", n => on && !isOn(n)); };
  const enter = (e, d) => { const s = nb[d.id] || new Set(), near = n => n.id === d.id || s.has(n.id), touches = l => l.source.id === d.id || l.target.id === d.id;
    light(true, near); link.classed("hi", touches).classed("lo", l => !touches(l)); };
  const leave = () => { light(false); link.classed("hi", false).classed("lo", false); };
  /* each node is a keyboard stop: Tab to it shows its neighbors, Enter or Space opens it */
  node.attr("tabindex", 0).attr("role", "button").attr("aria-label", describe)
    .on("mouseenter", enter).on("focus", enter).on("mouseleave", leave).on("blur", leave)
    .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); openNote(d.id); } })
    .on("click", (e, d) => openNote(d.id))
    .call(d3.drag().on("start", (e, d) => { if (!e.active) sim.alphaTarget(.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
  gSel = node;
  sim = d3.forceSimulation(nodes).force("link", d3.forceLink(links).id(d => d.id).distance(70).strength(.5))
    .force("charge", d3.forceManyBody().strength(-230)).force("center", d3.forceCenter(W / 2, H / 2 + 10))
    .force("collide", d3.forceCollide().radius(d => r(d) + 14)).force("x", d3.forceX(W / 2).strength(.04)).force("y", d3.forceY(H / 2).strength(.06))
    .on("tick", () => { link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x},${d.y})`); });
  if (reduced()){ sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); sim.on("tick")(); }
}
function markGraph(){
  if (gSel) gSel.classed("match", d => !!st.q && matches(d));
  if (g3) g3.setMatch(st.q ? matches : null);
}
function seg(id, fn){ $(id).addEventListener("click", e => { const b = e.target.closest("button"); if (b) fn(b); }); }
/* on/off button of a graph option */
function toggle(id, key, apply){
  $(id).setAttribute("aria-pressed", gState[key]);
  $(id).onclick = () => { gState[key] = !gState[key]; $(id).setAttribute("aria-pressed", gState[key]); apply(); };
}
seg("gcolor", b => { gState.color = b.dataset.c; press("gcolor", x => x === b);
  if (gSel) gSel.select("circle").attr("fill", nodeColor); if (g3) g3.setColor(nodeColor); renderLegend(); });
seg("gmode", b => { if (gState.mode === b.dataset.m) return; gState.mode = b.dataset.m;
  press("gmode", x => x === b); store.set("beryl-gmode", gState.mode); drawGraph(); });
seg("gshow", b => { const k = b.dataset.s; gState[k] = !gState[k]; b.setAttribute("aria-pressed", gState[k]);
  if (gState.mode === "galaxy" && k === "daily" && g3) g3.setDaily(gState.daily); else drawGraph(); });
/* "Latest session": turns the sonar pulse of the most recent conversation on and off */
toggle("glatest", "sonar", () => { store.set("beryl-sonar", gState.sonar ? "on" : "off"); g3?.setSonar(gState.sonar); });
toggle("gchats", "chats", () => g3?.setChats?.(gState.chats));
toggle("gspin", "spin", () => g3?.setSpin?.(gState.spin));


/* ---------- timeline ---------- */
function renderTimeline(){
  const all = projects.flatMap(n => [n.first, n.last]).concat(DATA.filter(n => n.kind === "daily").map(n => n.last)).filter(Boolean).sort();
  const today = META.generated || new Date().toISOString().slice(0, 10);
  const first = all[0] || today;
  const t0 = new Date(first.slice(0, 7) + "-01"), end = new Date(today); end.setDate(end.getDate() + 20);
  const span = end - t0;
  const pct = d => Math.max(0, Math.min(100, (new Date(d) - t0) / span * 100));
  const monthNames = t("months");
  const mw = 30.4 * 864e5 / span * 100;
  const todayLine = `<span class="tl-today" style="left:${pct(today)}%"></span>`;
  let h = `<div class="tl-row ax"><div class="tl-lab">${t("tl_col_project")}</div><div class="tl-months">`;
  for (let d = new Date(t0); d < end; d.setMonth(d.getMonth() + 1)){
    const mid = new Date(d.getFullYear(), d.getMonth(), 15);
    h += `<span style="left:${pct(mid)}%">${monthNames[d.getMonth()]}</span>`;
  }
  h += `<div class="today" style="left:${pct(today)}%"><b>${t("today")}</b></div></div></div>`;
  h += `<div class="tl-row ax"><div class="tl-lab">${t("daily")}</div><div class="tl-months tl-daily">`;
  DATA.filter(n => n.kind === "daily").forEach(n => h += `<button class="dn" style="left:${pct(n.last)}%" data-id="${esc(n.id)}" title="Daily ${esc(n.last)}" aria-label="Daily note ${esc(n.last)}"></button>`);
  h += `${todayLine}</div></div>`;
  projects.filter(matches).sort((a, b) => byArea(areaOf(a), areaOf(b)) || (a.first || a.last).localeCompare(b.first || b.last)).forEach(n => {
    const a = pct(n.first || n.last), b = pct(n.last || n.first);
    h += `<button class="tl-row" data-id="${esc(n.id)}" aria-label="${esc(n.title)}, ${esc(statusLabel(n.status))}${pending(n) ? "?" : ""}"><span class="tl-lab"><b title="${esc(n.title)}">${esc(n.title)}</b><em>${esc(statusLabel(n.status))}${pending(n) ? " ?" : ""}</em></span>
      <span class="tl-track" style="--mw:${mw}%"><span class="tl-bar b-${bucket(n.status)}${pending(n) ? " q" : ""}" style="left:${a}%;width:calc(${Math.max(0, b - a)}% + 10px)" title="${esc(n.first)} → ${esc(n.last)}"></span>${todayLine}</span></button>`;
  });
  $("tl").innerHTML = h;
  $("tlNote").innerHTML = `<span><i class="bar"></i>${t("tl_leg_bar")}</span><span><i class="bar q"></i>${t("tl_leg_q")}</span><span><i class="dm"></i>${t("tl_leg_daily")}</span><span><i class="td"></i>${t("today")} ${fmt(today)}</span>`;
}

/* ---------- tabs, filters, search ---------- */
const TABS = ["painel", "grafico", "tempo"];
let current = "painel", graphDirty = true;
function show(v){
  current = v;
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.v === v));
  TABS.forEach(x => $("v-" + x).hidden = x !== v);
  $("notices").hidden = v !== "painel";
  if (v !== "grafico" && g3){ g3.destroy(); g3 = null; graphDirty = true; }
  if (v === "grafico" && graphDirty){ drawGraph(); graphDirty = false; }
  store.set("beryl-tab", v);
}
document.querySelector(".tabs").addEventListener("click", e => { const t = e.target.closest(".tab"); if (t) show(t.dataset.v); });
$("statusbar").addEventListener("click", e => { const b = e.target.closest(".sbtn"); if (!b) return; st.status = st.status === b.dataset.s ? "" : b.dataset.s; renderStatusbar(); renderAreas(); });
seg("origem", b => { st.origem = b.dataset.o; press("origem", x => x === b); renderAreas(); });
$("area").onchange = e => { st.area = e.target.value; renderAreas(); };
seg("sort", b => { st.sort = b.dataset.so; renderAreas(); });
const qi = $("q");
qi.addEventListener("input", () => { st.q = qi.value.trim(); renderAreas(); renderTimeline(); markGraph(); });
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== qi && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){ e.preventDefault(); qi.focus(); }
  if (e.key === "Escape"){ if (!$("delModal").hidden) closeConfirm(); else closeNote(); }
  /* Tab stays inside the window (or the confirmation) while one is open */
  if (e.key === "Tab" && (openId || !$("delModal").hidden)){
    const box = !$("delModal").hidden ? $("cfWin") : win;
    const f = [...box.querySelectorAll("button, select, a[href], [tabindex]:not([tabindex='-1'])")].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    if (!box.contains(document.activeElement)){ e.preventDefault(); f[0].focus(); }
    else if (e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]){ e.preventDefault(); f[0].focus(); }
  }
});

/* theme: follows the system, or the choice kept in this browser */
const THEMES = ["crt-beryl", "crt-amber", "auto", "light", "dark"];
function applyTheme(v){ v === "auto" ? document.documentElement.removeAttribute("data-theme") : document.documentElement.dataset.theme = v; }
$("theme").value = THEMES.includes(store.get("beryl-theme")) ? store.get("beryl-theme") : "crt-beryl";   // CRT Beryl unless another was chosen
applyTheme($("theme").value);
$("theme").onchange = e => { applyTheme(e.target.value); store.set("beryl-theme", e.target.value); graphDirty = true; if (current === "grafico"){ drawGraph(); graphDirty = false; } };

/* on a phone, the filters and the graph options fold away, and the side blocks start closed */
const foldBox = (btn, box) => $(btn).addEventListener("click", () => { const on = !$(box).classList.contains("open"); $(box).classList.toggle("open", on); $(btn).setAttribute("aria-expanded", on); });
foldBox("filtersBtn", "filtersBox"); foldBox("gfoldBtn", "gfold");
const phone = matchMedia("(max-width:760px)");
const foldSide = () => document.querySelectorAll(".rest details").forEach(d => { d.open = !phone.matches; });
phone.addEventListener("change", foldSide);

/* what the graph draws: when a refresh brings nothing new for it, the graph stays as it is (no jump back to the start) */
let lastGraphSig = null;
const graphSig = () => DATA.map(n => [n.id, n.title, n.status, n.last, n.area, n.kind, n.links.join(",")].join("|")).join("\n");
function renderAll(){
  renderMeta(); renderStatusbar(); renderAreaSelect(); renderAreas(); renderAside(); renderTimeline();
  const sig = graphSig(), changed = sig !== lastGraphSig; lastGraphSig = sig;
  if (changed){ graphDirty = true; if (current === "grafico"){ drawGraph(); graphDirty = false; } }
}

/* ---------- load and follow the data ---------- */
let version = null, stopped = false;
async function load(){
  if (window.BERYL_DATA){ index(window.BERYL_DATA); return; }
  const r = await fetch("/api/data", {cache:"no-store"});
  const d = await r.json();
  if (!r.ok) throw {shown: d.error};
  index(d);
}
async function poll(){
  if (!META.editable || document.hidden || stopped) return;
  try {
    const r = await fetch("/api/version", {cache:"no-store"});
    const {version: v} = await r.json();
    $("live")?.classList.remove("off");
    if (version && v !== version){ await load(); renderAll(); if (openId) openNote(openId, true); }
    version = v;
  } catch (e){ $("live")?.classList.add("off"); }
}

(async () => {
  try { await load(); }
  catch (e){ $("meta").textContent = (e && e.shown) || t("load_error"); return; }
  renderAll(); foldSide();
  const gm = store.get("beryl-gmode");
  if (gm === "2d" || gm === "3d" || gm === "galaxy") gState.mode = gm;      // Galaxy unless another view was chosen
  press("gmode", x => x.dataset.m === gState.mode);
  const tab = store.get("beryl-tab");
  show(TABS.includes(tab) ? tab : "painel");
  if (META.editable){ poll(); setInterval(poll, 3000); }
})();
