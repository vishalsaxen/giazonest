import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, updateDoc, writeBatch, doc, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN_EMAIL } from "./firebase-config.js?v=dev";
import { PINS, EXAMPLE_SELLERS, EXAMPLE_BUYERS } from "./pincodes.js?v=dev";
import { CATEGORIES, subsOf, typesOf } from "./categories.js?v=dev";
import { checkContact, publicSeller } from "./contacts.js?v=dev";
import { checkKyc, readKyc, fillKyc, wireKycSkips } from "./kyc.js?v=dev";
import { sellingPrice, rupees, itemWord, fieldsFor } from "./product-fields.js?v=dev";

const $ = (s) => document.querySelector(s);
const ADMIN = SUPER_ADMIN_EMAIL.toLowerCase();

if (firebaseConfig.apiKey.startsWith("PASTE")) {
  $("#setup-dialog").hidden = false;
  throw new Error("Fill in public/firebase-config.js");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helpers
const show = (el, text, kind) => { el.textContent = text; el.className = "msg " + (kind || ""); el.hidden = false; };
const RULES = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["One uppercase letter", (p) => /[A-Z]/.test(p)],
  ["One number", (p) => /\d/.test(p)],
  ["One symbol", (p) => /[^A-Za-z0-9]/.test(p)]
];
const strong = (p) => RULES.every(([, f]) => f(p));
document.querySelectorAll(".rules").forEach((ul) => {
  ul.innerHTML = RULES.map(([t]) => `<li>${t}</li>`).join("");
  const input = document.getElementById(ul.dataset.for);
  input.addEventListener("input", () =>
    [...ul.children].forEach((li, i) => li.classList.toggle("met", RULES[i][1](input.value))));
});
const authError = (e) => ({
  "auth/invalid-credential": "That email and password don't match. Check them or reset your password.",
  "auth/wrong-password": "That password is wrong.",
  "auth/invalid-email": "That email doesn't look right. Check for typos.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes or reset your password.",
  "auth/network-request-failed": "Can't reach the server. Check your connection and try again.",
  "auth/requires-recent-login": "For security, sign out and sign in again, then change your password."
}[e.code] || e.message);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Login, reset
const steps = ["step-signin", "step-forgot"];
const step = (id) => steps.forEach((s) => (document.getElementById(s).hidden = s !== id));
$("#go-forgot").onclick = () => { $("#fg-email").value = $("#si-email").value; step("step-forgot"); };
document.querySelectorAll(".back").forEach((b) => (b.onclick = () => step("step-signin")));
$("#si-show").onchange = (e) => ($("#si-pass").type = e.target.checked ? "text" : "password");

$("#signin-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#si-email").value.trim().toLowerCase(), pw = $("#si-pass").value, m = $("#si-msg");
  if (!email || !pw) return show(m, "Enter your email and password.", "bad");
  if (email !== ADMIN) return show(m, "Only the super admin account can sign in here.", "bad");
  try { await signInWithEmailAndPassword(auth, email, pw); $("#si-pass").value = ""; m.hidden = true; }
  catch (err) { show(m, authError(err), "bad"); }
};

$("#forgot-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#fg-email").value.trim().toLowerCase(), m = $("#fg-msg");
  if (email !== ADMIN) return show(m, "Only the super admin email can reset this password.", "bad");
  try {
    await sendPasswordResetEmail(auth, email);
    step("step-signin");
    show($("#si-msg"), `Reset link sent to ${email}. Open it, choose a new password, then sign in.`, "ok");
  } catch (err) { show(m, authError(err), "bad"); }
};

// ---------- Change password
const dlg = $("#change-dialog");
const closeChange = () => { dlg.hidden = true; $("#change-form").reset(); $("#cp-msg").hidden = true;
  document.querySelectorAll("#change-form .rules li").forEach((li) => li.classList.remove("met")); };
