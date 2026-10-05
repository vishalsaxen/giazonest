import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, setDoc, updateDoc, writeBatch, query, where,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN_EMAIL } from "./firebase-config.js?v=dev";
import "./formats.js?v=dev";
import { PINS } from "./pincodes.js?v=dev";
import { CATEGORIES, subsOf, typesOf } from "./categories.js?v=dev";
import { checkContact } from "./contacts.js?v=dev";
import { checkKyc, readKyc, fillKyc, wireKycSkips } from "./kyc.js?v=dev";
import { fieldsFor, stockLabel, itemWord, sellingPrice, rupees } from "./product-fields.js?v=dev";
import { shrink, thumb } from "./photos.js?v=dev";
import { fillStates, autofillFromPin, stateFromPin } from "./places.js?v=dev";
import { termsGate, wireTermsLink, TERMS_VERSION } from "./terms.js?v=dev";
import { ratingOf, ratingText, starString } from "./ratings.js?v=dev";

const $ = (s) => document.querySelector(s);
if (firebaseConfig.apiKey.startsWith("PASTE")) {
  $("#setup-dialog").hidden = false;
  throw new Error("Fill in public/firebase-config.js");
}
// Its own named app, so the seller's sign-in never mixes with the admin's or a shopper's.
const app = initializeApp(firebaseConfig, "seller");
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helpers
const show = (el, text, kind) => { el.textContent = text; el.className = "msg " + (kind || ""); el.hidden = false; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (v, label = v) => { const o = document.createElement("option"); o.value = v; o.textContent = label; return o; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTOS = 10;
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
  "auth/invalid-credential": "That email and password don't match. Check them or reset your password.",
  "auth/invalid-email": "That email doesn't look right. Check for typos.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes or reset your password.",
  "auth/network-request-failed": "Can't reach the server. Check your connection and try again."
}[e.code] || e.message);

// ---------- Sign in, create account, reset
const steps = ["step-signin", "step-signup", "step-forgot"];
const step = (id) => steps.forEach((s) => (document.getElementById(s).hidden = s !== id));
$("#go-signup").onclick = () => step("step-signup");
$("#go-forgot").onclick = () => { $("#fg-email").value = $("#si-email").value.trim(); step("step-forgot"); };
document.querySelectorAll(".back").forEach((b) => (b.onclick = () => step("step-signin")));
$("#si-show").onchange = (e) => ($("#si-pass").type = e.target.checked ? "text" : "password");

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
  const m = $("#su-msg"), owner = $("#su-owner").value.trim();
  const email = $("#su-email").value.trim().toLowerCase(), pw = $("#su-pass").value;
  if (!owner) return show(m, "Enter your name.", "bad");
  if (!EMAIL.test(email)) return show(m, "That email doesn't look right.", "bad");
  if (email === SUPER_ADMIN_EMAIL.toLowerCase()) return show(m, "This email belongs to the admin account. Use a different email.", "bad");
  if (!RULES.every(([, f]) => f(pw))) return show(m, "Your password doesn't meet every rule above.", "bad");
  if (pw !== $("#su-confirm").value) return show(m, "The two passwords don't match.", "bad");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(cred.user, { displayName: owner });
    $("#who-name").textContent = `${owner} · ${email}`;
  } catch (err) { show(m, authError(err), "bad"); }
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
$("#sign-out").onclick = () => signOut(auth);

// ---------- Shop details
let me = null, shop = null, products = [], geo = null;
const chip = { "Verified": "ok", "Pending KYC": "warn", "Suspended": "bad", "KYC Rejected": "bad" };
const catSel = $("#sh-cat"), subSel = $("#sh-sub"), typeSel = $("#sh-type");
Object.keys(CATEGORIES).forEach((c) => catSel.append(opt(c)));
const fillTypes = (value = "") => {
  const types = typesOf(catSel.value, subSel.value);
  typeSel.replaceChildren(opt("", "Select type"), ...types.map((x) => opt(x)));
  typeSel.value = value;
  $("#sh-type-label").hidden = !types.length;
};
const fillSubs = (sub = "", type = "") => {
  const subs = subsOf(catSel.value);
  subSel.replaceChildren(opt("", subs.length ? "Select sub-category" : "Select a category first"), ...subs.map((x) => opt(x)));
  subSel.disabled = !subs.length;
  subSel.value = sub;
  fillTypes(type);
};
catSel.onchange = () => fillSubs();
subSel.onchange = () => fillTypes();
wireKycSkips("sk-");
fillStates($("#sh-state"));
autofillFromPin($("#sh-pin"), $("#sh-state"), $("#sh-city"), (t) => ($("#sh-city-note").textContent = t));

