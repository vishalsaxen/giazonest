import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, writeBatch, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN_EMAIL } from "./firebase-config.js?v=dev";
import { PINS } from "./pincodes.js?v=dev";
import { CATEGORIES, subsOf, typesOf } from "./categories.js?v=dev";

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
  "auth/user-not-found": "No account uses that email."
}[e.code] || e.message);
const km = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const fmt = (d) => d === Infinity ? "" : d < 1 ? "< 1 km" : `${Math.round(d).toLocaleString("en-IN")} km`;

// ---------- Sign in, create account, reset
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show(m, "That email doesn't look right.", "bad");
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
      orders: 0, status: "New", createdAt: serverTimestamp()
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
  try {
    await sendPasswordResetEmail(auth, email);
    step("step-signin");
    show($("#si-msg"), `If ${email} has an account, a reset link is on its way.`, "ok");
  } catch (err) { show(m, authError(err), "bad"); }
};
$("#sign-out").onclick = () => signOut(auth);

// ---------- Search
let me = null, here = null, sellers = [];
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

function setPlace(origin, pin, label) {
  here = origin;
  $("#cur-pin").textContent = pin || "GPS";
  $("#cur-place").textContent = label;
  render();
}

function render() {
  const text = $("#f-text").value.trim().toLowerCase();
  const radius = Number($("#f-radius").value) || Infinity;
  const rows = sellers
    .map((r) => ({ r, d: km(here, r) }))
    .filter(({ r, d }) =>
      (!catSel.value || r.category === catSel.value) &&
      (!subSel.value || r.subCategory === subSel.value) &&
      (!typeSel.value || r.type === typeSel.value) &&
      (!text || [r.name, r.category, r.subCategory, r.type].join(" ").toLowerCase().includes(text)) &&
      (!here || radius === Infinity || d <= radius))
    .sort((a, b) => a.d - b.d || a.r.name.localeCompare(b.r.name));
  $("#result-count").textContent = rows.length;
  $("#result-note").textContent = here ? "Nearest first" : "Set your pin code to sort by distance";
  $("#results").innerHTML = rows.length ? rows.map(({ r, d }) => `
    <li class="result">
      <div class="result-main">
        <span class="name">${esc(r.name)}</span>
        <span class="meta">${esc(r.category)}${r.subCategory ? " › " + esc(r.subCategory) : ""}${r.type ? " › " + esc(r.type) : ""}</span>
        <span class="meta">Pin ${esc(r.pin)}${fmt(d) ? " · " + fmt(d) + " away" : ""} · <span class="chip ok">KYC verified</span></span>
      </div>
      <div class="result-actions">
        ${r.whatsapp ? `<a class="btn small" href="https://wa.me/91${esc(r.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        ${r.email ? `<a class="btn ghost small" href="mailto:${esc(r.email)}">Email</a>` : ""}
        ${r.website ? `<a class="btn ghost small" href="${esc(r.website)}" target="_blank" rel="noopener">Website</a>` : ""}
      </div>
    </li>`).join("")
    : `<li class="empty">No verified sellers match. Try a wider distance or another category.</li>`;
}

async function savePlace(fields) {
  try { await updateDoc(doc(db, "buyers", auth.currentUser.uid), fields); } catch { /* the search still works without saving */ }
}

$("#pin-form").onsubmit = (e) => {
  e.preventDefault();
  const pin = $("#pin-input").value.trim(), msg = $("#loc-msg");
  if (!/^[1-9]\d{5}$/.test(pin)) { msg.textContent = "Enter a 6-digit pin code, like 400001."; return; }
  const p = PINS[pin] || sellers.find((r) => r.pin === pin && r.lat != null);
  msg.textContent = p ? "" : `We don't have a map location for ${pin} yet, so results aren't sorted by distance.`;
  setPlace(p ? { lat: p.lat, lng: p.lng } : null, pin, PINS[pin]?.place || `Pin code ${pin}`);
  if (!p) $("#f-radius").value = "";
  savePlace({ pin, lat: p ? p.lat : null, lng: p ? p.lng : null });
};

$("#geo-btn").onclick = () => {
  const msg = $("#loc-msg");
  if (!navigator.geolocation) { msg.textContent = "This browser can't share location. Enter your pin code instead."; return; }
  msg.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition((pos) => {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const [pin, p] = Object.entries(PINS).sort((a, b) => km(loc, a[1]) - km(loc, b[1]))[0];
    msg.textContent = `Using your live location (${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}).`;
    $("#pin-input").value = "";
    setPlace(loc, null, `Your location, near ${p.place}`);
    savePlace({ lat: loc.lat, lng: loc.lng });
  }, () => { msg.textContent = "Location access was blocked. Allow location for this site, or enter your pin code."; },
  { enableHighAccuracy: true, timeout: 10000 });
};

async function enter(user) {
  $("#auth-view").hidden = true;
  $("#shop-view").hidden = false;
  $("#who-name").textContent = `Hello, ${user.displayName || user.email}`;
  $("#results").innerHTML = `<li class="empty">Loading sellers…</li>`;
  try {
    const [pub, mine] = await Promise.all([getDocs(collection(db, "publicSellers")), getDoc(doc(db, "buyers", user.uid))]);
    sellers = pub.docs.map((d) => ({ id: d.id, ...d.data() }));
    me = mine.exists() ? mine.data() : null;
  } catch (err) {
    $("#results").innerHTML = `<li class="empty">Couldn't load sellers: ${esc(err.message)}</li>`;
    return;
  }
  if (me?.lat != null) {
    $("#pin-input").value = me.pin || "";
    setPlace({ lat: me.lat, lng: me.lng }, me.pin, PINS[me.pin]?.place || (me.pin ? `Pin code ${me.pin}` : "Your saved location"));
  } else if (me?.pin) {
    $("#pin-input").value = me.pin;
    setPlace(null, me.pin, `Pin code ${me.pin}`);
  } else render();
}

// ---------- Session
let creating = false;
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
