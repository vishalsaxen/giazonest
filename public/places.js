// State and city for Indian pin codes.
// The state comes from the pin code's first digits, which follow India Post's postal
// circles. The city (district) comes from the free India Post lookup at
// api.postalpincode.in when it answers; otherwise the person types it.

export const STATES = [
  "Andaman & Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra & Nagar Haveli and Daman & Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal"
];

// Three-digit prefixes that differ from their two-digit circle.
const BY3 = {
  160: "Chandigarh", 194: "Ladakh", 246: "Uttarakhand", 248: "Uttarakhand", 249: "Uttarakhand", 262: "Uttarakhand", 263: "Uttarakhand",
  396: "Dadra & Nagar Haveli and Daman & Diu", 403: "Goa", 605: "Puducherry", 682: "Kerala", 737: "Sikkim", 744: "Andaman & Nicobar Islands",
  790: "Arunachal Pradesh", 791: "Arunachal Pradesh", 792: "Arunachal Pradesh", 793: "Meghalaya", 794: "Meghalaya", 795: "Manipur",
  796: "Mizoram", 797: "Nagaland", 798: "Nagaland", 799: "Tripura",
  813: "Jharkhand", 814: "Jharkhand", 815: "Jharkhand", 816: "Jharkhand", 822: "Jharkhand", 825: "Jharkhand", 826: "Jharkhand",
  827: "Jharkhand", 828: "Jharkhand", 829: "Jharkhand", 831: "Jharkhand", 832: "Jharkhand", 833: "Jharkhand", 834: "Jharkhand", 835: "Jharkhand"
};
const BY2 = {
  11: "Delhi", 12: "Haryana", 13: "Haryana", 14: "Punjab", 15: "Punjab", 16: "Punjab", 17: "Himachal Pradesh",
  18: "Jammu & Kashmir", 19: "Jammu & Kashmir", 20: "Uttar Pradesh", 21: "Uttar Pradesh", 22: "Uttar Pradesh",
  23: "Uttar Pradesh", 24: "Uttar Pradesh", 25: "Uttar Pradesh", 26: "Uttar Pradesh", 27: "Uttar Pradesh", 28: "Uttar Pradesh",
  30: "Rajasthan", 31: "Rajasthan", 32: "Rajasthan", 33: "Rajasthan", 34: "Rajasthan", 36: "Gujarat", 37: "Gujarat",
  38: "Gujarat", 39: "Gujarat", 40: "Maharashtra", 41: "Maharashtra", 42: "Maharashtra", 43: "Maharashtra", 44: "Maharashtra",
  45: "Madhya Pradesh", 46: "Madhya Pradesh", 47: "Madhya Pradesh", 48: "Madhya Pradesh", 49: "Chhattisgarh",
  50: "Telangana", 51: "Andhra Pradesh", 52: "Andhra Pradesh", 53: "Andhra Pradesh", 56: "Karnataka", 57: "Karnataka",
  58: "Karnataka", 59: "Karnataka", 60: "Tamil Nadu", 61: "Tamil Nadu", 62: "Tamil Nadu", 63: "Tamil Nadu", 64: "Tamil Nadu",
  67: "Kerala", 68: "Kerala", 69: "Kerala", 70: "West Bengal", 71: "West Bengal", 72: "West Bengal", 73: "West Bengal",
  74: "West Bengal", 75: "Odisha", 76: "Odisha", 77: "Odisha", 78: "Assam", 80: "Bihar", 81: "Bihar", 82: "Bihar",
  83: "Jharkhand", 84: "Bihar", 85: "Bihar"
};

export const stateFromPin = (pin) => /^[1-9]\d{5}$/.test(pin || "") ? BY3[pin.slice(0, 3)] || BY2[pin.slice(0, 2)] || "" : "";

const cache = new Map();
// { city, state } for a pin code from India Post, or null when the lookup fails.
export async function lookupPin(pin) {
  if (!/^[1-9]\d{5}$/.test(pin || "")) return null;
  if (cache.has(pin)) return cache.get(pin);
  const ask = (async () => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: ctl.signal });
      clearTimeout(t);
      const po = (await res.json())?.[0]?.PostOffice?.[0];
      if (!po) return null;
      const state = STATES.find((s) => s.toLowerCase() === String(po.State).toLowerCase().replace(/\band\b/g, "&")) || stateFromPin(pin);
      return { city: po.District || po.Block || "", state };
    } catch { return null; }
  })();
  cache.set(pin, ask);
  return ask;
}

// Fills a <select> with the states, plus a blank first option.
export function fillStates(select, value = "") {
  select.replaceChildren(new Option("Select state", ""), ...STATES.map((s) => new Option(s, s)));
  select.value = value;
}

// Wires a pin code box to fill its state and city boxes, without overwriting what the person typed.
export function autofillFromPin(pinInput, stateSelect, cityInput, onNote = () => {}) {
  pinInput.addEventListener("change", async () => {
    const pin = pinInput.value.trim();
    const guess = stateFromPin(pin);
    if (guess && !stateSelect.value) stateSelect.value = guess;
    if (!guess) return;
    onNote("Looking up the city…");
    const found = await lookupPin(pin);
    if (pinInput.value.trim() !== pin) return;
    if (found?.state && !stateSelect.dataset.touched) stateSelect.value = found.state;
    if (found?.city && !cityInput.value.trim()) cityInput.value = found.city;
    onNote(found ? "" : "Couldn't look up the city. Please type it.");
  });
  stateSelect.addEventListener("change", () => (stateSelect.dataset.touched = "1"));
}
