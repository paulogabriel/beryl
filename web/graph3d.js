/* Beryl: 3D graph with three.js (r147, UMD build in vendor/three-bundle.js), on top of common.js.
   Usage: const g = Graph3D.mount(el, {nodes, links, radius, color, dim, depthTime, latestId, sonar, onClick});
        g.setColor(fn); g.setMatch(fn); g.setSonar(bool); g.destroy(); */
(function(){
  const {toColor, softTexture, makeSonar, sonar, stage} = Beryl3D;
  const isDark = () => { const c = toColor("var(--bg)"); return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) < 0.4; };

  /* 3D force layout: repulsion between all nodes, springs on links, pull to the center */
  function layout(nodes, links, depthTime){
    const N = nodes.length, byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    nodes.forEach((n, i) => {
      const phi = Math.acos(1 - 2 * (i + .5) / N), th = Math.PI * (1 + Math.sqrt(5)) * i, R = 110;
      n.x = R * Math.sin(phi) * Math.cos(th); n.y = R * Math.sin(phi) * Math.sin(th); n.z = R * Math.cos(phi);
      n.vx = n.vy = n.vz = 0;
    });
    if (depthTime){
      const ds = nodes.map(n => n.last).filter(Boolean).sort();
      const t0 = +new Date(ds[0] || Date.now()), t1 = +new Date(ds[ds.length - 1] || Date.now()), span = Math.max(1, t1 - t0);
      nodes.forEach(n => { n.zt = n.last ? ((+new Date(n.last) - t0) / span) * 240 - 120 : -120; });
    }
    const L = links.map(l => [byId[l.source], byId[l.target]]).filter(p => p[0] && p[1]);
    const iters = 420;
    for (let it = 0; it < iters; it++){
      const a = 1 - it / iters;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++){
        const p = nodes[i], q = nodes[j];
        let dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        const d2 = dx * dx + dy * dy + dz * dz + 1, d = Math.sqrt(d2), f = 1400 / d2 * a;
        dx /= d; dy /= d; dz /= d;
        p.vx += dx * f; p.vy += dy * f; p.vz += dz * f; q.vx -= dx * f; q.vy -= dy * f; q.vz -= dz * f;
      }
      for (const [p, q] of L){
        let dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + .01, f = (d - 50) * .03 * a;
        dx /= d; dy /= d; dz /= d;
        p.vx += dx * f; p.vy += dy * f; p.vz += dz * f; q.vx -= dx * f; q.vy -= dy * f; q.vz -= dz * f;
      }
      for (const n of nodes){
        n.vx -= n.x * .012 * a; n.vy -= n.y * .012 * a;
        n.vz += depthTime ? (n.zt - n.z) * .08 * a : -n.z * .012 * a;
        n.vx *= .6; n.vy *= .6; n.vz *= .6;
        n.x += n.vx; n.y += n.vy; n.z += n.vz;
      }
    }
  }

  function mount(el, opts){
    const dark = isDark();
    const S = stage(el, {fov: 50, near: 1, far: 4000, background: toColor("var(--surface)"), bloom: dark && [.45, .35, .5]});
    if (!S) return null;
    const {scene, camera, controls} = S;

    const nodes = opts.nodes.map(n => ({...n})), byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const links = opts.links.filter(l => byId[l.source] && byId[l.target]);
    layout(nodes, links, opts.depthTime);

    const extent = Math.max(60, ...nodes.map(n => Math.hypot(n.x, n.y, n.z)));
    camera.position.set(0, 0, extent * 1.9);
    controls.dampingFactor = .08; controls.minDistance = 40; controls.maxDistance = 900;
    controls.autoRotate = !reduced(); controls.autoRotateSpeed = .45;
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    /* notes: sphere + halo */
    const core = s => dark ? toColor(s).multiplyScalar(.82) : toColor(s);
    const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    const haloOpacity = (n, on) => (on ? (opts.dim(n) ? .12 : .32) : .03) * (dark ? 1 : .6);
    const tex = softTexture([[0, 1], [.18, .55], [.5, .12], [1, 0]]), sphere = new THREE.SphereGeometry(1, 24, 18);
    const neigh = {}; links.forEach(l => { (neigh[l.source] = neigh[l.source] || new Set()).add(l.target); (neigh[l.target] = neigh[l.target] || new Set()).add(l.source); });
    const meshes = [];
    nodes.forEach(n => {
      const r = opts.radius(n) * .7;
      const m = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({color: core(opts.color(n)), transparent: true, opacity: 1}));
      m.scale.setScalar(r); m.position.set(n.x, n.y, n.z); m.userData.id = n.id;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, color: toColor(opts.color(n)), transparent: true, depthWrite: false, blending, opacity: haloOpacity(n, true)}));
      halo.scale.setScalar(4.2); m.add(halo);        // child of the sphere: 4.2× its radius
      n.mesh = m; n.halo = halo; n.r = r; meshes.push(m); scene.add(m);
      if (n.id === opts.latestId){ n.sonar = makeSonar(m, dark); n.sonar.enabled = opts.sonar !== false; }
    });

    /* links */
    const segments = list => { const arr = new Float32Array(list.length * 6);
      list.forEach((l, i) => { const a = byId[l.source], b = byId[l.target]; arr.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); });
      return new THREE.BufferAttribute(arr, 3); };
    const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute("position", segments(links));
    const lineMat = new THREE.LineBasicMaterial({color: toColor("var(--line-2)"), transparent: true, opacity: dark ? .55 : .8});
    scene.add(new THREE.LineSegments(lineGeo, lineMat));
    const hiGeo = new THREE.BufferGeometry(); hiGeo.setAttribute("position", segments([]));
    scene.add(new THREE.LineSegments(hiGeo, new THREE.LineBasicMaterial({color: toColor("var(--fg)"), transparent: true, opacity: .85})));

    /* particles running along the links */
    let particles = null, pT = [];
    if (!reduced() && links.length){
      pT = links.map(() => Math.random());
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(links.length * 3), 3));
      particles = new THREE.Points(g, new THREE.PointsMaterial({color: toColor("var(--fg)"), size: 2.4, transparent: true, opacity: dark ? .75 : .5, map: tex, depthWrite: false, blending}));
      scene.add(particles);
    }

    /* focus: the hovered node and its neighbors lit, the rest dimmed; search results bigger */
    let hovered = null, matchFn = null, labelList = [];
    function applyFocus(){
      const s = hovered ? neigh[hovered] || new Set() : null;
      nodes.forEach(n => {
        const on = !s || n.id === hovered || s.has(n.id), match = matchFn && matchFn(n);
        n.mesh.material.opacity = on ? 1 : .15;
        n.halo.material.opacity = haloOpacity(n, on) * (match ? 2 : 1);
        n.mesh.scale.setScalar(n.r * (match ? 1.6 : 1));
      });
      lineMat.opacity = hovered ? .12 : (dark ? .55 : .8);
      hiGeo.setAttribute("position", segments(hovered ? links.filter(l => l.source === hovered || l.target === hovered) : []));
      const ids = new Set();
      if (hovered){ ids.add(hovered); (neigh[hovered] || []).forEach(x => ids.add(x)); }
      if (matchFn) nodes.forEach(n => { if (matchFn(n)) ids.add(n.id); });
      labelList = S.setLabels([...ids].map(id => { const n = byId[id];
        return {html: `<span class="${id === hovered ? "main" : ""}">${esc(n.title)}</span>`, x: n.x, y: n.y + n.r + 3, z: n.z, p: 0}; }));
    }

    S.on({
      hover: e => { const id = S.pick(e, meshes); if (id !== hovered){ hovered = id; applyFocus(); S.dom.style.cursor = id ? "pointer" : "grab"; } },
      leave: () => { if (hovered){ hovered = null; applyFocus(); } },
      click: e => { const id = S.pick(e, meshes); if (!id) return; flyTo(byId[id]); opts.onClick && opts.onClick(id); },
    });
    S.keyboard({                                 // keyboard: notes in alphabetical order
      items: () => nodes.slice().sort((a, b) => a.title.localeCompare(b.title)).map(n => n.id),
      current: () => hovered,
      focus: id => { hovered = id; applyFocus(); if (id) flyTo(byId[id]); },
      open: id => opts.onClick && opts.onClick(id),
      describe: id => opts.describe ? opts.describe(byId[id]) : byId[id].title,
    }, opts.label || "3D graph");
    function flyTo(n){ controls.autoRotate = false; S.flyTo(new THREE.Vector3(n.x, n.y, n.z), 110, 900); }

    S.start(now => {
      controls.autoRotateSpeed = hovered ? 0 : .45;     // still while a note is under the mouse
      nodes.forEach(n => { if (n.sonar) sonar(n.sonar, now, n.mesh.scale.x / S.worldPerPx(n.mesh)); });
      if (particles){
        const p = particles.geometry.attributes.position;
        links.forEach((l, i) => {
          const a = byId[l.source], b = byId[l.target], on = !hovered || l.source === hovered || l.target === hovered;
          pT[i] = (pT[i] + (on ? .0045 : .0015)) % 1;
          p.setXYZ(i, a.x + (b.x - a.x) * pT[i], a.y + (b.y - a.y) * pT[i], a.z + (b.z - a.z) * pT[i]);
        });
        p.needsUpdate = true;
      }
      S.placeLabels(labelList, null, false);
    });

    return {
      setColor(fn){ nodes.forEach(n => { n.mesh.material.color = core(fn(n)); n.halo.material.color = toColor(fn(n)); }); },
      setMatch(fn){ matchFn = fn; applyFocus(); },
      setSonar(on){ nodes.forEach(n => { if (n.sonar) n.sonar.enabled = on; }); },
      getView: S.getView, setView: S.setView,
      destroy: S.destroy,
    };
  }

  window.Graph3D = {mount};
})();
