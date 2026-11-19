// Copies the photos of every live product out of Firestore into public/img/, so each one has
// a plain https:// address on the site, like https://vishalsaxen.github.io/giazonest/img/geLvALol.jpg
// (the cover) and .../img/geLvALol-2.jpg (the second photo). The name is the product's short
// link code. Runs in the Pages workflow before each deploy; reads only what the shop shows
// to guests, so it needs no keys beyond the public web config.
import { readFile, mkdir, writeFile } from "node:fs/promises";

const here = new URL("../public/", import.meta.url);
const load = async (f) => import("data:text/javascript," + encodeURIComponent(await readFile(new URL(f, here), "utf8")));
const { firebaseConfig } = await load("firebase-config.js");
const { shortCode } = await load("share-link.js");
const BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:runQuery?key=${firebaseConfig.apiKey}`;

async function run(from, field, value) {
  const res = await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: from }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value } } } }) });
  if (!res.ok) throw new Error(`${from}: ${res.status} ${await res.text()}`);
  return (await res.json()).filter((r) => r.document).map((r) => ({ id: r.document.name.split("/").pop(), f: r.document.fields || {} }));
}
const str = (f, k) => f[k]?.stringValue;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const dir = new URL("img/", here);
await mkdir(dir, { recursive: true });
let files = 0;
async function save(name, dataUrl) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl || "");
  if (!m) return;
  // Every file is named .jpg so links stay predictable; seller photos are saved as JPEG anyway.
  if (!EXT[m[1]]) return;
  await writeFile(new URL(name, dir), Buffer.from(m[2], "base64"));
  files++;
}
const products = await run("products", "live", { booleanValue: true });
for (const p of products) {
  const code = shortCode(p.id);
  const photos = (await run("productImages", "productId", { stringValue: p.id }))
    .map((x) => ({ n: Number(x.f.n?.integerValue ?? 0), data: str(x.f, "data") }))
    .sort((a, b) => a.n - b.n);
  if (!photos.length && str(p.f, "thumb")) photos.push({ n: 0, data: str(p.f, "thumb") });
  for (const [i, ph] of photos.entries()) await save(i ? `${code}-${i + 1}.jpg` : `${code}.jpg`, ph.data);
}
console.log(`Saved ${files} photos of ${products.length} live products to public/img/`);
