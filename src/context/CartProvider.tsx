import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as cartApi from "../api/cartApi";
import type { CheckoutResponse } from "../api/types";

export type CartItem = {
  id: string | number;
  name?: string;
  price?: number;
  quantity: number;
  [key: string]: unknown;
};

export type CartSummary = {
  subtotal: number;
  total: number;
  itemCount: number;
};

export type CartContextValue = {
  items: CartItem[];
  summary: CartSummary;
  tenantId: string;
  addItem: (item: { id: string | number; [key: string]: unknown }, quantity?: number) => void;
  removeItem: (id: CartItem["id"]) => void;
  updateQuantity: (id: CartItem["id"], quantity: number) => void;
  clearCart: () => void;
  /** Only in API mode: loading state for cart fetch/mutations */
  isSyncing: boolean;
  /** Only in API mode: last API error, clear on next success */
  lastError: Error | null;
  /** Only in API mode: merge guest cart into user cart after login */
  mergeGuestCart: () => Promise<void>;
  /** Only in API mode: start checkout, returns redirect URL or order id */
  checkout: (body?: Record<string, unknown>) => Promise<CheckoutResponse>;
};

type CartProviderProps = {
  tenantId: string;
  storageKeyPrefix?: string;
  children: React.ReactNode;
  /** When set, cart is synced with backend (API mode). Requires storeId. */
  apiBaseUrl?: string;
  /** Required when apiBaseUrl is set. */
  storeId?: string;
  /** Optional: return headers for auth (e.g. X-User-Id). When X-User-Id is present, guest id is not sent after merge. */
  getHeaders?: () => Record<string, string>;
};

export const CartContext = createContext<CartContextValue | undefined>(
  undefined,
);

const getStorageKey = (tenantId: string, prefix: string) =>
  `${prefix}:${tenantId}`;

const getGuestCartStorageKey = (tenantId: string, storeId: string) =>
  `cart_guest_id:${tenantId}:${storeId}`;

function isApiMode(apiBaseUrl: string | undefined, storeId: string | undefined): apiBaseUrl is string {
  return typeof apiBaseUrl === "string" && apiBaseUrl.length > 0 && typeof storeId === "string" && storeId.length > 0;
}