$("#sh-geo").onclick = () => {
  const msg = $("#sh-geo-msg");
  if (!navigator.geolocation) { msg.textContent = "This browser can't share location. Your pin code will be used."; return; }
  msg.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition((pos) => {
    geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    msg.textContent = `Shop location set to ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}. Save to keep it.`;
  }, () => { msg.textContent = "Location access was blocked. Your pin code will be used instead."; },
  { enableHighAccuracy: true, timeout: 10000 });
};

function showStatus() {
  const s = shop?.status, b = $("#status-banner");
  $("#shop-status").textContent = s || "Not set up";
  $("#shop-status").className = "chip " + (chip[s] || "warn");
  const text = !shop ? "Fill in your shop details and save them. Then you can add products."
    : s === "Verified" ? "Your KYC is verified. Your shop and in-stock products are visible on the GiaZoNest shop."
    : s === "KYC Rejected" ? `GiaZoNest couldn't verify your KYC${shop.kycNote ? `: ${shop.kycNote}` : "."} Fix the details below and save to send them again.`
    : s === "Suspended" ? "Your shop is suspended. Contact GiaZoNest to find out why."
    : "GiaZoNest is checking your KYC. You can add products now; shoppers will see them once you're verified.";
  show(b, text, s === "Verified" ? "ok" : s === "KYC Rejected" || s === "Suspended" ? "bad" : "");
  // Verified KYC numbers are locked; changing them needs a fresh check by GiaZoNest.
  const locked = s === "Verified" || s === "Suspended";
  $("#kyc-box").disabled = locked;
  $("#kyc-help").textContent = locked
    ? "Your KYC details are locked after verification. To change them, contact GiaZoNest."
    : "GiaZoNest checks these before your shop goes live. If you don't have one, tick \"Not available\".";
  $("#products-panel").hidden = !shop;
  $("#ratings-panel").hidden = !shop;
}

function fillShop() {
  const r = shop || {};
  $("#sh-name").value = r.name || "";
  catSel.value = r.category || "";
  fillSubs(r.subCategory || "", r.type || "");
  $("#sh-pin").value = r.pin || "";
  $("#sh-state").value = r.state || stateFromPin(r.pin) || "";
  $("#sh-city").value = r.city || "";
  $("#sh-email").value = r.email || me.email || "";
  $("#sh-whatsapp").value = r.whatsapp || "";
  $("#sh-website").value = r.website || "";
  fillKyc("sk-", r.kyc || {});
}

$("#shop-form").onsubmit = async (e) => {
  e.preventDefault();
  const m = $("#sh-msg");
  const name = $("#sh-name").value.trim(), category = catSel.value, subCategory = subSel.value, type = typeSel.value;
  const pin = $("#sh-pin").value.trim();
  if (!name) return show(m, "Enter your shop name.", "bad");
  if (!category || !subCategory) return show(m, "Choose a category and a sub-category.", "bad");
  if (typesOf(category, subCategory).length && !type) return show(m, "Choose a type.", "bad");
  if (!/^[1-9]\d{5}$/.test(pin)) return show(m, "Enter your shop's 6-digit pin code.", "bad");
  const state = $("#sh-state").value, city = $("#sh-city").value.trim();
  if (!state) return show(m, "Choose your state.", "bad");
  if (!city) return show(m, "Enter your city.", "bad");
  const contact = { email: $("#sh-email").value.trim().toLowerCase(), whatsapp: $("#sh-whatsapp").value.trim(), website: $("#sh-website").value.trim() };
  const badContact = checkContact(contact);
  if (badContact) return show(m, badContact.replace("the seller's", "your"), "bad");
  const loc = geo || (shop?.pin === pin && shop.lat != null ? { lat: shop.lat, lng: shop.lng } : PINS[pin] || null);
  const data = { name, category, subCategory, type: type || null, pin, state, city, ...contact,
    lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, owner: me.displayName || "", loginEmail: me.email, updatedAt: serverTimestamp() };
  if (shop?.termsVersion !== TERMS_VERSION) Object.assign(data, { termsVersion: TERMS_VERSION, termsAcceptedAt: serverTimestamp() });
  const locked = shop && (shop.status === "Verified" || shop.status === "Suspended");
  if (!locked) {
    const kyc = readKyc("sk-");
    const badKyc = checkKyc(kyc, false, "sk-");
    if (badKyc) return show(m, badKyc, "bad");
    data.kyc = kyc;
    if (shop?.status === "KYC Rejected") data.status = "Pending KYC";
  }
  $("#sh-save").disabled = true;
  try {
    const ref = doc(db, "sellers", me.uid);
    if (shop) await updateDoc(ref, data);
    else await setDoc(ref, { ...data, status: "Pending KYC", ownerUid: me.uid, createdAt: serverTimestamp() });
    shop = (await getDoc(ref)).data();
    if (!locked) fillKyc("sk-", shop.kyc || {});
    geo = null;
    showStatus();
    show(m, "Saved.", "ok");
  } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
  finally { $("#sh-save").disabled = false; }
};

