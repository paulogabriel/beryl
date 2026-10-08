/* Beryl: the Galaxy on an instrument screen, for the CRT themes. A flat canvas drawing (no WebGL) with a polar grid, flat marks, a reticle
   and a readout. It takes the same options as Galaxy.mount (galaxy.js) and answers the same calls, and it places every star where galaxy.js does.
   Usage: const g = GalaxyCRT.mount(el, {notes, areas, coreId, color, showDaily, showChats, spin, latestId, sonar, describe, label, onClick});
        g.setColor(fn); g.setMatch(fn); g.setDaily(bool); g.setChats(bool); g.setSpin(bool); g.setSonar(bool);
        g.select(id|null); g.getView(); g.setView(v); g.destroy(); */
(function(){
  const G = Galaxy.geometry, TAU = Math.PI * 2, TILT = .62, RG = G.R_MAX * 1.12;
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const norm = a => ((a % TAU) + TAU) % TAU;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mount(el, opts){
    const P = {}; ["fg", "hot", "muted", "line", "bg", "surface"].forEach(k => P[k] = cssVar("--" + k)); P.grid = P.line;
    const areas = opts.areas.length ? opts.areas : [""];
    const coreId = opts.coreId && opts.notes.some(n => n.id === opts.coreId) ? opts.coreId : null;
    const notes = opts.notes.map(n => ({...n}));
    const {byId, armAngle} = G.layout(notes, areas, coreId);
    const items = notes.filter(n => n.pos);
    const neigh = {};
    notes.forEach(n => n.links.forEach(l => { if (!byId[l]) return; (neigh[n.id] = neigh[n.id] || new Set()).add(l); (neigh[l] = neigh[l] || new Set()).add(n.id); }));

    /* the canvas and the instrument frame around it */
    const cv = document.createElement("canvas"); cv.tabIndex = 0; cv.setAttribute("role", "application"); cv.setAttribute("aria-label", opts.label || "Galaxy"); el.appendChild(cv);
    const ctx = cv.getContext("2d");
    const ui = document.createElement("div"); ui.className = "gcrt"; ui.setAttribute("aria-hidden", "true");
    ui.innerHTML = `<i class="gc c1"></i><i class="gc c2"></i><i class="gc c3"></i><i class="gc c4"></i>
      <div class="gr"></div>
      <div class="gl"><span><i class="gg tri"></i>${esc(t("leg_code"))}</span><span><i class="gg circ"></i>${esc(t("leg_chat"))}</span><span><i class="gg sq"></i>${esc(t("leg_both"))}</span>
        <span><i class="gg circ fill"></i>${esc(t("mark_filled"))}</span><span><i class="gg circ"></i>${esc(t("mark_hollow"))}</span><span><i class="gg ring"></i>${esc(t("latest"))}</span></div>`;
    el.appendChild(ui);
    const readEl = ui.querySelector(".gr");
    const live = document.createElement("div"); live.className = "sr-only"; live.setAttribute("aria-live", "polite"); el.appendChild(live);

    /* state */
    let W = 0, H = 0, R = 0, rot = .4, zoom = 1, panX = 0, panY = 0, goal = null, hits = [], raf = 0, last = 0, dragging = false;
    let hovered = null, selected = null, matchFn = null, colorFn = opts.color, spin = opts.spin !== false && !reduced(), sonarOn = opts.sonar !== false;
    let showDaily = opts.showDaily !== false, showChats = opts.showChats !== false;
    const colors = {};
    const col = n => { const s = String(colorFn(n) || ""); if (colors[s] !== undefined) return colors[s]; const m = /var\((--[^)]+)\)/.exec(s); return colors[s] = m ? cssVar(m[1]) || P.fg : s || P.fg; };

    const visible = n => n.kind === "daily" ? showDaily : isConv(n) ? showChats : true;
    const kindOf = n => { const o = orig(n); return n.id === coreId || o === "ambos" ? "sq" : o === "code" ? "tri" : "circ"; };
    const isMark = n => n.id === coreId || n.project;
    const filled = n => n.id === coreId || ["ativo", "continuo"].includes(bucket(n.status));

    /* view: the plane is turned by rot, flattened by TILT, then zoomed and moved */
    const kk = () => R / RG * zoom;
    const project = (x, z) => { const c = Math.cos(rot), s = Math.sin(rot), k = kk(); return [W / 2 + panX + (x * c - z * s) * k, H / 2 + panY + (x * s + z * c) * k * TILT]; };
    function fit(){
      const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
      if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
      ctx.setTransform(d, 0, 0, d, 0, 0); W = r.width; H = r.height;
      R = Math.min(W / 2 - (W < 560 ? 30 : 52), (H / 2 - 40) / TILT);
    }
    const hexA = (c, a) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim()); return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : c; };

    function glyph(kind, x, y, r, fill, dashed){
      ctx.beginPath();
      if (kind === "tri"){ ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.1, y + r * .85); ctx.lineTo(x - r * 1.1, y + r * .85); ctx.closePath(); }
      else if (kind === "sq") ctx.rect(x - r, y - r, r * 2, r * 2);
      else ctx.arc(x, y, r, 0, TAU);
      if (dashed) ctx.setLineDash([3, 3]);
      if (fill) ctx.fill();
      ctx.stroke(); ctx.setLineDash([]);
    }
    const activeNote = () => byId[hovered || selected] || null;
    const markRadius = n => (5 + Math.min(6, (n.id === coreId ? 4 : (convsOf(n.id).length || 0)) / 5)) * clamp(R / 300, .62, 1) * (1 + .12 * Math.min(4, zoom - 1));

    function draw(now){
      fit(); ctx.clearRect(0, 0, W, H); hits = [];
      const cx = W / 2 + panX, cy = H / 2 + panY, Rk = R * zoom, small = W < 560, act = activeNote();
      const near = act ? (neigh[act.id] || new Set()) : null, on = n => !act || n.id === act.id || near.has(n.id);
      ctx.lineWidth = 1; ctx.font = "16px VT323, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";

      /* 1. polar grid: rings, spokes every 30 degrees, degree marks */
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, TILT); ctx.strokeStyle = P.grid;
      [.25, .5, .75].forEach(q => { ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(0, 0, q * Rk, 0, TAU); ctx.stroke(); });
      ctx.setLineDash([]); ctx.strokeStyle = P.line; ctx.beginPath(); ctx.arc(0, 0, Rk, 0, TAU); ctx.stroke(); ctx.strokeStyle = P.grid;
      for (let d = 0; d < 360; d += 30){ const a = d / 180 * Math.PI; ctx.beginPath(); ctx.moveTo(Math.cos(a) * Rk * .08, Math.sin(a) * Rk * .08); ctx.lineTo(Math.cos(a) * Rk, Math.sin(a) * Rk); ctx.stroke(); }
      ctx.strokeStyle = P.line;
      for (let d = 0; d < 360; d += 5){ const a = d / 180 * Math.PI, tk = (d % 30 === 0 ? 11 : d % 10 === 0 ? 7 : 4) * .55 / TILT; ctx.beginPath(); ctx.moveTo(Math.cos(a) * Rk, Math.sin(a) * Rk); ctx.lineTo(Math.cos(a) * (Rk + tk), Math.sin(a) * (Rk + tk)); ctx.stroke(); }
      ctx.restore();
      if (!small){
        ctx.fillStyle = P.muted;
        const lab = (txt, x, y) => { if (x > 8 && x < W - 8 && y > 8 && y < H - 8) ctx.fillText(txt, x, y); };
        for (let d = 0; d < 360; d += 30){ const a = d / 180 * Math.PI; lab(String(d).padStart(3, "0"), cx + Math.cos(a) * Rk * 1.13, cy + Math.sin(a) * Rk * TILT * 1.13); }
        [25, 50, 75].forEach(v => lab(String(v), cx + 14, cy + v / 100 * Rk * TILT));
      }

      /* 2. arms: spiral lines, the active area's arm lit; names at the tips */
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      areas.forEach(a => {
        const lit = act && (act.project || isConv(act)) && (act.area || "") === a;
        ctx.beginPath();
        for (let i = 0; i <= 90; i++){ const r = G.R_MIN * .9 + i / 90 * (G.R_MAX * 1.1 - G.R_MIN * .9), th = G.spiral(r, armAngle(a)), [x, y] = project(Math.cos(th) * r, Math.sin(th) * r); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = lit ? P.hot : P.fg; ctx.globalAlpha = lit ? .9 : .38; ctx.lineWidth = lit ? 1.6 : 1.1; ctx.shadowColor = P.fg; ctx.shadowBlur = lit ? 8 : 3; ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (!small || lit){ const r = G.R_MAX * 1.16, th = G.spiral(r, armAngle(a)), [tx, ty] = project(Math.cos(th) * r, Math.sin(th) * r);
          ctx.fillStyle = lit ? P.hot : P.muted; ctx.fillText(areaName(a).toUpperCase(), clamp(tx, 60, W - 60), clamp(ty, 14, H - 14)); }
      });

      /* 3. conversations: small squares along the arms */
      const sq = zoom > 2.5 ? 3 : 2;
      items.forEach(n => {
        if (!isConv(n) || !visible(n)) return;
        const [x, y] = project(n.pos[0], n.pos[2]); if (x < -10 || x > W + 10 || y < -10 || y > H + 10) return;
        const lit = n.id === opts.latestId;
        ctx.globalAlpha = on(n) ? (lit ? 1 : .55) : .1; ctx.fillStyle = col(n);
        const s = lit ? 4 : sq; ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
        hits.push([x, y, n, 7]);
      });
      ctx.globalAlpha = 1;

      /* 4. index notes and daily notes around the hub */
      items.forEach(n => {
        if (isConv(n) || isMark(n) || !visible(n)) return;
        const [x, y] = project(n.pos[0], n.pos[2]); ctx.strokeStyle = ctx.fillStyle = col(n); ctx.globalAlpha = on(n) ? .9 : .2; ctx.lineWidth = 1.2;
        if (n.kind === "daily"){ ctx.beginPath(); ctx.moveTo(x, y - 3.5); ctx.lineTo(x + 3.5, y); ctx.lineTo(x, y + 3.5); ctx.lineTo(x - 3.5, y); ctx.closePath(); ctx.fill(); }
        else ctx.strokeRect(x - 3, y - 3, 6, 6);
        ctx.globalAlpha = 1; hits.push([x, y, n, 7]);
      });

      /* 5. the core: a ring and a cross, with the core note as its square */
      { const [x, y] = project(0, 0), rr = G.R_HUB * kk();
        ctx.strokeStyle = P.fg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, rr * 1.45, rr * 1.45 * TILT, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - rr * 2.4, y); ctx.lineTo(x - rr * .6, y); ctx.moveTo(x + rr * .6, y); ctx.lineTo(x + rr * 2.4, y); ctx.moveTo(x, y - rr * 1.8); ctx.lineTo(x, y - rr * .5); ctx.moveTo(x, y + rr * .5); ctx.lineTo(x, y + rr * 1.8); ctx.stroke(); }

      /* 6. projects: flat marks (shape by origin, filled when active), tinted by the chosen color */
      items.forEach(n => {
        if (!isMark(n)) return;
        const [x, y] = project(n.pos[0], n.pos[2]), r = markRadius(n), isAct = act === n, k = on(n) ? 1 : .3;
        ctx.globalAlpha = k; ctx.strokeStyle = ctx.fillStyle = isAct ? P.hot : col(n); ctx.lineWidth = isAct ? 2 : 1.6; ctx.shadowColor = P.fg; ctx.shadowBlur = 8;
        glyph(kindOf(n), x, y, r, filled(n), false); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (n.id === opts.latestId && sonarOn){ ctx.strokeStyle = P.hot; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r + 9 + (reduced() ? 0 : 2 * Math.sin(now / 500)), 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
        hits.push([x, y, n, Math.max(14, r + 6)]);
      });
      /* the latest session when it is a conversation: a dashed ring that breathes */
      const lt = sonarOn && opts.latestId && byId[opts.latestId];
      if (lt && lt.pos && !isMark(lt) && visible(lt)){ const [x, y] = project(lt.pos[0], lt.pos[2]); ctx.strokeStyle = P.hot; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 9 + (reduced() ? 0 : 2 * Math.sin(now / 500)), 0, TAU); ctx.stroke(); ctx.setLineDash([]); }

      /* 7. search matches: a ring and the name */
      if (matchFn){
        ctx.textAlign = "left"; let shown = 0;
        items.forEach(n => { if (!visible(n) || !matchFn(n)) return; const [x, y] = project(n.pos[0], n.pos[2]); if (x < 0 || x > W || y < 0 || y > H) return;
          ctx.strokeStyle = P.hot; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, (isMark(n) ? markRadius(n) : 3) + 5, 0, TAU); ctx.stroke();
          if (shown++ < 12){ ctx.fillStyle = P.hot; ctx.fillText(n.title, Math.min(x + 12, W - ctx.measureText(n.title).width - 8), y - 10); } });
        ctx.textAlign = "center";
      }

      /* 8. reticle and cross lines on the active star */
      if (act && act.pos && visible(act)){
        const [x, y] = project(act.pos[0], act.pos[2]), b = Math.max(15, (isMark(act) ? markRadius(act) : 4) + 9), s = 6;
        ctx.strokeStyle = P.hot; ctx.lineWidth = 1.5; ctx.shadowColor = P.fg; ctx.shadowBlur = 6;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { ctx.beginPath(); ctx.moveTo(x + sx * b, y + sy * (b - s)); ctx.lineTo(x + sx * b, y + sy * b); ctx.lineTo(x + sx * (b - s), y + sy * b); ctx.stroke(); });
        ctx.shadowBlur = 0; ctx.setLineDash([2, 5]); ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(x - b - 4, y); ctx.moveTo(x + b + 4, y); ctx.lineTo(W - 24, y); ctx.moveTo(x, 24); ctx.lineTo(x, y - b - 4); ctx.moveTo(x, y + b + 4); ctx.lineTo(x, H - 24); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    /* readout of the active star */
    function readout(){
      const n = activeNote(), row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
      if (!n){ readEl.innerHTML = `<h4>${esc(t("crt_no_sel"))}</h4><p>${esc(t("crt_no_sel_hint"))}</p>`; return; }
      const og = orig(n), originOf = x => x === "ambos" ? t("both") : x === "code" ? "Code" : "Chat";
      readEl.innerHTML = `<h4>${esc(n.title)}</h4>` + row(t("area"), esc(areaName(n.area || ""))) +
        (n.project ? row(t("status"), esc(statusLabel(n.status))) + row(t("origin"), esc(originOf(og))) + row(t("sum_convs"), convsOf(n.id).length) :
          row(t("origin"), esc(isConv(n) ? originOf(og) : n.kind))) + row(t("last_activity"), fmt(n.last));
    }

    /* choosing: from the mouse, the keyboard or the page */
    const order = () => items.filter(visible).sort((a, b) => armIndex(a) - armIndex(b) || radius(a) - radius(b));
    const armIndex = n => n.id === coreId ? -2 : (n.project || isConv(n)) && areas.includes(n.area || "") ? areas.indexOf(n.area || "") : -1;
    const radius = n => Math.hypot(n.pos[0], n.pos[2]);
    function select(id, quiet){
      selected = id && byId[id] && byId[id].pos ? id : null; readout();
      const n = selected && byId[selected];
      if (n && zoom > 1.2){ const [x, y] = project(n.pos[0], n.pos[2]); goal = {panX: panX + (W / 2 - x), panY: panY + (H / 2 - y)}; }
      if (n && !quiet) live.textContent = opts.describe ? opts.describe(n) : n.title;
    }
    const nearest = e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 1e9;
      hits.forEach(h => { const d = Math.hypot(h[0] - x, h[1] - y) - (isMark(h[2]) ? 4 : 0); if (d < h[3] && d < bd){ bd = d; best = h[2].id; } }); return best; };
    let down = null;
    cv.addEventListener("pointerdown", e => { down = {x: e.clientX, y: e.clientY, px: panX, py: panY, moved: false}; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", e => {
      if (down){ const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.hypot(dx, dy) > 4) down.moved = true; if (down.moved && zoom > 1){ dragging = true; panX = down.px + dx; panY = down.py + dy; goal = null; cv.style.cursor = "grabbing"; } return; }
      const id = nearest(e); if (id !== hovered){ hovered = id; cv.style.cursor = id ? "pointer" : "crosshair"; readout(); }
    });
    cv.addEventListener("pointerup", e => { const d = down; down = null; dragging = false; cv.style.cursor = ""; if (!d || d.moved) return;
      const id = nearest(e); if (id){ select(id); opts.onClick && opts.onClick(id); } });
    cv.addEventListener("pointerleave", () => { if (hovered){ hovered = null; readout(); } });
    cv.addEventListener("dblclick", () => { zoom = 1; panX = panY = 0; goal = null; });
    cv.addEventListener("wheel", e => {
      e.preventDefault(); const r = cv.getBoundingClientRect(), px = e.clientX - r.left - W / 2, py = e.clientY - r.top - H / 2, z = clamp(zoom * Math.exp(-e.deltaY * .0015), 1, 10), q = z / zoom;
      panX = px - (px - panX) * q; panY = py - (py - panY) * q; zoom = z; if (zoom === 1){ panX = panY = 0; } goal = null;
    }, {passive: false});
    cv.addEventListener("keydown", e => {
      const list = order(); if (!list.length) return;
      const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[e.key];
      let i = list.findIndex(n => n.id === selected);
      if (step) i = i < 0 ? (step > 0 ? 0 : list.length - 1) : (i + step + list.length) % list.length;
      else if (e.key === "Home") i = 0; else if (e.key === "End") i = list.length - 1;
      else if ((e.key === "Enter" || e.key === " ") && i >= 0){ e.preventDefault(); opts.onClick && opts.onClick(list[i].id); return; }
      else if (e.key === "Escape"){ select(null); live.textContent = ""; return; }
      else if (e.key === "+" || e.key === "="){ zoom = clamp(zoom * 1.3, 1, 10); return; }
      else if (e.key === "-"){ zoom = clamp(zoom / 1.3, 1, 10); if (zoom === 1) panX = panY = 0; return; }
      else return;
      e.preventDefault(); hovered = null; select(list[i].id);
    });

    /* loop */
    const ro = new ResizeObserver(() => {}); ro.observe(el);
    function frame(now){
      const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
      if (spin && !hovered && !selected && !dragging) rot += dt * .0225;
      if (goal){ panX += (goal.panX - panX) * .12; panY += (goal.panY - panY) * .12; if (Math.abs(goal.panX - panX) + Math.abs(goal.panY - panY) < .5) goal = null; }
      draw(now); raf = requestAnimationFrame(frame);
    }
    readout(); raf = requestAnimationFrame(frame);

    return {
      setColor(fn){ colorFn = fn; Object.keys(colors).forEach(k => delete colors[k]); },
      setMatch(fn){ matchFn = fn; },
      setDaily(on){ showDaily = on; },
      setChats(on){ showChats = on; },
      setSpin(on){ spin = on && !reduced(); },
      setSonar(on){ sonarOn = on; },
      select: id => select(id, true),
      getView: () => ({zoom, panX, panY, rot}),
      setView(v){ zoom = v.zoom; panX = v.panX; panY = v.panY; if (v.rot !== undefined) rot = v.rot; },
      destroy(){ cancelAnimationFrame(raf); ro.disconnect(); el.innerHTML = ""; },
    };
  }

  window.GalaxyCRT = {mount};
})();
