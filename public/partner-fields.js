// GiaZoNest partners: the Partner ID and the enrollment checks.
// Only the last 4 digits of Aadhaar are ever saved; the full number is used
// in the browser to check it and to build the Partner ID.

export const PARTNER_TYPES = ["GiZee"];
export const MONTHLY_FEE = 100; // seller subscription in rupees; a partner's discount comes off this

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR = /^[2-9][0-9]{11}$/;
const MOBILE = /^[6-9][0-9]{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "Vishal Saxena", "123412341234", 5 Oct 2026 -> "VIS-1234-051026".
// Names with fewer than 3 letters are padded with X.
export function makePartnerId(name, aadhaar, date = new Date()) {
  const first3 = String(name).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
  const two = (n) => String(n).padStart(2, "0");
  return `${first3}-${String(aadhaar).slice(-4)}-${two(date.getDate())}${two(date.getMonth() + 1)}${two(date.getFullYear() % 100)}`;
}

// Adds -2, -3, … when the ID is already taken.
export function uniquePartnerId(id, taken) {
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}-${n}`)) n++;
  return `${id}-${n}`;
}

// Returns an error message, or "".
export function checkPartner(p) {
  if (!PARTNER_TYPES.includes(p.type)) return "Choose the partner type.";
  if (!/[A-Za-z]/.test(p.name)) return "Enter the partner's name.";
  if (!MOBILE.test(p.mobile)) return "Mobile number should be a 10-digit Indian mobile number, like 9876543210.";
  if (!PAN.test(p.pan)) return "PAN should look like ABCDE1234F.";
  if (!AADHAAR.test(p.aadhaar)) return "Aadhaar should be 12 digits and can't start with 0 or 1.";
  if (!EMAIL.test(p.email)) return "Enter the partner's email. They sign in with it.";
  return "";
}

// Discount a partner gives a seller, in whole rupees off the monthly fee.
export function checkDiscount(text) {
  if (!/^\d+$/.test(text)) return "Discount should be a whole number of rupees, like 20. Use 0 for none.";
  if (Number(text) > MONTHLY_FEE) return `Discount can't be more than the ₹${MONTHLY_FEE} monthly fee.`;
  return "";
}
