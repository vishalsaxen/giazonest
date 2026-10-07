import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, doc, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN_EMAIL } from "./firebase-config.js?v=dev";
import "./formats.js?v=dev";
import { PINS, EXAMPLE_SELLERS, EXAMPLE_BUYERS } from "./pincodes.js?v=dev";
import { CATEGORIES, subsOf, typesOf } from "./categories.js?v=dev";
import { checkContact, publicSeller } from "./contacts.js?v=dev";
import { checkKyc, readKyc, fillKyc, wireKycSkips } from "./kyc.js?v=dev";
import { sellingPrice, rupees, itemWord, fieldsFor } from "./product-fields.js?v=dev";
import { fillStates, autofillFromPin, stateFromPin, lookupPin } from "./places.js?v=dev";
import { ratingOf, ratingText, starString } from "./ratings.js?v=dev";
import { partnerRows, partnerStats, wirePartnerReview } from "./partner-review.js?v=dev";

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
// No location until the admin types a pin code or uses GPS; until then every record shows.
let sellers = [], buyers = [], products = [], reviews = [], partners = [], current = { origin: null, label: "", pin: "" };
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
    const [s, b, p, v, pa] = await Promise.all([getDocs(collection(db, "sellers")), getDocs(collection(db, "buyers")), getDocs(collection(db, "products")),
      getDocs(collection(db, "reviews")).catch(() => null), getDocs(collection(db, "partners")).catch(() => null)]);
    sellers = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    buyers = b.docs.map((d) => ({ id: d.id, ...d.data() }));
    products = p.docs.map((d) => ({ id: d.id, ...d.data() }));
    reviews = v ? v.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    partners = pa ? pa.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    await syncPublic();
    const hasExamples = [...sellers, ...buyers].some((r) => r.example);
    $("#seed-btn").hidden = !(hasExamples || sellers.length + buyers.length === 0);
    $("#seed-btn").textContent = hasExamples ? "Refresh example data" : "Load example data";
    $("#data-note").textContent = sellers.length + buyers.length
      ? `${sellers.length} sellers and ${buyers.length} buyers in the database.`
      : "The database is empty. Add a seller, or load the example data.";
    render();
    fillPlaces();
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
  const anywhere = !origin && !pin;
  $("#where").hidden = anywhere;
  $("#cur-pin").textContent = pin || "GPS";
  $("#cur-place").textContent = label;
  const byName = (a, b) => String(a.r.name).localeCompare(String(b.r.name));
  const s = sellers.map((r) => ({ r, d: km(origin, r) })).sort((a, b) => a.d - b.d || byName(a, b));
  const b = buyers.map((r) => ({ r, d: km(origin, r) })).sort((a, b) => a.d - b.d || byName(a, b));
  const near = (x) => anywhere || x.d <= RADIUS || x.r.pin === pin;
  const sNear = s.filter(near), bNear = b.filter(near);
  const scope = anywhere ? "in total" : `within ${RADIUS} km`;
  $("#sellers-count").textContent = sNear.length;
  $("#buyers-count").textContent = bNear.length;
  $("#seller-stats").innerHTML = stat(sNear.length, scope) + stat(sNear.filter((x) => x.r.status === "Verified").length, "verified") + stat(sNear.filter((x) => x.r.status !== "Verified").length, "need review");
  $("#buyer-stats").innerHTML = stat(bNear.length, scope) + stat(bNear.reduce((n, x) => n + (x.r.orders || 0), 0), "orders placed") + stat(bNear.filter((x) => x.r.status === "New").length, "new");
  const list = (all, few, html) => few.length ? few.map(html).join("")
    : anywhere ? `<li class="empty" style="display:block">None yet.</li>`
    : `<li class="empty" style="display:block">None within ${RADIUS} km.${all[0] && all[0].d !== Infinity ? ` The nearest is ${esc(all[0].r.name)}, ${fmt(all[0].d)} away.` : ""}</li>`;
  const dist = (d) => anywhere ? "" : fmt(d);
  const rated = (id) => { const x = ratingOf(reviews, id); return x.n ? ` · ${ratingText(x)}` : ""; };
  $("#sellers-list").innerHTML = list(s, sNear, ({ r, d }) =>
    `<li class="pick"><input type="checkbox" class="pick-box" data-pick="${esc(r.id)}" aria-label="Select ${esc(r.name)}"${picked.has(r.id) ? " checked" : ""}><button type="button" class="name link-name" data-seller="${esc(r.id)}">${esc(r.name)}</button><span class="chip ${chip[r.status] || "warn"}">${esc(r.status)}</span><span class="meta">${esc(r.category)}${r.subCategory ? " › " + esc(r.subCategory) : ""}${r.type ? " › " + esc(r.type) : ""} · ${placeOf(r)}${countProducts(r.id) ? ` · ${countProducts(r.id)} products` : ""}${rated(r.id)}${r.ownerUid ? " · signed up" : ""}${viaPartner(r)}</span><span class="dist">${dist(d)}</span><span class="row-actions">${resetBtn(r.ownerUid && (r.loginEmail || r.email), r.name)}<button type="button" class="btn ghost small kyc-btn" data-seller="${esc(r.id)}">Review KYC</button></span></li>`);
  shownSellers = sNear.map((x) => x.r.id);
  syncPicks();
  $("#buyers-list").innerHTML = list(b, bNear, ({ r, d }) =>
    `<li><span class="name">${esc(r.name)}</span><span class="chip ${chip[r.status] || "warn"}">${esc(r.status)}</span><span class="meta">${r.orders || 0} orders · Pin ${esc(r.pin || "not set")}${r.phone ? " · " + esc(r.phone) : ""}</span><span class="dist">${dist(d)}</span><span class="row-actions">${resetBtn(!r.example && r.email, r.name)}</span></li>`);
  renderKycList();
  renderPartners();
}

