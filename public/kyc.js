// Seller KYC numbers, shared by the admin console and the seller page.
// Sellers who don't have a PAN, GSTIN or bank account can mark it "Not available".

export const KYC_FIELDS = [
  { key: "pan", label: "PAN", re: /^[A-Z]{5}[0-9]{4}[A-Z]$/, msg: "PAN should look like ABCDE1234F.", needed: true, canSkip: true },
  { key: "gstin", label: "GSTIN", re: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, msg: "GSTIN should be 15 characters, like 27ABCDE1234F1Z5.", canSkip: true },
  { key: "account", label: "Bank account number", re: /^[0-9]{9,18}$/, msg: "Bank account number should be 9 to 18 digits.", needed: true, canSkip: true },
  { key: "ifsc", label: "IFSC", re: /^[A-Z]{4}0[A-Z0-9]{6}$/, msg: "IFSC should look like SBIN0001234.", needed: true, skipWith: "account" },
  { key: "aadhaarLast4", label: "Aadhaar, last 4 digits", re: /^[0-9]{4}$/, msg: "Enter only the last 4 digits of Aadhaar." }
];

// Is this field marked "Not available"? IFSC follows the bank account.
export const isSkipped = (kyc, f) => (kyc.na || []).includes(f.skipWith || f.key);

// Returns an error message, or "". For approval, every needed field must be filled or marked "Not available".
export function checkKyc(kyc, forApproval = false) {
  for (const f of KYC_FIELDS) {
    if (isSkipped(kyc, f)) continue;
    const v = kyc[f.key] || "";
    if (v && !f.re.test(v)) return f.msg;
    if (forApproval && f.needed && !v) return `Fill in ${f.label}, or mark it "Not available".`;
  }
  return "";
}

// Reads KYC inputs named `${prefix}${key}` and checkboxes `${prefix}${key}-na`.
export function readKyc(prefix) {
  const kyc = { na: [] };
  for (const f of KYC_FIELDS) {
    if (f.canSkip && document.getElementById(`${prefix}${f.key}-na`)?.checked) kyc.na.push(f.key);
    kyc[f.key] = isSkipped(kyc, f) ? "" : document.getElementById(prefix + f.key).value.trim().toUpperCase();
  }
  return kyc;
}

export function fillKyc(prefix, kyc = {}) {
  for (const f of KYC_FIELDS) {
    document.getElementById(prefix + f.key).value = kyc[f.key] || "";
    const box = document.getElementById(`${prefix}${f.key}-na`);
    if (box) box.checked = (kyc.na || []).includes(f.key);
  }
  syncKycSkips(prefix);
}

// Disables inputs marked "Not available". Call once to wire the checkboxes.
export function syncKycSkips(prefix) {
  for (const f of KYC_FIELDS) {
    const skipped = document.getElementById(`${prefix}${f.skipWith || f.key}-na`)?.checked;
    if (skipped === undefined) continue;
    const input = document.getElementById(prefix + f.key);
    input.dataset.hint ??= input.placeholder;
    input.disabled = skipped;
    input.placeholder = skipped ? "Not available" : input.dataset.hint;
    if (skipped) input.value = "";
  }
}
export function wireKycSkips(prefix) {
  for (const f of KYC_FIELDS) {
    const box = document.getElementById(`${prefix}${f.key}-na`);
    if (box) box.onchange = () => syncKycSkips(prefix);
  }
}

// One line for lists: "PAN ABCDE1234F · GSTIN not available · …"
export function kycSummary(kyc = {}) {
  return KYC_FIELDS.filter((f) => !f.skipWith).map((f) =>
    `${f.label}: ${isSkipped(kyc, f) ? "not available" : kyc[f.key] || "—"}`).join(" · ");
}