export const CartProvider = ({
  tenantId,
  storageKeyPrefix = "cart",
  children,
  apiBaseUrl,
  storeId,
  getHeaders,
}: CartProviderProps) => {
  const storageKey = getStorageKey(tenantId, storageKeyPrefix);
  const hasHydrated = useRef(false);

  const [items, setItems] = useState<CartItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  // API mode: guest cart id (when no X-User-Id)
  const [guestCartId, setGuestCartId] = useState<string | null>(null);

  const apiMode = isApiMode(apiBaseUrl, storeId);

  const effectiveStoreId = storeId ?? "";

  const buildApiOpts = useCallback((): cartApi.CartApiOptions => {
    const headers = getHeaders?.() ?? {};
    const userId = headers["X-User-Id"];
    return {
      tenantId,
      storeId: effectiveStoreId,
      guestCartId: userId ? undefined : guestCartId,
      headers,
    };
  }, [tenantId, effectiveStoreId, guestCartId, getHeaders]);

  const fetchCart = useCallback(async () => {
    if (!apiBaseUrl || !effectiveStoreId) return;
    const opts = buildApiOpts();
    if (!opts.guestCartId && !opts.headers?.["X-User-Id"]) return;
    setIsSyncing(true);
    setLastError(null);
    try {
      const cart = await cartApi.getCartView(apiBaseUrl, opts);
      setItems(cart.items as CartItem[]);
    } catch (err) {
      setLastError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSyncing(false);
    }
  }, [apiBaseUrl, effectiveStoreId, buildApiOpts]);

  // API mode: ensure guest session then fetch cart
  useEffect(() => {
    if (typeof window === "undefined" || !apiMode || !apiBaseUrl || !effectiveStoreId) return;

    let cancelled = false;

    async function init() {
      const baseUrl = apiBaseUrl as string;
      const headers = getHeaders?.() ?? {};
      const opts: cartApi.CartApiOptions = {
        tenantId,
        storeId: effectiveStoreId,
        headers,
        guestCartId: undefined,
      };

      if (headers["X-User-Id"]) {
        opts.guestCartId = undefined;
        setIsSyncing(true);
        setLastError(null);
        try {
          const cart = await cartApi.getCartView(baseUrl, opts);
          if (!cancelled) setItems(cart.items as CartItem[]);
        } catch (err) {
          if (!cancelled) setLastError(err instanceof Error ? err : new Error(String(err)));
        } finally {
          if (!cancelled) setIsSyncing(false);
        }
        return;
      }

      const key = getGuestCartStorageKey(tenantId, effectiveStoreId);
      let guestId: string | null = null;
      try {
        const stored = window.localStorage.getItem(key);
        if (stored) guestId = stored;
      } catch {
        // ignore
      }

      if (!guestId) {
        setIsSyncing(true);
        setLastError(null);
        try {
          guestId = await cartApi.createGuestSession(baseUrl, {
            tenantId,
            storeId: effectiveStoreId,
            headers,
          });
          if (!cancelled) {
            setGuestCartId(guestId);
            try {
              window.localStorage.setItem(key, guestId!);
            } catch {
              // ignore
            }
          }
        } catch (err) {
          if (!cancelled) setLastError(err instanceof Error ? err : new Error(String(err)));
          if (!cancelled) setIsSyncing(false);
          return;
        } finally {
          if (!cancelled) setIsSyncing(false);
        }
      } else if (!cancelled) {
        setGuestCartId(guestId);
      }

      if (!cancelled && guestId) {
        opts.guestCartId = guestId;
        setIsSyncing(true);
        setLastError(null);
        try {
          const cart = await cartApi.getCartView(baseUrl, opts);
          if (!cancelled) setItems(cart.items as CartItem[]);
        } catch (err) {
          if (!cancelled) setLastError(err instanceof Error ? err : new Error(String(err)));
        } finally {
          if (!cancelled) setIsSyncing(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [apiMode, apiBaseUrl, tenantId, effectiveStoreId]);

  // Local-only mode: hydrate from localStorage
  useEffect(() => {
    if (typeof window === "undefined" || apiMode) return;

    hasHydrated.current = false;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(
            parsed.map((item: Record<string, unknown>) => ({
              ...item,
              quantity:
                typeof item.quantity === "number" && item.quantity > 0
                  ? item.quantity
                  : 1,
            })) as CartItem[],
          );
        }
      }
    } catch {
      // ignore
    } finally {
      hasHydrated.current = true;
    }
  }, [storageKey, apiMode]);

  // Local-only mode: persist after hydration
  useEffect(() => {
    if (typeof window === "undefined" || !hasHydrated.current || apiMode) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items, storageKey, apiMode]);

  const summary = useMemo<CartSummary>(() => {
    const itemCount = items.reduce(
      (acc, item) => acc + (item.quantity ?? 1),
      0,
    );
    const subtotal = items.reduce(
      (acc, item) => acc + (item.price ?? 0) * (item.quantity ?? 1),
      0,
    );
    return {
      subtotal,
      total: subtotal,
      itemCount,
    };
  }, [items]);

  const addItem: CartContextValue["addItem"] = useCallback(
    (item, quantity = 1) => {
      if (item == null || item.id === undefined) return;

      if (apiMode && apiBaseUrl && effectiveStoreId) {
        setIsSyncing(true);
        setLastError(null);
        const opts = buildApiOpts();
        cartApi
          .addToCart(apiBaseUrl, opts, {
            tenant_id: tenantId,
            store_id: effectiveStoreId,
            product_id: String(item.id),
            quantity,
          })
          .then(() => fetchCart())
          .catch((err) => setLastError(err instanceof Error ? err : new Error(String(err))))
          .finally(() => setIsSyncing(false));
        return;
      }

      setItems((prev) => {
        const existingIndex = prev.findIndex((existing) => existing.id === item.id);
        if (existingIndex === -1) {
          return [...prev, { ...item, quantity } as CartItem];
        }
        const next = [...prev];
        const existing = next[existingIndex];
        next[existingIndex] = {
          ...existing,
          ...item,
          quantity: (existing.quantity ?? 1) + quantity,
        } as CartItem;
        return next;
      });
    },
    [apiMode, apiBaseUrl, effectiveStoreId, tenantId, buildApiOpts, fetchCart],
  );

  const removeItem: CartContextValue["removeItem"] = useCallback(
    (id) => {
      if (apiMode && apiBaseUrl && effectiveStoreId) {
        setIsSyncing(true);
        setLastError(null);
        const opts = buildApiOpts();
        cartApi
          .removeCartItem(apiBaseUrl, opts, id)
          .then(() => fetchCart())
          .catch((err) => setLastError(err instanceof Error ? err : new Error(String(err))))
          .finally(() => setIsSyncing(false));
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
    },
    [apiMode, apiBaseUrl, effectiveStoreId, buildApiOpts, fetchCart],
  );

  const updateQuantity: CartContextValue["updateQuantity"] = useCallback(
    (id, quantity) => {
      if (quantity <= 0) {
        removeItem(id);
        return;
      }
      if (apiMode && apiBaseUrl && effectiveStoreId) {
        setIsSyncing(true);
        setLastError(null);
        const opts = buildApiOpts();
        cartApi
          .updateCartItem(apiBaseUrl, opts, id, { quantity })
          .then(() => fetchCart())
          .catch((err) => setLastError(err instanceof Error ? err : new Error(String(err))))
          .finally(() => setIsSyncing(false));
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, quantity } : item,
        ),
      );
    },
    [apiMode, apiBaseUrl, effectiveStoreId, buildApiOpts, fetchCart, removeItem],
  );

  const clearCart: CartContextValue["clearCart"] = useCallback(() => {
    if (apiMode && apiBaseUrl && effectiveStoreId) {
      setIsSyncing(true);
      setLastError(null);
      const opts = buildApiOpts();
      cartApi
        .clearCartApi(apiBaseUrl, opts)
        .then(() => setItems([]))
        .catch((err) => setLastError(err instanceof Error ? err : new Error(String(err))))
        .finally(() => setIsSyncing(false));
      return;
    }
    setItems([]);
  }, [apiMode, apiBaseUrl, effectiveStoreId, buildApiOpts]);

  const checkout: CartContextValue["checkout"] = useCallback(
    async (body) => {
      if (!apiMode || !apiBaseUrl || !effectiveStoreId) {
        throw new Error("Checkout requires API mode (apiBaseUrl + storeId)");
      }
      return cartApi.checkout(apiBaseUrl, buildApiOpts(), body);
    },
    [apiMode, apiBaseUrl, effectiveStoreId, buildApiOpts],
  );

  const mergeGuestCart = useCallback(async () => {
    if (!apiMode || !apiBaseUrl || !effectiveStoreId || !guestCartId) return;
    const headers = getHeaders?.() ?? {};
    if (!headers["X-User-Id"]) return;
    setIsSyncing(true);
    setLastError(null);
    try {
      await cartApi.mergeGuestCart(apiBaseUrl, {
        tenantId,
        storeId: effectiveStoreId,
        guestCartId,
        headers,
      });
      const key = getGuestCartStorageKey(tenantId, effectiveStoreId);
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
      setGuestCartId(null);
      await fetchCart();
    } catch (err) {
      setLastError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSyncing(false);
    }
  }, [apiMode, apiBaseUrl, effectiveStoreId, tenantId, guestCartId, getHeaders, fetchCart]);

  const value: CartContextValue = useMemo(
    () => ({
      items,
      summary,
      tenantId,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      isSyncing: apiMode ? isSyncing : false,
      lastError: apiMode ? lastError : null,
      mergeGuestCart,
      checkout,
    }),
    [
      items,
      summary,
      tenantId,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      apiMode,
      isSyncing,
      lastError,
      mergeGuestCart,
      checkout,
    ],
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
};
