import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, writeBatch, updateDoc, setDoc, deleteDoc, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN_EMAIL } from "./firebase-config.js?v=dev";
import { PINS } from "./pincodes.js?v=dev";
import { CATEGORIES, subsOf, typesOf } from "./categories.js?v=dev";
import { fieldsFor, itemWord, sellingPrice, rupees } from "./product-fields.js?v=dev";
import { termsGate, wireTermsLink, TERMS_VERSION } from "./terms.js?v=dev";
import { ratingOf, ratingText, starString } from "./ratings.js?v=dev";
import { STATES, stateFromPin } from "./places.js?v=dev";

const $ = (s) => document.querySelector(s);
if (firebaseConfig.apiKey.startsWith("PASTE")) {
  $("#setup-dialog").hidden = false;
  throw new Error("Fill in public/firebase-config.js");
}
// A separately named app keeps the shopper's sign-in apart from the admin console's,
// so signing in on one page never signs the other out (even in another tab).
const app = initializeApp(firebaseConfig, "shop");
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helpers
const show = (el, text, kind) => { el.textContent = text; el.className = "msg " + (kind || ""); el.hidden = false; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const RULES = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["One uppercase letter", (p) => /[A-Z]/.test(p)],
  ["One number", (p) => /\d/.test(p)],
  ["One symbol", (p) => /[^A-Za-z0-9]/.test(p)]
];
document.querySelectorAll(".rules").forEach((ul) => {
  ul.innerHTML = RULES.map(([t]) => `<li>${t}</li>`).join("");
  const input = document.getElementById(ul.dataset.for);
  input.addEventListener("input", () =>
    [...ul.children].forEach((li, i) => li.classList.toggle("met", RULES[i][1](input.value))));
});
const authError = (e) => ({
  "auth/invalid-credential": "That user ID or email and password don't match. Check them or reset your password.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes or reset your password.",
  "auth/network-request-failed": "Can't reach the server. Check your connection and try again.",
  "auth/user-not-found": "No account uses that email.",
  "auth/invalid-email": "That email doesn't look right. Check for typos, or sign in with your user ID instead.",
  "auth/missing-email": "Enter the email on your account."
}[e.code] || e.message);
const km = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const fmt = (d) => d === Infinity ? "" : d < 1 ? "< 1 km" : `${Math.round(d).toLocaleString("en-IN")} km`;

// ---------- Sign in, create account, reset
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const steps = ["step-signin", "step-signup", "step-forgot"];
const step = (id) => steps.forEach((s) => (document.getElementById(s).hidden = s !== id));
$("#go-signup").onclick = () => step("step-signup");
$("#go-forgot").onclick = () => { const v = $("#si-id").value.trim(); $("#fg-email").value = v.includes("@") ? v : ""; step("step-forgot"); };
document.querySelectorAll(".back").forEach((b) => (b.onclick = () => step("step-signin")));
$("#si-show").onchange = (e) => ($("#si-pass").type = e.target.checked ? "text" : "password");

$("#signin-form").onsubmit = async (e) => {
  e.preventDefault();
  const id = $("#si-id").value.trim().toLowerCase(), pw = $("#si-pass").value, m = $("#si-msg");
  if (!id || !pw) return show(m, "Enter your email or user ID, and your password.", "bad");
  try {
    let email = id;
    if (id.includes("@") && !EMAIL.test(id)) return show(m, "That email doesn't look right. Check for typos, or sign in with your user ID instead.", "bad");
    if (!id.includes("@")) {
      const u = await getDoc(doc(db, "usernames", id));
      if (!u.exists()) return show(m, "No account uses that user ID. Check it, or sign in with your email.", "bad");
      email = u.data().email;
    }
    await signInWithEmailAndPassword(auth, email, pw);
    $("#si-pass").value = ""; m.hidden = true;
  } catch (err) { show(m, authError(err), "bad"); }
};

