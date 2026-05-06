export const CATEGORY_ICONS: Record<string, string> = {
  "Meat & Seafood": "🍗", "Meat": "🍗", "Seafood": "🐟",
  "Dairy & Eggs": "🥛", "Dairy": "🥛", "Eggs": "🥚",
  "Produce": "🥦", "Vegetables": "🥦", "Fruit": "🍎",
  "Grains & Legumes": "🌾", "Grains": "🌾", "Legumes": "🫘",
  "Beans & Legumes": "🫘", "Snacks": "🍿", "Beverages": "🧃",
  "Frozen": "🧊", "Fats & Oils": "🫙", "Other": "📦",
};

export const categoryIcon = (cat: string): string =>
  CATEGORY_ICONS[cat] ??
  Object.entries(CATEGORY_ICONS).find(([k]) => cat.toLowerCase().includes(k.toLowerCase()))?.[1] ??
  "🛒";
