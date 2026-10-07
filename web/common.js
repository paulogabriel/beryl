/* Beryl: helpers shared by the dashboard (app.js) and the 3D views (graph3d.js and galaxy.js). */

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const areaName = a => a ? a[0].toUpperCase() + a.slice(1) : t("no_area");
const isConv = n => n.kind === "chat" || n.kind === "code";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const byLast = (a, b) => (b.last || "").localeCompare(a.last || "");    // newest first
let STATUS_GROUPS = {}, STATUS_WORDS = {};                             // own words (exact) and every language's words
const setStatusGroups = (groups, words) => { STATUS_GROUPS = groups || {}; STATUS_WORDS = words || {}; };
function bucket(s){
  s = (s || "").replace("?", "").trim().toLowerCase();
  const own = Object.keys(STATUS_GROUPS).find(g => (STATUS_GROUPS[g] || []).some(w => w.toLowerCase() === s));
  if (own) return own;
  for (const g of ["ativo", "pausado", "ideia", "encerrado"]) if ((STATUS_WORDS[g] || []).some(w => s.includes(w))) return g;
  return "continuo";                           // ongoing and anything else
}

/* Base of the 3D views: renderer, camera, controls, click and hover, camera flight,
   labels, animation loop and cleanup. Returns null if the browser has no WebGL. */
