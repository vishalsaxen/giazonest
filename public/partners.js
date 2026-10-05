import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, addDoc, setDoc, updateDoc, doc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN_EMAIL } from "./firebase-config.js?v=dev";
import { PINS } from "./pincodes.js?v=dev";
import { CATEGORIES, subsOf, typesOf } from "./categories.js?v=dev";
import { checkContact } from "./contacts.js?v=dev";
import { fillStates, autofillFromPin } from "./places.js?v=dev";
import { PARTNER_TYPES, MONTHLY_FEE, makePartnerId, uniquePartnerId, checkPartner, checkDiscount } from "./partner-fields.js?v=dev";

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

// A second app, only for creating a partner's sign-in. It keeps nothing on the device,
// so the super admin stays signed in on the first app.
let makerAuth = null;
const maker = () => (makerAuth ??= initializeAuth(initializeApp(firebaseConfig, "partner-maker"), { persistence: inMemoryPersistence }));

// ---------- Helpers
const show = (el, text, kind) => { el.textContent = text; el.className = "msg " + (kind || ""); el.hidden = false; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (v, label = v) => { const o = document.createElement("option"); o.value = v; o.textContent = label; return o; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const chip = { "Verified": "ok", "Pending KYC": "warn", "KYC Rejected": "bad", "Suspended": "bad" };
const chipHtml = (s) => `<span class="chip ${chip[s] || "warn"}">${esc(s)}</span>`;
const stat = (n, t) => `<div class="stat"><b>${n.toLocaleString("en-IN")}</b><span>${t}</span></div>`;
const authError = (e) => ({
  "auth/invalid-credential": "That email and password don't match. Check them or set a new password.",
  "auth/invalid-email": "That email doesn't look right. Check for typos.",
  "auth/email-already-in-use": "This email already has a GiaZoNest sign-in (as a seller or shopper). Use a different email for the partner.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes or set a new password.",
  "auth/network-request-failed": "Can't reach the server. Check your connection and try again."
}[e.code] || e.message);
const views = ["login-view", "admin-view", "partner-view"];
const view = (id) => views.forEach((v) => (document.getElementById(v).hidden = v !== id));

// ---------- Sign in, set password
const steps = ["step-signin", "step-forgot"];
const step = (id) => steps.forEach((s) => (document.getElementById(s).hidden = s !== id));
const toForgot = () => { $("#fg-email").value = $("#si-email").value.trim(); step("step-forgot"); $("#fg-email").focus(); };
$("#go-forgot").onclick = toForgot;
$("#go-first").onclick = toForgot;
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
$("#forgot-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#fg-email").value.trim().toLowerCase(), m = $("#fg-msg");
  if (!EMAIL.test(email)) return show(m, "Enter the email you were enrolled with.", "bad");
  try {
    await sendPasswordResetEmail(auth, email);
    step("step-signin");
    show($("#si-msg"), `If ${email} is enrolled, a link to set your password is on its way.`, "ok");
  } catch (err) { show(m, authError(err), "bad"); }
};

// ================= SUPER ADMIN =================
let partners = [], sellers = [];
PARTNER_TYPES.forEach((t) => $("#pa-type").append(opt(t)));

const readPartner = () => ({
  type: $("#pa-type").value,
  name: $("#pa-name").value.trim().replace(/\s+/g, " "),
  mobile: $("#pa-mobile").value.trim(),
  pan: $("#pa-pan").value.trim().toUpperCase(),
  aadhaar: $("#pa-aadhaar").value.replace(/\s/g, ""),
  email: $("#pa-email").value.trim().toLowerCase(),
  address: $("#pa-address").value.trim()
});
const takenIds = () => new Set(partners.map((p) => p.partnerId));
function previewId() {
  const p = readPartner();
  $("#pa-id").textContent = /[A-Za-z]/.test(p.name) && /^\d{12}$/.test(p.aadhaar)
    ? uniquePartnerId(makePartnerId(p.name, p.aadhaar), takenIds()) : "Fill in the name and Aadhaar";
}
["#pa-name", "#pa-aadhaar"].forEach((s) => $(s).addEventListener("input", previewId));

async function loadAdmin() {
  $("#data-note").textContent = "Loading partners…";
  try {
    const [p, s] = await Promise.all([getDocs(collection(db, "partners")), getDocs(collection(db, "sellers"))]);
    partners = p.docs.map((d) => ({ id: d.id, ...d.data() }));
    sellers = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.partnerUid);
    $("#data-note").textContent = "";
    renderAdmin();
    previewId();
  } catch (err) {
    $("#data-note").textContent = `Couldn't load partners: ${err.message}. Republish firestore.rules in the Firebase console.`;
  }
}
const sellersOf = (uid) => sellers.filter((r) => r.partnerUid === uid);

function renderAdmin() {
  const order = { "Pending KYC": 0, "KYC Rejected": 1, "Verified": 2 };
  const list = [...partners].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || String(a.name).localeCompare(String(b.name)));
  $("#partners-count").textContent = partners.length;
  $("#partner-stats").innerHTML = stat(partners.filter((p) => p.status === "Verified").length, "approved")
    + stat(partners.filter((p) => p.status === "Pending KYC").length, "pending KYC") + stat(sellers.length, "sellers enrolled");
  $("#partners-list").innerHTML = list.length ? list.map((p) => `<li>
      <button type="button" class="name link-name" data-partner="${esc(p.id)}">${esc(p.name)}</button>${chipHtml(p.status)}
      <span class="meta"><span class="pid">${esc(p.partnerId)}</span> · ${esc(p.type)} · ${esc(p.mobile)} · ${sellersOf(p.id).length} sellers</span>
      <button type="button" class="btn ghost small" data-partner="${esc(p.id)}">Review KYC</button>
    </li>`).join("") : `<li class="empty" style="display:block">No partners yet. Enroll the first one.</li>`;
}