// " · via partner VIS-1234-051026, ₹20 off fee" for sellers a partner enrolled.
const viaPartner = (r) => r.partnerId ? ` · via partner ${esc(r.partnerId)}${r.feeDiscount ? `, ₹${r.feeDiscount} off fee` : ""}` : "";

// "New Delhi, Delhi · Pin 110001", with the state guessed from the pin when it isn't saved.
const stateOf = (r) => r.state || stateFromPin(r.pin) || "";
const placeOf = (r) => [r.city, stateOf(r)].filter(Boolean).map(esc).join(", ") + `${r.city || stateOf(r) ? " · " : ""}Pin ${esc(r.pin || "not set")}`;

// ---------- Password resets
// Passwords are never visible to anyone. This emails the person a link to choose a new one.
const resetBtn = (email, name) => email
  ? `<button type="button" class="btn ghost small" data-reset="${esc(email)}" data-name="${esc(name)}">Send password reset</button>` : "";
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-reset]");
  if (!b) return;
  const email = b.dataset.reset;
  if (!confirm(`Email ${b.dataset.name} (${email}) a link to set a new password?`)) return;
  b.disabled = true;
  try {
    await sendPasswordResetEmail(auth, email);
    b.textContent = "Reset link sent ✓";
  } catch (err) {
    b.disabled = false;
    alert(`Couldn't send the reset link to ${email}: ${authError(err)}`);
  }
});

// ---------- Partners KYC
const partnerSellers = (uid) => sellers.filter((r) => r.partnerUid === uid);
function renderPartners() {
  $("#partner-pending-count").textContent = partners.filter((p) => p.status === "Pending KYC").length;
  $("#partners-count").textContent = partners.length;
  $("#partner-stats").innerHTML = partnerStats(partners, sellers.filter((r) => r.partnerUid).length);
  $("#partners-list").innerHTML = partnerRows(partners, partnerSellers, "No partners yet. Partners sign up on the Partners page.");
}
const partnerReview = wirePartnerReview({ db, auth, partners: () => partners, sellersOf: partnerSellers, onSaved: () => load() });
$("#partners-list").addEventListener("click", (e) => {
  const id = e.target.closest("[data-partner]")?.dataset.partner;
  if (id) partnerReview.open(id);
});