const Beryl3D = (function(){
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const toColor = s => { const m = /var\((--[^)]+)\)/.exec(s || ""); return new THREE.Color(m ? cssVar(m[1]) || "#888" : s || "#888"); };

  /* radial glow texture from [offset, opacity] pairs */
  function softTexture(stops, size = 128){
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"), h = size / 2, grd = g.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(([o, a]) => grd.addColorStop(o, `rgba(255,255,255,${a})`));
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  /* sonar of the latest session: two blurred pulses that start at the star's size and grow 56 px in 3.6 s,
     one every 2.6 s. With reduced motion, a still halo. */
  const SONAR_COLOR = "#ffd36b", PERIOD = 5.2, LIFE = 3.6;
  function makeSonar(mesh, additive){
    const tex = softTexture([[0, 0], [.55, 0], [.74, .35], [.84, 1], [.92, .45], [1, 0]], 256);   // ring with soft edges
    const mk = () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, color: SONAR_COLOR, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending}));
      s.renderOrder = 5; mesh.add(s); return s;
    };
    return {pulses: [mk(), mk()], enabled: true};
  }
  function sonar(son, now, pxPerUnit){             // pxPerUnit: screen px of 1 unit of the star's radius
    const star = 2 * pxPerUnit;
    son.pulses.forEach((s, i) => {
      if (!son.enabled){ s.material.opacity = 0; return; }
      if (reduced()){ s.scale.setScalar((star + 22) / pxPerUnit); s.material.opacity = i ? 0 : .5; return; }
      const k = (((now / 1000) + i * PERIOD / 2) % PERIOD) / LIFE;
      if (k > 1){ s.material.opacity = 0; return; }
      s.scale.setScalar((star + 8 + k * 56) / pxPerUnit);
      s.material.opacity = .75 * Math.pow(1 - k, 1.3) * Math.min(1, k * 6);   // fades in fast, out slowly
    });
  }

  function stage(el, {fov, near, far, background, bloom}){
    let renderer;
    try { renderer = new THREE.WebGLRenderer({antialias: true}); if (!renderer.getContext()) throw 0; }
    catch (e){ return null; }
    const W = () => el.clientWidth, H = () => el.clientHeight, dom = renderer.domElement;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W(), H());
    el.appendChild(dom);
    const scene = new THREE.Scene(); scene.background = background;
    const camera = new THREE.PerspectiveCamera(fov, W() / H(), near, far);
    const controls = new THREE.OrbitControls(camera, dom); controls.enableDamping = true;
    let composer = null;
    if (bloom){
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(W(), H()), ...bloom));
    }
    const labels = document.createElement("div"); labels.className = "g3-labels"; el.appendChild(labels);

    /* keyboard: the canvas takes focus; arrows walk the items, Enter opens, Esc clears.
       The current item is announced to screen readers through a live region. */
    const live = document.createElement("div"); live.className = "sr-only"; live.setAttribute("aria-live", "polite"); el.appendChild(live);
    dom.tabIndex = 0; dom.setAttribute("role", "application");
    let keys = null;
    dom.addEventListener("keydown", e => {
      if (!keys) return;
      const list = keys.items(); if (!list.length) return;
      const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[e.key];
      let i = list.indexOf(keys.current());
      if (step) i = i < 0 ? (step > 0 ? 0 : list.length - 1) : (i + step + list.length) % list.length;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = list.length - 1;
      else if ((e.key === "Enter" || e.key === " ") && i >= 0){ e.preventDefault(); keys.open(list[i]); return; }
      else if (e.key === "Escape"){ keys.focus(null); live.textContent = ""; return; }
      else return;
      e.preventDefault(); pointer = null;            // the keyboard wins over a mouse resting on the canvas
      keys.focus(list[i]); live.textContent = keys.describe(list[i]);
    });

    /* click (without dragging) and hover; pick returns the id of the first mesh under the pointer */
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    let pointer = null, down = null, hoverFn = () => {}, clickFn = () => {}, leaveFn = () => {};
    const pick = (e, objects) => {
      const b = dom.getBoundingClientRect();
      mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(objects, false)[0];
      return hit ? hit.object.userData.id : null;
    };
    dom.addEventListener("pointermove", e => { pointer = e; });
    dom.addEventListener("pointerleave", () => { pointer = null; leaveFn(); });
    dom.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
    dom.addEventListener("pointerup", e => {
      const moved = !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5;
      down = null; if (!moved) clickFn(e);
    });

    /* camera flight to a point, keeping the viewing direction */
    let flying = null;
    function flyTo(target, dist, dur){
      const dir = camera.position.clone().sub(controls.target).normalize();
      flying = {t0: performance.now(), dur: reduced() ? 1 : dur, p0: camera.position.clone(), p1: target.clone().add(dir.multiplyScalar(dist)),
                q0: controls.target.clone(), q1: target.clone()};
    }

    /* size of 1 screen px in world units, at an object's distance */
    const wp = new THREE.Vector3();
    const worldPerPx = obj => { obj.getWorldPosition(wp); return 2 * camera.position.distanceTo(wp) * Math.tan(camera.fov * Math.PI / 360) / H(); };

    /* labels: each item {s, x, y, z, p}; by priority (lower p first), hiding those that would overlap one already placed */
    const v = new THREE.Vector3();
    function placeLabels(list, matrix, avoidOverlap){
      const w = W(), h = H(), placed = [];
      list.forEach(l => {
        v.set(l.x, l.y, l.z); if (matrix) v.applyMatrix4(matrix); v.project(camera);
        if (v.z > 1){ l.s.style.visibility = "hidden"; return; }
        const x = (v.x * .5 + .5) * w, y = (-v.y * .5 + .5) * h;
        if (avoidOverlap){
          const box = [x - l.w / 2 - 3, y - l.h - 2, x + l.w / 2 + 3, y + 1];
          if (placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])){ l.s.style.visibility = "hidden"; return; }
          placed.push(box);
        }
        l.s.style.visibility = ""; l.s.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      });
    }
    /* builds the labels from [{html, x, y, z, p}] and measures each once (the size doesn't change) */
    function setLabels(items){
      labels.innerHTML = items.map(i => i.html).join("");
      return [...labels.children].map((s, k) => ({...items[k], s, w: s.offsetWidth, h: s.offsetHeight})).sort((a, b) => a.p - b.p);
    }

    let raf = 0, alive = true, update = () => {};
    function frame(now){
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (flying){
        const k = Math.min(1, (now - flying.t0) / flying.dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camera.position.lerpVectors(flying.p0, flying.p1, e); controls.target.lerpVectors(flying.q0, flying.q1, e);
        if (k >= 1) flying = null;
      }
      controls.update();
      if (pointer && !down) hoverFn(pointer);
      update(now);
      if (composer) composer.render(); else renderer.render(scene, camera);
    }
    const ro = new ResizeObserver(() => {
      camera.aspect = W() / H(); camera.updateProjectionMatrix();
      renderer.setSize(W(), H()); if (composer) composer.setSize(W(), H());
    });
    ro.observe(el);

    return {
      scene, camera, controls, dom, H, pick, flyTo, worldPerPx, placeLabels, setLabels,
      isFlying: () => !!flying,
      /* the camera, so a redraw of the same view can put it back where the person left it */
      getView: () => ({p: camera.position.toArray(), t: controls.target.toArray()}),
      setView: v => { camera.position.fromArray(v.p); controls.target.fromArray(v.t); controls.update(); },
      /* {items() → ids in order, current() → id, focus(id|null), open(id), describe(id) → text}; label: the canvas's accessible name */
      keyboard(k, label){ keys = k; dom.setAttribute("aria-label", label); },
      on({hover, click, leave}){ hoverFn = hover || hoverFn; clickFn = click || clickFn; leaveFn = leave || leaveFn; },
      start(fn){ update = fn; raf = requestAnimationFrame(frame); },
      destroy(){
        alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material){ if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
        renderer.dispose(); el.innerHTML = "";
      }
    };
  }

  return {toColor, softTexture, makeSonar, sonar, stage};
})();