$("#signup-form").onsubmit = async (e) => {
  e.preventDefault();
  const m = $("#su-msg");
  const name = $("#su-name").value.trim(), user = $("#su-user").value.trim().toLowerCase();
  const phone = $("#su-phone").value.trim(), email = $("#su-email").value.trim().toLowerCase();
  const pin = $("#su-pin").value.trim(), pw = $("#su-pass").value;
  if (!name) return show(m, "Enter your full name.", "bad");
  if (!/^[a-z0-9_.]{3,20}$/.test(user)) return show(m, "User ID should be 3 to 20 letters, numbers, dots or underscores.", "bad");
  if (!/^[6-9]\d{9}$/.test(phone)) return show(m, "Mobile number should be 10 digits, like 9876543210.", "bad");
  if (!EMAIL.test(email)) return show(m, "That email doesn't look right.", "bad");
  if (email === SUPER_ADMIN_EMAIL.toLowerCase()) return show(m, "This email belongs to the admin account. Use a different email.", "bad");
  if (pin && !/^[1-9]\d{5}$/.test(pin)) return show(m, "Pin code should be 6 digits.", "bad");
  if (!RULES.every(([, f]) => f(pw))) return show(m, "Your password doesn't meet every rule above.", "bad");
  if (pw !== $("#su-confirm").value) return show(m, "The two passwords don't match.", "bad");
  try {
    if ((await getDoc(doc(db, "usernames", user))).exists()) return show(m, "That user ID is taken. Try another.", "bad");
    creating = true;
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(cred.user, { displayName: name });
    const loc = PINS[pin];
    const batch = writeBatch(db);
    batch.set(doc(db, "usernames", user), { uid: cred.user.uid, email });
    batch.set(doc(db, "buyers", cred.user.uid), {
      name, userId: user, email, phone, pin: pin || null,
      lat: loc ? loc.lat : null, lng: loc ? loc.lng : null,
      orders: 0, status: "New", createdAt: serverTimestamp(),
      termsVersion: TERMS_VERSION, termsAcceptedAt: serverTimestamp()
    });
    await batch.commit();
    creating = false;
    enter(cred.user);
  } catch (err) {
    creating = false;
    show(m, err.code === "permission-denied" ? "That user ID was just taken. Choose another." : authError(err), "bad");
  }
};

$("#forgot-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#fg-email").value.trim().toLowerCase(), m = $("#fg-msg");
  if (!email) return show(m, "Enter the email on your account.", "bad");
  if (!EMAIL.test(email)) return show(m, "That email doesn't look right. Check for typos.", "bad");
  try {
    await sendPasswordResetEmail(auth, email);
    step("step-signin");
    show($("#si-msg"), `If ${email} has an account, a reset link is on its way.`, "ok");
  } catch (err) { show(m, authError(err), "bad"); }
};
$("#sign-out").onclick = () => signOut(auth);

// ---------- Search
let me = null, here = null, sellers = [], products = [], reviews = [];
const catSel = $("#f-cat"), subSel = $("#f-sub"), typeSel = $("#f-type");
const opt = (v, label = v) => { const o = document.createElement("option"); o.value = v; o.textContent = label; return o; };
Object.keys(CATEGORIES).forEach((c) => catSel.append(opt(c)));
catSel.onchange = () => {
  const subs = subsOf(catSel.value);
  subSel.replaceChildren(opt("", "All"), ...subs.map((x) => opt(x)));
  subSel.disabled = !subs.length;
  subSel.onchange();
};
subSel.onchange = () => {
  const types = typesOf(catSel.value, subSel.value);
  typeSel.replaceChildren(opt("", "All"), ...types.map((x) => opt(x)));
  $("#f-type-label").hidden = !types.length;
  render();
};
["#f-type", "#f-radius"].forEach((s) => ($(s).onchange = render));
$("#f-text").oninput = render;
$("#filter-form").onsubmit = (e) => e.preventDefault();

// ---------- Place search: state, then city, then pin code. All start blank, which shows every seller.
// Typing part of a name is enough ("maha" finds Maharashtra); suggestions narrow to the level above.
const norm = (v) => String(v || "").toLowerCase().replace(/\band\b/g, "&").replace(/\s+/g, " ").trim();
const stateOf = (r) => r.state || stateFromPin(r.pin) || "";
const place = () => ({ state: norm($("#place-state").value), city: norm($("#place-city").value), pin: $("#place-pin").value.replace(/\D/g, "") });
const inPlace = (r, f = place()) =>
  (!f.state || norm(stateOf(r)).startsWith(f.state)) &&
  (!f.city || norm(r.city).startsWith(f.city)) &&
  (!f.pin || String(r.pin || "").startsWith(f.pin));