$("#open-change").onclick = () => { dlg.hidden = false; $("#cp-current").focus(); };
$("#cp-cancel").onclick = closeChange;
dlg.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChange(); });
$("#change-form").onsubmit = async (e) => {
  e.preventDefault();
  const m = $("#cp-msg"), cur = $("#cp-current").value, nw = $("#cp-new").value;
  if (!strong(nw)) return show(m, "The new password doesn't meet every rule above.", "bad");
  if (nw === cur) return show(m, "Choose a password different from the current one.", "bad");
  if (nw !== $("#cp-confirm").value) return show(m, "The two passwords don't match.", "bad");
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
    await updatePassword(user, nw);
    show(m, "Password updated.", "ok");
    setTimeout(closeChange, 1200);
  } catch (err) {
    show(m, err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" ? "Your current password is wrong." : authError(err), "bad");
  }
};

$("#sign-out").onclick = () => signOut(auth);

// ---------- Sellers and buyers
let sellers = [], buyers = [], products = [], current = { origin: PINS["110001"], label: PINS["110001"].place, pin: "110001" };
const RADIUS = 50; // km counted as "near"
const chip = { "Verified": "ok", "Active": "ok", "Pending KYC": "warn", "New": "warn", "Suspended": "bad", "Flagged": "bad", "KYC Rejected": "bad" };
const km = (a, b) => {
  if (!a || !b || b.lat == null) return Infinity;
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const fmt = (d) => d === Infinity ? "distance unknown" : d < 1 ? "< 1 km" : `${Math.round(d).toLocaleString("en-IN")} km`;
const stat = (n, t) => `<div class="stat"><b>${n.toLocaleString("en-IN")}</b><span>${t}</span></div>`;

async function load() {
  $("#data-note").textContent = "Loading sellers and buyers…";
  try {
    const [s, b, p] = await Promise.all([getDocs(collection(db, "sellers")), getDocs(collection(db, "buyers")), getDocs(collection(db, "products"))]);
    sellers = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    buyers = b.docs.map((d) => ({ id: d.id, ...d.data() }));
    products = p.docs.map((d) => ({ id: d.id, ...d.data() }));
    await syncPublic();
    const hasExamples = [...sellers, ...buyers].some((r) => r.example);
    $("#seed-btn").hidden = !(hasExamples || sellers.length + buyers.length === 0);
    $("#seed-btn").textContent = hasExamples ? "Refresh example data" : "Load example data";
    $("#data-note").textContent = sellers.length + buyers.length
      ? `${sellers.length} sellers and ${buyers.length} buyers in the database.`
      : "The database is empty. Add a seller, or load the example data.";
    render();
  } catch (err) {
    $("#data-note").textContent = `Couldn't load data: ${err.message}. Check firestore.rules and the super admin email.`;
  }
}

// Writes in batches of up to 400, since one Firestore batch holds at most 500 writes.
async function commitAll(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

// Shoppers only see the publicSellers collection (Verified sellers, without KYC details)
// and products marked live, which are the products of Verified sellers.
async function syncPublic() {
  const pub = await getDocs(collection(db, "publicSellers"));
  const stable = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  const have = new Map(pub.docs.map((d) => [d.id, stable(d.data())]));
  const ops = [], verified = new Set();
  for (const r of sellers) {
    if (r.status === "Verified") {
      verified.add(r.id);
      const data = publicSeller(r);
      if (have.get(r.id) !== stable(data)) ops.push((b) => b.set(doc(db, "publicSellers", r.id), data));
      have.delete(r.id);
    }
  }
  for (const id of have.keys()) ops.push((b) => b.delete(doc(db, "publicSellers", id)));
  for (const p of products) {
    const live = verified.has(p.sellerId);
    if (p.live !== live) { ops.push((b) => b.update(doc(db, "products", p.id), { live })); p.live = live; }
  }
  await commitAll(ops);
}

const fieldLabel = (p, key) => fieldsFor(p.category, p.subCategory).find((f) => f.key === key)?.label || key;
const countProducts = (sellerId) => products.filter((p) => p.sellerId === sellerId).length;

function render() {
  const { origin, label, pin } = current;
  $("#cur-pin").textContent = pin || "GPS";
  $("#cur-place").textContent = label;
  const s = sellers.map((r) => ({ r, d: km(origin, r) })).sort((a, b) => a.d - b.d);
  const b = buyers.map((r) => ({ r, d: km(origin, r) })).sort((a, b) => a.d - b.d);
  const near = (x) => x.d <= RADIUS || x.r.pin === pin;
  const sNear = s.filter(near), bNear = b.filter(near);
  $("#sellers-count").textContent = sNear.length;
  $("#buyers-count").textContent = bNear.length;
  $("#seller-stats").innerHTML = stat(sNear.length, `within ${RADIUS} km`) + stat(sNear.filter((x) => x.r.status === "Verified").length, "verified") + stat(sNear.filter((x) => x.r.status !== "Verified").length, "need review");
  $("#buyer-stats").innerHTML = stat(bNear.length, `within ${RADIUS} km`) + stat(bNear.reduce((n, x) => n + (x.r.orders || 0), 0), "orders placed") + stat(bNear.filter((x) => x.r.status === "New").length, "new");
  const list = (all, few, html) => few.length ? few.map(html).join("")
    : `<li class="empty" style="display:block">None within ${RADIUS} km.${all[0] && all[0].d !== Infinity ? ` The nearest is ${esc(all[0].r.name)}, ${fmt(all[0].d)} away.` : ""}</li>`;
  $("#sellers-list").innerHTML = list(s, sNear, ({ r, d }) =>
    `<li class="pick"><input type="checkbox" class="pick-box" data-pick="${esc(r.id)}" aria-label="Select ${esc(r.name)}"${picked.has(r.id) ? " checked" : ""}><button type="button" class="name link-name" data-seller="${esc(r.id)}">${esc(r.name)}</button><span class="chip ${chip[r.status] || "warn"}">${esc(r.status)}</span><span class="meta">${esc(r.category)}${r.subCategory ? " › " + esc(r.subCategory) : ""}${r.type ? " › " + esc(r.type) : ""} · Pin ${esc(r.pin)}${countProducts(r.id) ? ` · ${countProducts(r.id)} products` : ""}${r.ownerUid ? " · signed up" : ""}</span><span class="dist">${fmt(d)}</span><button type="button" class="btn ghost small kyc-btn" data-seller="${esc(r.id)}">Review KYC</button></li>`);
  shownSellers = sNear.map((x) => x.r.id);
  syncPicks();
  $("#buyers-list").innerHTML = list(b, bNear, ({ r, d }) =>
    `<li><span class="name">${esc(r.name)}</span><span class="chip ${chip[r.status] || "warn"}">${esc(r.status)}</span><span class="meta">${r.orders || 0} orders · Pin ${esc(r.pin || "not set")}${r.phone ? " · " + esc(r.phone) : ""}</span><span class="dist">${fmt(d)}</span></li>`);
}

// ---------- Select and delete sellers
const picked = new Set();
let shownSellers = [];
const dd = $("#delete-dialog");
function syncPicks() {
  for (const id of [...picked]) if (!sellers.some((r) => r.id === id)) picked.delete(id);
  const n = picked.size, all = $("#pick-all");
  $("#delete-picked").disabled = !n;
  $("#delete-picked").textContent = n ? `Delete selected (${n})` : "Delete selected";
  const shownPicked = shownSellers.filter((id) => picked.has(id)).length;
  all.checked = shownSellers.length > 0 && shownPicked === shownSellers.length;
  all.indeterminate = shownPicked > 0 && shownPicked < shownSellers.length;
  all.disabled = !shownSellers.length;
}
$("#sellers-list").addEventListener("change", (e) => {
  const id = e.target.dataset?.pick;
  if (!id) return;
  e.target.checked ? picked.add(id) : picked.delete(id);
  syncPicks();
});
$("#pick-all").onchange = (e) => {
  shownSellers.forEach((id) => (e.target.checked ? picked.add(id) : picked.delete(id)));
  document.querySelectorAll("#sellers-list [data-pick]").forEach((b) => (b.checked = e.target.checked));
  syncPicks();
};
const closeDelete = () => { dd.hidden = true; $("#del-msg").hidden = true; $("#del-yes").disabled = false; };
$("#delete-picked").onclick = () => {
  const rows = sellers.filter((r) => picked.has(r.id));
  if (!rows.length) return;
  $("#del-title").textContent = `Are you sure you want to delete ${rows.length} seller${rows.length === 1 ? "" : "s"}?`;
  $("#del-names").innerHTML = rows.map((r) => `<li>${esc(r.name)} <span class="hint">Pin ${esc(r.pin)}</span></li>`).join("");
  dd.hidden = false; $("#del-no").focus();
};
$("#del-no").onclick = closeDelete;
dd.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDelete(); });
$("#del-yes").onclick = async () => {
  const ids = [...picked], m = $("#del-msg");
  $("#del-yes").disabled = true;
  show(m, `Deleting ${ids.length}…`, "");
  try {
    // Each seller's record, shop listing, products and product photos all go.
    const ops = [];
    for (const id of ids) {
      ops.push((b) => b.delete(doc(db, "sellers", id)), (b) => b.delete(doc(db, "publicSellers", id)));
      products.filter((p) => p.sellerId === id).forEach((p) => ops.push((b) => b.delete(doc(db, "products", p.id))));
      const imgs = await getDocs(query(collection(db, "productImages"), where("sellerId", "==", id)));
      imgs.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
    }
    await commitAll(ops);
    picked.clear();
    closeDelete();
    await load();
    $("#data-note").textContent = `Deleted ${ids.length} seller${ids.length === 1 ? "" : "s"}. ` + $("#data-note").textContent;
  } catch (err) { $("#del-yes").disabled = false; show(m, `Couldn't delete: ${err.message}`, "bad"); }
};

