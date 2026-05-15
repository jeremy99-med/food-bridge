"""
Direct DB operations for steps 1 & 2 — no Claude / MCP involved.
"""

from db import execute, execute_returning, fetch_all, fetch_one
from nutrition import UserProfile, calculate_personalized_dv as _calc_dv, NUTRIENT_ID_MAP, NUTRIENT_WEIGHTS, score_food, _RDI_BASE

# Keyword-based dietary preference filter rules.
# bad_categories / bad_ingredients match against branded_food_category and
# the food description (case-insensitive).
DIETARY_FILTER_RULES: dict[str, dict] = {
    "vegetarian": {
        "bad_keywords": ["beef", "pork", "chicken", "turkey", "lamb", "duck", "veal",
                         "bison", "venison", "fish", "tuna", "salmon", "shrimp", "lobster",
                         "crab", "scallop", "clam", "oyster", "anchovy", "sardine",
                         "gelatin", "lard", "tallow", "pepperoni", "salami", "bacon",
                         "prosciutto", "chorizo", "meat"],
    },
    "vegan": {
        "bad_keywords": ["beef", "pork", "chicken", "turkey", "lamb", "duck", "veal",
                         "bison", "venison", "fish", "tuna", "salmon", "shrimp", "lobster",
                         "crab", "scallop", "clam", "oyster", "anchovy", "sardine",
                         "gelatin", "lard", "tallow", "pepperoni", "salami", "bacon",
                         "prosciutto", "chorizo", "meat",
                         "milk", "cheese", "butter", "cream", "whey", "casein",
                         "lactose", "yogurt", "ghee", "kefir", "egg", "honey",
                         "albumin", "collagen"],
    },
    "gluten_free": {
        "bad_keywords": ["wheat", "barley", "rye", "malt", "triticale", "spelt",
                         "kamut", "farro", "semolina", "durum", "bulgur", "couscous",
                         "breadcrumb", "crouton", "flour"],
    },
    "dairy_free": {
        "bad_keywords": ["milk", "cheese", "butter", "cream", "whey", "casein",
                         "lactose", "yogurt", "ghee", "kefir", "curds"],
    },
    "nut_free": {
        "bad_keywords": ["peanut", "almond", "cashew", "walnut", "pecan", "hazelnut",
                         "pistachio", "macadamia", "brazil nut", "pine nut", "chestnut"],
    },
    "halal": {
        "bad_keywords": ["pork", "lard", "gelatin", "alcohol", "wine", "beer"],
    },
    "kosher": {
        "bad_keywords": ["pork", "shellfish", "shrimp", "lobster", "crab", "lard"],
    },
    "low_carb": {},   # handled via nutrient cap — no keyword exclusions
    "keto": {
        "bad_keywords": ["sugar", "corn syrup", "honey", "maple syrup",
                         "starch", "dextrose", "maltodextrin"],
    },
    "low_sodium": {},  # handled via nutrient cap
}


def _snake(s: str) -> str:
    return s.strip().lower().replace(" ", "_")