function fillPlaceOptions() {
  const f = place();
  const list = (id, values) => $(id).replaceChildren(...[...new Set(values.filter(Boolean))].sort().map((v) => opt(v)));
  list("#state-options", [...STATES]);
  list("#city-options", sellers.filter((r) => inPlace(r, { ...f, city: "", pin: "" })).map((r) => r.city));
  list("#pin-options", sellers.filter((r) => inPlace(r, { ...f, pin: "" })).map((r) => r.pin));
  // Names the place in full once the typed letters point to just one state or city.
  const named = (typed, f, names) => { if (!f) return ""; const hits = [...new Set(names.filter((n) => n && norm(n).startsWith(f)))]; return hits.length === 1 ? hits[0] : typed; };
  const parts = [named($("#place-state").value.trim(), f.state, STATES), named($("#place-city").value.trim(), f.city, sellers.filter((r) => inPlace(r, { ...f, city: "", pin: "" })).map((r) => r.city)), f.pin && `Pin ${f.pin}`].filter(Boolean);
  $("#where").textContent = here && liveLocation ? "Showing sellers near your live location" + (parts.length ? `, in ${parts.join(" › ")}` : "")
    : parts.length ? `Showing sellers in ${parts.join(" › ")}` : "Showing sellers in every state";
}
["#place-state", "#place-city", "#place-pin"].forEach((s) => ($(s).oninput = () => { $("#loc-msg").textContent = ""; fillPlaceOptions(); render(); }));
$("#place-form").onsubmit = (e) => e.preventDefault();
$("#place-clear").onclick = () => {
  $("#place-form").reset();
  liveLocation = false; here = savedHere;
  $("#f-radius-label").hidden = true;
  $("#loc-msg").textContent = "";
  fillPlaceOptions(); render();
};
let liveLocation = false, savedHere = null;

