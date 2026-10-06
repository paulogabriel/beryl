/* Beryl: interface texts. They come with the data, from i18n/<language>.json (the server picks the
   language and fills in English for anything missing). Placeholders look like {n}; a text given as
   {"one": …, "other": …} has plural forms, chosen with the language's plural rules. */
let LANG = "en";
let TEXTS = {load_error: "Couldn't read the data. Is the Beryl server running?"};   // before any data arrives

function t(key, vars = {}){
  let v = TEXTS[key] ?? key;
  if (v && typeof v === "object" && !Array.isArray(v)) v = v[new Intl.PluralRules(LANG).select(vars.n ?? 0)] ?? v.other;
  return typeof v === "string" ? v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : v;
}

/* applies the language and the page's fixed texts (data-i, data-i-ph, data-i-aria) */
function setTexts(language, texts){
  LANG = language || "en";
  TEXTS = texts || TEXTS;
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i]").forEach(e => { e.textContent = t(e.dataset.i); });
  document.querySelectorAll("[data-i-ph]").forEach(e => { e.placeholder = t(e.dataset.iPh); });
  document.querySelectorAll("[data-i-aria]").forEach(e => { e.setAttribute("aria-label", t(e.dataset.iAria)); });
}
