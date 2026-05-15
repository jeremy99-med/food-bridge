const iconMap: Record<string, string> = {
  // Fruits
  lemon: 'lemon',
  lime: 'lime',
  apple: 'apple',
  banana: 'banana',
  orange: 'orange',
  strawberry: 'strawberry',
  strawberries: 'strawberry',
  blueberry: 'blueberry',
  blueberries: 'blueberry',
  avocado: 'avocado',
  grapes: 'grapes',
  grape: 'grapes',
  // Vegetables
  tomato: 'tomato',
  tomatoes: 'tomato',
  broccoli: 'broccoli',
  carrot: 'carrot',
  carrots: 'carrot',
  onion: 'onion',
  onions: 'onion',
  garlic: 'garlic',
  pepper: 'bell-pepper',
  'bell pepper': 'bell-pepper',
  'bell-pepper': 'bell-pepper',
  cucumber: 'cucumber',
  cucumbers: 'cucumber',
  spinach: 'spinach',
  mushroom: 'mushroom',
  mushrooms: 'mushroom',
  corn: 'corn',
  potato: 'potato',
  potatoes: 'potato',
  'sweet potato': 'sweet-potato',
  'sweet potatoes': 'sweet-potato',
  kale: 'kale',
  lettuce: 'lettuce',
  celery: 'celery',
  peas: 'peas',
  zucchini: 'zucchini',
  // Proteins
  chicken: 'chicken',
  salmon: 'salmon',
  tuna: 'tuna',
  beef: 'beef',
  steak: 'beef',
  turkey: 'turkey',
  shrimp: 'shrimp',
  tofu: 'tofu',
  egg: 'egg',
  eggs: 'egg',
  // Dairy
  milk: 'milk',
  cheese: 'cheese',
  yogurt: 'yogurt',
  butter: 'butter',
  // Grains & Pantry
  bread: 'bread',
  rice: 'rice',
  pasta: 'pasta',
  noodles: 'pasta',
  oats: 'oats',
  oatmeal: 'oats',
  'olive oil': 'olive-oil',
  // Legumes & Nuts
  beans: 'beans',
  lentils: 'lentils',
  almonds: 'almonds',
  almond: 'almonds',
  walnuts: 'walnuts',
  walnut: 'walnuts',
};

export function getFoodIconSrc(foodName: string): string {
  const lower = foodName.toLowerCase();

  if (iconMap[lower]) {
    return `/icons/food/${iconMap[lower]}.svg`;
  }

  for (const [keyword, icon] of Object.entries(iconMap)) {
    if (lower.includes(keyword)) {
      return `/icons/food/${icon}.svg`;
    }
  }

  return '/icons/food/generic.svg';
}
