import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, addDoc, updateDoc, writeBatch, doc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN_EMAIL } from "./firebase-config.js?v=dev";
import "./formats.js?v=dev";
import { PINS } from "./pincodes.js?v=dev";
import { CATEGORIES, subsOf, typesOf } from "./categories.js?v=dev";
import { checkContact } from "./contacts.js?v=dev";
import { fillStates, autofillFromPin } from "./places.js?v=dev";
import { partnerRows, partnerStats, wirePartnerReview } from "./partner-review.js?v=dev";
import { PARTNER_TYPES, MONTHLY_FEE, makePartnerId, checkPartner, checkDiscount } from "./partner-fields.js?v=dev";

const $ = (s) => document.querySelector(s);
const ADMIN = SUPER_ADMIN_EMAIL.toLowerCase();
if (firebaseConfig.apiKey.startsWith("PASTE")) {
  $("#setup-dialog").hidden = false;
  throw new Error("Fill in public/firebase-config.js");
}
// The default app, shared with the admin console, so the super admin doesn't sign in twice.
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helpers
const show = (el, text, kind) => { el.textContent = text; el.className = "msg " + (kind || ""); el.hidden = false; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (v, label = v) => { const o = document.createElement("option"); o.value = v; o.textContent = label; return o; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
const chip = { "Verified": "ok", "Pending KYC": "warn", "KYC Rejected": "bad", "Suspended": "bad" };
const chipHtml = (s) => `<span class="chip ${chip[s] || "warn"}">${esc(s)}</span>`;
const authError = (e) => ({
  "auth/invalid-credential": "That email and password don't match. Check them or reset your password.",
  "auth/invalid-email": "That email doesn't look right. Check for typos.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead, or use a different email.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes or reset your password.",
  "auth/network-request-failed": "Can't reach the server. Check your connection and try again."
}[e.code] || e.message);
const views = ["login-view", "admin-view", "details-view", "partner-view"];
const view = (id) => views.forEach((v) => (document.getElementById(v).hidden = v !== id));

// ---------- Sign in, create account, reset password
const steps = ["step-signin", "step-signup", "step-forgot"];
const step = (id) => steps.forEach((s) => (document.getElementById(s).hidden = s !== id));
$("#go-forgot").onclick = () => { $("#fg-email").value = $("#si-email").value.trim(); step("step-forgot"); $("#fg-email").focus(); };
$("#go-signup").onclick = () => { $("#su-email").value = $("#si-email").value.trim(); step("step-signup"); $("#su-email").focus(); };
document.querySelectorAll(".back").forEach((b) => (b.onclick = () => step("step-signin")));
$("#si-show").onchange = (e) => ($("#si-pass").type = e.target.checked ? "text" : "password");
document.querySelectorAll(".sign-out").forEach((b) => (b.onclick = () => signOut(auth)));

$("#signin-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#si-email").value.trim().toLowerCase(), pw = $("#si-pass").value, m = $("#si-msg");
  if (!email || !pw) return show(m, "Enter your email and password.", "bad");
  if (!EMAIL.test(email)) return show(m, "That email doesn't look right. Check for typos.", "bad");
  try { await signInWithEmailAndPassword(auth, email, pw); $("#si-pass").value = ""; m.hidden = true; }
  catch (err) { show(m, authError(err), "bad"); }
};
$("#signup-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#su-email").value.trim().toLowerCase(), pw = $("#su-pass").value, m = $("#su-msg");
  if (!EMAIL.test(email)) return show(m, "That email doesn't look right.", "bad");
  if (email === ADMIN) return show(m, "This email belongs to the admin account. Use a different email.", "bad");
  if (!RULES.every(([, f]) => f(pw))) return show(m, "Your password doesn't meet every rule above.", "bad");
  if (pw !== $("#su-confirm").value) return show(m, "The two passwords don't match.", "bad");
  try { await createUserWithEmailAndPassword(auth, email, pw); $("#signup-form").reset(); m.hidden = true; }
  catch (err) { show(m, authError(err), "bad"); }
};
$("#forgot-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#fg-email").value.trim().toLowerCase(), m = $("#fg-msg");
  if (!EMAIL.test(email)) return show(m, "Enter the email on your account.", "bad");
  try {
    await sendPasswordResetEmail(auth, email);
    step("step-signin");
    show($("#si-msg"), `If ${email} has an account, a reset link is on its way.`, "ok");
  } catch (err) { show(m, authError(err), "bad"); }
};

