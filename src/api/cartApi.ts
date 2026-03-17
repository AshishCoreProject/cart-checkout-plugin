/**
 * Cart HTTP client. Used only when CartProvider is in API mode (apiBaseUrl + storeId).
 *
 * Endpoint map:
 *   POST /cart/guest/session     → createGuestSession
 *   GET  /cart/view              → getCartView
 *   POST /cart/add               → addToCart
 *   PUT  /cart/item/{id}         → updateCartItem
 *   DELETE /cart/item/{id}       → removeCartItem
 *   DELETE /cart/clear           → clearCartApi
 *   POST /cart/merge-guest-cart  → mergeGuestCart
 *   POST /checkout/              → checkout
 *
 * All requests use buildHeaders(opts) for Content-Type and optional X-Guest-Cart-Id / X-User-Id.
 */
import type {
  GuestSessionResponse,
  ApiCartViewResponse,
  AddToCartBody,
  UpdateCartItemBody,
  CheckoutResponse,
  NormalizedCart,
} from "./types";

export type CartApiOptions = {
  tenantId: string;
  storeId: string;
  guestCartId?: string | null;
  headers?: Record<string, string>;
};

function buildHeaders(opts: CartApiOptions): Record<string, string> {
  const out: Record<string, string> = { "Content-Type": "application/json", ...opts.headers };
  if (opts.guestCartId) out["X-Guest-Cart-Id"] = opts.guestCartId;
  return out;
}

function getJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    return res.text().then((t) => {
      throw new Error(t || `HTTP ${res.status}`);
    });
  }
  return res.json();
}

/** Normalize API cart response to plugin-compatible shape */
export function normalizeCartView(api: ApiCartViewResponse): NormalizedCart {
  const items = (api.items || []).map((row) => ({
    ...row,
    id: row.item_id ?? row.id,
    name: row.name,
    price: row.price,
    quantity: typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 1,
  }));
  const subtotal = typeof api.subtotal === "number" ? api.subtotal : 0;
  const total = typeof api.total === "number" ? api.total : subtotal;
  const itemCount = typeof api.item_count === "number" ? api.item_count : items.reduce((s, i) => s + (i.quantity ?? 1), 0);
  return {
    items,
    summary: { subtotal, total, itemCount },
  };
}

export async function createGuestSession(
  apiBaseUrl: string,
  opts: { tenantId: string; storeId: string; headers?: Record<string, string> }
): Promise<string> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/cart/guest/session`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: JSON.stringify({ tenant_id: opts.tenantId, store_id: opts.storeId }),
  });
  const data = await getJson<GuestSessionResponse>(res);
  const id = data.guest_cart_id ?? data.id ?? data.cart_id;
  if (!id || typeof id !== "string") throw new Error("Guest session response missing guest_cart_id");
  return id;
}

export async function getCartView(
  apiBaseUrl: string,
  opts: CartApiOptions
): Promise<NormalizedCart> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/cart/view?tenant_id=${encodeURIComponent(opts.tenantId)}&store_id=${encodeURIComponent(opts.storeId)}`;
  const res = await fetch(url, { method: "GET", headers: buildHeaders(opts) });
  const data = await getJson<ApiCartViewResponse>(res);
  return normalizeCartView(data);
}

export async function addToCart(
  apiBaseUrl: string,
  opts: CartApiOptions,
  body: AddToCartBody
): Promise<void> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/cart/add`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(opts),
    body: JSON.stringify(body),
  });
  if (!res.ok) await res.text().then((t) => { throw new Error(t || `HTTP ${res.status}`); });
}

export async function updateCartItem(
  apiBaseUrl: string,
  opts: CartApiOptions,
  itemId: string | number,
  body: UpdateCartItemBody
): Promise<void> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/cart/item/${encodeURIComponent(String(itemId))}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: buildHeaders(opts),
    body: JSON.stringify(body),
  });
  if (!res.ok) await res.text().then((t) => { throw new Error(t || `HTTP ${res.status}`); });
}

export async function removeCartItem(
  apiBaseUrl: string,
  opts: CartApiOptions,
  itemId: string | number
): Promise<void> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/cart/item/${encodeURIComponent(String(itemId))}`;
  const res = await fetch(url, { method: "DELETE", headers: buildHeaders(opts) });
  if (!res.ok) await res.text().then((t) => { throw new Error(t || `HTTP ${res.status}`); });
}

export async function clearCartApi(
  apiBaseUrl: string,
  opts: CartApiOptions
): Promise<void> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/cart/clear`;
  const res = await fetch(url, { method: "DELETE", headers: buildHeaders(opts) });
  if (!res.ok) await res.text().then((t) => { throw new Error(t || `HTTP ${res.status}`); });
}

export async function mergeGuestCart(
  apiBaseUrl: string,
  opts: CartApiOptions
): Promise<void> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/cart/merge-guest-cart`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(opts),
    body: JSON.stringify({ tenant_id: opts.tenantId, store_id: opts.storeId }),
  });
  if (!res.ok) await res.text().then((t) => { throw new Error(t || `HTTP ${res.status}`); });
}

export async function checkout(
  apiBaseUrl: string,
  opts: CartApiOptions,
  body?: Record<string, unknown>
): Promise<CheckoutResponse> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/checkout/`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(opts),
    body: JSON.stringify(body ?? { tenant_id: opts.tenantId, store_id: opts.storeId }),
  });
  return getJson<CheckoutResponse>(res);
}