// ---------- Ratings from shoppers
async function loadReviews() {
  const snap = await getDocs(query(collection(db, "reviews"), where("sellerId", "==", me.uid)));
  const list = snap.docs.map((d) => d.data()).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  $("#rating-count").textContent = list.length;
  $("#rating-avg").textContent = list.length ? ratingText(ratingOf(list, me.uid)) : "";
  $("#rating-list").innerHTML = list.length ? list.map((x) => `<li>
      <span class="stars-static" aria-label="${x.stars} out of 5">${starString(x.stars)}</span> <b>${esc(x.name || "Shopper")}</b>
      ${x.text ? `<p>${esc(x.text)}</p>` : ""}
    </li>`).join("") : `<li class="empty">No ratings yet. Shoppers can rate you once your shop is verified.</li>`;
}

// ---------- Products
// Products show on the shop only while the seller is verified (publicSellers has their listing).
const isLive = async () => (await getDoc(doc(db, "publicSellers", me.uid))).exists();

async function loadProducts() {
  const snap = await getDocs(query(collection(db, "products"), where("sellerId", "==", me.uid)));
  products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  renderProducts();
}

function renderProducts() {
  $("#product-count").textContent = products.length;
  $("#products-note").textContent = products.length
    ? "Tap \"Sold 1\" when you sell an item, so your stock stays right."
    : "No products yet. Add your first one with photos, price and stock.";
  $("#product-list").innerHTML = products.map((p) => {
    const sp = sellingPrice(p), word = itemWord(p.category, p.subCategory);
    return `<li class="product">
      ${p.thumb ? `<img src="${p.thumb}" alt="" class="product-thumb">` : `<div class="product-thumb empty-thumb">No photo</div>`}
      <div class="product-main">
        <span class="name">${esc(p.name)}</span>
        <span class="price">${rupees(sp)}${p.discount ? ` <s>${rupees(p.price)}</s> <span class="off">${rupees(p.discount)} off</span>` : ""}</span>
        <span class="meta">${p.stock > 0 ? `${p.stock} ${word}${p.stock === 1 ? "" : "s"} left` : `<b class="out">Out of stock</b>`} · ${p.sold || 0} sold · ${p.photoCount || 0} photo${p.photoCount === 1 ? "" : "s"}</span>
      </div>
      <div class="product-actions">
        <button type="button" class="btn small" data-sold="${esc(p.id)}"${p.stock > 0 ? "" : " disabled"}>Sold 1</button>
        <button type="button" class="btn ghost small" data-edit="${esc(p.id)}">Edit</button>
      </div>
    </li>`;
  }).join("");
}

$("#product-list").addEventListener("click", async (e) => {
  const sold = e.target.closest("[data-sold]")?.dataset.sold;
  const edit = e.target.closest("[data-edit]")?.dataset.edit;
  if (edit) return openProduct(products.find((p) => p.id === edit));
  if (!sold) return;
  const p = products.find((x) => x.id === sold);
  if (!p || p.stock < 1) return;
  e.target.disabled = true;
  try {
    await updateDoc(doc(db, "products", p.id), { stock: increment(-1), sold: increment(1), live: await isLive(), updatedAt: serverTimestamp() });
    p.stock -= 1; p.sold = (p.sold || 0) + 1;
    renderProducts();
  } catch (err) { e.target.disabled = false; alert(`Couldn't update stock: ${err.message}`); }
});

// Product dialog
const pd = $("#product-dialog");
const pSub = $("#pd-sub"), pType = $("#pd-type");
let editing = null, photos = []; // photos: data URLs, first is the cover

