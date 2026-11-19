// Short share links for products, like shop.html?d=geLvALol.
// The 8-character code is worked out from the product id, so each product always gets the
// same link and nothing is saved. Only the admin console and the seller's own product list
// (or the shop, for a seller signed in to shop) offer the "Generate URL" button.
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export function shortCode(id) {
  // cyrb53: a fast 53-bit string hash, written out as 8 base-62 characters.
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) { const c = id.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  let n = 4294967296 * (2097151 & h2) + (h1 >>> 0), out = "";
  for (let i = 0; i < 8; i++) { out = B62[n % 62] + out; n = Math.floor(n / 62); }
  return out;
}
// The link always points at the shop page next to whichever page made it.
export const shareUrl = (p) => new URL(`shop.html?d=${shortCode(p.id)}`, location.href).href;
// Each live product's photos are also published with the site (scripts/export-photos.mjs, every
// 30 minutes) at img/<code>.jpg for the cover and img/<code>-2.jpg, -3.jpg… for the others.
export const imgUrl = (p, i = 0) => new URL(`img/${shortCode(p.id)}${i ? `-${i + 1}` : ""}.jpg`, location.href).href;
// An <img data-fallback="…"> whose https:// photo isn't published yet (a new product) shows the saved copy.
// (Skipped in scripts/export-photos.mjs, which loads this file in Node to share shortCode.)
if (typeof document !== "undefined") document.addEventListener("error", (e) => {
  const img = e.target, alt = img?.dataset?.fallback;
  if (img?.tagName === "IMG" && alt && img.src !== alt) { img.src = alt; img.removeAttribute("data-fallback"); }
}, true);
// A link opens only live products that have a photo, so only those get the button.
export const canShare = (p) => Boolean(p.thumb && p.live);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const made = new Set(); // products whose link is showing, so a re-render keeps it open
const box = (p) => `<label class="share-row"><span class="hint">Product link</span>
        <input class="share-link" readonly value="${esc(shareUrl(p))}" aria-label="Link to ${esc(p.name)}"></label>
      <button type="button" class="btn small" data-copy-url>Copy</button>
      <label class="share-row"><span class="hint">Image address</span>
        <input class="share-link" readonly value="${esc(imgUrl(p))}" aria-label="Image address of ${esc(p.name)}"></label>
      <button type="button" class="btn ghost small" data-copy-url>Copy image address</button>
      <span class="hint">A new photo's image address starts working within about 30 minutes.</span>`;
export const shareControls = (p) => canShare(p)
  ? `<div class="share-url" data-share="${esc(p.id)}">${made.has(p.id) ? box(p) : `<button type="button" class="btn ghost small" data-gen-url>Generate URL</button>`}</div>` : "";

async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { input.select(); try { return document.execCommand("copy"); } catch { return false; } }
}
// Handles Generate URL and Copy inside a list. find(id) returns the product, or nothing.
export function wireShare(list, find) {
  list.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-share]");
    if (!el) return;
    const p = find(el.dataset.share);
    if (!p) return;
    if (e.target.closest("[data-gen-url]")) { made.add(p.id); el.innerHTML = box(p); }
    else if (!e.target.closest("[data-copy-url]")) return;
    // Copy copies the link just before it; Generate URL copies the product link.
    const btn = e.target.closest("[data-copy-url]") || el.querySelector("[data-copy-url]");
    const input = btn.previousElementSibling.querySelector(".share-link"), label = btn.textContent;
    const ok = await copyText(input.value, input);
    input.focus(); input.select();
    if (!ok) return;
    btn.textContent = "Copied ✓";
    setTimeout(() => { if (btn.isConnected) btn.textContent = label; }, 2000);
  });
}
