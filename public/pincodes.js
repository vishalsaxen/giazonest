// Centre points for pin codes the console knows by name. Add rows as the marketplace grows.
export const PINS = {
  "110001": { place: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167 },
  "122001": { place: "Gurugram, Haryana", lat: 28.4595, lng: 77.0266 },
  "400001": { place: "Fort, Mumbai", lat: 18.9388, lng: 72.8354 },
  "400050": { place: "Bandra West, Mumbai", lat: 19.0596, lng: 72.8295 },
  "560001": { place: "MG Road, Bengaluru", lat: 12.9756, lng: 77.6050 },
  "560034": { place: "Koramangala, Bengaluru", lat: 12.9352, lng: 77.6245 },
  "700001": { place: "BBD Bagh, Kolkata", lat: 22.5726, lng: 88.3510 },
  "600001": { place: "George Town, Chennai", lat: 13.0900, lng: 80.2850 }
};

// Example rows written by "Load example data" (marked example: true in Firestore).
export const EXAMPLE_SELLERS = [
  { name: "Sharma Handlooms", category: "Fashion & Clothing", subCategory: "Women's Wear", pin: "110001", status: "Verified" },
  { name: "Chandni Spice Co.", category: "Grocery & Daily Needs", subCategory: "Food Products", pin: "110001", status: "Verified" },
  { name: "Delhi Gadget Hub", category: "Electrical & Electronics", subCategory: "Electronics", pin: "110001", status: "Pending KYC" },
  { name: "Cyber City Bakes", category: "Food", subCategory: "Vegetarian", pin: "122001", status: "Verified" },
  { name: "Kala Ghoda Prints", category: "Handicrafts & Handmade", subCategory: "Handmade Décor", pin: "400001", status: "Verified" },
  { name: "Bandra Thrift Closet", category: "Fashion & Clothing", subCategory: "Men's Wear", pin: "400050", status: "Suspended" },
  { name: "Linking Road Leather", category: "Fashion & Clothing", subCategory: "Leather", pin: "400050", status: "Verified" },
  { name: "Indiranagar Organics", category: "Grocery & Daily Needs", subCategory: "Packaged Goods", pin: "560001", status: "Pending KYC" },
  { name: "Koramangala Kicks", category: "Fashion & Clothing", subCategory: "Footwear", pin: "560034", status: "Verified" },
  { name: "Howrah Brassworks", category: "Home & Kitchen", subCategory: "Home Décor", pin: "700001", status: "Verified" },
  { name: "Saraswati Music Academy", category: "School & Education", subCategory: "Music", type: "Tabla", pin: "400050", status: "Verified" },
  { name: "Bright Minds Tutorials", category: "School & Education", subCategory: "Tutoring & Coaching", type: "Secondary School", pin: "110001", status: "Pending KYC" },
  { name: "Marina Silks", category: "Fashion & Clothing", subCategory: "Women's Wear", pin: "600001", status: "Verified" }
];
export const EXAMPLE_BUYERS = [
  { name: "Aditi Verma", pin: "110001", orders: 14, status: "Active" },
  { name: "Rohan Mehta", pin: "110001", orders: 3, status: "Active" },
  { name: "Imran Qureshi", pin: "110001", orders: 0, status: "New" },
  { name: "Neha Kapoor", pin: "122001", orders: 9, status: "Active" },
  { name: "Farah Khan", pin: "400001", orders: 21, status: "Active" },
  { name: "Kabir Desai", pin: "400050", orders: 2, status: "Flagged" },
  { name: "Ananya Rao", pin: "560001", orders: 7, status: "Active" },
  { name: "Vikram Iyer", pin: "560034", orders: 0, status: "New" },
  { name: "Sourav Das", pin: "700001", orders: 5, status: "Active" },
  { name: "Lakshmi Narayan", pin: "600001", orders: 11, status: "Active" }
];
