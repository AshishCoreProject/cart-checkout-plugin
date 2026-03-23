# Cart Checkout Plugin – Architecture & Flow

This doc helps developers understand how the plugin works and where to look when debugging.

---

## Requirements checklist (plugin scope)

| Requirement | Where it lives |
|-------------|----------------|
| React 18+ | Peer dependency |
| **Local-only mode:** cart in localStorage per `tenantId` | `CartProvider` – hydrate/persist effects |
| **API mode:** sync with backend when `apiBaseUrl` + `storeId` are set | `CartProvider` + `src/api/cartApi.ts` |
| Guest session: `POST /cart/guest/session`, store guest id in localStorage | `useCartApiInit` → `cartApi.createGuestSession` |
| Cart CRUD: view, add, update item, remove item, clear | `CartProvider` actions → `cartApi.*` |
| Logged-in: `getHeaders()` for `X-User-Id`; after login call `mergeGuestCart()` | `CartProvider.mergeGuestCart` → `cartApi.mergeGuestCart` |
| Checkout: `POST /checkout/` via `useCheckout().startCheckout()` | `useCheckout` → `CartProvider.checkout` → `cartApi.checkout` |
| Multi-tenant: cart keyed by `tenantId` (and in API mode by `storeId` for guest id) | Storage keys in `CartProvider` |

All of the above are implemented. Optimizations (e.g. request deduping, retries) are out of scope for this checklist.

---

## Two modes

- **Local-only:** No `apiBaseUrl` (or no `storeId`). Cart is stored in localStorage under `{storageKeyPrefix}:{tenantId}`. No network calls.
- **API mode:** `apiBaseUrl` and `storeId` are both set. All cart data comes from the backend. Guest cart id is stored in localStorage under `cart_guest_id:{tenantId}:{storeId}` and sent as `X-Guest-Cart-Id`; when user is logged in, `getHeaders()` can return `X-User-Id` and you call `mergeGuestCart()` after login.

---

## Where to look when debugging

| What you’re debugging | File / flow |
|------------------------|-------------|
| “Cart not loading in API mode” | `src/hooks/useCartApiInit.ts` – guest session creation and first `GET /cart/view` |
| “Add to cart does nothing in API mode” | `CartProvider.tsx` → `addItem` → `cartApi.addToCart` then `fetchCart()` |
| “Local cart not persisting” | `CartProvider.tsx` – effect that writes `items` to localStorage (runs only after hydration) |
| “Merge after login fails” | `CartProvider.tsx` → `mergeGuestCart` → `cartApi.mergeGuestCart`; ensure `getHeaders()` returns `X-User-Id` and guest had a cart |
| “Checkout fails” | `useCheckout.ts` → `CartProvider.checkout` → `cartApi.checkout` (POST /checkout/) |
| “Wrong cart for tenant” | Storage keys use `tenantId` (and in API mode `storeId` for guest id); confirm these props |

---

## Data flow (high level)

1. **Mount (API mode)**  
   `CartProvider` runs `useCartApiInit`. That hook:
   - If `getHeaders()` has `X-User-Id`: fetches cart with that header (no guest id).
   - Else: reads `cart_guest_id:{tenantId}:{storeId}` from localStorage; if missing, calls `POST /cart/guest/session`, stores the id, then calls `GET /cart/view`. Results are written to `CartProvider` state (`setItems`).

2. **Mount (local-only)**  
   One effect reads from `localStorage` and sets `items`. Another effect (after hydration) writes `items` back to `localStorage` when `items` change.

3. **addItem / removeItem / updateQuantity / clearCart**  
   In API mode: call the corresponding function in `src/api/cartApi.ts`, then call `fetchCart()` to refresh `items`. In local-only: update React state only; the persist effect saves to localStorage.

4. **mergeGuestCart()**  
   Called after login. Calls `POST /cart/merge-guest-cart` with `X-Guest-Cart-Id` and `X-User-Id`, clears the stored guest id, then refetches the cart.

5. **startCheckout()**  
   `useCheckout` calls `CartProvider.checkout`, which calls `cartApi.checkout` (`POST /checkout/`). Response (e.g. `checkout_url`, `order_id`) is returned to the caller.

---

## API endpoints (reference)

Implemented in `src/api/cartApi.ts`:

| Endpoint | Function | When it’s used |
|----------|----------|----------------|
| `POST /cart/guest/session` | `createGuestSession` | API init when no guest id in localStorage |
| `GET /cart/view` | `getCartView` | API init and after every mutation (add/update/remove/clear/merge) |
| `POST /cart/add` | `addToCart` | `addItem()` in API mode |
| `PUT /cart/item/{id}` | `updateCartItem` | `updateQuantity()` in API mode |
| `DELETE /cart/item/{id}` | `removeCartItem` | `removeItem()` in API mode |
| `DELETE /cart/clear?tenant_id&store_id` | `clearCartApi` | `clearCart()` in API mode |
| `POST /cart/merge-guest-cart` | `mergeGuestCart` | `mergeGuestCart()` after login |
| `POST /checkout/?tenant_id&store_id` | `checkout` | `useCheckout().startCheckout()` (empty body; tenant/store in query when set) |

All requests that need a cart identity use `buildHeaders(opts)`, which adds `X-Guest-Cart-Id` when `opts.guestCartId` is set and merges in `opts.headers` (e.g. `X-User-Id`).