// ---------- Tabs
document.querySelectorAll("[data-tab]").forEach((t) => (t.onclick = () => {
  document.querySelectorAll("[data-tab]").forEach((x) => {
    const on = x === t;
    x.setAttribute("aria-selected", on);
    $("#tab-" + x.dataset.tab).hidden = !on;
  });
}));

// ---------- KYC list: approved and pending sellers by state, city and pin code
const kycGroup = (r) => r.status === "Verified" ? "approved" : r.status === "KYC Rejected" ? "rejected" : r.status === "Pending KYC" ? "pending" : "other";
const UNKNOWN = "Not set";
function renderKycList() {
  const fState = $("#kl-state").value, fCity = $("#kl-city").value, fPin = $("#kl-pin").value.trim(), fStatus = $("#kl-status").value;
  const rows = sellers.map((r) => ({ r, state: stateOf(r) || UNKNOWN, city: r.city || UNKNOWN, group: kycGroup(r) }));
  $("#kyc-pending-count").textContent = rows.filter((x) => x.group === "pending").length;

  // Filter choices: every state on file, and the cities in the chosen state.
  const keep = (sel, values, all) => {
    const v = sel.value;
    sel.replaceChildren(opt("", all), ...[...new Set(values)].sort().map((x) => opt(x)));
    sel.value = values.includes(v) ? v : "";
  };
  keep($("#kl-state"), rows.map((x) => x.state), "All states");
  keep($("#kl-city"), rows.filter((x) => !fState || x.state === fState).map((x) => x.city), "All cities");

  const placeOk = (x) => (!fState || x.state === fState) && (!$("#kl-city").value || x.city === $("#kl-city").value) && (!fPin || String(x.r.pin || "").startsWith(fPin));
  const inPlace = rows.filter(placeOk);
  const shown = inPlace.filter((x) => !fStatus || x.group === fStatus)
    .sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || String(a.r.pin).localeCompare(String(b.r.pin)) || String(a.r.name).localeCompare(String(b.r.name)));
  const count = (g) => inPlace.filter((x) => x.group === g).length;
  $("#kl-count").textContent = shown.length;
  $("#kl-stats").innerHTML = stat(count("approved"), "approved KYC") + stat(count("pending"), "pending KYC") + stat(count("rejected"), "rejected")
    + stat(new Set(inPlace.map((x) => x.state)).size, "states") + stat(new Set(inPlace.map((x) => x.city)).size, "cities");

  const states = new Map();
  for (const x of inPlace) {
    const t = states.get(x.state) || { approved: 0, pending: 0, rejected: 0, other: 0 };
    t[x.group]++; states.set(x.state, t);
  }
  $("#kl-by-state tbody").innerHTML = states.size ? [...states].sort((a, b) => a[0].localeCompare(b[0])).map(([st, t]) =>
    `<tr><th scope="row"><button type="button" class="link" data-state="${esc(st)}">${esc(st)}</button></th><td>${t.approved}</td><td>${t.pending}</td><td>${t.rejected}</td><td>${t.approved + t.pending + t.rejected + t.other}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">No sellers match.</td></tr>`;
  $("#kl-table tbody").innerHTML = shown.length ? shown.map(({ r, state, city }) =>
    `<tr><th scope="row">${esc(r.name)}</th><td>${esc(state)}</td><td>${esc(city)}</td><td>${esc(r.pin || UNKNOWN)}</td><td><span class="chip ${chip[r.status] || "warn"}">${esc(r.status)}</span></td><td><button type="button" class="btn ghost small" data-seller="${esc(r.id)}">Review KYC</button></td></tr>`).join("")
    : `<tr><td colspan="6" class="empty">No sellers match these filters.</td></tr>`;
}
["#kl-state", "#kl-city", "#kl-status"].forEach((s) => ($(s).onchange = renderKycList));
$("#kl-pin").oninput = renderKycList;
$("#kl-filters").onsubmit = (e) => e.preventDefault();
$("#kl-by-state").addEventListener("click", (e) => {
  const st = e.target.closest("[data-state]")?.dataset.state;
  if (st) { $("#kl-state").value = st; $("#kl-city").value = ""; renderKycList(); }
});