function fillProductTypes(value = "") {
  const types = typesOf(shop.category, pSub.value);
  pType.replaceChildren(opt("", "Select type"), ...types.map((x) => opt(x)));
  pType.value = value;
  $("#pd-type-label").hidden = !types.length;
}
function fillProductFields(details = {}) {
  const fields = fieldsFor(shop.category, pSub.value);
  $("#pd-fields").innerHTML = fields.map((f) => f.options
    ? `<label for="pf-${f.key}">${esc(f.label)}<select id="pf-${f.key}" data-field="${f.key}"><option value="">Choose</option>${f.options.map((o) => `<option${details[f.key] === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`
    : `<label for="pf-${f.key}">${esc(f.label)}<input id="pf-${f.key}" type="text" maxlength="80" data-field="${f.key}" placeholder="${esc(f.hint || "")}" value="${esc(details[f.key] || "")}"></label>`).join("");
  $("#pd-stock-label").textContent = stockLabel(shop.category, pSub.value);
}
pSub.onchange = () => { fillProductTypes(); fillProductFields(readFields()); };
const readFields = () => Object.fromEntries([...document.querySelectorAll("#pd-fields [data-field]")]
  .map((el) => [el.dataset.field, el.value.trim()]).filter(([, v]) => v));

const updateSp = () => {
  const price = Number($("#pd-price").value) || 0, discount = Number($("#pd-discount").value) || 0;
  $("#pd-sp").textContent = rupees(Math.max(0, price - discount));
};
$("#pd-price").oninput = updateSp;
$("#pd-discount").oninput = updateSp;
$("#pd-desc").oninput = () => ($("#pd-desc-count").textContent = $("#pd-desc").value.length);

function renderPhotos() {
  $("#pd-photo-count").textContent = `${photos.length} of ${MAX_PHOTOS}`;
  $("#pd-photo-btn").hidden = photos.length >= MAX_PHOTOS;
  $("#pd-previews").innerHTML = photos.map((src, i) => `<li>
    <img src="${src}" alt="Photo ${i + 1}">
    ${i === 0 ? `<span class="cover">Cover</span>` : `<button type="button" class="photo-btn" data-cover="${i}" title="Make cover">★</button>`}
    <button type="button" class="photo-btn remove" data-remove="${i}" aria-label="Remove photo ${i + 1}">×</button>
  </li>`).join("");
}
$("#pd-previews").addEventListener("click", (e) => {
  const rm = e.target.dataset.remove, cover = e.target.dataset.cover;
  if (rm !== undefined) photos.splice(Number(rm), 1);
  if (cover !== undefined) photos.unshift(...photos.splice(Number(cover), 1));
  renderPhotos();
});
$("#pd-photos").onchange = async (e) => {
  const files = [...e.target.files].slice(0, MAX_PHOTOS - photos.length), m = $("#pd-msg");
  if (e.target.files.length > files.length) show(m, `Only ${MAX_PHOTOS} photos per product. The extra ones were skipped.`, "");
  for (const f of files) {
    try { photos.push(await shrink(f)); renderPhotos(); }
    catch (err) { show(m, err.message, "bad"); }
  }
  e.target.value = "";
};

async function openProduct(p = null) {
  editing = p;
  photos = [];
  $("#product-form").reset();
  $("#pd-msg").hidden = true;
  $("#pd-title").textContent = p ? `Edit ${p.name}` : "Add a product";
  $("#pd-delete").hidden = !p;
  pSub.replaceChildren(opt("", "Select sub-category"), ...subsOf(shop.category).map((x) => opt(x)));
  pSub.value = p?.subCategory || shop.subCategory || "";
  fillProductTypes(p?.type || (pSub.value === shop.subCategory ? shop.type || "" : ""));
  fillProductFields(p?.details || {});
  $("#pd-name").value = p?.name || "";
  $("#pd-desc").value = p?.description || "";
  $("#pd-desc-count").textContent = $("#pd-desc").value.length;
  $("#pd-price").value = p ? p.price : "";
  $("#pd-discount").value = p?.discount || "";
  $("#pd-stock").value = p ? p.stock : "";
  $("#pd-sold").textContent = p?.sold || 0;
  updateSp();
  renderPhotos();
  pd.hidden = false;
  $("#pd-name").focus();
  if (p?.photoCount) {
    $("#pd-photo-count").textContent = "Loading photos…";
    const snap = await getDocs(query(collection(db, "productImages"), where("productId", "==", p.id)));
    if (editing !== p) return;
    photos = snap.docs.map((d) => d.data()).sort((a, b) => a.n - b.n).map((x) => x.data);
    renderPhotos();
  }
}
const closeProduct = () => { pd.hidden = true; editing = null; photos = []; };
$("#add-product").onclick = () => openProduct();
$("#pd-cancel").onclick = closeProduct;
pd.addEventListener("keydown", (e) => { if (e.key === "Escape") closeProduct(); });

$("#product-form").onsubmit = async (e) => {
  e.preventDefault();
  const m = $("#pd-msg");
  const name = $("#pd-name").value.trim(), subCategory = pSub.value, type = pType.value;
  const price = Number($("#pd-price").value), discount = Number($("#pd-discount").value || 0), stock = Number($("#pd-stock").value);
  if (!name) return show(m, "Enter the product name.", "bad");
  if (!subCategory) return show(m, "Choose a sub-category.", "bad");
  if (typesOf(shop.category, subCategory).length && !type) return show(m, "Choose a type.", "bad");
  if ($("#pd-price").value === "" || !(price >= 0)) return show(m, "Enter the price in rupees.", "bad");
  if (!(discount >= 0) || discount > price) return show(m, "Discount can't be more than the price.", "bad");
  if ($("#pd-stock").value === "" || !Number.isInteger(stock) || stock < 0) return show(m, `Enter how many ${itemWord(shop.category, subCategory)}s you have, as a whole number.`, "bad");
  $("#pd-save").disabled = true;
  show(m, "Saving…", "");
  try {
    const ref = editing ? doc(db, "products", editing.id) : doc(collection(db, "products"));
    const data = {
      sellerId: me.uid, sellerName: shop.name, name, category: shop.category, subCategory, type: type || null,
      details: readFields(), description: $("#pd-desc").value.trim(),
      price: Math.round(price * 100) / 100, discount: Math.round(discount * 100) / 100, stock,
      photoCount: photos.length, thumb: photos[0] ? await thumb(photos[0]) : null,
      live: await isLive(), updatedAt: serverTimestamp()
    };
    if (!editing) Object.assign(data, { sold: 0, createdAt: serverTimestamp() });
    // Each photo is its own document (productImages/{product}_{n}); the first is the cover.
    const batch = writeBatch(db);
    if (editing) {
      // Photos beyond the new count are removed; the rest are overwritten below.
      const old = await getDocs(query(collection(db, "productImages"), where("productId", "==", ref.id)));
      old.docs.filter((d) => d.data().n >= photos.length).forEach((d) => batch.delete(d.ref));
      batch.update(ref, data);
    } else batch.set(ref, data);
    photos.forEach((src, n) => batch.set(doc(db, "productImages", `${ref.id}_${n}`), { productId: ref.id, sellerId: me.uid, n, data: src }));
    await batch.commit();
    closeProduct();
    await loadProducts();
  } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
  finally { $("#pd-save").disabled = false; }
};

$("#pd-delete").onclick = async () => {
  if (!editing || !confirm(`Delete ${editing.name}? This can't be undone.`)) return;
  try {
    const batch = writeBatch(db);
    const imgs = await getDocs(query(collection(db, "productImages"), where("productId", "==", editing.id)));
    imgs.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "products", editing.id));
    await batch.commit();
    closeProduct();
    await loadProducts();
  } catch (err) { show($("#pd-msg"), `Couldn't delete: ${err.message}`, "bad"); }
};