// Pin code search: use the known pin table, else the first record with that pin
$("#pin-form").onsubmit = (e) => {
  e.preventDefault();
  const pin = $("#pin-input").value.trim(), msg = $("#loc-msg");
  if (!/^[1-9]\d{5}$/.test(pin)) { msg.textContent = "Enter a 6-digit Indian pin code, like 400001."; return; }
  const known = PINS[pin] || [...sellers, ...buyers].find((r) => r.pin === pin && r.lat != null);
  msg.textContent = known ? "" : `No location on file for ${pin}. Showing only records with that exact pin code.`;
  current = { origin: known ? { lat: known.lat, lng: known.lng } : null, label: PINS[pin]?.place || `Pin code ${pin}`, pin };
  render();
};

$("#geo-btn").onclick = () => {
  const msg = $("#loc-msg");
  if (!navigator.geolocation) { msg.textContent = "This browser can't share location. Enter a pin code instead."; return; }
  msg.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition((pos) => {
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const [pin, p] = Object.entries(PINS).sort((a, b) => km(here, a[1]) - km(here, b[1]))[0];
    $("#pin-input").value = pin;
    msg.textContent = `Located at ${here.lat.toFixed(4)}, ${here.lng.toFixed(4)}.`;
    current = { origin: here, label: `Your location, near ${p.place}`, pin };
    render();
  }, () => { msg.textContent = "Location access was blocked. Allow location for this site, or enter a pin code."; },
  { enableHighAccuracy: true, timeout: 10000 });
};