// Saves the state and the city (from the India Post lookup) on sellers that don't have them yet.
let filling = false;
async function fillPlaces() {
  if (filling) return;
  filling = true;
  try {
    const todo = sellers.filter((r) => /^[1-9]\d{5}$/.test(r.pin || "") && (!r.city || !r.state));
    if (!todo.length) return;
    $("#kl-note").textContent = `Looking up the city for ${todo.length} seller${todo.length === 1 ? "" : "s"}…`;
    const ops = [];
    for (const r of todo) {
      const found = await lookupPin(r.pin);
      const update = {};
      if (!r.state && (found?.state || stateFromPin(r.pin))) update.state = found?.state || stateFromPin(r.pin);
      if (!r.city && found?.city) update.city = found.city;
      if (Object.keys(update).length) { Object.assign(r, update); ops.push((b) => b.update(doc(db, "sellers", r.id), update)); }
    }
    await commitAll(ops);
    if (ops.length) await syncPublic();
    const left = sellers.filter((r) => !r.city).length;
    $("#kl-note").textContent = left ? `City not found for ${left} seller${left === 1 ? "" : "s"}. Open Review KYC to type it.` : "";
    render();
  } catch (err) {
    $("#kl-note").textContent = `Couldn't fill in cities: ${err.message}`;
  } finally { filling = false; }
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
fillStates($("#as-state"));
autofillFromPin($("#as-pin"), $("#as-state"), $("#as-city"), (t) => ($("#as-city-note").textContent = t));
const closeSeller = () => { sd.hidden = true; $("#seller-form").reset(); fillSubs(); $("#as-msg").hidden = true; $("#as-city-note").textContent = ""; delete $("#as-state").dataset.touched; };
$("#add-seller").onclick = () => {
  sd.hidden = false;
  $("#as-pin").value = current.pin || "";
  if (current.pin) $("#as-pin").dispatchEvent(new Event("change"));
  $("#as-name").focus();
};
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
  const state = $("#as-state").value, city = $("#as-city").value.trim();
  if (!state) return show(m, "Choose the state.", "bad");
  if (!city) return show(m, "Enter the city.", "bad");
  const contact = { email: $("#as-email").value.trim().toLowerCase(), whatsapp: $("#as-whatsapp").value.trim(), website: $("#as-website").value.trim() };
  const bad = checkContact(contact);
  if (bad) return show(m, bad, "bad");
  const loc = PINS[pin] || [...sellers, ...buyers].find((r) => r.pin === pin && r.lat != null);
  try {
    await addDoc(collection(db, "sellers"), { name, category, subCategory, ...(type && { type }), pin, state, city, ...contact, status: "Pending KYC",
      lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, createdAt: serverTimestamp() });
    closeSeller();
    await load();
  } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
};

// ---------- Seller KYC
const kd = $("#kyc-dialog");
let kycSeller = null;
wireKycSkips("kyc-");
fillStates($("#kyc-state"));
const closeKyc = () => { kd.hidden = true; $("#kyc-form").reset(); $("#kyc-msg").hidden = true; kycSeller = null; };
const openKycFrom = (e) => openKyc(e.target.closest("[data-seller]")?.dataset.seller);
$("#sellers-list").addEventListener("click", openKycFrom);
$("#kl-table").addEventListener("click", openKycFrom);

