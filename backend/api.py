"""
FoodBridge FastAPI backend.

Steps 1 & 2 hit the DB directly.
Steps 3-5 will be handled by a LangChain agent (coming soon).
"""

import asyncio
import uuid

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
import auth_db
import user
import planner
from dependencies import get_current_user
from grocery_api import _ensure_zip_cache_table

app = FastAPI(title="FoodBridge API", version="0.1.0")

@app.on_event("startup")
def _startup() -> None:
    _ensure_zip_cache_table()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Step 1: Profile ───────────────────────────────────────────────────────────

class ProfileRequest(BaseModel):
    session_id: str | None = None
    height_cm: float
    weight_kg: float
    age: int
    sex: str
    activity_level: str
    smoking_status: str
    household_size_adults: int = 1
    household_size_children: int = 0
    health_goals: list[str] = []
    health_conditions: list[str] = []
    medications: list[str] = []


class ProfileResponse(BaseModel):
    session_id: str
    profile_id: str


@app.post("/profile", response_model=ProfileResponse)
def create_profile(req: ProfileRequest):
    session_id = req.session_id or str(uuid.uuid4())
    try:
        profile_id = user.create_profile(
            height_cm=req.height_cm,
            weight_kg=req.weight_kg,
            age=req.age,
            sex=req.sex,
            activity_level=req.activity_level,
            smoking_status=req.smoking_status,
            household_size_adults=req.household_size_adults,
            household_size_children=req.household_size_children,
            health_goals=req.health_goals,
            health_conditions=req.health_conditions,
            medications=req.medications,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return ProfileResponse(session_id=session_id, profile_id=profile_id)


# ── Step 2: Preferences ───────────────────────────────────────────────────────

class PreferencesRequest(BaseModel):
    session_id: str | None = None
    profile_id: str
    weekly_budget_usd: float
    zip_code: str
    dietary_preferences: list[str] = []
    allergies: list[str] = []
    cuisine_preferences: list[str] = []
    wic_filter_active: bool = False


@app.post("/preferences")
def save_preferences(req: PreferencesRequest):
    try:
        user.save_preferences(
            profile_id=req.profile_id,
            weekly_budget_usd=req.weekly_budget_usd,
            zip_code=req.zip_code,
            dietary_preferences=req.dietary_preferences,
            allergies=req.allergies,
            cuisine_preferences=req.cuisine_preferences,
            wic_filter_active=req.wic_filter_active,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"status": "ok"}


# ── Step 3: Food search ───────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    profile_id: str | None = None


class FoodResult(BaseModel):
    fdc_id: int
    name: str
    data_type: str | None = None
    score: float
    top_nutrients: list[str]


@app.post("/search", response_model=list[FoodResult])
def search_foods(req: SearchRequest):
    try:
        results = user.search_foods(req.query, profile_id=req.profile_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return results


# ── Step 4: Meal plan ────────────────────────────────────────────────────────

class SelectedFood(BaseModel):
    fdc_id: int
    name: str


class MealPlanRequest(BaseModel):
    profile_id: str
    selected_foods: list[SelectedFood]


@app.post("/meal-plan")
def meal_plan(req: MealPlanRequest):
    try:
        result = planner.generate_meal_plan(
            req.profile_id,
            [f.model_dump() for f in req.selected_foods],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"response": result}


# ── Step 5: Grocery list ──────────────────────────────────────────────────────

class GroceryListRequest(BaseModel):
    profile_id: str
    selected_foods: list[SelectedFood]
    meal_plan_text: str | None = None


async def _price_items(
    grocery_list_data: dict,
    zip_code: str | None,
) -> tuple[list[dict], float]:
    """Price all items; annotate each with _category; return (all_items, budget_total).
    Spices & Pantry items are priced but excluded from budget_total."""
    from grocery_api import get_grocery_price

    all_items: list[dict] = []
    for cat, items in grocery_list_data.items():
        if isinstance(items, list):
            for it in items:
                it["_category"] = cat
                all_items.append(it)

    prices = await asyncio.gather(
        *[get_grocery_price(it.get("name", ""), float(it.get("serving_size_g", 100)), zip_code)
          for it in all_items],
        return_exceptions=True,
    )

    budget_total = 0.0
    for item, price_result in zip(all_items, prices):
        if isinstance(price_result, Exception):
            item["estimated_unit_price_usd"] = 0.0
            item["price_source"] = "unavailable"
        else:
            qty = max(1, min(int(item.get("quantity_needed", 1)), 10))
            item["quantity_needed"] = qty
            item["estimated_unit_price_usd"] = price_result["estimated_price_usd"]
            item["price_source"] = price_result["source"]
            item["image_url"] = price_result.get("image_url")
            if item.get("_category") != "Spices & Pantry":
                budget_total += price_result["estimated_price_usd"] * qty

    return all_items, budget_total


async def _substitute_for_budget(
    meal_plan_text: str,
    all_items: list[dict],
    total: float,
    budget: float,
) -> str:
    """Call Claude Haiku to swap expensive meal ingredients for cheaper ones."""
    import anthropic, json as _json

    overage = total - budget
    non_spice = [it for it in all_items if it.get("_category") != "Spices & Pantry"]
    expensive = sorted(
        non_spice,
        key=lambda x: x.get("estimated_unit_price_usd", 0) * x.get("quantity_needed", 1),
        reverse=True,
    )[:5]
    expensive_str = ", ".join(
        f"{it['name']} (${it.get('estimated_unit_price_usd', 0) * it.get('quantity_needed', 1):.2f})"
        for it in expensive
    )
    prompt = (
        f"The grocery list for this meal plan costs ${total:.2f} against a ${budget:.2f} "
        f"weekly budget (${overage:.2f} over).\n\n"
        f"Most expensive items: {expensive_str}\n\n"
        f"Meal plan:\n{meal_plan_text}\n\n"
        "Update this meal plan to use cheaper ingredient substitutions to bring total cost within budget.\n"
        "Rules:\n"
        "- Keep the exact 7-day structure with 3 meals per day\n"
        "- Replace expensive proteins (salmon, shrimp, steak) with cheaper alternatives "
        "(chicken thighs, canned tuna, eggs, lentils, beans)\n"
        "- Keep all 7 fields per meal: name, prep_time, cook_time, temperature, servings, "
        "ingredients (with precise spice quantities), steps\n"
        "- Only change meals that use the expensive ingredients — leave affordable meals unchanged\n"
        "- Return ONLY the raw JSON object, no prose, no code fences"
    )
    try:
        client = anthropic.Anthropic()
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text
    except Exception:
        return meal_plan_text


@app.post("/grocery-list")
async def grocery_list(req: GroceryListRequest):
    try:
        if req.meal_plan_text:
            foods = user.extract_ingredients_from_meal_plan(req.meal_plan_text)
        else:
            foods = [f.model_dump() for f in req.selected_foods]
        data = user.derive_grocery_list(foods)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    grocery_list_data = data.get("grocery_list", {})

    # Resolve user's zip for location-accurate Kroger prices
    zip_code: str | None = None
    try:
        zip_code = user.get_user_zip(req.profile_id)
    except Exception:
        pass

    # Fetch user's weekly budget
    budget: float | None = None
    try:
        from db import fetch_one as _fetch_one
        row = _fetch_one(
            "SELECT weekly_budget_usd FROM user_grocery_preference WHERE profile_id = %s",
            (req.profile_id,),
        )
        if row and row.get("weekly_budget_usd"):
            budget = float(row["weekly_budget_usd"])
    except Exception:
        pass

    # Price all items; Spices & Pantry excluded from budget total
    all_items, total = await _price_items(grocery_list_data, zip_code)

    # If over budget by more than $10, try swapping expensive ingredients first
    budget_adjusted = False
    if budget and total > budget + 10 and req.meal_plan_text:
        updated_plan = await _substitute_for_budget(req.meal_plan_text, all_items, total, budget)
        try:
            sub_foods = user.extract_ingredients_from_meal_plan(updated_plan)
            sub_data = user.derive_grocery_list(sub_foods)
            sub_list_data = sub_data.get("grocery_list", {})
            sub_all_items, sub_total = await _price_items(sub_list_data, zip_code)
            if sub_total < total:
                grocery_list_data = sub_list_data
                all_items = sub_all_items
                total = sub_total
                budget_adjusted = True
        except Exception:
            pass  # substitution failed; fall through to quantity pruner

    # If still over budget by more than $10, prune quantities then items
    if budget and total > budget + 10:
        budget_adjusted = True
        non_spice_items = [it for it in all_items if it.get("_category") != "Spices & Pantry"]

        # Pass 1: reduce quantities proportionally (floor at 1)
        scale = (budget + 10) / total
        for item in non_spice_items:
            if item.get("estimated_unit_price_usd", 0) > 0:
                item["quantity_needed"] = max(1, round(item["quantity_needed"] * scale))
        total = sum(
            it.get("estimated_unit_price_usd", 0) * it.get("quantity_needed", 1)
            for it in non_spice_items
        )

        # Pass 2: drop most expensive non-spice items until within $10 of budget
        if total > budget + 10:
            flat = sorted(
                [(it, it.get("estimated_unit_price_usd", 0) * it.get("quantity_needed", 1))
                 for it in non_spice_items],
                key=lambda x: x[1], reverse=True,
            )
            for item, item_cost in flat:
                if total <= budget + 10:
                    break
                for cat_items in grocery_list_data.values():
                    if isinstance(cat_items, list) and item in cat_items:
                        cat_items.remove(item)
                        break
                total -= item_cost

        total = sum(
            it.get("estimated_unit_price_usd", 0) * it.get("quantity_needed", 1)
            for cat_items in grocery_list_data.values()
            if isinstance(cat_items, list)
            for it in cat_items
            if it.get("_category") != "Spices & Pantry"
        )

    # Strip internal _category annotation before returning
    for cat_items in grocery_list_data.values():
        if isinstance(cat_items, list):
            for it in cat_items:
                it.pop("_category", None)

    budget_over_by = round(total - budget, 2) if budget and total > budget else 0.0

    return {
        "total_estimated_cost_usd": round(total, 2),
        "grocery_list": grocery_list_data,
        "budget_adjusted": budget_adjusted,
        "budget_over_by": budget_over_by,
    }


class ResetRequest(BaseModel):
    session_id: str


@app.post("/reset")
def reset(req: ResetRequest):
    return {"session_id": req.session_id, "status": "cleared"}


# ── Auth ──────────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    username: str
    email: str
    password: str
    profile_id: str | None = None


class LoginRequest(BaseModel):
    identifier: str
    password: str


class AuthUserResponse(BaseModel):
    user_id: str
    username: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: AuthUserResponse


@app.post("/auth/signup", response_model=AuthResponse)
async def signup(req: SignupRequest):
    try:
        auth.validate_password_rules(req.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    password_hash = await asyncio.get_event_loop().run_in_executor(
        None, auth.hash_password, req.password
    )

    try:
        user_id = auth_db.create_auth_user(req.username, req.email, password_hash)
    except Exception as exc:
        msg = str(exc).lower()
        if "username" in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        if "email" in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    if req.profile_id:
        try:
            auth_db.link_profile_to_user(req.profile_id, user_id)
        except Exception:
            pass  # non-fatal — profile link is best-effort

    access_token = auth.create_access_token(user_id)
    refresh_token = auth.create_refresh_token(user_id)
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=AuthUserResponse(user_id=user_id, username=req.username),
    )


@app.post("/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    row = auth_db.get_auth_user_by_identifier(req.identifier)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    match = await asyncio.get_event_loop().run_in_executor(
        None, auth.verify_password, req.password, row["password_hash"]
    )
    if not match:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user_id = str(row["user_id"])
    access_token = auth.create_access_token(user_id)
    refresh_token = auth.create_refresh_token(user_id)
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=AuthUserResponse(user_id=user_id, username=row["username"]),
    )


class RefreshRequest(BaseModel):
    refresh_token: str


@app.post("/auth/refresh")
def refresh_token(req: RefreshRequest):
    user_id = auth.decode_refresh_token(req.refresh_token)
    user = auth_db.get_auth_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    new_access = auth.create_access_token(user_id)
    new_refresh = auth.create_refresh_token(user_id)
    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
    }


@app.get("/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "user_id": str(current_user["user_id"]),
        "username": current_user["username"],
        "created_at": current_user["created_at"].isoformat() if current_user.get("created_at") else None,
    }


# ── Grocery list persistence ──────────────────────────────────────────────────

class SaveGroceryListRequest(BaseModel):
    total_estimated_cost_usd: float
    grocery_list: dict
    meal_plan_json: dict | None = None


@app.post("/grocery-list/save")
def save_grocery_list(
    req: SaveGroceryListRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        list_id = auth_db.save_grocery_list(
            user_id=str(current_user["user_id"]),
            total=req.total_estimated_cost_usd,
            items_by_category=req.grocery_list,
            meal_plan_data=req.meal_plan_json,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    return {"list_id": list_id}


@app.get("/grocery-list/history")
def grocery_list_history(current_user: dict = Depends(get_current_user)):
    try:
        return auth_db.get_grocery_list_history(str(current_user["user_id"]))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@app.get("/grocery-list/history/{list_id}")
def grocery_list_detail(list_id: str, current_user: dict = Depends(get_current_user)):
    detail = auth_db.get_grocery_list_detail(list_id, str(current_user["user_id"]))
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    return detail


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}
