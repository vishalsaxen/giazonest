// Terms & Conditions: shown before the seller page and the shop open.
// The terms text lives in terms/seller.md and terms/buyer.md, so it can be edited without touching code.

export const TERMS_VERSION = "2026-10-03"; // change when the terms text changes, so everyone accepts again
export const SUPPORT_EMAIL = "gizee@giazonest.com";

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

// Enough Markdown for the terms files: headings, paragraphs, bullet and numbered lists, rules, bold.
export function renderMarkdown(md) {
  const out = [];
  let para = [], list = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    let m;
    if (!line) { flush(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if (/^---+$/.test(line)) { flush(); out.push("<hr>"); continue; }
    if ((m = line.match(/^[*-]\s+(.*)$/)) || (m = line.match(/^\d+\.\s+(.*)$/))) {
      const tag = /^\d/.test(line) ? "ol" : "ul";
      if (para.length || (list && list.tag !== tag)) flush();
      list ||= { tag, items: [] };
      list.items.push(m[1]);
      continue;
    }
    if (list) flush();
    para.push(line);
  }
  flush();
  return out.join("\n");
}

const load = async (kind) => {
  const res = await fetch(`terms/${kind}.md?v=dev`);
  if (!res.ok) throw new Error(`Couldn't load the terms (${res.status}).`);
  return renderMarkdown(await res.text());
};
const storeKey = (kind) => `gz-terms-${kind}`;
const accepted = (kind) => { try { return localStorage.getItem(storeKey(kind)) === TERMS_VERSION; } catch { return false; } };

// Shows the terms until the person accepts them, then resolves. Remembered on this device.
export function termsGate(kind) {
  const view = document.getElementById("terms-view");
  if (accepted(kind)) { view.hidden = true; return Promise.resolve(); }
  view.hidden = false;
  const body = document.getElementById("terms-body");
  load(kind).then((html) => (body.innerHTML = html)).catch((err) => (body.textContent = err.message));
  const boxes = [...view.querySelectorAll("input[type=checkbox][data-terms]")];
  const btn = document.getElementById("terms-accept");
  const sync = () => (btn.disabled = !boxes.every((b) => b.checked));
  boxes.forEach((b) => (b.onchange = sync));
  sync();
  return new Promise((resolve) => {
    btn.onclick = () => {
      try { localStorage.setItem(storeKey(kind), TERMS_VERSION); } catch { /* accepted for this visit only */ }
      view.hidden = true;
      window.scrollTo(0, 0);
      resolve();
    };
  });
}

// The "Terms & Conditions" link in the footer opens the terms to read again.
export function wireTermsLink(kind) {
  const dlg = document.getElementById("terms-dialog");
  const close = () => (dlg.hidden = true);
  document.getElementById("show-terms").onclick = async (e) => {
    e.preventDefault();
    dlg.hidden = false;
    const body = document.getElementById("terms-dialog-body");
    try { body.innerHTML = await load(kind); } catch (err) { body.textContent = err.message; }
    document.getElementById("terms-close").focus();
  };
  document.getElementById("terms-close").onclick = close;
  dlg.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
