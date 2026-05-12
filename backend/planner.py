"""
LangChain agents for step 4 (meal plan) and step 5 (grocery list).
"""
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import create_react_agent

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

_DB_URI = (
    f"postgresql+psycopg2://"
    f"{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}"
    f"@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5433')}"
    f"/{os.getenv('POSTGRES_DB')}"
)

_llm = ChatAnthropic(
    model="claude-haiku-4-5-20251001",
    anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
    temperature=0,
)

_db = None
_tools = None
_meal_plan_agent = None

def _ensure_initialized():
    global _db, _tools, _meal_plan_agent
    if _db is not None:
        return
    _db = SQLDatabase.from_uri(
        _DB_URI,
        include_tables=[
            "food", "food_category", "food_nutrient", "nutrient", "branded_food",
            "user_profile", "user_calculated_dv",
            "user_grocery_preference", "user_dietary_preference", "user_allergy",
            "user_medication", "user_health_condition",
        ],
        sample_rows_in_table_info=2,
    )
    _tools = SQLDatabaseToolkit(db=_db, llm=_llm).get_tools()
    _meal_plan_agent = create_react_agent(_llm, _tools, prompt=_MEAL_PLAN_PROMPT)

_MEAL_PLAN_PROMPT = SystemMessage(content="""You are FoodBridge, a nutrition and meal planning assistant.
You have read-only access to a USDA FoodData Central database via SQL tools.

Key tables:
- food: fdc_id, description, data_type
- food_nutrient: fdc_id, nutrient_id, amount  (per 100g)
- nutrient: id, name, unit_name
- branded_food: fdc_id, brand_name, serving_size
- user_calculated_dv: profile_id + 17 nutrient daily value targets
- user_dietary_preference, user_allergy: user restrictions
- user_medication: profile_id, medication_name — medications the user takes
- user_health_condition: profile_id, condition_name — diagnosed conditions

HARD CONSTRAINTS — query ALL of these tables before building the plan:

1. ALLERGIES (user_allergy): NEVER include any food containing the user's allergens. No exceptions.

2. DIETARY PREFERENCES (user_dietary_preference): substitute conflicting foods, never skip them.

3. MEDICATIONS & CONDITIONS (user_medication, user_health_condition):
   Apply these substitution rules when medications or conditions are present.
   ALWAYS substitute — NEVER leave a meal or day blank.

   Insulin / diabetes / metformin / type 2 diabetes:
   - AVOID: candy, soda, juice, sugar, syrup, white bread, white rice, pastry, cookies, cake, donuts, chips, crackers, sweetened cereals, dried fruit, honey, jam
   - SUBSTITUTE WITH: oats, quinoa, brown rice, sweet potato, lentils, chickpeas, leafy greens, nuts, eggs, Greek yogurt, berries, avocado, salmon, chicken breast
   - If a selected food is high-sugar (contains "sugar", "syrup", "candy", "soda", "juice", "cookie", "cake", "donut"), replace it with a low-GI alternative from the food table.

   Blood pressure medication / hypertension / lisinopril / amlodipine:
   - AVOID: high-sodium foods (>600mg sodium per serving), processed meats, canned soups, pickles, soy sauce
   - SUBSTITUTE WITH: fresh fruits, vegetables, whole grains, lean proteins, low-sodium options

   Blood thinners / warfarin / coumadin:
   - AVOID: large amounts of kale, spinach, or other very high vitamin K greens
   - SUBSTITUTE WITH: other vegetables like broccoli, carrots, peas in moderate amounts

   Statins / cholesterol medication:
   - AVOID: saturated fat-heavy foods, fried foods, full-fat dairy in excess
   - SUBSTITUTE WITH: oats, beans, nuts, olive oil, lean proteins, fish

   General rule: If ANY medication or condition is present, always query user_medication and user_health_condition,
   apply the appropriate substitutions, and document every swap in suggested_swaps.
   A meal plan with blank days is NEVER acceptable — always find a compliant substitute.

General rules:
- Only SELECT queries. Never modify data.
- Limit all queries to 20 rows max.
- Return raw JSON only — no markdown, no prose, no explanation.

Return ONLY this exact JSON shape:
{
  "days": [
    {"day": "Day 1", "meals": [{"name": "Breakfast: Oats + Yogurt"}, {"name": "Lunch: Tofu Stir-fry + Broccoli"}, {"name": "Dinner: Lentil Soup + Rice"}]}
  ],
  "nutrient_coverage": {"calories_kcal": 95, "protein_g": 110, "fiber_g": 88},
  "suggested_swaps": [{"original": "Candy Bar", "replacement": "Mixed Berries", "reason": "Substituted — user takes insulin; high-sugar foods replaced with low-GI alternatives"}],
  "alternatives": {
    "breakfast": [
      {"name": "Greek Yogurt Parfait with Berries"},
      {"name": "Scrambled Eggs with Spinach"},
      {"name": "Overnight Oats with Chia Seeds"},
      {"name": "Avocado Toast on Whole Grain Bread"},
      {"name": "Cottage Cheese with Flaxseed and Fruit"}
    ],
    "lunch": [
      {"name": "Grilled Chicken Salad with Olive Oil"},
      {"name": "Lentil and Vegetable Soup"},
      {"name": "Brown Rice Bowl with Edamame and Vegetables"},
      {"name": "Turkey and Avocado Wrap on Whole Grain"},
      {"name": "Quinoa Tabbouleh with Chickpeas"}
    ],
    "dinner": [
      {"name": "Baked Salmon with Roasted Broccoli"},
      {"name": "Chicken Stir-fry with Brown Rice"},
      {"name": "Black Bean Tacos on Corn Tortillas"},
      {"name": "Turkey Meatballs with Zucchini Noodles"},
      {"name": "Lentil Dal with Cauliflower Rice"}
    ]
  }
}

CRITICAL: The "alternatives" key MUST be present in your response. All 15 alternatives must
satisfy the SAME allergy, dietary preference, medication, and health condition constraints
applied to the main meal plan. Do not repeat any meal from the main plan in alternatives.
Exactly 5 alternatives per meal type (breakfast, lunch, dinner).""")