// Add seller
const sd = $("#seller-dialog");
const catSel = $("#as-cat"), subSel = $("#as-sub"), typeSel = $("#as-type");
const opt = (v, label = v) => { const o = document.createElement("option"); o.value = v; o.textContent = label; return o; };
Object.keys(CATEGORIES).forEach((c) => catSel.append(opt(c)));
const fillTypes = () => {
  const types = typesOf(catSel.value, subSel.value);
  typeSel.replaceChildren(opt("", "Select type"), ...types.map((x) => opt(x)));
  $("#as-type-label").hidden = !types.length;
};
const fillSubs = () => {
  const subs = subsOf(catSel.value);
  subSel.replaceChildren(opt("", subs.length ? "Select sub-category" : "Select a category first"), ...subs.map((x) => opt(x)));
  subSel.disabled = !subs.length;
  fillTypes();
};
catSel.onchange = fillSubs;
subSel.onchange = fillTypes;
const closeSeller = () => { sd.hidden = true; $("#seller-form").reset(); fillSubs(); $("#as-msg").hidden = true; };
$("#add-seller").onclick = () => { sd.hidden = false; $("#as-pin").value = current.pin || ""; $("#as-name").focus(); };
$("#as-cancel").onclick = closeSeller;
sd.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSeller(); });
$("#seller-form").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#as-name").value.trim(), category = catSel.value, subCategory = subSel.value, pin = $("#as-pin").value.trim(), m = $("#as-msg");
  if (!name) return show(m, "Enter the shop name.", "bad");
  if (!category || !subCategory) return show(m, "Choose a category and a sub-category.", "bad");
  const type = typeSel.value;
  if (typesOf(category, subCategory).length && !type) return show(m, "Choose a type.", "bad");
  if (!/^[1-9]\d{5}$/.test(pin)) return show(m, "Enter a 6-digit pin code.", "bad");
  const contact = { email: $("#as-email").value.trim().toLowerCase(), whatsapp: $("#as-whatsapp").value.trim(), website: $("#as-website").value.trim() };
  const bad = checkContact(contact);
  if (bad) return show(m, bad, "bad");
  const loc = PINS[pin] || [...sellers, ...buyers].find((r) => r.pin === pin && r.lat != null);
  try {
    await addDoc(collection(db, "sellers"), { name, category, subCategory, ...(type && { type }), pin, ...contact, status: "Pending KYC",
      lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, createdAt: serverTimestamp() });
    closeSeller();
    await load();
  } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
};

