/* Beryl: applies the saved theme before the page paints and, in the CRT themes, plays the boot screen
   (logo, check lines and a loading bar) once per browser tab. Any key or click skips it. */
(() => {
  const root = document.documentElement;
  let theme = "crt-beryl", seen = false;
  try { const s = localStorage.getItem("beryl-theme"); if (["crt-beryl", "crt-amber", "auto", "light", "dark"].includes(s)) theme = s; } catch (e) {}
  try { seen = sessionStorage.getItem("beryl-booted") === "1"; } catch (e) {}
  if (theme !== "auto") root.dataset.theme = theme;               // no flash of another theme while the page loads
  if (!theme.startsWith("crt") || seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.dataset.boot = "on";
  document.addEventListener("DOMContentLoaded", start, {once: true});

  const LINES = [[8, "MEMORY CHECK"], [30, "PHOSPHOR WARM-UP"], [55, "READING SOURCES"], [80, "BUILDING GALAXY"]];
  const MIN_MS = 2800, FAILSAFE_MS = 9000;

  function start(){
    const boot = document.getElementById("boot"), wrap = document.querySelector(".wrap");
    if (!boot || !wrap){ delete root.dataset.boot; return; }
    try { sessionStorage.setItem("beryl-booted", "1"); } catch (e) {}
    wrap.inert = true;
    const logo = document.querySelector(".logo");
    if (logo){                                                      // a decorative copy: no repeated ids, hidden from screen readers
      const c = logo.cloneNode(true);
      c.removeAttribute("aria-labelledby"); c.removeAttribute("role"); c.setAttribute("aria-hidden", "true");
      c.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
      boot.querySelector(".boot-logo").appendChild(c);
    }
    const log = boot.querySelector(".boot-log"), fill = boot.querySelector(".boot-fill"), pct = boot.querySelector(".boot-pct");
    const t0 = performance.now();
    let p = 0, shown = 0, over = false;

    function line(text){
      const done = text === "READY.";
      const row = document.createElement("div");
      row.textContent = done ? text : text.padEnd(22, ".") + " ";
      if (!done){ const ok = document.createElement("b"); ok.textContent = "OK"; row.appendChild(ok); }
      log.appendChild(row);
    }
    function finish(){
      if (over) return; over = true;
      clearInterval(timer); clearTimeout(failsafe);
      removeEventListener("keydown", finish); removeEventListener("pointerdown", finish);
      fill.style.width = "100%"; pct.textContent = "100%";
      if (!log.querySelector(".rdy")){ line("READY."); log.lastChild.className = "rdy"; }
      setTimeout(() => {
        boot.classList.add("boot-out");
        wrap.inert = false; wrap.classList.add("crt-on");
        setTimeout(() => { boot.remove(); delete root.dataset.boot; wrap.classList.remove("crt-on"); }, 650);
      }, 380);
    }
    const timer = setInterval(() => {
      const ms = performance.now() - t0, ready = window.__berylReady === true;
      const goal = ready && ms >= MIN_MS ? 100 : Math.min(92, 92 * (1 - Math.exp(-ms / 1000)));
      p = Math.max(p, Math.min(goal, p + (goal === 100 ? 7 : 4)));
      const q = Math.round(p / 2) * 2;                             // grows in steps, like blocks being drawn
      fill.style.width = q + "%"; pct.textContent = Math.floor(p) + "%";
      while (shown < LINES.length && p >= LINES[shown][0]) line(LINES[shown++][1]);
      if (p >= 100) finish();
    }, 70);
    const failsafe = setTimeout(finish, FAILSAFE_MS);               // if the data never arrives, the page shows its own error
    addEventListener("keydown", finish); addEventListener("pointerdown", finish);
  }
})();
