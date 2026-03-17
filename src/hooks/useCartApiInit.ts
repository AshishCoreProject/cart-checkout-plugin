import { useEffect } from "react";
import * as cartApi from "../api/cartApi";
import type { CartItem } from "../context/CartProvider";

const GUEST_CART_STORAGE_KEY_PREFIX = "cart_guest_id";

function getGuestCartStorageKey(tenantId: string, storeId: string): string {
  return `${GUEST_CART_STORAGE_KEY_PREFIX}:${tenantId}:${storeId}`;
}

type UseCartApiInitArgs = {
  apiMode: boolean;
  apiBaseUrl: string | undefined;
  tenantId: string;
  storeId: string;
  getHeaders?: () => Record<string, string>;
  setItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setLastError: React.Dispatch<React.SetStateAction<Error | null>>;
  setGuestCartId: React.Dispatch<React.SetStateAction<string | null>>;
};

/**
 * Runs once on mount when in API mode. Flow:
 * 1. If getHeaders() returns X-User-Id → fetch cart with that header, done.
 * 2. Else (guest): read guest cart id from localStorage (key: cart_guest_id:{tenantId}:{storeId}).
 * 3. If no guest id → POST /cart/guest/session, store id in localStorage and state, then GET /cart/view.
 * 4. If guest id exists → GET /cart/view with X-Guest-Cart-Id.
 * All state updates are written via the setters passed in. See ARCHITECTURE.md for full flow.
 */
export function useCartApiInit({
  apiMode,
  apiBaseUrl,
  tenantId,
  storeId,
  getHeaders,
  setItems,
  setIsSyncing,
  setLastError,
  setGuestCartId,
}: UseCartApiInitArgs): void {
  useEffect(() => {
    if (typeof window === "undefined" || !apiMode || !apiBaseUrl || !storeId) return;

    let cancelled = false;
    const baseUrl = apiBaseUrl;
    const headers = getHeaders?.() ?? {};

    async function run() {
      // --- Step 1: Logged-in user (X-User-Id) ---
      if (headers["X-User-Id"]) {
        setIsSyncing(true);
        setLastError(null);
        try {
          const cart = await cartApi.getCartView(baseUrl, {
            tenantId,
            storeId,
            headers,
          });
          if (!cancelled) setItems(cart.items as CartItem[]);
        } catch (err) {
          if (!cancelled) setLastError(err instanceof Error ? err : new Error(String(err)));
        } finally {
          if (!cancelled) setIsSyncing(false);
        }
        return;
      }

      // --- Step 2 & 3: Guest — get or create guest cart id ---
      const storageKey = getGuestCartStorageKey(tenantId, storeId);
      let guestId: string | null = null;
      try {
        guestId = window.localStorage.getItem(storageKey);
      } catch {
        /* ignore */
      }

      if (!guestId) {
        setIsSyncing(true);
        setLastError(null);
        try {
          guestId = await cartApi.createGuestSession(baseUrl, {
            tenantId,
            storeId,
            headers,
          });
          if (!cancelled) {
            setGuestCartId(guestId);
            try {
              window.localStorage.setItem(storageKey, guestId!);
            } catch {
              /* ignore */
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

      // --- Step 4: Fetch cart with guest id ---
      if (!cancelled && guestId) {
        setIsSyncing(true);
        setLastError(null);
        try {
          const cart = await cartApi.getCartView(baseUrl, {
            tenantId,
            storeId,
            headers,
            guestCartId: guestId,
          });
          if (!cancelled) setItems(cart.items as CartItem[]);
        } catch (err) {
          if (!cancelled) setLastError(err instanceof Error ? err : new Error(String(err)));
        } finally {
          if (!cancelled) setIsSyncing(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // Intentionally omit getHeaders: we only re-init when api identity (tenant/store/url) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, apiBaseUrl, tenantId, storeId]);
}
