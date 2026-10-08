/* The 404 page wears the theme chosen in the dashboard (same setting, same default). */
(() => {
  let v = "crt-beryl";
  try { const s = localStorage.getItem("beryl-theme"); if (["crt-beryl", "crt-amber", "light", "dark", "auto"].includes(s)) v = s; } catch (e) {}
  if (v !== "auto") document.documentElement.dataset.theme = v;
})();