// ---------- Seller KYC
const kd = $("#kyc-dialog");
let kycSeller = null;
wireKycSkips("kyc-");
const closeKyc = () => { kd.hidden = true; $("#kyc-form").reset(); $("#kyc-msg").hidden = true; kycSeller = null; };
$("#sellers-list").addEventListener("click", (e) => {
  const id = e.target.closest("[data-seller]")?.dataset.seller;
  kycSeller = sellers.find((r) => r.id === id);
  if (!kycSeller) return;
  const k = kycSeller.kyc || {};
  $("#kyc-title").textContent = kycSeller.name;
  $("#kyc-sub").textContent = `${kycSeller.category || ""}${kycSeller.subCategory ? " › " + kycSeller.subCategory : ""}${kycSeller.type ? " › " + kycSeller.type : ""} · Pin ${kycSeller.pin}`;
  $("#kyc-status").textContent = kycSeller.status;
  $("#kyc-status").className = "chip " + (chip[kycSeller.status] || "warn");
  fillKyc("kyc-", k); $("#kyc-note").value = kycSeller.kycNote || "";
  $("#kyc-email").value = kycSeller.email || ""; $("#kyc-whatsapp").value = kycSeller.whatsapp || ""; $("#kyc-website").value = kycSeller.website || "";
  const when = kycSeller.kycReviewedAt?.toDate?.();
  $("#kyc-review").textContent = when ? `Last reviewed ${when.toLocaleString("en-IN")} by ${kycSeller.kycReviewedBy}.` : "Not reviewed yet.";
  const mine = products.filter((p) => p.sellerId === kycSeller.id);
  $("#kyc-product-count").textContent = mine.length;
  $("#kyc-products").innerHTML = mine.length ? mine.map((p) => `<li class="product">
      ${p.thumb ? `<img src="${p.thumb}" alt="" class="product-thumb">` : `<div class="product-thumb empty-thumb">No photo</div>`}
      <div class="product-main">
        <span class="name">${esc(p.name)}</span>
        <span class="price">${rupees(sellingPrice(p))}${p.discount ? ` <s>${rupees(p.price)}</s> <span class="off">${rupees(p.discount)} off</span>` : ""}</span>
        <span class="meta">${esc(p.subCategory || "")}${p.type ? " › " + esc(p.type) : ""} · ${p.stock} ${itemWord(p.category, p.subCategory)}s left · ${p.sold || 0} sold · ${p.photoCount || 0} photos</span>
        ${p.description ? `<span class="meta">${esc(p.description)}</span>` : ""}
        ${Object.keys(p.details || {}).length ? `<span class="meta">${Object.entries(p.details).map(([k, v]) => `${esc(fieldLabel(p, k))}: ${esc(v)}`).join(" · ")}</span>` : ""}
      </div>
    </li>`).join("") : `<li class="empty">${kycSeller.ownerUid ? "No products added yet." : "This seller was added by you, so they can't sign in to add products."}</li>`;
  kd.hidden = false; $("#kyc-pan").focus();
});
$("#kyc-cancel").onclick = closeKyc;
kd.addEventListener("keydown", (e) => { if (e.key === "Escape") closeKyc(); });

