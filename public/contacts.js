// Seller contact details, and the public listing shoppers can see.

// Returns an error message, or "" when the contact details are fine.
// With allowBlank, empty email and WhatsApp are accepted (for saving a draft).
export function checkContact({ email, whatsapp, website }, allowBlank = false) {
  if (!email && !allowBlank) return "Enter the seller's email.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email doesn't look right.";
  if (!whatsapp && !allowBlank) return "Enter the seller's WhatsApp number.";
  if (whatsapp && !/^[6-9]\d{9}$/.test(whatsapp)) return "WhatsApp number should be a 10-digit Indian mobile number, like 9876543210.";
  if (website && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(website)) return "Website should start with https://";
  return "";
}

// The fields of a Verified seller that shoppers may see. KYC details are never copied.
export function publicSeller(r) {
  const out = { name: r.name, category: r.category || "", subCategory: r.subCategory || "", pin: r.pin,
    lat: r.lat ?? null, lng: r.lng ?? null };
  for (const k of ["type", "email", "whatsapp", "website"]) if (r[k]) out[k] = r[k];
  return out;
}
