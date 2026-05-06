import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import { getGroceryHistory, getGroceryListDetail, type SavedListMeta } from "@/lib/api";
import { categoryIcon } from "@/lib/categories";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";

interface DetailCache {
  [listId: string]: Record<string, unknown[]>;
}

const SavedLists = () => {
  const { authToken, setScreen, setReturnScreen, reset } = useApp();

  const [history, setHistory] = useState<SavedListMeta[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<DetailCache>({});

  useEffect(() => {
    if (!authToken) {
      setReturnScreen(8);
      setScreen(6);
    }
  }, [authToken, setScreen, setReturnScreen]);

  useEffect(() => {
    if (!authToken) return;
    getGroceryHistory()
      .then(setHistory)
      .catch((e) => setHistoryError(e instanceof Error ? e.message : "Failed to load history"))
      .finally(() => setLoadingHistory(false));
  }, [authToken]);

  const toggleExpand = async (listId: string) => {
    if (expandedId === listId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(listId);
    if (detailCache[listId]) return;
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const detail = await getGroceryListDetail(listId);
      setDetailCache((c) => ({ ...c, [listId]: detail.grocery_list as Record<string, unknown[]> }));
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (loadingHistory) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner message="Loading saved lists…" /></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-8 pb-4 max-w-xl mx-auto w-full">
        <h1 className="text-3xl font-bold">Saved Lists</h1>
        <p className="text-sm text-muted-foreground mt-1">Your previously saved grocery lists.</p>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-5 pb-32 space-y-3">
        {historyError && <ErrorAlert message={historyError} onDismiss={() => setHistoryError(null)} />}
        {detailError && <ErrorAlert message={detailError} onDismiss={() => setDetailError(null)} />}

        {history.length === 0 && !historyError && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No saved lists yet. Generate a grocery list and save it!
          </p>
        )}

        {history.map((item) => {
          const isOpen = expandedId === item.list_id;
          const detail = detailCache[item.list_id];
          const categories = detail ? Object.entries(detail) : [];

          return (
            <div key={item.list_id} className="border border-foreground rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(item.list_id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-2 transition-colors"
              >
                <div>
                  <p className="font-semibold text-sm">{formatDate(item.saved_at)}</p>
                  <p className="text-xs text-muted-foreground">${item.total_estimated_cost_usd.toFixed(2)} estimated total</p>
                </div>
                <span className={`text-sm transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              {isOpen && (
                <div className="border-t border-foreground px-4 pb-4 pt-3 space-y-4">
                  {loadingDetail && !detail && <Spinner message="Loading items…" />}
                  {categories.map(([cat, items]) => (
                    <section key={cat} className="space-y-2">
                      <h3 className="font-semibold text-sm border-b border-foreground pb-1">
                        {categoryIcon(cat)} {cat}
                      </h3>
                      <ul className="space-y-1">
                        {(items as Record<string, unknown>[]).map((it, i) => {
                          const name = String(it.name ?? it.description ?? "Item");
                          const qty = it.quantity_needed != null ? Number(it.quantity_needed) : null;
                          const price = it.estimated_unit_price_usd != null ? Number(it.estimated_unit_price_usd) : null;
                          const lineTotal = qty != null && price != null ? qty * price : null;
                          return (
                            <li key={i} className="flex items-center justify-between text-sm py-0.5">
                              <span>{name}</span>
                              <span className="text-muted-foreground tabular-nums text-xs">
                                {qty != null && price != null
                                  ? `x${qty} × $${price.toFixed(2)}${lineTotal != null ? ` = $${lineTotal.toFixed(2)}` : ""}`
                                  : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-foreground">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <button type="button" onClick={() => setScreen(5)} className="fb-btn-outline">Back</button>
          <button type="button" onClick={() => { reset(); setScreen(1); }} className="fb-btn flex-1">Start Over</button>
        </div>
      </footer>
    </div>
  );
};

export default SavedLists;