// ================= SUPER ADMIN =================
let partners = [], sellers = [];

async function loadAdmin() {
  $("#data-note").textContent = "Loading partners…";
  try {
    const [p, s, ids] = await Promise.all([getDocs(collection(db, "partners")), getDocs(collection(db, "sellers")), getDocs(collection(db, "partnerIds"))]);
    partners = p.docs.map((d) => ({ id: d.id, ...d.data() }));
    sellers = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.partnerUid);
    // Partners enrolled before sign-up existed have no partnerIds entry; add one so new IDs never repeat theirs.
    const have = new Set(ids.docs.map((d) => d.id)), batch = writeBatch(db);
    const missing = partners.filter((x) => x.partnerId && !have.has(x.partnerId));
    missing.forEach((x) => batch.set(doc(db, "partnerIds", x.partnerId), { uid: x.id }));
    if (missing.length) await batch.commit();
    $("#data-note").textContent = "Partners create their own account on this page and fill in their details. Approve their KYC here or in the admin console.";
    renderAdmin();
  } catch (err) {
    $("#data-note").textContent = `Couldn't load partners: ${err.message}. Republish firestore.rules in the Firebase console.`;
  }
}
const sellersOf = (uid) => sellers.filter((r) => r.partnerUid === uid);

function renderAdmin() {
  $("#partners-count").textContent = partners.length;
  $("#partner-stats").innerHTML = partnerStats(partners, sellers.length);
  $("#partners-list").innerHTML = partnerRows(partners, sellersOf, "No partners yet. Partners sign up on this page.");
}

// ---------- Partner KYC
const review = wirePartnerReview({ db, auth, partners: () => partners, sellersOf, onSaved: loadAdmin });
$("#partners-list").addEventListener("click", (e) => {
  const id = e.target.closest("[data-partner]")?.dataset.partner;
  if (id) review.open(id);
});

// ================= PARTNER: DETAILS =================
let me = null, mySellers = [];
PARTNER_TYPES.forEach((t) => $("#pa-type").append(opt(t)));
const readPartner = () => ({
  type: $("#pa-type").value,
  name: $("#pa-name").value.trim().replace(/\s+/g, " "),
  dob: $("#pa-dob").value.trim(),
  mobile: $("#pa-mobile").value.trim(),
  pan: $("#pa-pan").value.trim().toUpperCase(),
  // Once submitted, the Aadhaar (and so the Partner ID) can't change.
  ...(!me && { aadhaar: $("#pa-aadhaar").value.replace(/\s/g, "") }),
  address: $("#pa-address").value.trim()
});
function previewId() {
  if (me) return;
  const p = readPartner();
  $("#pa-id").textContent = /[A-Za-z]/.test(p.name) && /^\d{12}$/.test(p.aadhaar)
    ? makePartnerId(p.name, p.aadhaar) : "Fill in your name and Aadhaar";
}
["#pa-name", "#pa-aadhaar"].forEach((s) => $(s).addEventListener("input", previewId));

