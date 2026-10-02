// Extra product details asked for in each category. A sub-category entry
// ("Category|Sub-category") replaces its category's list.
// A field with `options` shows a dropdown; otherwise a text box.

const brand = { key: "brand", label: "Brand" };
const material = { key: "material", label: "Material" };
const colour = { key: "colour", label: "Colour" };
const size = { key: "size", label: "Size / dimensions", hint: "e.g. 30 x 20 cm" };
const quantity = { key: "quantity", label: "Quantity per item", hint: "e.g. 500 g, 1 L, pack of 6" };
const warranty = { key: "warranty", label: "Warranty", hint: "e.g. 1 year" };
const vegNonVeg = { key: "diet", label: "Veg / non-veg", options: ["Veg", "Non-veg", "Egg", "Vegan"] };
const shelfLife = { key: "shelfLife", label: "Best before / shelf life", hint: "e.g. 6 months" };
const ageGroup = { key: "ageGroup", label: "Age group / class", hint: "e.g. 5–8 years, Class 6–8" };
const mode = { key: "mode", label: "Mode", options: ["At our centre", "At student's home", "Online", "Online and offline"] };
const duration = { key: "duration", label: "Course duration", hint: "e.g. 3 months" };
const timings = { key: "timings", label: "Batch timings", hint: "e.g. Mon–Fri, 5–7 pm" };
const feeFor = { key: "feeFor", label: "Price is for", options: ["Per month", "Per class", "Full course", "Per term", "Per year"] };

const FIELDS = {
  "Fashion & Clothing": [{ key: "sizes", label: "Sizes available", hint: "e.g. S, M, L, XL" }, colour, { key: "material", label: "Fabric / material" }, { key: "for", label: "For", options: ["Men", "Women", "Kids", "Unisex"] }],
  "Home & Kitchen": [brand, material, size, colour],
  "Electrical & Electronics": [brand, { key: "model", label: "Model" }, { key: "power", label: "Power", hint: "e.g. 9 W" }, warranty],
  "Glass Products": [colour, size, { key: "pieces", label: "Pieces in a set" }, { key: "fragile", label: "Packed for delivery", options: ["Yes", "Pickup only"] }],
  "Beauty & Personal Care": [brand, quantity, { key: "suitedFor", label: "Suited for", hint: "e.g. dry skin, all hair types" }, shelfLife],
  "Grocery & Daily Needs": [brand, quantity, vegNonVeg, shelfLife],
  "Handicrafts & Handmade": [material, size, colour, { key: "madeIn", label: "Made in / craft", hint: "e.g. Jaipur blue pottery" }],
  "Toys, Kids & Baby": [brand, ageGroup, material, { key: "battery", label: "Batteries", options: ["Not needed", "Included", "Not included"] }],
  "Mobile & Computer": [brand, { key: "model", label: "Model" }, { key: "condition", label: "Condition", options: ["New", "Refurbished", "Used"] }, warranty],
  "Automotive": [brand, { key: "fits", label: "Fits vehicle", hint: "e.g. Honda Activa, all bikes" }, material, warranty],
  "Sports & Fitness": [brand, size, material, ageGroup],
  "Sports & Fitness|Gym Nearby": [timings, feeFor, { key: "facilities", label: "Facilities", hint: "e.g. AC, trainer, lockers" }, { key: "trial", label: "Free trial", options: ["Yes", "No"] }],
  "Stationery & Office": [brand, { key: "pack", label: "Pack size", hint: "e.g. pack of 10" }, colour],
  "Jewellery & Accessories": [material, colour, { key: "occasion", label: "Occasion", hint: "e.g. wedding, daily wear" }],
  "Jewellery & Accessories|Watches": [brand, { key: "for", label: "For", options: ["Men", "Women", "Kids", "Unisex"] }, { key: "strap", label: "Strap", hint: "e.g. leather, steel" }, warranty],
  "Gifts & Lifestyle": [{ key: "occasion", label: "Occasion", hint: "e.g. birthday, Diwali" }, material, size, { key: "personalised", label: "Can be personalised", options: ["Yes", "No"] }],
  "Food": [quantity, vegNonVeg, shelfLife, { key: "delivery", label: "Home delivery", options: ["Yes", "Pickup only"] }],
  "School & Education": [ageGroup, mode, duration, timings, feeFor],
  "School & Education|Educational Products": [ageGroup, { key: "publisher", label: "Brand / publisher" }, { key: "board", label: "Board", hint: "e.g. CBSE, ICSE" }, { key: "language", label: "Language" }],
  "Other": [brand, size]
};

export const fieldsFor = (cat, sub) => FIELDS[`${cat}|${sub}`] || FIELDS[cat] || [brand];

// Services (classes, gyms) count seats or spots instead of items.
const SERVICE = (cat, sub) => (cat === "School & Education" && sub !== "Educational Products") || (cat === "Sports & Fitness" && sub === "Gym Nearby");
export const stockLabel = (cat, sub) => SERVICE(cat, sub) ? "Seats available" : "Items in stock";
export const itemWord = (cat, sub) => SERVICE(cat, sub) ? "seat" : "item";

// Price after discount, and rupee formatting.
export const sellingPrice = (p) => Math.max(0, (Number(p.price) || 0) - (Number(p.discount) || 0));
export const rupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