$("#partner-form").onsubmit = async (e) => {
  e.preventDefault();
  const p = readPartner(), m = $("#pa-msg");
  const bad = checkPartner(p);
  if (bad) return show(m, bad, "bad");
  if (p.email === ADMIN) return show(m, "That's the super admin email. Use the partner's own email.", "bad");
  if (partners.some((x) => x.pan === p.pan)) return show(m, `A partner with PAN ${p.pan} is already enrolled.`, "bad");
  if (partners.some((x) => x.email === p.email)) return show(m, `A partner with ${p.email} is already enrolled.`, "bad");
  const partnerId = uniquePartnerId(makePartnerId(p.name, p.aadhaar), takenIds());
  $("#pa-save").disabled = true;
  show(m, "Creating the partner's sign-in…", "");
  try {
    // A random password nobody sees; the partner sets their own from the emailed link.
    const pw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))) + "aA1!";
    const cred = await createUserWithEmailAndPassword(maker(), p.email, pw);
    await signOut(maker());
    await setDoc(doc(db, "partners", cred.user.uid), {
      partnerId, type: p.type, name: p.name, mobile: p.mobile, pan: p.pan, aadhaarLast4: p.aadhaar.slice(-4),
      email: p.email, ...(p.address && { address: p.address }),
      status: "Pending KYC", enrolledAt: serverTimestamp(), enrolledBy: auth.currentUser.email
    });
    let sent = true;
    try { await sendPasswordResetEmail(auth, p.email); } catch { sent = false; }
    $("#partner-form").reset();
    await loadAdmin();
    show(m, `Enrolled ${p.name} as ${partnerId}. ${sent ? `We emailed ${p.email} a link to set their password.` : `Ask them to open this page and tap "Set your password".`} Approve their KYC to let them enroll sellers.`, "ok");
  } catch (err) { show(m, `Couldn't enroll: ${authError(err)}`, "bad"); }
  finally { $("#pa-save").disabled = false; }
};

// ---------- Partner KYC
const pk = $("#pk-dialog");
let kycPartner = null;
const closePk = () => { pk.hidden = true; $("#pk-msg").hidden = true; $("#pk-note").value = ""; kycPartner = null; };
$("#partners-list").addEventListener("click", (e) => {
  const id = e.target.closest("[data-partner]")?.dataset.partner;
  if (id) openPk(id);
});
function openPk(id) {
  kycPartner = partners.find((p) => p.id === id);
  if (!kycPartner) return;
  const p = kycPartner;
  $("#pk-title").textContent = p.name;
  $("#pk-status").textContent = p.status;
  $("#pk-status").className = "chip " + (chip[p.status] || "warn");
  $("#pk-sub").textContent = `${p.type} partner`;
  const facts = [["Partner ID", p.partnerId], ["Mobile", p.mobile], ["PAN", p.pan], ["Aadhaar", `XXXX XXXX ${p.aadhaarLast4}`],
    ["Email", p.email], ["Address", p.address || "Not given"], ["Enrolled", p.enrolledAt?.toDate?.().toLocaleString("en-IN") || ""]];
  $("#pk-facts").innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  $("#pk-note").value = p.kycNote || "";
  const mine = sellersOf(p.id);
  $("#pk-seller-count").textContent = mine.length;
  $("#pk-sellers").innerHTML = mine.length ? mine.map((r) => `<li><span class="name">${esc(r.name)}</span>${chipHtml(r.status)}
      <span class="meta">Pin ${esc(r.pin)} · ₹${r.feeDiscount || 0} off the monthly fee</span></li>`).join("")
    : `<li class="empty" style="display:block">None yet.</li>`;
  const when = p.kycReviewedAt?.toDate?.();
  $("#pk-review").textContent = when ? `Last reviewed ${when.toLocaleString("en-IN")} by ${p.kycReviewedBy}.` : "Not reviewed yet.";
  $("#pk-approve").hidden = p.status === "Verified";
  $("#pk-reject").textContent = p.status === "Verified" ? "Revoke approval" : "Reject";
  pk.hidden = false; $("#pk-close").focus();
}
$("#pk-close").onclick = closePk;
pk.addEventListener("keydown", (e) => { if (e.key === "Escape") closePk(); });
async function reviewPartner(approve) {
  const m = $("#pk-msg"), note = $("#pk-note").value.trim();
  if (!approve && !note) return show(m, "Write a reason in the note so the partner knows what to fix.", "bad");
  try {
    await updateDoc(doc(db, "partners", kycPartner.id), {
      status: approve ? "Verified" : "KYC Rejected", kycNote: note,
      kycReviewedAt: serverTimestamp(), kycReviewedBy: auth.currentUser.email
    });
    closePk();
    await loadAdmin();
  } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
}
$("#pk-approve").onclick = () => reviewPartner(true);
$("#pk-reject").onclick = () => reviewPartner(false);

// ================= PARTNER =================
let me = null, mySellers = [];
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
  if (!snap.exists()) {
    await signOut(auth);
    show($("#si-msg"), "This account isn't an enrolled GiaZoNest partner. Ask the super admin to enroll you.", "bad");
    return;
  }
  me = { id: snap.id, ...snap.data() };
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
    ? `Your KYC was not approved${me.kycNote ? `: ${me.kycNote}` : "."} Contact GiaZoNest at gizee@giazonest.com.`
    : "Your KYC is waiting for approval by GiaZoNest. You can enroll sellers once it's approved.", me.status === "KYC Rejected" ? "bad" : "");
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