function openDetails(user) {
  view("details-view");
  $("#dt-email").textContent = user.email;
  $("#pa-msg").hidden = true;
  const editing = !!me;
  $("#pa-cancel").hidden = !editing;
  $("#pa-save").textContent = editing ? "Save and resubmit" : "Submit for KYC";
  $("#dt-sub").textContent = editing
    ? "Fix your details and save. GiaZoNest reviews your KYC again."
    : "Fill in your details. GiaZoNest reviews your KYC, and once it's approved you can enroll sellers.";
  const a = $("#pa-aadhaar");
  a.disabled = editing; a.required = !editing;
  a.value = editing ? `XXXX XXXX ${me.aadhaarLast4}` : "";
  $("#pa-aadhaar-hint").textContent = editing ? "Your Aadhaar and Partner ID can't be changed." : "Only the last 4 digits are saved.";
  if (editing) {
    $("#pa-type").value = me.type; $("#pa-name").value = me.name; $("#pa-dob").value = me.dob || "";
    $("#pa-mobile").value = me.mobile; $("#pa-pan").value = me.pan; $("#pa-address").value = me.address || "";
    $("#pa-id").textContent = me.partnerId;
  } else previewId();
}
$("#me-edit").onclick = () => openDetails(auth.currentUser);
$("#pa-cancel").onclick = () => loadPartner(auth.currentUser);

$("#partner-form").onsubmit = async (e) => {
  e.preventDefault();
  const user = auth.currentUser, p = readPartner(), m = $("#pa-msg");
  const bad = checkPartner(p);
  if (bad) return show(m, bad, "bad");
  const details = { type: p.type, name: p.name, dob: p.dob, mobile: p.mobile, pan: p.pan, address: p.address };
  $("#pa-save").disabled = true;
  try {
    if (me) {
      // A rejected partner goes back to Pending KYC when they save their fixes.
      await updateDoc(doc(db, "partners", me.id), { ...details, status: "Pending KYC", updatedAt: serverTimestamp() });
    } else {
      // Claims the first free Partner ID: the base one, then -2, -3, …
      const base = makePartnerId(p.name, p.aadhaar);
      let partnerId = base;
      for (let n = 2; (await getDoc(doc(db, "partnerIds", partnerId))).exists(); n++) partnerId = `${base}-${n}`;
      const batch = writeBatch(db);
      batch.set(doc(db, "partners", user.uid), { ...details, partnerId, aadhaarLast4: p.aadhaar.slice(-4),
        email: user.email.toLowerCase(), status: "Pending KYC", enrolledAt: serverTimestamp() });
      batch.set(doc(db, "partnerIds", partnerId), { uid: user.uid });
      await batch.commit();
    }
    await loadPartner(user);
  } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
  finally { $("#pa-save").disabled = false; }
};

// ================= PARTNER: ENROLL SELLERS =================
const catSel = $("#es-cat"), subSel = $("#es-sub"), typeSel = $("#es-type");
Object.keys(CATEGORIES).forEach((c) => catSel.append(opt(c)));
const fillTypes = () => {
  const types = typesOf(catSel.value, subSel.value);
  typeSel.replaceChildren(opt("", "Select type"), ...types.map((x) => opt(x)));
  $("#es-type-label").hidden = !types.length;
};
const fillSubs = () => {
  const subs = subsOf(catSel.value);
  subSel.replaceChildren(opt("", subs.length ? "Select sub-category" : "Select a category first"), ...subs.map((x) => opt(x)));
  subSel.disabled = !subs.length;
  fillTypes();
};
catSel.onchange = fillSubs;
subSel.onchange = fillTypes;
fillStates($("#es-state"));
autofillFromPin($("#es-pin"), $("#es-state"), $("#es-city"), (t) => ($("#es-city-note").textContent = t));
$("#es-discount-hint").textContent = `Rupees off the seller's ₹${MONTHLY_FEE} monthly fee. 0 for none.`;

