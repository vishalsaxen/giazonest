// Partner KYC review, shared by the admin console (index.html) and the Partners page.
// Both pages carry the same #pk-dialog markup.
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const show = (el, text, kind) => { el.textContent = text; el.className = "msg " + (kind || ""); el.hidden = false; };
const chip = { "Verified": "ok", "Pending KYC": "warn", "KYC Rejected": "bad", "Suspended": "bad" };
const chipHtml = (s) => `<span class="chip ${chip[s] || "warn"}">${esc(s)}</span>`;
// Sellers can stop their services for a while; this shows it next to their status.
export const pausedChip = (r) => r.servicesPaused ? `<span class="chip bad">Services paused</span>` : "";
const stat = (n, t) => `<div class="stat"><b>${n.toLocaleString("en-IN")}</b><span>${t}</span></div>`;

// Pending first, then rejected, then approved; by name within each.
const ORDER = { "Pending KYC": 0, "KYC Rejected": 1, "Verified": 2 };
const sorted = (partners) => [...partners].sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || String(a.name).localeCompare(String(b.name)));

export const partnerStats = (partners, sellerCount) =>
  stat(partners.filter((p) => p.status === "Verified").length, "approved")
  + stat(partners.filter((p) => p.status === "Pending KYC").length, "pending KYC") + stat(sellerCount, "sellers enrolled");

export const partnerRows = (partners, sellersOf, empty = "No partners yet. Enroll the first one.") => partners.length
  ? sorted(partners).map((p) => `<li>
      <button type="button" class="name link-name" data-partner="${esc(p.id)}">${esc(p.name)}</button>${chipHtml(p.status)}
      <span class="meta"><span class="pid">${esc(p.partnerId)}</span> · ${esc(p.type)} · ${esc(p.mobile)} · ${sellersOf(p.id).length} sellers</span>
      <button type="button" class="btn ghost small" data-partner="${esc(p.id)}">Review KYC</button>
    </li>`).join("")
  : `<li class="empty" style="display:block">${empty}</li>`;

// Wires the #pk-dialog. partners() and sellersOf(id) read the page's current data;
// onSaved() runs after an approval or rejection, to reload.
export function wirePartnerReview({ db, auth, partners, sellersOf, onSaved }) {
  const pk = $("#pk-dialog");
  let current = null;
  const close = () => { pk.hidden = true; $("#pk-msg").hidden = true; $("#pk-note").value = ""; current = null; };
  function open(id) {
    current = partners().find((p) => p.id === id);
    if (!current) return;
    const p = current;
    $("#pk-title").textContent = p.name;
    $("#pk-status").textContent = p.status;
    $("#pk-status").className = "chip " + (chip[p.status] || "warn");
    $("#pk-sub").textContent = `${p.type} partner`;
    const facts = [["Partner ID", p.partnerId], ["Date of birth", p.dob || "Not given"], ["Mobile", p.mobile], ["PAN", p.pan], ["Aadhaar", `XXXX XXXX ${p.aadhaarLast4}`],
      ["Email", p.email], ["Address", p.address || "Not given"], ["Signed up", p.enrolledAt?.toDate?.().toLocaleString("en-IN") || ""]];
    $("#pk-facts").innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
    $("#pk-note").value = p.kycNote || "";
    const mine = sellersOf(p.id);
    $("#pk-seller-count").textContent = mine.length;
    $("#pk-sellers").innerHTML = mine.length ? mine.map((r) => `<li><span class="name">${esc(r.name)}</span>${chipHtml(r.status)}${pausedChip(r)}
        <span class="meta">Pin ${esc(r.pin)} · ₹${r.feeDiscount || 0} off the monthly fee</span></li>`).join("")
      : `<li class="empty" style="display:block">None yet.</li>`;
    const when = p.kycReviewedAt?.toDate?.();
    $("#pk-review").textContent = when ? `Last reviewed ${when.toLocaleString("en-IN")} by ${p.kycReviewedBy}.` : "Not reviewed yet.";
    $("#pk-approve").hidden = p.status === "Verified";
    $("#pk-reject").textContent = p.status === "Verified" ? "Revoke approval" : "Reject";
    pk.hidden = false; $("#pk-close").focus();
  }
  async function review(approve) {
    const m = $("#pk-msg"), note = $("#pk-note").value.trim();
    if (!approve && !note) return show(m, "Write a reason in the note so the partner knows what to fix.", "bad");
    try {
      await updateDoc(doc(db, "partners", current.id), {
        status: approve ? "Verified" : "KYC Rejected", kycNote: note,
        kycReviewedAt: serverTimestamp(), kycReviewedBy: auth.currentUser.email
      });
      close();
      await onSaved();
    } catch (err) { show(m, `Couldn't save: ${err.message}`, "bad"); }
  }
  $("#pk-close").onclick = close;
  pk.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  $("#pk-approve").onclick = () => review(true);
  $("#pk-reject").onclick = () => review(false);
  return { open };
}