def _extract_json(text: str) -> str:
    """Extract the first valid JSON object containing 'days' from agent output."""
    # Try code fences first (```json ... ``` or ``` ... ```)
    for m in re.finditer(r'```(?:json)?\s*\n?(\{.+?\})\s*\n?```', text, re.DOTALL):
        candidate = m.group(1)
        try:
            obj = json.loads(candidate)
            if "days" in obj:
                return candidate
        except json.JSONDecodeError:
            pass
    # Fall back to raw brace scan
    for m in re.finditer(r'\{', text):
        start = m.start()
        depth = 0
        for i, ch in enumerate(text[start:]):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    candidate = text[start:start + i + 1]
                    try:
                        obj = json.loads(candidate)
                        if "days" in obj:
                            return candidate
                    except json.JSONDecodeError:
                        break
    return text


def generate_meal_plan(profile_id: str, selected_foods: list[dict]) -> str:
    _ensure_initialized()
    foods_str = ", ".join(
        f"{f['name']} (fdc_id: {f['fdc_id']})" for f in selected_foods
    )
    message = (
        f"[profile_id: {profile_id}]\n\n"
        f"Selected foods: {foods_str}\n\n"
        "Step 1: Query user_dietary_preference, user_allergy, user_medication, and user_health_condition for this profile_id.\n"
        "Step 2: For each selected food, check whether it conflicts with dietary preferences, allergies, OR medication/condition rules.\n"
        "Step 3: Any conflicting food MUST be substituted — never skip or leave a meal blank. "
        "For insulin/diabetes: replace high-sugar or high-GI foods with oats, lentils, berries, eggs, leafy greens, or brown rice. "
        "Search the food table to find real substitute names (SELECT description FROM food WHERE description ILIKE '%oats%' LIMIT 5).\n"
        "Step 4: Build a complete 7-day meal plan (all 7 days, 3 meals each) using the substituted foods and the user's daily values.\n"
        "Step 5: Generate the 'alternatives' pool — exactly 5 breakfast, 5 lunch, and 5 dinner options "
        "that satisfy ALL the same allergy, dietary, medication, and condition constraints. "
        "Do NOT repeat any meal already in the 7-day plan.\n"
        "Step 6: Output ONLY the raw JSON object — no prose, no code fences, no explanation before or after."
    )
    result = _meal_plan_agent.invoke({"messages": [{"role": "user", "content": message}]})
    raw = result["messages"][-1].content
    if isinstance(raw, list):
        raw = " ".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in raw
            if not isinstance(block, dict) or block.get("type") == "text"
        )
    return _extract_json(raw)