def create_profile(
    height_cm: float,
    weight_kg: float,
    age: int,
    sex: str,
    activity_level: str,
    smoking_status: str,
    household_size_adults: int,
    household_size_children: int,
    health_goals: list[str],
    health_conditions: list[str],
    medications: list[str],
) -> str:
    row = execute_returning(
        """
        INSERT INTO user_profile (
            height_cm, weight_kg, age, sex, activity_level,
            smoking_status, pregnancy_status,
            household_size_adults, household_size_children
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING profile_id
        """,
        (
            height_cm, weight_kg, age, sex.lower(), _snake(activity_level),
            _snake(smoking_status), "not_pregnant",
            household_size_adults, household_size_children,
        ),
    )
    profile_id = str(row["profile_id"])

    for goal in health_goals:
        g = _snake(goal)
        if g and g != "none":
            execute(
                "INSERT INTO user_health_goal (profile_id, goal) VALUES (%s,%s)",
                (profile_id, g),
            )

    for cond in health_conditions:
        if cond and cond.lower() != "none":
            execute(
                "INSERT INTO user_health_condition (profile_id, condition_name) VALUES (%s,%s)",
                (profile_id, cond),
            )

    for med in medications:
        if med.strip():
            execute(
                "INSERT INTO user_medication (profile_id, medication_name) VALUES (%s,%s)",
                (profile_id, med.strip()),
            )

    # Calculate and persist personalised daily values
    profile = UserProfile(
        height_cm=height_cm,
        weight_kg=weight_kg,
        age=age,
        sex=sex.lower(),
        activity_level=_snake(activity_level),
        smoking_status=_snake(smoking_status),
        pregnancy_status="not_pregnant",
        health_goals=[_snake(g) for g in health_goals if g and g.lower() != "none"],
        health_conditions=[c for c in health_conditions if c and c.lower() != "none"],
    )
    dv = _calc_dv(profile)

    execute(
        """
        INSERT INTO user_calculated_dv (
            profile_id, calories_kcal, protein_g, fat_g, saturated_fat_g,
            carbohydrates_g, fiber_g, added_sugars_g, sodium_mg, potassium_mg,
            calcium_mg, iron_mg, vitamin_c_mg, vitamin_d_iu, folate_mcg,
            b12_mcg, magnesium_mg, zinc_mg
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            profile_id,
            dv["calories_kcal"], dv["protein_g"], dv["fat_g"], dv["saturated_fat_g"],
            dv["carbohydrates_g"], dv["fiber_g"], dv["added_sugars_g"], dv["sodium_mg"],
            dv["potassium_mg"], dv["calcium_mg"], dv["iron_mg"], dv["vitamin_c_mg"],
            dv["vitamin_d_iu"], dv["folate_mcg"], dv["b12_mcg"], dv["magnesium_mg"],
            dv["zinc_mg"],
        ),
    )

    return profile_id


def save_preferences(
    profile_id: str,
    weekly_budget_usd: float,
    zip_code: str,
    dietary_preferences: list[str],
    allergies: list[str],
    cuisine_preferences: list[str],
    wic_filter_active: bool,
) -> None:
    execute(
        """
        INSERT INTO user_grocery_preference (profile_id, weekly_budget_usd, zip_code, wic_filter_active)
        VALUES (%s,%s,%s,%s)
        ON CONFLICT (profile_id) DO UPDATE
            SET weekly_budget_usd = EXCLUDED.weekly_budget_usd,
                zip_code          = EXCLUDED.zip_code,
                wic_filter_active = EXCLUDED.wic_filter_active,
                updated_at        = NOW()
        """,
        (profile_id, weekly_budget_usd, zip_code, "Y" if wic_filter_active else "N"),
    )

    execute("DELETE FROM user_dietary_preference WHERE profile_id = %s", (profile_id,))
    for pref in dietary_preferences:
        p = _snake(pref)
        if p:
            execute(
                "INSERT INTO user_dietary_preference (profile_id, preference) VALUES (%s,%s)",
                (profile_id, p),
            )

    execute("DELETE FROM user_allergy WHERE profile_id = %s", (profile_id,))
    for allergen in allergies:
        a = allergen.strip().lower()
        if a:
            execute(
                "INSERT INTO user_allergy (profile_id, allergen) VALUES (%s,%s)",
                (profile_id, a),
            )

    execute("DELETE FROM user_cuisine_preference WHERE profile_id = %s", (profile_id,))
    for cuisine in cuisine_preferences:
        if cuisine.strip():
            execute(
                "INSERT INTO user_cuisine_preference (profile_id, cuisine) VALUES (%s,%s)",
                (profile_id, cuisine),
            )


def get_user_zip(profile_id: str) -> str | None:
    """Return the zip code stored for this profile, or None if not set."""
    row = fetch_one(
        "SELECT zip_code FROM user_grocery_preference WHERE profile_id = %s",
        (profile_id,),
    )
    return row["zip_code"] if row and row.get("zip_code") else None


# ── Food search ───────────────────────────────────────────────────────────────

import re as _re

_NUTRIENT_IDS = list(NUTRIENT_ID_MAP.keys())

# Terms that indicate non-grocery-store items; these get a heavy score penalty
# so common cuts (breast, thigh, drumstick) naturally surface first.
_NON_GROCERY_TERMS = {
    # Organ meats & offal
    "giblet", "gizzard", "liver", "heart", "kidney", "lung", "spleen",
    "feet", "head", "tripe", "tongue", "brain", "sweetbread", "oxtail",
    # Unusual butchery terms
    "neck", "back", "frame", "carcass", "capon", "stewing",
    # USDA composite / aggregate records
    "composite of", "separable lean", "separable fat",
    # Baby food & infant formula
    "babyfood", "baby food", "infant formula", "junior",
    # Organ/offal USDA category labels
    "variety meats", "by-products",
    # Meatless / plant-based mis-categorised under the real food
    "meatless",
}

# Noise tokens stripped from USDA descriptions to produce a readable display name.
_USDA_NOISE = _re.compile(
    r",\s*(?:"
    r"broilers?\s+or\s+fryers?|roasting|capons?|stewing|baking|"
    r"meat\s+(?:and\s+skin|only)|with\s+skin|without\s+skin|skin\s+not\s+eaten|"
    r"with\s+peel|without\s+peel|peeled|unpeeled|"
    r"separable\s+lean[^,]*|separable\s+fat[^,]*|composite\s+of[^,]*|"
    r"ns\s+as\s+to\b[^,]*|all\s+classes|"
    r"(?:cooked|raw|dry|fresh|frozen|canned|unenriched|enriched|regular|instant|long-grain|short-grain|medium-grain)[^,]*|"
    r"dry\s+heat|moist\s+heat|"
    r"\d+%\s+lean[^,]*|farmed|wild|farm-raised|"
    r"ready-to-(?:eat|cook|serve)[^,]*"
    r")",
    _re.IGNORECASE,
)

# Maps known bad USDA-derived display names to consumer-friendly grocery store names.
_NAME_NORMALIZATIONS: dict[str, str] = {
    "Egg Yolk":          "Eggs",
    "Egg White":         "Eggs",
    "Egg Whole":         "Eggs",
    "Pepper Banana":     "Banana Pepper",
    "Peppers Banana":    "Banana Peppers",
    "Pepper Bell":       "Bell Pepper",
    "Peppers Bell":      "Bell Peppers",
    "Pepper Sweet":      "Sweet Pepper",
    "Potato Sweet":      "Sweet Potato",
    "Onion Green":       "Green Onion",
    "Onions Green":      "Green Onions",
    "Mushroom Enoki":    "Enoki Mushrooms",
    "Mushroom Shiitake": "Shiitake Mushrooms",
    "Mushroom Portobello": "Portobello Mushrooms",
    "Beans Green":       "Green Beans",
    "Bean Green":        "Green Bean",
    "Peas Snow":         "Snow Peas",
    "Peas Sugar Snap":   "Sugar Snap Peas",
    "Lemon Peel":        "Lemons",
    "Lime Peel":         "Limes",
    "Orange Peel":       "Oranges",
    "Angel Hair":        "Angel Hair Pasta",
    "Fettuccine":        "Fettuccine Pasta",
    "Fettuccini":        "Fettuccine Pasta",
    "Linguine":          "Linguine Pasta",
    "Linguini":          "Linguine Pasta",
    "Farfalle":          "Farfalle Pasta",
    "Rotini":            "Rotini Pasta",
    "Tagliatelle":       "Tagliatelle Pasta",
    "Bucatini":          "Bucatini Pasta",
    # USDA comma-reversed names
    "Oil Corn":          "Corn Oil",
    "Oil Canola":        "Canola Oil",
    "Oil Olive":         "Olive Oil",
    "Onions Red":        "Red Onions",
    "Onion Red":         "Red Onion",
    "Asparagus Green":   "Asparagus",
    "Soy Sauce Made From Soy": "Soy Sauce",
    # Juice forms → buy the whole fruit
    "Lemon Juice":       "Lemons",
    "Lime Juice":        "Limes",
    "Orange Juice":      "Oranges",
}

# Words in a meal-plan part that signal it is a prepared dish, not a raw grocery.
# Used to skip non-ingredient parts that have no matching ingredient root.
_PREPARED_DISH_TERMS = {
    # Dish types
    "omelet", "omelette", "scramble", "skillet", "frittata", "quiche", "muffin",
    "salad", "stir-fry", "stir fry", "soup", "stew", "casserole", "curry",
    "wrap", "sandwich", "bowl", "parfait", "pudding", "porridge",
    "pancake", "waffle", "smoothie", "hash", "toast", "tartine",
    "piccata", "noodle", "noodles", "fritters",
    # Cooking method words — only filter parts with NO ingredient root
    # (e.g. "Roasted Vegetables" has no root; "Roasted Chicken" has root "chicken" → bypassed)
    "roasted", "grilled", "sauteed", "sautéed", "steamed", "braised",
    "stewed", "baked", "fried", "seared", "poached",
    # Generic non-buyable descriptors
    "vegetables", "greens", "mixed", "assorted",
}

# DB description patterns that indicate a processed product, not a raw grocery.
# Applied as a post-filter on USDA query results.
_PROCESSED_DESC_RE = _re.compile(
    r"\b(dip|spread|rings|fritter|patties|patty|pie|roll|wing|neck|back|giblet|gizzard|cutlet)\b",
    _re.IGNORECASE,
)


def _display_name(description: str) -> str:
    """Return a grocery-store-friendly label for a USDA food description."""
    # Strip parenthetical USDA notes like "(Includes foods for USDA's...)"
    cleaned = _re.sub(r"\s*\([^)]*\)", "", description)
    cleaned = _USDA_NOISE.sub("", cleaned)
    cleaned = _re.sub(r",\s*,+", ",", cleaned).strip().strip(",").strip()
    parts = [p.strip() for p in cleaned.split(",") if p.strip()]
    # "Fish, salmon, Atlantic" → drop the generic "Fish" prefix
    if len(parts) > 1 and parts[0].lower() == "fish":
        parts = parts[1:]
    # "Spices, garlic powder" → drop "Spices" prefix so result is "Garlic Powder"
    if len(parts) > 1 and parts[0].lower() == "spices":
        parts = parts[1:]
    name = " ".join(p.title() for p in parts[:2]) or description.split(",")[0].title()
    return _NAME_NORMALIZATIONS.get(name, name)

_CUISINE_KEYWORDS: dict[str, list[str]] = {
    "Asian":          ["tofu", "bok choy", "rice", "soy", "edamame", "miso", "tempeh",
                       "noodle", "sesame", "ginger", "mung", "lemongrass", "daikon"],
    "Mexican":        ["black bean", "pinto bean", "corn", "avocado", "jalapeño",
                       "cilantro", "lime", "tortilla", "chili", "salsa", "tomatillo"],
    "Mediterranean":  ["olive", "hummus", "chickpea", "feta", "quinoa", "lentil",
                       "eggplant", "tahini", "couscous", "spinach", "artichoke", "sardine"],
    "Italian":        ["pasta", "tomato", "basil", "mozzarella", "ricotta",
                       "zucchini", "parmesan", "polenta", "cannellini"],
    "Middle Eastern": ["hummus", "lentil", "chickpea", "tahini", "lamb",
                       "pomegranate", "bulgur", "falafel", "sumac", "za'atar"],
    "American":       ["chicken", "beef", "potato", "corn", "turkey",
                       "sweet potato", "blueberry", "cranberry", "pumpkin"],
}

_BENEFICIAL = {
    k for k in NUTRIENT_WEIGHTS
    if k not in {"calories_kcal", "saturated_fat_g", "sodium_mg", "added_sugars_g", "fat_g", "carbohydrates_g"}
}

_NUTRIENT_LABELS = {
    "protein_g": "Protein",
    "fiber_g": "Fiber",
    "potassium_mg": "Potassium",
    "calcium_mg": "Calcium",
    "iron_mg": "Iron",
    "vitamin_c_mg": "Vitamin C",
    "vitamin_d_iu": "Vitamin D",
    "folate_mcg": "Folate",
    "b12_mcg": "Vitamin B12",
    "magnesium_mg": "Magnesium",
    "zinc_mg": "Zinc",
}


# ── Grocery list derivation ───────────────────────────────────────────────────

_CATEGORY_RULES: list[tuple[list[str], str]] = [
    # Nut & seed butters must come before Dairy so "almond butter" → Nuts & Seeds
    (["almond butter", "peanut butter", "cashew butter", "sunflower butter",
      "nut butter", "nut", "almond", "walnut", "cashew", "peanut", "seed", "tahini"], "Nuts & Seeds"),
    (["chicken", "beef", "pork", "turkey", "lamb", "bison", "meat"], "Meat & Seafood"),
    (["salmon", "tuna", "tilapia", "cod", "haddock", "halibut", "trout", "bass",
      "catfish", "mahi", "snapper", "shrimp", "fish", "crab", "lobster", "seafood",
      "nuggets"], "Meat & Seafood"),
    # "butter" kept here for real dairy butter; nut butters already matched above
    (["milk", "yogurt", "cheese", "butter", "cream", "whey"], "Dairy & Eggs"),
    (["egg"], "Dairy & Eggs"),
    # Fats & Oils BEFORE Produce so "Corn Oil" → oil matches here, not "corn" in Produce
    # "olive oil" used instead of bare "olive" to avoid miscategorising black olives
    (["corn oil", "canola oil", "sesame oil", "peanut oil", "sunflower oil",
      "olive oil", "avocado oil", "coconut oil", "oil", "ghee"], "Fats & Oils"),
    # Compound spice forms BEFORE Produce so "garlic powder" → Spices & Pantry,
    # not "garlic" → Produce. Must be checked before the Produce rule.
    (["garlic powder", "garlic salt", "onion powder", "onion flakes", "onion salt",
      "black pepper", "white pepper", "red pepper flake", "cayenne pepper",
      "ginger powder", "ground ginger", "ground cumin", "ground cinnamon",
      "ground nutmeg", "ground cloves", "celery salt", "celery seed",
      "lemon pepper", "smoked paprika"], "Spices & Pantry"),
    (["broccoli", "spinach", "kale", "lettuce", "carrot", "tomato", "cucumber",
      "pepper", "onion", "garlic", "ginger", "potato", "sweet potato", "zucchini",
      "apple", "banana", "berry", "orange", "mango", "lemon", "lime",
      "fruit", "vegetable",
      "avocado", "cauliflower", "asparagus", "mushroom", "celery", "beet",
      "cabbage", "bok choy", "eggplant", "artichoke", "leek", "radish",
      "turnip", "parsnip", "squash", "pumpkin", "corn", "pea",
      "green bean", "brussels", "sprout"], "Produce"),
    (["oat", "rice", "pasta", "bread", "quinoa", "barley", "wheat", "flour", "cereal", "grain"], "Grains & Legumes"),
    (["bean", "lentil", "chickpea", "legume", "tofu", "tempeh"], "Grains & Legumes"),
    # Spices & Pantry — lowest priority, catches dried spices/herbs that matched nothing above
    (["paprika", "cumin", "oregano", "thyme", "rosemary", "basil", "cinnamon",
      "turmeric", "cayenne", "chili powder", "bay leaf", "nutmeg", "cloves",
      "allspice", "cardamom", "dill", "sage", "tarragon", "marjoram",
      "italian seasoning", "seasoning", "spice blend", "herbs de provence",
      "curry powder", "garam masala", "salt", "pepper"], "Spices & Pantry"),
]

_DEFAULT_SERVING_G: dict[str, float] = {
    "Meat & Seafood":   450.0,
    "Dairy & Eggs":     500.0,
    "Produce":          300.0,
    "Grains & Legumes": 500.0,
    "Fats & Oils":      500.0,   # ~500ml bottle of oil
    "Nuts & Seeds":     200.0,
    "Spices & Pantry":   50.0,   # small spice jar
    "Other":            300.0,
}

_DEFAULT_QTY: dict[str, int] = {
    "Meat & Seafood":   3,
    "Dairy & Eggs":     2,
    "Produce":          2,
    "Grains & Legumes": 1,
    "Fats & Oils":      1,
    "Nuts & Seeds":     1,
    "Spices & Pantry":  1,
    "Other":            2,
}

# Items that should always be presented as a standard retail unit.
# Maps a keyword (matched against the item name) to (unit_label, serving_size_g).
_RETAIL_UNIT_OVERRIDES: dict[str, tuple[str, float]] = {
    "egg":    ("1 dozen",  600.0),   # 12 × 50g eggs
    "garlic": ("1 head",    50.0),   # 1 head ≈ 50g; Kroger matches large bulk packages otherwise
    "lemon":  ("2 lemons", 150.0),
    "lime":   ("3 limes",  150.0),
}


# Core ingredient keywords — deduplication collapses anything that contains the
# same root word into one entry (e.g. "spinach salad", "baby spinach", "spinach
# & mushroom omelette starter" all collapse to "spinach").
_INGREDIENT_ROOTS: list[str] = [
    # Specific chicken cuts before bare "chicken" so "Grilled Chicken Breast" → "chicken breast"
    "chicken breast", "chicken thigh", "chicken drumstick", "chicken leg",
    # Cured/processed meats before bare "pork" to get specific DB entries
    "bacon", "ham", "sausage",
    "chicken", "beef", "pork", "turkey", "salmon", "tuna", "shrimp", "fish",
    "egg", "milk", "cheese", "yogurt",
    # compound nut butters must come before bare "butter" to win the substring match
    "almond butter", "peanut butter", "cashew butter", "sunflower butter",
    "butter",
    "spinach", "kale", "broccoli", "zucchini", "cauliflower", "carrot",
    "tomato",
    # Compound spice forms before their base vegetable so "garlic powder" → spice root
    "garlic powder", "garlic salt", "onion powder", "onion flakes", "onion salt",
    "black pepper", "white pepper", "red pepper flakes", "cayenne pepper",
    "ginger powder", "ground ginger",
    "onion", "garlic", "potato", "pepper", "cucumber", "lettuce",
    "apple", "banana", "berry", "orange", "mango", "avocado",
    # Specific pasta shapes before bare "pasta" so "Angel Hair" → root "angel hair"
    "angel hair", "spaghetti", "fettuccine", "fettuccini", "linguine", "linguini",
    "penne", "rigatoni", "farfalle", "rotini", "orzo", "tagliatelle", "bucatini",
    "rice", "pasta", "oat", "bread", "quinoa", "lentil", "green bean", "tofu", "bean",
    "almond", "walnut", "peanut", "cashew",
    "olive oil", "oil",
    "asparagus", "mushroom", "celery", "beet", "corn", "pea",
]

# USDA data types that describe as-eaten dishes, not raw groceries.
# We exclude these so "Grilled Chicken Breast" or "Spinach Salad No Dressing"
# don't appear on a shopping list.
_PREPARED_DATA_TYPES = {"survey_fndds_food", "sub_sample_food"}

# Strips leading quantity + unit from a meal-plan ingredient string so the
# ingredient name can be matched against USDA.
# e.g. "1/2 cup rolled oats" → "rolled oats"
#      "1 (15 oz) can black beans" → "black beans"
_QUANTITY_PREFIX_RE = _re.compile(
    r"^[\d¼½¾⅓⅔⅛⅜⅝⅞\s./–\-]+\s*"        # leading number/fraction
    r"(?:\([^)]*\)\s*)?"                    # optional parenthetical, e.g. (15 oz)
    r"(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|lbs?|pounds?|ozs?|ounces?|"
    r"grams?|g\b|kg\b|mls?|liters?|cloves?|slices?|pieces?|heads?|bunches?|"
    r"cans?|packages?|pkgs?|sprigs?|handfuls?|stalks?|ears?|"
    r"medium|large|small|whole|fresh|dried)?\s*",
    _re.I,
)

# Strips trailing preparation notes from an ingredient string.
# e.g. "broccoli, cut into florets" → "broccoli"
#      "Salt and pepper to taste"   → "Salt and pepper"
_PREP_SUFFIX_RE = _re.compile(
    r",?\s*(to taste|as needed|for garnish|for serving|if desired|optional"
    r"|cut into|roughly chopped|finely chopped|thinly sliced|coarsely chopped"
    r"|diced|minced|sliced|chopped|peeled|halved|quartered|trimmed"
    r"|divided|separated|room temperature|softened|melted)\b.*$",
    _re.I,
)


def _root_key(name: str) -> str:
    """Return the first matching ingredient root for a name, or the name itself."""
    lower = name.lower()
    for root in _INGREDIENT_ROOTS:
        if root in lower:
            return root
    return lower


def extract_ingredients_from_meal_plan(meal_plan_text: str) -> list[dict]:
    """Parse a meal plan JSON string and return DB-matched ingredients for the grocery list."""
    import re, json

    raw_ingredients: list[str] = []

    try:
        json_match = re.search(r'\{[\s\S]*\}', meal_plan_text)
        if json_match:
            obj = json.loads(json_match.group())
            for day in obj.get("days", []):
                for meal in day.get("meals", []):
                    # Primary source: per-meal ingredients list (most specific)
                    for raw_ing in meal.get("ingredients", []):
                        cleaned = _QUANTITY_PREFIX_RE.sub("", str(raw_ing)).strip()
                        cleaned = _PREP_SUFFIX_RE.sub("", cleaned).strip().strip(",").strip()
                        if len(cleaned) > 2:
                            raw_ingredients.append(cleaned)

                    # Fallback: parse the meal name itself (for plans without ingredients)
                    name = meal.get("name", "")
                    name = re.sub(r'^(breakfast|lunch|dinner|snack)\s*[:–\-]\s*', '', name, flags=re.I)
                    parts = re.split(r'\s*[+&,]\s*|\s+with\s+|\s+and\s+', name, flags=re.I)
                    for part in parts:
                        part = part.strip()
                        if len(part) > 2:
                            raw_ingredients.append(part)
    except Exception:
        pass

    # Deduplicate by ingredient root — collapses "Spinach Salad", "Baby Spinach",
    # "Spinach Omelette Starter" all down to one "spinach" entry.
    # Parts with no ingredient root that are clearly prepared dishes are dropped.
    seen_roots: set[str] = set()
    unique: list[str] = []
    for ing in raw_ingredients:
        root = _root_key(ing)
        # If no root was found and the part contains a prepared-dish term, skip it
        # (e.g. "Herb Omelet", "Tofu Stir-fry Bowl" with no known ingredient root).
        if root == ing.lower():
            words = set(ing.lower().split())
            if words & _PREPARED_DISH_TERMS:
                continue
        if root not in seen_roots:
            seen_roots.add(root)
            # Use the root itself as the search term for a cleaner DB match
            unique.append(root if root != ing.lower() else ing)

    # Look up each ingredient in the USDA food DB.
    # Rules:
    #   - Exclude survey/sub-sample data types (as-eaten dishes, not raw groceries)
    #   - Prefer foundation_food / sr_legacy_food over branded
    #   - Prefer descriptions that start with the ingredient word
    #   - Prefer shorter descriptions (less preparation detail)
    results: list[dict] = []
    seen_ids: set[int] = set()
    excluded = tuple(_PREPARED_DATA_TYPES)
    for ing in unique:
        # Match whole words only — "salmon" must not match "Salmonberries".
        # Fetch a few candidates so we can filter out processed products (dip, rings…).
        rows = fetch_all(
            """
            SELECT fdc_id, description, data_type FROM food
            WHERE description ~* %s
              AND data_type NOT IN %s
            ORDER BY
                CASE WHEN description ILIKE %s THEN 0 ELSE 1 END,
                CASE data_type
                    WHEN 'foundation_food' THEN 1
                    WHEN 'sr_legacy_food'  THEN 2
                    ELSE 7
                END,
                char_length(description)
            LIMIT 5
            """,
            (rf"(^|[^a-z]){_re.escape(ing)}(s|es)?([^a-z]|$)", excluded, f"{ing}%"),
        )
        # Skip rows whose description looks like a processed product (dip, rings, etc.)
        rows = [r for r in rows if not _PROCESSED_DESC_RE.search(r["description"])]
        if rows:
            fid = int(rows[0]["fdc_id"])
            if fid not in seen_ids:
                seen_ids.add(fid)
                results.append({"fdc_id": fid, "name": _display_name(rows[0]["description"])})
        elif ing not in _PREPARED_DISH_TERMS:
            # Only add a fallback entry if the term itself isn't a dish
            results.append({"fdc_id": 0, "name": ing.title()})

    return results


def _categorise(name: str) -> str:
    lower = name.lower()
    for keywords, category in _CATEGORY_RULES:
        if any(k in lower for k in keywords):
            return category
    return "Other"


def derive_grocery_list(selected_foods: list[dict]) -> dict:
    grocery_list: dict[str, list[dict]] = {}

    for food in selected_foods:
        fid = int(food["fdc_id"])
        name = food["name"]
        category = _categorise(name)
        serving_size_g = _DEFAULT_SERVING_G.get(category, 300.0)
        quantity_needed = _DEFAULT_QTY.get(category, 2)

        # Override serving size for items that are sold in specific retail units
        # (e.g. garlic = 1 head ≈ 50g, not the 300g Produce default)
        name_lower = name.lower()
        for kw, (_, override_g) in _RETAIL_UNIT_OVERRIDES.items():
            if kw in name_lower:
                serving_size_g = override_g
                break

        grocery_list.setdefault(category, []).append({
            "name": name,
            "fdc_id": fid,
            "quantity_needed": quantity_needed,
            "serving_size_g": round(serving_size_g, 1),
        })

    return {"grocery_list": grocery_list}


def search_foods(query: str, profile_id: str | None = None, limit: int = 20) -> list[dict]:
    candidates = fetch_all(
        """
        SELECT fdc_id, description, data_type FROM food
        WHERE description ILIKE %s
        ORDER BY CASE data_type
            WHEN 'foundation_food'    THEN 1
            WHEN 'sr_legacy_food'     THEN 2
            WHEN 'survey_fndds_food'  THEN 3
            WHEN 'sub_sample_food'    THEN 4
            WHEN 'market_acquistion'  THEN 5
            WHEN 'sample_food'        THEN 6
            ELSE 7
        END
        LIMIT 100
        """,
        (f"%{query}%",),
    )
    if not candidates:
        return []

    # Fetch user's cuisine preferences and allergens in parallel
    cuisine_keywords: list[str] = []
    if profile_id:
        allergy_rows = fetch_all(
            "SELECT allergen FROM user_allergy WHERE profile_id = %s", (profile_id,)
        )
        allergens = [r["allergen"].lower() for r in allergy_rows]
        if allergens:
            candidates = [
                c for c in candidates
                if not any(a in c["description"].lower() for a in allergens)
            ]

        dietary_rows = fetch_all(
            "SELECT preference FROM user_dietary_preference WHERE profile_id = %s", (profile_id,)
        )
        bad_keywords: set[str] = set()
        for row in dietary_rows:
            rules = DIETARY_FILTER_RULES.get(row["preference"], {})
            bad_keywords.update(rules.get("bad_keywords", []))
        if bad_keywords:
            candidates = [
                c for c in candidates
                if not any(kw in c["description"].lower() for kw in bad_keywords)
            ]

        cuisine_rows = fetch_all(
            "SELECT cuisine FROM user_cuisine_preference WHERE profile_id = %s", (profile_id,)
        )
        for row in cuisine_rows:
            keywords = _CUISINE_KEYWORDS.get(row["cuisine"], [])
            cuisine_keywords.extend(keywords)

    if not candidates:
        return []

    fdc_ids = [int(r["fdc_id"]) for r in candidates]

    # Fetch key nutrients for all candidates in one query
    nutrient_rows = fetch_all(
        "SELECT fdc_id, nutrient_id, amount FROM food_nutrient WHERE fdc_id = ANY(%s) AND nutrient_id = ANY(%s)",
        (fdc_ids, _NUTRIENT_IDS),
    )

    nutrient_map: dict[int, dict[str, float]] = {}
    for row in nutrient_rows:
        fid = int(row["fdc_id"])
        dv_key = NUTRIENT_ID_MAP.get(int(row["nutrient_id"]))
        if dv_key and row["amount"] is not None:
            nutrient_map.setdefault(fid, {})[dv_key] = float(row["amount"])

    # Load user's personalized DV (fall back to RDI baseline)
    dv: dict[str, float] = dict(_RDI_BASE)
    if profile_id:
        dv_row = fetch_one(
            "SELECT * FROM user_calculated_dv WHERE profile_id = %s", (profile_id,)
        )
        if dv_row:
            dv = {}
            for k, v in dv_row.items():
                if k == "profile_id" or v is None:
                    continue
                try:
                    dv[k] = float(v)
                except (TypeError, ValueError):
                    pass

    query_lower = query.lower()
    results = []
    for food in candidates:
        fid = int(food["fdc_id"])
        nutrients = nutrient_map.get(fid, {})
        raw = score_food(nutrients, dv)
        scaled = round(min(100.0, max(0.0, raw * 25)), 1)

        top = sorted(
            [k for k in nutrients if k in _BENEFICIAL and dv.get(k, 0) > 0],
            key=lambda k: nutrients[k] / dv[k],
            reverse=True,
        )[:3]

        name_lower = food["description"].lower()

        # Prefer whole / survey foods over branded processed products
        if food["data_type"] in (
            "sr_legacy_food", "foundation_food", "survey_fndds_food",
            "sub_sample_food", "market_acquistion", "sample_food",
        ):
            scaled = min(100.0, scaled + 20.0)

        # Reward descriptions that start with the query term (e.g. "Chicken, breast"
        # over "Adobo Chicken Wrap") — gives a clear whole-food preference
        if name_lower.startswith(query_lower):
            scaled = min(100.0, scaled + 10.0)

        # Penalise organ meats, necks, and other non-grocery-store items
        if any(term in name_lower for term in _NON_GROCERY_TERMS):
            scaled = max(0.0, scaled - 40.0)

        # Boost score for culturally relevant foods
        if cuisine_keywords and any(kw in name_lower for kw in cuisine_keywords):
            scaled = min(100.0, scaled + 15.0)

        results.append({
            "fdc_id": fid,
            "name": _display_name(food["description"]),
            "data_type": food["data_type"],
            "score": scaled,
            "top_nutrients": [_NUTRIENT_LABELS.get(k, k) for k in top],
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]
