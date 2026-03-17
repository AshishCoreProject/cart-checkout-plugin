/**
 * Cart state and actions for the cart-checkout plugin.
 *
 * Two modes:
 * - Local-only: no apiBaseUrl/storeId. Cart is in React state and persisted to localStorage per tenant.
 * - API mode: apiBaseUrl + storeId set. Cart is loaded and updated via backend; see src/api/cartApi.ts and ARCHITECTURE.md.
 */
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
import { useCartApiInit } from "../hooks/useCartApiInit";

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

  /**
   * Refetches cart from API. Used after add/update/remove/clear/merge.
   * No-op if not in API mode or missing guest id / X-User-Id.
   */
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

  // API mode: on mount, ensure guest session (or use X-User-Id) then load cart. See useCartApiInit.ts and ARCHITECTURE.md.
  useCartApiInit({
    apiMode,
    apiBaseUrl,
    tenantId,
    storeId: effectiveStoreId,
    getHeaders,
    setItems,
    setIsSyncing,
    setLastError,
    setGuestCartId,
  });

  // Local-only mode: on mount, hydrate cart from localStorage (key: {storageKeyPrefix}:{tenantId})
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

  // Local-only mode: whenever items change (after first hydration), persist to localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !hasHydrated.current || apiMode) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* ignore */
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

  // Add or merge item by id. API mode: POST /cart/add then refetch. Local: update state (persist effect saves).
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

  // Remove line item by id. API mode: DELETE /cart/item/{id} then refetch. Local: filter state.
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

  // Set quantity for item; removes if quantity <= 0. API mode: PUT /cart/item/{id} then refetch. Local: update state.
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

  // Remove all items. API mode: DELETE /cart/clear then set items to []. Local: set items to [].
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

  // API mode only. POST /checkout/. Used by useCheckout().startCheckout().
  const checkout: CartContextValue["checkout"] = useCallback(
    async (body) => {
      if (!apiMode || !apiBaseUrl || !effectiveStoreId) {
        throw new Error("Checkout requires API mode (apiBaseUrl + storeId)");
      }
      return cartApi.checkout(apiBaseUrl, buildApiOpts(), body);
    },
    [apiMode, apiBaseUrl, effectiveStoreId, buildApiOpts],
  );

  // API mode only. Call after login: POST /cart/merge-guest-cart, clear stored guest id, refetch cart.
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