const whatsappLink = (r, text) => `https://wa.me/91${encodeURIComponent(r.whatsapp)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

function render() {
  const text = $("#f-text").value.trim().toLowerCase();
  const radius = Number($("#f-radius").value) || Infinity, f = place();
  const byId = new Map(sellers.map((r) => [r.id, r]));
  const items = products
    .map((p) => ({ p, s: byId.get(p.sellerId) }))
    .filter(({ s }) => s)
    .map(({ p, s }) => ({ p, s, d: km(here, s) }))
    .filter(({ p, s, d }) =>
      (!catSel.value || p.category === catSel.value) &&
      (!subSel.value || p.subCategory === subSel.value) &&
      (!typeSel.value || p.type === typeSel.value) &&
      (!text || [p.name, p.description, p.subCategory, p.type, s.name, ...Object.values(p.details || {})].join(" ").toLowerCase().includes(text)) &&
      inPlace(s, f) && (!liveLocation || radius === Infinity || d <= radius))
    .sort((a, b) => (b.p.stock > 0) - (a.p.stock > 0) || a.d - b.d || a.p.name.localeCompare(b.p.name));
  $("#product-count").textContent = items.length;
  $("#product-note").textContent = items.length ? "In stock first, then nearest" : "";
  $("#product-results").innerHTML = items.length ? items.map(({ p, s, d }) => `
    <li><button type="button" class="product-card" data-product="${esc(p.id)}">
      ${p.thumb ? `<img src="${p.thumb}" alt="" loading="lazy">` : `<span class="empty-thumb">No photo</span>`}
      <span class="name">${esc(p.name)}</span>
      <span class="price">${rupees(sellingPrice(p))}${p.discount ? ` <s>${rupees(p.price)}</s>` : ""}</span>
      <span class="meta">${p.stock > 0 ? (p.stock <= 5 ? `Only ${p.stock} left` : "In stock") : `<b class="out">Out of stock</b>`}</span>
      <span class="meta">${esc(s.name)}${fmt(d) ? " · " + fmt(d) : ""}</span>
    </button></li>`).join("")
    : `<li class="empty">No products match yet. Try another state, city, pin code or category.</li>`;
  const rows = sellers
    .map((r) => ({ r, d: km(here, r) }))
    .filter(({ r, d }) =>
      (!catSel.value || r.category === catSel.value) &&
      (!subSel.value || r.subCategory === subSel.value) &&
      (!typeSel.value || r.type === typeSel.value) &&
      (!text || [r.name, r.category, r.subCategory, r.type].join(" ").toLowerCase().includes(text)) &&
      inPlace(r, f) && (!liveLocation || radius === Infinity || d <= radius))
    .sort((a, b) => a.d - b.d || a.r.name.localeCompare(b.r.name));
  $("#result-count").textContent = rows.length;
  $("#result-note").textContent = here ? "Nearest first" : "";
  $("#results").innerHTML = rows.length ? rows.map(({ r, d }) => `
    <li class="result">
      <div class="result-main">
        <span class="name">${esc(r.name)}</span>
        <span class="meta">${esc(r.category)}${r.subCategory ? " › " + esc(r.subCategory) : ""}${r.type ? " › " + esc(r.type) : ""}</span>
        <span class="meta">${[r.city, stateOf(r)].filter(Boolean).map(esc).join(", ")}${r.city || stateOf(r) ? " · " : ""}Pin ${esc(r.pin)}${fmt(d) ? " · " + fmt(d) + " away" : ""} · <span class="chip ok">KYC verified</span></span>
        <span class="meta rating">${ratingText(ratingOf(reviews, r.id))}</span>
      </div>
      <div class="result-actions">
        <button type="button" class="btn ghost small" data-rate="${esc(r.id)}">${reviews.some((x) => x.sellerId === r.id && x.uid === auth.currentUser?.uid) ? "Edit my rating" : "Rate"}</button>
        ${r.whatsapp ? `<a class="btn small" href="${whatsappLink(r)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        ${r.email ? `<a class="btn ghost small" href="mailto:${esc(r.email)}">Email</a>` : ""}
        ${r.website ? `<a class="btn ghost small" href="${esc(r.website)}" target="_blank" rel="noopener">Website</a>` : ""}
      </div>
    </li>`).join("")
    : `<li class="empty">No verified sellers match. Try another state, city, pin code or category.</li>`;
}

async function savePlace(fields) {
  try { await updateDoc(doc(db, "buyers", auth.currentUser.uid), fields); } catch { /* the search still works without saving */ }
}

$("#geo-btn").onclick = () => {
  const msg = $("#loc-msg");
  if (!navigator.geolocation) { msg.textContent = "This browser can't share location. Type your state, city or pin code instead."; return; }
  msg.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition((pos) => {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const [pin, p] = Object.entries(PINS).sort((a, b) => km(loc, a[1]) - km(loc, b[1]))[0];
    msg.textContent = `Using your live location, near ${p.place}. Choose a distance below.`;
    here = loc; liveLocation = true;
    $("#f-radius-label").hidden = false;
    fillPlaceOptions(); render();
    savePlace({ lat: loc.lat, lng: loc.lng });
  }, () => { msg.textContent = "Location access was blocked. Allow location for this site, or type your state, city or pin code."; },
  { enableHighAccuracy: true, timeout: 10000 });
};

async function enter(user) {
  $("#auth-view").hidden = true;
  $("#shop-view").hidden = false;
  $("#who-name").textContent = `Hello, ${user.displayName || user.email}`;
  $("#results").innerHTML = `<li class="empty">Loading sellers…</li>`;
  try {
    const [pub, mine, prods] = await Promise.all([getDocs(collection(db, "publicSellers")), getDoc(doc(db, "buyers", user.uid)),
      getDocs(query(collection(db, "products"), where("live", "==", true)))]);
    reviews = (await getDocs(collection(db, "reviews")).catch(() => ({ docs: [] }))).docs.map((d) => ({ id: d.id, ...d.data() }));
    sellers = pub.docs.map((d) => ({ id: d.id, ...d.data() }));
    products = prods.docs.map((d) => ({ id: d.id, ...d.data() }));
    me = mine.exists() ? mine.data() : null;
    // Records that this shopper accepted the current terms (they accepted on the terms screen to get here).
    if (me && me.termsVersion !== TERMS_VERSION)
      updateDoc(doc(db, "buyers", user.uid), { termsVersion: TERMS_VERSION, termsAcceptedAt: serverTimestamp() }).catch(() => {});
  } catch (err) {
    $("#results").innerHTML = `<li class="empty">Couldn't load sellers: ${esc(err.message)}</li>`;
    return;
  }
  // The search starts blank; the shopper's saved location only orders results, nearest first.
  const saved = me?.lat != null ? me : PINS[me?.pin];
  savedHere = here = saved ? { lat: saved.lat, lng: saved.lng } : null;
  fillPlaceOptions();
  render();
}

