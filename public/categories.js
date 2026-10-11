// Seller categories, shown in the Add seller form.
// A category maps to a list of sub-categories, or to an object of
// sub-category -> list of types when it needs a third level.
// Add or rename entries here; the dropdowns update automatically.
// Keep "Other" as the last option in every list.
export const CATEGORIES = {
  "Fashion & Clothing": ["Men's Wear", "Women's Wear", "Kids' Wear", "Footwear", "Bags & Accessories", "Leather", "Other"],
  "Home & Kitchen": ["Kitchenware", "Home Décor", "Storage & Organizers", "Cleaning Products", "Furniture", "Other"],
  "Electrical & Electronics": ["LED Bulbs", "Electrical Accessories", "Mobile Accessories", "Small Appliances", "Electronics", "Other"],
  "Glass Products": ["Glassware", "Decorative Glass", "Bangles", "Vases", "Gift Items", "Jhoomer", "Other"],
  "Beauty & Personal Care": ["Cosmetics", "Skincare", "Hair Care", "Personal Hygiene", "Other"],
  "Grocery & Daily Needs": ["Food Products", "Household Essentials", "Packaged Goods", "Cleaning Supplies", "Other"],
  "Handicrafts & Handmade": ["Handicrafts", "Wooden Products", "Handmade Décor", "Traditional Products", "Other"],
  "Toys, Kids & Baby": ["Toys", "Baby Products", "School Supplies", "Kids Accessories", "Other"],
  "Mobile & Computer": ["Mobile Phones", "Chargers & Cables", "Computer Accessories", "Networking Products", "Other"],
  "Automotive": ["Car Accessories", "Bike Accessories", "Tools", "Cleaning & Care", "Other"],
  "Sports & Fitness": ["Sports Equipment", "Fitness Products", "Outdoor Products", "Gym Nearby", "Other"],
  "Stationery & Office": ["Stationery", "Office Supplies", "Printing Supplies", "Other"],
  "Jewellery & Accessories": ["Fashion Jewellery", "Artificial Jewellery", "Watches", "Accessories", "Other"],
  "Gifts & Lifestyle": ["Gifts", "Personalized Gifts", "Festival Items", "Lifestyle Products", "Other"],
  "Food": ["Bikaner Products", "Chitle", "Vegetarian", "Non-Vegetarian", "Chaupati", "Other"],
  "School & Education": {
    "School Boards": ["CBSE", "ICSE", "ISC", "State Board – Maharashtra", "State Board – Uttar Pradesh", "State Board – Delhi", "State Board – Karnataka", "State Board – Tamil Nadu", "State Board – Other States", "IB – International Baccalaureate", "Cambridge / IGCSE", "Other"],
    "Academic Subjects": ["Mathematics", "Science", "Physics", "Chemistry", "Biology", "English", "Hindi", "Marathi", "Social Studies", "History", "Geography", "Computer Science", "Coding & Programming", "Other"],
    "Languages": ["English", "Hindi", "Marathi", "Sanskrit", "French", "German", "Spanish", "Other Languages", "Other"],
    "Music": ["Vocal", "Sitar", "Tabla", "Guitar", "Piano / Keyboard", "Violin", "Drums", "Classical Music", "Western Music", "Other"],
    "Dance": ["Kathak", "Bharatanatyam", "Odissi", "Kuchipudi", "Contemporary", "Bollywood Dance", "Western Dance", "Hip-Hop", "Other"],
    "Sports & Fitness": ["Cricket", "Football", "Basketball", "Badminton", "Tennis", "Swimming", "Athletics", "Chess", "Skating", "Yoga", "Martial Arts", "Gymnastics", "Other"],
    "Arts & Creative": ["Drawing", "Painting", "Sketching", "Craft", "Photography", "Sculpture", "Calligraphy", "Other"],
    "Competitive Exams": ["Olympiads", "NTSE / Scholarship", "JEE", "NEET", "CUET", "NDA", "Government Exams", "Entrance Exam Preparation", "Other"],
    "Skill Development": ["Coding", "Robotics", "Artificial Intelligence", "Communication Skills", "Public Speaking", "Personality Development", "Financial Literacy", "Entrepreneurship", "Other"],
    "Tutoring & Coaching": ["Primary School", "Middle School", "Secondary School", "Higher Secondary", "Home Tuition", "Online Tuition", "Special Education", "Other"],
    "Preschool & Early Learning": ["Play School", "Nursery", "LKG", "UKG", "Montessori", "Early Childhood Learning", "Other"],
    "Educational Products": ["School Books", "Reference Books", "Notebooks", "School Bags", "Uniforms", "Stationery", "Educational Toys", "Learning Kits", "Other"],
    "Other": []
  },
  "Real Estate": ["One BHK", "Two BHK or More", "Office Space", "Retail Space", "Factory", "Godown", "Other"],
  "Civil Engineering": ["Structural Engineering", "Geotechnical Engineering", "Transportation Engineering", "Environmental Engineering", "Water Resources Engineering", "Construction Engineering & Management", "Municipal or Urban Engineering", "Coastal and Marine Engineering", "Materials Science and Engineering", "Surveying", "Other"],
  "Other": ["Miscellaneous Products", "Other"]
};

// Sub-categories of a category, and the types under a sub-category (empty when there is no third level)
export const subsOf = (cat) => { const v = CATEGORIES[cat]; return !v ? [] : Array.isArray(v) ? v : Object.keys(v); };
export const typesOf = (cat, sub) => { const v = CATEGORIES[cat]; return v && !Array.isArray(v) ? v[sub] || [] : []; };
