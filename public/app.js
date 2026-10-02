import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, writeBatch, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN_EMAIL } from "./firebase-config.js";
import { PINS, EXAMPLE_SELLERS, EXAMPLE_BUYERS } from "./pincodes.js";
import { CATEGORIES, subsOf, typesOf } from "./categories.js";

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
let sellers = [], buyers = [], current = { origin: PINS["110001"], label: PINS["110001"].place, pin: "110001" };
const RADIUS = 50; // km counted as "near"
const chip = { "Verified": "ok", "Active": "ok", "Pending KYC": "warn", "New": "warn", "Suspended": "bad", "Flagged": "bad" };
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
    const [s, b] = await Promise.all([getDocs(collection(db, "sellers")), getDocs(collection(db, "buyers"))]);
    sellers = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    buyers = b.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    `<li><span class="name">${esc(r.name)}</span><span class="chip ${chip[r.status] || "warn"}">${esc(r.status)}</span><span class="meta">${esc(r.category)}${r.subCategory ? " › " + esc(r.subCategory) : ""}${r.type ? " › " + esc(r.type) : ""} · Pin ${esc(r.pin)}</span><span class="dist">${fmt(d)}</span></li>`);
  $("#buyers-list").innerHTML = list(b, bNear, ({ r, d }) =>
    `<li><span class="name">${esc(r.name)}</span><span class="chip ${chip[r.status] || "warn"}">${esc(r.status)}</span><span class="meta">${r.orders || 0} orders · Pin ${esc(r.pin)}</span><span class="dist">${fmt(d)}</span></li>`);
}

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
  const loc = PINS[pin] || [...sellers, ...buyers].find((r) => r.pin === pin && r.lat != null);
  try {
    await addDoc(collection(db, "sellers"), { name, category, subCategory, ...(type && { type }), pin, status: "Pending KYC",
      lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, createdAt: serverTimestamp() });
    closeSeller();
    await load();
  } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
};

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
