/* Beryl: Galaxy view (three.js r147, UMD build in vendor/three-bundle.js), on top of common.js.
   Each arm is an area; along the arm, stars follow the order of last activity.
   Conversations with Claude (kind "chat" or "code") become small stars along the arm of their area.
   Usage: const g = Galaxy.mount(el, {notes, areas, coreId, color, showDaily, showChats, spin, latestId, sonar, onClick});
        g.setColor(fn); g.setMatch(fn); g.setDaily(bool); g.setChats(bool); g.setSpin(bool); g.setSonar(bool);
        g.select(id|null); g.destroy(); */
(function(){
  const {toColor, softTexture, makeSonar, sonar, stage} = Beryl3D;

  /* colors: the original night sky (white and lilac dust, warm core), or, in the CRT themes, the theme's phosphor */
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function palette(){
    if (!(document.documentElement.dataset.theme || "").startsWith("crt"))
      return {crt: false, space: "#07090c", core: "#ffe2a8", heat: "#fff1d6", glow: "#ffe3b0", white: "#f3f0ff", lilac: "#a58fe6", line: "#cfc4f7", lineOpacity: .2, field: "#aab8c6", link: "#dfe9e6"};
    const hot = cssVar("--hot") || cssVar("--fg"), fg = cssVar("--fg");
    return {crt: true, space: cssVar("--bg"), core: hot, heat: hot, glow: hot, white: hot, lilac: fg, line: fg, lineOpacity: .42, field: cssVar("--muted"), link: fg};
  }
  /* geometry: arm = area, radius = recency order */
  const R_MIN = 22, R_MAX = 124, WIND = 1.15;
  const ARM_START = R_MIN * .7, ARM_END = R_MAX * 1.12, ARM_LEN = ARM_END - ARM_START;
  const R_IN = ARM_START + .22 * ARM_LEN;     // the newest starts at 22% of the arm
  const R_OUT = ARM_START + .86 * ARM_LEN;    // the oldest ends before the tip, where archived projects sit
  const R_HUB = .1 * R_MAX;                   // ring of index notes around the core
  const SPIN = .00014;                        // 20% of the first prototype's speed
  const CORE_LEVEL = .6;                      // core brightness: 60% of the original
  const sameArea = a => n => (n.area || "") === a;

  function rand(seed){ let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h = Math.imul(h ^ (h >>> 13), 3266489909), (h ^= h >>> 16) >>> 0) / 4294967296); }
  const gauss = r => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const spiral = (r, base) => base - WIND * Math.log(r / R_MIN);
  /* relative position (0 to 1) of each item in an already sorted list */
  const ranks = (list, into) => list.forEach((n, i) => { into[n.id] = list.length > 1 ? i / (list.length - 1) : .5; });

  function layout(notes, areas, coreId){
    const byId = Object.fromEntries(notes.map(n => [n.id, n]));
    const armAngle = a => (Math.max(0, areas.indexOf(a)) / Math.max(1, areas.length)) * Math.PI * 2;
    const projects = notes.filter(n => n.project && n.id !== coreId);
    /* position on the arm: half by overall recency, half by recency within the arm */
    const recent = (a, b) => byLast(a, b) || a.id.localeCompare(b.id);
    const live = projects.filter(n => bucket(n.status) !== "encerrado").sort(recent);
    const globalPct = {}, armPct = {}, convPct = {};
    ranks(live, globalPct);
    areas.forEach(a => ranks(live.filter(sameArea(a)), armPct));
    /* conversations: recency within the arm, from the start (recent) to the tip (old) */
    areas.forEach(a => ranks(notes.filter(n => isConv(n) && sameArea(a)(n)).sort(recent), convPct));
    const dailies = notes.filter(n => n.kind === "daily").sort((a, b) => byLast(b, a));
    const gap = Math.PI * 2 / Math.max(1, areas.length);
    notes.forEach(n => {
      const rnd = rand(n.id);
      if (n.id === coreId) n.pos = [0, 0, 0];
      else if (n.project){
        const r = bucket(n.status) === "encerrado" ? R_OUT + 8 + rnd() * 8 : R_IN + (.5 * globalPct[n.id] + .5 * armPct[n.id]) * (R_OUT - R_IN) + (rnd() - .5) * 3;
        const th = spiral(r, armAngle(n.area || "")) + (rnd() - .5) * .12;   // projects: doubled spread too
        n.pos = [Math.cos(th) * r, (rnd() - .5) * 3 * (1 - r / (R_MAX * 1.3)), Math.sin(th) * r];
      } else if (n.kind === "indice" || (n.group === "" && !isConv(n))){
        const th = rnd() * Math.PI * 2, r = R_HUB + (rnd() - .5) * 2;
        n.pos = [Math.cos(th) * r, (rnd() - .5) * 3, Math.sin(th) * r];
      } else if (isConv(n)){
        if (convPct[n.id] === undefined){ const th = rnd() * Math.PI * 2, r = ARM_END + 6 + rnd() * 10; n.pos = [Math.cos(th) * r, (rnd() - .5) * 4, Math.sin(th) * r]; return; }
        const r = ARM_START + (.08 + .9 * convPct[n.id]) * ARM_LEN + (rnd() - .5) * 4;
        const off = Math.max(-2.2, Math.min(2.2, gauss(rnd))) * Math.min(gap * .22, .06 + .08 * r / R_MAX);   // star band: twice the original width, growing from start to tip
        const th = spiral(r, armAngle(n.area)) + off;
        n.pos = [Math.cos(th) * r, gauss(rnd) * (1.4 - .8 * r / R_MAX), Math.sin(th) * r];
      } else if (n.kind === "daily"){
        const th = (dailies.indexOf(n) / Math.max(1, dailies.length)) * Math.PI * 2 + .4, r = R_HUB + 6;
        n.pos = [Math.cos(th) * r, 0, Math.sin(th) * r];
      }
    });
    return {byId, armAngle};
  }

  function mount(el, opts){
    const P = palette();
    const S = stage(el, {fov: 52, near: .5, far: 3000, background: new THREE.Color(P.space), bloom: [.8, .5, .2]});
    if (!S) return null;
    const {scene, camera, controls} = S;
    camera.position.set(0, 135, 185);
    Object.assign(controls, {dampingFactor: .07, minDistance: 25, maxDistance: 520, maxPolarAngle: Math.PI * .92});

    const areas = opts.areas.length ? opts.areas : [""];
    const coreId = opts.coreId && opts.notes.some(n => n.id === opts.coreId) ? opts.coreId : null;
    const notes = opts.notes.map(n => ({...n}));
    const {byId, armAngle} = layout(notes, areas, coreId);
    const neigh = {}, deg = {};
    notes.forEach(n => n.links.forEach(l => { if (!byId[l]) return;
      (neigh[n.id] = neigh[n.id] || new Set()).add(l); (neigh[l] = neigh[l] || new Set()).add(n.id);
      deg[n.id] = (deg[n.id] || 0) + 1; deg[l] = (deg[l] || 0) + 1; }));
    const coreAreas = coreId ? [...new Set(byId[coreId].links.map(l => byId[l]).filter(x => x && x.project).map(x => x.area || ""))] : [];

    const galaxy = new THREE.Group(); scene.add(galaxy);

    const dot = softTexture([[0,1],[.25,.8],[.5,.25],[1,0]]);
    const halo = softTexture([[0,1],[.12,.55],[.4,.12],[1,0]]);
    const cloud = softTexture([[0,.5],[.5,.18],[1,0]]);

    /* arm dust (white with lilac hues) and the core bulge */
    (function dust(){
      const r = rand("poeira"), per = reduced() ? 400 : 650, bulge = 3200;   // less dust: the conversations now draw the arms
      const N = areas.length * per + bulge, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      const core = new THREE.Color(P.heat), white = new THREE.Color(P.white), lilac = new THREE.Color(P.lilac), arm = new THREE.Color(), tmp = new THREE.Color();
      const gap = Math.PI * 2 / areas.length;
      const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      let k = 0;
      areas.forEach(a => {
        for (let i = 0; i < per; i++){
          const rr = ARM_START + r() * ARM_LEN;
          const spread = Math.min(gap * .2, .05 + .05 * (rr / R_MAX));
          const off = Math.max(-2.6, Math.min(2.6, gauss(r))) * spread;
          const th = spiral(rr, armAngle(a)) + off, rad = rr + gauss(r) * 1.6;
          pos.set([Math.cos(th) * rad, gauss(r) * (1.8 - 1.1 * rr / R_MAX), Math.sin(th) * rad], k * 3);
          arm.copy(white).lerp(lilac, Math.pow(r(), 1.6) * .85);
          tmp.copy(core).lerp(arm, smooth(R_MAX * .12, R_MAX * .3, rr)).multiplyScalar((.7 + r() * .6) * (1 - .35 * Math.abs(off) / (spread * 2.6)));
          col.set([tmp.r, tmp.g, tmp.b], k * 3); k++;
        }
      });
      const armCount = k;
      for (let i = 0; i < bulge; i++){
        const rr = Math.abs(gauss(r)) * 5.2, th = r() * Math.PI * 2, ph = gauss(r) * .45;
        pos.set([Math.cos(th) * rr, Math.sin(ph) * rr * .55, Math.sin(th) * rr], k * 3);
        tmp.copy(core).multiplyScalar(.7 + r() * .5); col.set([tmp.r, tmp.g, tmp.b], k * 3); k++;
      }
      const points = (from, to, mat) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos.slice(from * 3, to * 3), 3));
        g.setAttribute("color", new THREE.BufferAttribute(col.slice(from * 3, to * 3), 3));
        galaxy.add(new THREE.Points(g, mat));
      };
      const pmat = opacity => new THREE.PointsMaterial({size: 1.55, map: dot, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending});
      /* the arm dust is mist: big soft points that overlap into a cloud, instead of separate dots */
      const mist = softTexture([[0,.9],[.18,.55],[.45,.18],[.75,.04],[1,0]]);
      points(0, armCount, new THREE.PointsMaterial({size: 12, map: mist, vertexColors: true, transparent: true, opacity: .08, depthWrite: false, blending: THREE.AdditiveBlending}));
      points(armCount, k, pmat(.9 * CORE_LEVEL));
      areas.forEach(a => {
        for (let i = 0; i < 8; i++){
          const rr = R_IN * .8 + (i + .5) / 8 * (R_MAX * 1.05 - R_IN * .8), th = spiral(rr, armAngle(a)) + gauss(r) * .02;
          const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloud, color: P.lilac, transparent: true, opacity: P.crt ? .12 : .085, depthWrite: false, blending: THREE.AdditiveBlending}));
          s.position.set(Math.cos(th) * rr, 0, Math.sin(th) * rr); s.scale.setScalar(11 + r() * 7 + rr * .06); galaxy.add(s);
        }
        const pts = [];
        for (let i = 0; i <= 90; i++){ const rr = R_MIN * .9 + i / 90 * (R_MAX * 1.1 - R_MIN * .9), th = spiral(rr, armAngle(a)); pts.push(new THREE.Vector3(Math.cos(th) * rr, 0, Math.sin(th) * rr)); }
        galaxy.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color: P.line, transparent: true, opacity: P.lineOpacity, depthWrite: false, blending: THREE.AdditiveBlending})));
      });
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: cloud, color: P.glow, transparent: true, opacity: .55 * CORE_LEVEL, depthWrite: false, blending: THREE.AdditiveBlending})); glow.scale.setScalar(27); galaxy.add(glow);
      const ring = [];
      for (let i = 0; i <= 128; i++){ const t = i / 128 * Math.PI * 2; ring.push(new THREE.Vector3(Math.cos(t) * R_HUB, 0, Math.sin(t) * R_HUB)); }
      galaxy.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({color: P.line, transparent: true, opacity: P.crt ? .5 : .28, depthWrite: false})));
    })();

    /* background stars */
    (function field(){
      const r = rand("fundo"), N = 1800, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++){ const u = r() * 2 - 1, th = r() * Math.PI * 2, R = 900 + r() * 500, s = Math.sqrt(1 - u * u);
        pos.set([R * s * Math.cos(th), R * u, R * s * Math.sin(th)], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({size: 2.2, map: dot, color: P.field, transparent: true, opacity: P.crt ? .4 : .55, depthWrite: false})));
    })();

    /* note stars: halo, 1px outline and sphere */
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const diskTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fill(); return new THREE.CanvasTexture(c); })();
    const stars = [];
    notes.filter(n => n.pos).forEach(n => {
      const size = n.id === coreId ? 3 : n.kind === "indice" ? 2.1 : n.kind === "daily" ? 1.1 : isConv(n) ? .42 + rand(n.id + "s")() * .16 : .9 + Math.min(1.8, Math.sqrt(deg[n.id] || 0) * .42);
      const m = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({color: "#ffffff", transparent: true}));
      m.position.set(...n.pos); m.scale.setScalar(size); m.userData.id = n.id; m.renderOrder = 3;
      const h = new THREE.Sprite(new THREE.SpriteMaterial({map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      h.scale.setScalar(isConv(n) ? 7 : 9); h.renderOrder = 1; m.add(h);
      const o = new THREE.Sprite(new THREE.SpriteMaterial({map: diskTex, color: "#000000", transparent: true, depthWrite: false}));
      o.scale.setScalar(2); o.renderOrder = 2; m.add(o);
      Object.assign(n, {mesh: m, halo: h, outline: o, size, phase: rand(n.id + "t")() * Math.PI * 2, on: true});
      if (n.id === opts.latestId){   // latest session: a bit bigger, with a sonar pulse
        n.size = size * 1.7; m.scale.setScalar(n.size);
        n.sonar = makeSonar(m, true); n.sonar.enabled = opts.sonar !== false;
      }
      galaxy.add(m); stars.push(m);
    });
    let colorFn = opts.color;
    function paint(){
      notes.forEach(n => { if (!n.mesh) return;
        const c = n.id === coreId ? new THREE.Color(P.core) : toColor(colorFn(n)), dim = n.project && bucket(n.status) === "encerrado";
        n.mesh.material.color.copy(c).lerp(new THREE.Color("#ffffff"), .12).multiplyScalar(dim ? .45 : 1);
        n.halo.material.color.copy(c); n.baseHalo = dim ? .25 : n.kind === "indice" ? .9 : isConv(n) ? .55 : .75;
      });
    }
    paint();

    const cGeo = new THREE.BufferGeometry(); cGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
    galaxy.add(new THREE.LineSegments(cGeo, new THREE.LineBasicMaterial({color: P.link, transparent: true, opacity: .55, depthWrite: false})));

    /* state */
    let hovered = null, selected = null, matchFn = null, showDaily = opts.showDaily !== false, showChats = opts.showChats !== false, spin = opts.spin !== false && !reduced();
    const visible = n => n.mesh && (showDaily || n.kind !== "daily") && (showChats || !isConv(n));
    let labelList = [];
    function refresh(){
      const f = hovered || selected, s = f ? neigh[f] || new Set() : null;
      notes.forEach(n => { if (!n.mesh) return; n.mesh.visible = visible(n); n.on = !s || n.id === f || s.has(n.id); n.match = !!matchFn && matchFn(n); });
      const pairs = f ? [...(neigh[f] || [])].filter(id => byId[id] && byId[id].mesh && visible(byId[id])) : [];
      const spokes = f && f === coreId ? coreAreas.map(a => { const th = spiral(ARM_START, armAngle(a)); return [Math.cos(th) * ARM_START, 0, Math.sin(th) * ARM_START]; }) : [];
      const arr = new Float32Array((pairs.length + spokes.length) * 6);
      pairs.forEach((id, i) => arr.set([...byId[f].pos, ...byId[id].pos], i * 6));
      spokes.forEach((p, i) => arr.set([0, 0, 0, ...p], (pairs.length + i) * 6));
      cGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const ids = new Set();
      if (f){
        ids.add(f);
        /* names: all linked notes, but only the 6 newest conversations (a project may have dozens) */
        pairs.filter(x => !isConv(byId[x])).forEach(x => ids.add(x));
        pairs.filter(x => isConv(byId[x])).sort((x, y) => byLast(byId[x], byId[y])).slice(0, 6).forEach(x => ids.add(x));
      }
      notes.forEach(n => { if (n.match && visible(n)) ids.add(n.id); });
      /* name priority: 0 active star, 1 notes, 2 search results, 3 conversations, 4 arm names */
      const armLabels = areas.map(a => { const r = R_MAX * 1.16, th = spiral(r, armAngle(a));
        return {html: `<span class="arm">${esc(areaName(a))}</span>`, x: Math.cos(th) * r, y: 0, z: Math.sin(th) * r, p: 4}; });
      labelList = S.setLabels(armLabels.concat([...ids].map(id => { const n = byId[id];
        return {html: `<span class="${id === f ? "main" : n.match ? "match" : ""}">${esc(n.title)}</span>`,
                x: n.pos[0], y: n.pos[1] + n.size + 1.5, z: n.pos[2], p: id === f ? 0 : n.match ? 2 : isConv(n) ? 3 : 1}; })));
    }

    /* interaction */
    const pick = e => S.pick(e, stars.filter(s => s.visible));
    S.on({
      hover: e => { const id = pick(e); if (id !== hovered){ hovered = id; S.dom.style.cursor = id ? "pointer" : ""; refresh(); } },
      leave: () => { if (hovered){ hovered = null; refresh(); } },
      click: e => { const id = pick(e); if (!id) return; select(id); opts.onClick && opts.onClick(id); },
    });
    /* keyboard order: the core, the stars around it, then arm by arm from the center out */
    const armIndex = n => n.id === coreId ? -2 : (n.project || isConv(n)) && areas.includes(n.area || "") ? areas.indexOf(n.area || "") : -1;
    const radius = n => Math.hypot(n.pos[0], n.pos[2]);
    S.keyboard({
      items: () => notes.filter(n => n.mesh && n.mesh.visible).sort((a, b) => armIndex(a) - armIndex(b) || radius(a) - radius(b)).map(n => n.id),
      current: () => selected,
      focus: id => select(id),
      open: id => opts.onClick && opts.onClick(id),
      describe: id => opts.describe ? opts.describe(byId[id]) : byId[id].title,
    }, opts.label || "Galaxy");
    function select(id){
      selected = id && byId[id] && byId[id].pos ? id : null; refresh();
      if (selected) S.flyTo(new THREE.Vector3(...byId[selected].pos).applyMatrix4(galaxy.matrixWorld), selected === coreId ? 150 : 55, 1100);
    }

    /* loop */
    refresh();
    S.start(now => {
      if (spin && !S.isFlying() && !selected && !hovered) galaxy.rotation.y -= SPIN;   // still while a star is under the mouse
      galaxy.updateMatrixWorld();
      const t = now / 1000, still = reduced();
      notes.forEach(n => { if (!n.mesh) return;
        const tw = still ? 1 : .82 + .18 * Math.sin(t * 1.7 + n.phase);
        n.halo.material.opacity = (n.on ? n.baseHalo : .06) * tw * (n.match ? 1.8 : 1);
        n.mesh.material.opacity = n.on ? 1 : .25;
        const rad = n.size * (n.match ? 1.5 : 1); n.mesh.scale.setScalar(rad);
        const px = S.worldPerPx(n.mesh);                                   // 1px outline on screen
        n.outline.scale.setScalar(2 * (1 + px / rad)); n.outline.material.opacity = n.mesh.material.opacity;
        if (n.sonar) sonar(n.sonar, now, rad / px);
      });
      S.placeLabels(labelList, galaxy.matrixWorld, true);
    });

    return {
      setColor(fn){ colorFn = fn; paint(); },
      setMatch(fn){ matchFn = fn; refresh(); },
      setDaily(on){ showDaily = on; refresh(); },
      setChats(on){ showChats = on; refresh(); },
      setSpin(on){ spin = on && !reduced(); },
      select,
      setSonar(on){ notes.forEach(n => { if (n.sonar) n.sonar.enabled = on; }); },
      getView: () => ({...S.getView(), rot: galaxy.rotation.y}),
      setView(v){ S.setView(v); if (v.rot !== undefined) galaxy.rotation.y = v.rot; },
      destroy: S.destroy,
    };
  }

  window.Galaxy = {mount};
})();