// ---------- Session
async function enter(user) {
  me = user;
  $("#auth-view").hidden = true;
  $("#seller-view").hidden = false;
  $("#who-name").textContent = user.displayName ? `${user.displayName} · ${user.email}` : user.email;
  try {
    const snap = await getDoc(doc(db, "sellers", user.uid));
    shop = snap.exists() ? snap.data() : null;
  } catch (err) {
    show($("#status-banner"), `Couldn't load your shop: ${err.message}`, "bad");
    return;
  }
  // Records that this seller accepted the current terms (they accepted on the terms screen to get here).
  if (shop && shop.termsVersion !== TERMS_VERSION) {
    updateDoc(doc(db, "sellers", user.uid), { termsVersion: TERMS_VERSION, termsAcceptedAt: serverTimestamp() })
      .then(() => (shop.termsVersion = TERMS_VERSION)).catch(() => {});
  }
  fillShop();
  showStatus();
  if (shop) {
    await loadProducts().catch((err) => ($("#products-note").textContent = `Couldn't load products: ${err.message}`));
    loadReviews().catch(() => ($("#rating-list").innerHTML = `<li class="empty">Couldn't load ratings.</li>`));
  }
}

// The seller terms must be accepted on this device before anything else opens.
wireTermsLink("seller");
await termsGate("seller");

onAuthStateChanged(auth, (user) => {
  if (user && user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
    signOut(auth);
    show($("#si-msg"), "That's the admin account. Use the admin console instead.", "bad");
    return;
  }
  if (user) { if (me?.uid !== user.uid) enter(user); }
  else { me = null; shop = null; $("#seller-view").hidden = true; $("#auth-view").hidden = false; step("step-signin"); }
});
