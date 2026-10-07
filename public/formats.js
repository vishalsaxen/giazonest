// Keeps typed values in shape on every page. Add data-format to an input:
//   mobile: a 10-digit mobile number; a pasted +91 or leading 0 is dropped (so no maxlength on these inputs)
//   digits: numbers only (Aadhaar, pin code, bank account), up to the input's maxlength
//   caps:   capital letters and numbers only (PAN, GSTIN, IFSC), up to the input's maxlength
//   date:   DD/MM/YYYY, with the slashes added as the digits are typed
const CLEAN = {
  // "+", "+9" and "+91" stay while being typed, then drop away with the first digit after them.
  mobile: (v) => /^\+9?1?$/.test(v.trim()) ? v.trim() : v.replace(/^\s*(\+\s*91|0+)/, "").replace(/\D/g, ""),
  digits: (v) => v.replace(/\D/g, ""),
  caps: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""),
  date: (v) => { const d = v.replace(/\D/g, "").slice(0, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/"); }
};
document.addEventListener("input", (e) => {
  const el = e.target, clean = CLEAN[el.dataset?.format];
  if (!clean) return;
  let v = clean(el.value);
  const max = el.dataset.format === "mobile" ? 10 : el.maxLength;
  if (max > 0 && !v.startsWith("+")) v = v.slice(0, max);
  if (v !== el.value) el.value = v;
});