async function loadPartner(user) {
  const snap = await getDoc(doc(db, "partners", user.uid));
  me = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  // First time: a new account fills in its partner details.
  if (!me) { $("#partner-form").reset(); return openDetails(user); }
  view("partner-view");
  $("#me-type").textContent = `${me.type} partner`;
  $("#me-name").innerHTML = `${esc(me.name)} · <span class="pid">${esc(me.partnerId)}</span>`;
  $("#me-status").textContent = me.status;
  $("#me-status").className = "chip " + (chip[me.status] || "warn");
  const ok = me.status === "Verified";
  $("#es-fields").disabled = !ok;
  const banner = $("#me-banner");
  if (ok) banner.hidden = true;
  else show(banner, me.status === "KYC Rejected"
    ? `Your KYC was not approved${me.kycNote ? `: ${me.kycNote.replace(/[.!?]?$/, ".")}` : "."} Fix your details and save them to send them for review again. Questions: gizee@giazonest.com.`
    : "Your details are with GiaZoNest for KYC review. You can enroll sellers once it's approved.", me.status === "KYC Rejected" ? "bad" : "");
  $("#me-edit-row").hidden = ok;
  await loadMySellers();
}
async function loadMySellers() {
  try {
    const s = await getDocs(query(collection(db, "sellers"), where("partnerUid", "==", me.id)));
    mySellers = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch { mySellers = []; }
  $("#ms-count").textContent = mySellers.length;
  $("#ms-list").innerHTML = mySellers.length ? mySellers.map((r) => `<li><span class="name">${esc(r.name)}</span>${chipHtml(r.status)}
      <span class="meta">${esc(r.category)}${r.subCategory ? " › " + esc(r.subCategory) : ""} · ${esc(r.city || "")} · Pin ${esc(r.pin)} · ₹${r.feeDiscount || 0} off the monthly fee</span></li>`).join("")
    : `<li class="empty" style="display:block">No sellers enrolled yet.</li>`;
}

$("#es-form").onsubmit = async (e) => {
  e.preventDefault();
  const m = $("#es-msg");
  const name = $("#es-name").value.trim(), category = catSel.value, subCategory = subSel.value, type = typeSel.value, pin = $("#es-pin").value.trim();
  if (!name) return show(m, "Enter the shop name.", "bad");
  if (!category || !subCategory) return show(m, "Choose a category and a sub-category.", "bad");
  if (typesOf(category, subCategory).length && !type) return show(m, "Choose a type.", "bad");
  if (!/^[1-9]\d{5}$/.test(pin)) return show(m, "Enter a 6-digit pin code.", "bad");
  const state = $("#es-state").value, city = $("#es-city").value.trim();
  if (!state) return show(m, "Choose the state.", "bad");
  if (!city) return show(m, "Enter the city.", "bad");
  const contact = { email: $("#es-email").value.trim().toLowerCase(), whatsapp: $("#es-whatsapp").value.trim(), website: $("#es-website").value.trim() };
  const badContact = checkContact(contact);
  if (badContact) return show(m, badContact, "bad");
  const discountText = $("#es-discount").value.trim();
  const badDiscount = checkDiscount(discountText);
  if (badDiscount) return show(m, badDiscount, "bad");
  const loc = PINS[pin];
  try {
    await addDoc(collection(db, "sellers"), {
      name, category, subCategory, ...(type && { type }), pin, state, city, ...contact, status: "Pending KYC",
      lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, createdAt: serverTimestamp(),
      partnerUid: me.id, partnerId: me.partnerId, feeDiscount: Number(discountText)
    });
    $("#es-form").reset(); fillSubs(); $("#es-city-note").textContent = ""; delete $("#es-state").dataset.touched;
    show(m, `Enrolled ${name}. GiaZoNest will review their KYC.`, "ok");
    await loadMySellers();
  } catch (err) { show(m, `Couldn't enroll: ${err.message}`, "bad"); }
};

// ---------- Session
onAuthStateChanged(auth, async (user) => {
  me = null;
  if (!user) { view("login-view"); step("step-signin"); return; }
  if ((user.email || "").toLowerCase() === ADMIN) {
    view("admin-view");
    $("#admin-email").textContent = user.email;
    loadAdmin();
    return;
  }
  try { await loadPartner(user); }
  catch (err) { view("login-view"); show($("#si-msg"), `Couldn't load your partner record: ${err.message}`, "bad"); }
});
