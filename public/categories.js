// Seller categories, shown in the Add seller form.
// A category maps to a list of sub-categories, or to an object of
// sub-category -> list of types when it needs a third level.
// Add or rename entries here; the dropdowns update automatically.
export const CATEGORIES = {
  "Fashion & Clothing": ["Men's Wear", "Women's Wear", "Kids' Wear", "Footwear", "Bags & Accessories", "Leather"],
  "Home & Kitchen": ["Kitchenware", "Home Décor", "Storage & Organizers", "Cleaning Products", "Furniture"],
  "Electrical & Electronics": ["LED Bulbs", "Electrical Accessories", "Mobile Accessories", "Small Appliances", "Electronics"],
  "Glass Products": ["Glassware", "Decorative Glass", "Bangles", "Vases", "Gift Items", "Jhoomer"],
  "Beauty & Personal Care": ["Cosmetics", "Skincare", "Hair Care", "Personal Hygiene"],
  "Grocery & Daily Needs": ["Food Products", "Household Essentials", "Packaged Goods", "Cleaning Supplies"],
  "Handicrafts & Handmade": ["Handicrafts", "Wooden Products", "Handmade Décor", "Traditional Products"],
  "Toys, Kids & Baby": ["Toys", "Baby Products", "School Supplies", "Kids Accessories"],
  "Mobile & Computer": ["Mobile Phones", "Chargers & Cables", "Computer Accessories", "Networking Products"],
  "Automotive": ["Car Accessories", "Bike Accessories", "Tools", "Cleaning & Care"],
  "Sports & Fitness": ["Sports Equipment", "Fitness Products", "Outdoor Products", "Gym Nearby"],
  "Stationery & Office": ["Stationery", "Office Supplies", "Printing Supplies"],
  "Jewellery & Accessories": ["Fashion Jewellery", "Artificial Jewellery", "Watches", "Accessories"],
  "Gifts & Lifestyle": ["Gifts", "Personalized Gifts", "Festival Items", "Lifestyle Products"],
  "Food": ["Bikaner Products", "Chitle", "Vegetarian", "Non-Vegetarian", "Chaupati", "Cloud Kitchen"],
  "School & Education": {
    "School Boards": ["CBSE", "ICSE", "ISC", "State Board – Maharashtra", "State Board – Uttar Pradesh", "State Board – Delhi", "State Board – Karnataka", "State Board – Tamil Nadu", "State Board – Other States", "IB – International Baccalaureate", "Cambridge / IGCSE"],
    "Academic Subjects": ["Mathematics", "Science", "Physics", "Chemistry", "Biology", "English", "Hindi", "Marathi", "Social Studies", "History", "Geography", "Computer Science", "Coding & Programming"],
    "Languages": ["English", "Hindi", "Marathi", "Sanskrit", "French", "German", "Spanish", "Other Languages"],
    "Music": ["Vocal", "Sitar", "Tabla", "Guitar", "Piano / Keyboard", "Violin", "Drums", "Classical Music", "Western Music"],
    "Dance": ["Kathak", "Bharatanatyam", "Odissi", "Kuchipudi", "Contemporary", "Bollywood Dance", "Western Dance", "Hip-Hop"],
    "Sports & Fitness": ["Cricket", "Football", "Basketball", "Badminton", "Tennis", "Swimming", "Athletics", "Chess", "Skating", "Yoga", "Martial Arts", "Gymnastics"],
    "Arts & Creative": ["Drawing", "Painting", "Sketching", "Craft", "Photography", "Sculpture", "Calligraphy"],
    "Competitive Exams": ["Olympiads", "NTSE / Scholarship", "JEE", "NEET", "CUET", "NDA", "Government Exams", "Entrance Exam Preparation"],
    "Skill Development": ["Coding", "Robotics", "Artificial Intelligence", "Communication Skills", "Public Speaking", "Personality Development", "Financial Literacy", "Entrepreneurship"],
    "Tutoring & Coaching": ["Primary School", "Middle School", "Secondary School", "Higher Secondary", "Home Tuition", "Online Tuition", "Special Education"],
    "Preschool & Early Learning": ["Play School", "Nursery", "LKG", "UKG", "Montessori", "Early Childhood Learning"],
    "Educational Products": ["School Books", "Reference Books", "Notebooks", "School Bags", "Uniforms", "Stationery", "Educational Toys", "Learning Kits"]
  },
  "Other": ["Miscellaneous Products"]
};

// Sub-categories of a category, and the types under a sub-category (empty when there is no third level)
export const subsOf = (cat) => { const v = CATEGORIES[cat]; return !v ? [] : Array.isArray(v) ? v : Object.keys(v); };
export const typesOf = (cat, sub) => { const v = CATEGORIES[cat]; return v && !Array.isArray(v) ? v[sub] || [] : []; };