// ---------- Session
let creating = false;
// The buyer terms must be accepted on this device before the shop opens.
wireTermsLink("buyer");
await termsGate("buyer");

onAuthStateChanged(auth, (user) => {
  if (creating) return; // the sign-up handler enters once the profile is saved
  if (user && user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
    signOut(auth);
    show($("#si-msg"), "That's the admin account. Use the admin console instead.", "bad");
    return;
  }
  if (user) enter(user);
  else { $("#shop-view").hidden = true; $("#auth-view").hidden = false; step("step-signin"); }
});

// ---------- Product details
const pv = $("#product-dialog");
let viewing = null;
const closeView = () => { pv.hidden = true; viewing = null; };
$("#pv-close").onclick = closeView;
pv.addEventListener("keydown", (e) => { if (e.key === "Escape") closeView(); });
pv.addEventListener("click", (e) => { if (e.target === pv) closeView(); });
$("#pv-strip").addEventListener("click", (e) => {
  const src = e.target.closest("[data-src]")?.dataset.src;
  if (src) $("#pv-photo").src = src;
});

$("#product-results").addEventListener("click", async (e) => {
  const id = e.target.closest("[data-product]")?.dataset.product;
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const s = sellers.find((r) => r.id === p.sellerId) || {};
  viewing = p;
  const word = itemWord(p.category, p.subCategory);
  $("#pv-name").textContent = p.name;
  $("#pv-price").innerHTML = `${rupees(sellingPrice(p))}${p.discount ? ` <s>${rupees(p.price)}</s> <span class="off">${rupees(p.discount)} off</span>` : ""}`;
  $("#pv-stock").innerHTML = p.stock > 0 ? `${p.stock} ${word}${p.stock === 1 ? "" : "s"} available` : `<b class="out">Out of stock</b>`;
  $("#pv-desc").textContent = p.description || "";
  const labels = Object.fromEntries(fieldsFor(p.category, p.subCategory).map((f) => [f.key, f.label]));
  $("#pv-details").innerHTML = [["Category", [p.subCategory, p.type].filter(Boolean).join(" › ")], ...Object.entries(p.details || {}).map(([k, v]) => [labels[k] || k, v])]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("#pv-seller").innerHTML = `Sold by <b>${esc(s.name || p.sellerName)}</b> · ${ratingText(ratingOf(reviews, p.sellerId))}${s.pin ? ` · Pin ${esc(s.pin)}` : ""}${fmt(km(here, s)) ? ` · ${fmt(km(here, s))} away` : ""} · <span class="chip ok">KYC verified</span>`;
  $("#pv-actions").innerHTML = [
    s.whatsapp && p.stock > 0 ? `<a class="btn" href="${whatsappLink(s, `Hi ${s.name}, I'd like to buy ${p.name} (${rupees(sellingPrice(p))}) that I saw on GiaZoNest.`)}" target="_blank" rel="noopener">Buy on WhatsApp</a>` : "",
    s.whatsapp && p.stock <= 0 ? `<a class="btn ghost" href="${whatsappLink(s, `Hi ${s.name}, will ${p.name} be back in stock?`)}" target="_blank" rel="noopener">Ask on WhatsApp</a>` : "",
    s.email ? `<a class="btn ghost" href="mailto:${esc(s.email)}?subject=${encodeURIComponent(p.name + " on GiaZoNest")}">Email seller</a>` : ""
  ].join("");
  const photo = $("#pv-photo");
  photo.hidden = !p.thumb; photo.src = p.thumb || ""; photo.alt = p.name;
  $("#pv-strip").innerHTML = "";
  pv.hidden = false;
  $("#pv-close").focus();
  if (!p.photoCount) return;
  try {
    const snap = await getDocs(query(collection(db, "productImages"), where("productId", "==", p.id)));
    if (viewing !== p) return;
    const srcs = snap.docs.map((d) => d.data()).sort((a, b) => a.n - b.n).map((x) => x.data);
    if (srcs[0]) photo.src = srcs[0];
    $("#pv-strip").innerHTML = srcs.length > 1 ? srcs.map((src, i) => `<li><button type="button" data-src="${src}" aria-label="Photo ${i + 1}"><img src="${src}" alt=""></button></li>`).join("") : "";
  } catch { /* the cover thumbnail is still shown */ }
});