async function saveKyc(action) {
  const m = $("#kyc-msg");
  const kyc = readKyc("kyc-");
  const badKyc = checkKyc(kyc, action === "approve");
  if (badKyc) return show(m, action === "approve" ? `To approve: ${badKyc[0].toLowerCase()}${badKyc.slice(1)}` : badKyc, "bad");
  const contact = { email: $("#kyc-email").value.trim().toLowerCase(), whatsapp: $("#kyc-whatsapp").value.trim(), website: $("#kyc-website").value.trim() };
  const badContact = checkContact(contact, action !== "approve");
  if (badContact) return show(m, badContact, "bad");
  const note = $("#kyc-note").value.trim();
  if (action === "reject" && !note) return show(m, "Write a reason in the note so the seller knows what to fix.", "bad");
  const update = { kyc, kycNote: note, ...contact };
  if (action !== "save") Object.assign(update, {
    status: action === "approve" ? "Verified" : "KYC Rejected",
    kycReviewedAt: serverTimestamp(), kycReviewedBy: auth.currentUser.email
  });
  try {
    await updateDoc(doc(db, "sellers", kycSeller.id), update);
    closeKyc();
    await load();
  } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
}
$("#kyc-form").onsubmit = (e) => { e.preventDefault(); saveKyc("save"); };
$("#kyc-approve").onclick = () => saveKyc("approve");
$("#kyc-reject").onclick = () => saveKyc("reject");

// Example data: replaces any earlier example rows; real sellers and buyers are never touched
$("#seed-btn").onclick = async () => {
  const batch = writeBatch(db);
  sellers.filter((r) => r.example).forEach((r) => batch.delete(doc(db, "sellers", r.id)));
  buyers.filter((r) => r.example).forEach((r) => batch.delete(doc(db, "buyers", r.id)));
  const put = (col, rows) => rows.forEach((r) => batch.set(doc(collection(db, col)),
    { ...r, lat: PINS[r.pin].lat, lng: PINS[r.pin].lng, example: true, createdAt: serverTimestamp() }));
  put("sellers", EXAMPLE_SELLERS);
  put("buyers", EXAMPLE_BUYERS);
  try { await batch.commit(); await load(); }
  catch (err) { $("#data-note").textContent = `Couldn't load example data: ${err.message}`; }
};

// ---------- Session
onAuthStateChanged(auth, (user) => {
  const isAdmin = user && user.email && user.email.toLowerCase() === ADMIN;
  if (user && !isAdmin) { signOut(auth); return; }
  $("#login-view").hidden = !!isAdmin;
  $("#home-view").hidden = !isAdmin;
  if (isAdmin) { $("#who-email").textContent = user.email; load(); }
  else step("step-signin");
});