function renderKycReviews() {
  const mine = reviews.filter((x) => x.sellerId === kycSeller.id)
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  $("#kyc-rating-count").textContent = mine.length;
  $("#kyc-rating-avg").textContent = mine.length ? ratingText(ratingOf(reviews, kycSeller.id)) : "";
  $("#kyc-reviews").innerHTML = mine.length ? mine.map((x) => `<li>
      <span class="stars-static" aria-label="${x.stars} out of 5">${starString(x.stars)}</span> <b>${esc(x.name || "Shopper")}</b>
      <button type="button" class="link danger" data-review="${esc(x.id)}">Remove</button>
      ${x.text ? `<p>${esc(x.text)}</p>` : ""}
    </li>`).join("") : `<li class="empty">No ratings yet.</li>`;
}
$("#kyc-reviews").addEventListener("click", async (e) => {
  const id = e.target.dataset?.review;
  if (!id || !confirm("Remove this rating and feedback?")) return;
  try {
    await deleteDoc(doc(db, "reviews", id));
    reviews = reviews.filter((x) => x.id !== id);
    renderKycReviews();
    render();
  } catch (err) { show($("#kyc-msg"), `Couldn't remove it: ${err.message}`, "bad"); }
});

function openKyc(id) {
  kycSeller = sellers.find((r) => r.id === id);
  if (!kycSeller) return;
  const k = kycSeller.kyc || {};
  $("#kyc-title").textContent = kycSeller.name;
  $("#kyc-sub").textContent = `${kycSeller.category || ""}${kycSeller.subCategory ? " › " + kycSeller.subCategory : ""}${kycSeller.type ? " › " + kycSeller.type : ""} · Pin ${kycSeller.pin}`
    + (kycSeller.partnerId ? ` · Enrolled by partner ${kycSeller.partnerId} with ₹${kycSeller.feeDiscount || 0} off the monthly fee` : "");
  $("#kyc-status").textContent = kycSeller.status;
  $("#kyc-status").className = "chip " + (chip[kycSeller.status] || "warn");
  fillKyc("kyc-", k); $("#kyc-note").value = kycSeller.kycNote || "";
  $("#kyc-email").value = kycSeller.email || ""; $("#kyc-whatsapp").value = kycSeller.whatsapp || ""; $("#kyc-website").value = kycSeller.website || "";
  $("#kyc-state").value = stateOf(kycSeller); $("#kyc-city").value = kycSeller.city || "";
  renderKycReviews();
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
    </li>`).join("") : `<li class="empty">${kycSeller.ownerUid ? "No products added yet." : `This seller was added by ${kycSeller.partnerId ? "a partner" : "you"}, so they can't sign in to add products.`}</li>`;
  kd.hidden = false; $("#kyc-pan").focus();
}
$("#kyc-cancel").onclick = closeKyc;
kd.addEventListener("keydown", (e) => { if (e.key === "Escape") closeKyc(); });

async function saveKyc(action) {
  const m = $("#kyc-msg");
  const kyc = readKyc("kyc-");
  const badKyc = checkKyc(kyc, action === "approve", "kyc-");
  if (badKyc) return show(m, action === "approve" ? `To approve: ${badKyc[0].toLowerCase()}${badKyc.slice(1)}` : badKyc, "bad");
  const contact = { email: $("#kyc-email").value.trim().toLowerCase(), whatsapp: $("#kyc-whatsapp").value.trim(), website: $("#kyc-website").value.trim() };
  const badContact = checkContact(contact, action !== "approve");
  if (badContact) return show(m, badContact, "bad");
  const note = $("#kyc-note").value.trim();
  if (action === "reject" && !note) return show(m, "Write a reason in the note so the seller knows what to fix.", "bad");
  const state = $("#kyc-state").value, city = $("#kyc-city").value.trim();
  const update = { kyc, kycNote: note, ...contact, ...(state && { state }), ...(city && { city }) };
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
