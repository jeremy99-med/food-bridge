import { useApp } from "@/store/app";

const SESSION_KEY = "foodbridge_session_id";

export const getSessionId = (): string | null => localStorage.getItem(SESSION_KEY);
export const setSessionId = (id: string) => localStorage.setItem(SESSION_KEY, id);
export const clearSessionId = () => localStorage.removeItem(SESSION_KEY);

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "http://localhost:8000";

let _refreshing: Promise<void> | null = null;

async function _doRefresh(): Promise<void> {
  const { refreshToken, setAccessToken, clearAuth } = useApp.getState();
  if (!refreshToken) { clearAuth(); return; }
  try {
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) { clearAuth(); return; }
    const data = await res.json() as { access_token: string; refresh_token: string };
    setAccessToken(data.access_token, data.refresh_token);
  } catch {
    clearAuth();
  }
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  authed = false,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authed) {
    const token = useApp.getState().authToken;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // On 401 for authed requests, attempt one token refresh then retry
  if (res.status === 401 && authed) {
    if (!_refreshing) _refreshing = _doRefresh().finally(() => { _refreshing = null; });
    await _refreshing;
    const newToken = useApp.getState().authToken;
    if (!newToken) throw new Error("Session expired. Please sign in again.");
    const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
    const retry = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: retryHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!retry.ok) {
      let detail = `Server error ${retry.status}`;
      try { const b = await retry.json(); if (b.detail) detail = b.detail; } catch { /* ignore */ }
      throw new Error(detail);
    }
    return retry.json();
  }

  if (!res.ok) {
    let detail = `Server error ${res.status}`;
    try { const b = await res.json(); if (b.detail) detail = b.detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

function authedPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body, true);
}

function authedGet<T>(path: string): Promise<T> {
  return request<T>("GET", path, undefined, true);
}

// ── Step 1: Profile ───────────────────────────────────────────────────────────

export interface ProfileResponse {
  session_id: string;
  profile_id: string;
}

export async function createProfile(data: {
  height_cm: number;
  weight_kg: number;
  age: number;
  sex: string;
  activity_level: string;
  smoking_status: string;
  household_size_adults: number;
  household_size_children: number;
  health_goals: string[];
  health_conditions: string[];
  medications: string[];
}): Promise<ProfileResponse> {
  const result = await post<ProfileResponse>("/profile", {
    ...data,
    session_id: getSessionId() ?? undefined,
  });
  setSessionId(result.session_id);
  return result;
}

// ── Step 2: Preferences ───────────────────────────────────────────────────────

export async function savePreferences(data: {
  profile_id: string;
  weekly_budget_usd: number;
  zip_code: string;
  dietary_preferences: string[];
  allergies: string[];
  cuisine_preferences: string[];
  wic_filter_active: boolean;
}): Promise<void> {
  await post("/preferences", {
    ...data,
    session_id: getSessionId() ?? undefined,
  });
}

// ── Step 3: Food search ───────────────────────────────────────────────────────

export interface FoodResult {
  fdc_id: number;
  name: string;
  data_type: string | null;
  score: number;
  top_nutrients: string[];
}

export async function searchFoods(query: string, profileId?: string): Promise<FoodResult[]> {
  return post<FoodResult[]>("/search", { query, profile_id: profileId ?? null });
}

// ── Step 4: Meal plan ─────────────────────────────────────────────────────────

export async function generateMealPlan(
  profileId: string,
  selectedFoods: { fdc_id: number; name: string }[],
): Promise<string> {
  const res = await post<{ response: string }>("/meal-plan", {
    profile_id: profileId,
    selected_foods: selectedFoods,
  });
  return res.response;
}

// ── Step 5: Grocery list ──────────────────────────────────────────────────────

export async function generateGroceryList(
  profileId: string,
  selectedFoods: { fdc_id: number; name: string }[],
  mealPlanText?: string,
): Promise<string> {
  const res = await post<{ total_estimated_cost_usd: number; grocery_list: unknown }>(
    "/grocery-list",
    { profile_id: profileId, selected_foods: selectedFoods, meal_plan_text: mealPlanText },
  );
  return JSON.stringify(res);
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export async function resetSession(): Promise<void> {
  clearSessionId();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  user_id: string;
  username: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

export async function signup(data: {
  username: string;
  email: string;
  password: string;
  profile_id?: string;
}): Promise<AuthResponse> {
  return post<AuthResponse>("/auth/signup", data);
}

export async function login(data: {
  identifier: string;
  password: string;
}): Promise<AuthResponse> {
  return post<AuthResponse>("/auth/login", data);
}

export async function getMe(): Promise<AuthUser & { created_at: string }> {
  return authedGet("/auth/me");
}

// ── Grocery list persistence ──────────────────────────────────────────────────

export interface SavedListMeta {
  list_id: string;
  total_estimated_cost_usd: number;
  saved_at: string;
}

export async function saveGroceryList(data: {
  total_estimated_cost_usd: number;
  grocery_list: Record<string, unknown[]>;
  meal_plan_json?: object | null;
}): Promise<{ list_id: string }> {
  return authedPost("/grocery-list/save", data);
}

export async function getGroceryHistory(): Promise<SavedListMeta[]> {
  return authedGet("/grocery-list/history");
}

export async function getGroceryListDetail(listId: string): Promise<{
  list_id: string;
  total_estimated_cost_usd: number;
  saved_at: string;
  grocery_list: Record<string, unknown[]>;
  meal_plan: Record<string, unknown> | null;
}> {
  return authedGet(`/grocery-list/history/${listId}`);
}