// ---------- Ratings and feedback
const rd = $("#rate-dialog");
let rating = null; // the seller being rated
const myReview = (sellerId) => reviews.find((x) => x.sellerId === sellerId && x.uid === auth.currentUser?.uid);
function renderReviews() {
  const list = reviews.filter((x) => x.sellerId === rating.id)
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  $("#rate-summary").textContent = ratingText(ratingOf(reviews, rating.id));
  $("#rate-list").innerHTML = list.length ? list.map((x) => `<li>
      <span class="stars-static" aria-label="${x.stars} out of 5">${starString(x.stars)}</span>
      <b>${esc(x.name || "Shopper")}</b>${x.uid === auth.currentUser?.uid ? " <span class=\"hint\">(you)</span>" : ""}
      ${x.text ? `<p>${esc(x.text)}</p>` : ""}
    </li>`).join("") : `<li class="empty">No reviews yet. Be the first.</li>`;
}
const closeRate = () => { rd.hidden = true; rating = null; };
$("#results").addEventListener("click", (e) => {
  const id = e.target.closest("[data-rate]")?.dataset.rate;
  rating = sellers.find((r) => r.id === id);
  if (!rating) return;
  const mine = myReview(id);
  $("#rate-form").reset();
  $("#rate-msg").hidden = true;
  $("#rate-title").textContent = `Rate ${rating.name}`;
  if (mine) { $(`#star-${mine.stars}`).checked = true; $("#rate-text").value = mine.text || ""; }
  $("#rate-delete").hidden = !mine;
  $("#rate-save").textContent = mine ? "Update review" : "Post review";
  renderReviews();
  rd.hidden = false;
  $(`#star-${mine?.stars || 5}`).focus();
});
$("#rate-cancel").onclick = closeRate;
rd.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRate(); });

$("#rate-form").onsubmit = async (e) => {
  e.preventDefault();
  const m = $("#rate-msg"), stars = Number(document.querySelector("#rate-form [name=stars]:checked")?.value || 0);
  if (!stars) return show(m, "Tap a star to rate this seller.", "bad");
  const uid = auth.currentUser.uid, mine = myReview(rating.id);
  const data = { sellerId: rating.id, uid, name: (me?.name || auth.currentUser.displayName || "Shopper").slice(0, 60),
    stars, text: $("#rate-text").value.trim(), updatedAt: serverTimestamp(), createdAt: mine?.createdAt || serverTimestamp() };
  $("#rate-save").disabled = true;
  try {
    await setDoc(doc(db, "reviews", `${rating.id}_${uid}`), data);
    reviews = reviews.filter((x) => x !== mine).concat({ id: `${rating.id}_${uid}`, ...data, updatedAt: { seconds: Date.now() / 1000 } });
    show(m, "Thanks! Your review is posted.", "ok");
    $("#rate-delete").hidden = false;
    $("#rate-save").textContent = "Update review";
    renderReviews();
    render();
  } catch (err) { show(m, `Couldn't post your review: ${err.message}`, "bad"); }
  finally { $("#rate-save").disabled = false; }
};
$("#rate-delete").onclick = async () => {
  const mine = myReview(rating.id);
  if (!mine || !confirm("Delete your review of this seller?")) return;
  try {
    await deleteDoc(doc(db, "reviews", mine.id));
    reviews = reviews.filter((x) => x !== mine);
    closeRate();
    render();
  } catch (err) { show($("#rate-msg"), `Couldn't delete: ${err.message}`, "bad"); }
};
