# @ecommerce-store/cart-checkout-plugin

A small React SDK for cart state and persistence in multi-tenant storefronts. Supports **local-only mode** (localStorage per tenant) or **API mode** (sync with your backend: guest session, add/view/update/remove/clear, checkout, merge guest cart on login).

**Requirements:** React 18+

For **flow, requirements checklist, and where to debug**, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Install

```bash
npm install @ecommerce-store/cart-checkout-plugin
```

---

## Quick start

1. Wrap your app with `CartProvider` and pass a `tenantId` (e.g. store or site id):

```jsx
import { CartProvider } from "@ecommerce-store/cart-checkout-plugin";

function App() {
  return (
    <CartProvider tenantId="my-store-id">
      <YourApp />
    </CartProvider>
  );
}
```

2. Use `useCart` in any child to read the cart and call actions:

```jsx
import { useCart } from "@ecommerce-store/cart-checkout-plugin";

function ProductCard({ product }) {
  const { addItem } = useCart();

  return (
    <button
      onClick={() =>
        addItem({
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
        })
      }
    >
      Add to cart
    </button>
  );
}

function CartPage() {
  const { items, summary, removeItem, updateQuantity, clearCart } = useCart();

  return (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          {item.name} × {item.quantity} — ${(item.price ?? 0) * item.quantity}
          <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
          <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
          <button onClick={() => removeItem(item.id)}>Remove</button>
        </div>
      ))}
      <p>Subtotal: ${summary.subtotal}</p>
      <p>Items: {summary.itemCount}</p>
      <button onClick={clearCart}>Clear cart</button>
    </div>
  );
}
```

---

## API

### `CartProvider`

| Prop                | Type     | Default   | Description                                      |
|---------------------|----------|-----------|--------------------------------------------------|
| `tenantId`          | `string` | required  | Tenant/store id. Cart is stored per tenant.       |
| `storageKeyPrefix`  | `string` | `"cart"`  | Prefix for localStorage key (local-only mode).   |
| `children`         | `ReactNode` | required | Your app or subtree.                             |
| `apiBaseUrl`       | `string` | —         | When set, enables **API mode** (see below).      |
| `storeId`          | `string` | —         | Required when `apiBaseUrl` is set.                |
| `getHeaders`       | `() => Record<string, string>` | — | Optional. Return headers for each request (e.g. `{ "X-User-Id": userId }` for logged-in users). |

### `useCart()`

Returns:

| Property        | Type                    | Description |
|-----------------|-------------------------|-------------|
| `items`         | `CartItem[]`            | Current line items. |
| `summary`       | `CartSummary`           | `{ subtotal, total, itemCount }`. |
| `tenantId`      | `string`                | Current tenant id. |
| `isEmpty`       | `boolean`               | `items.length === 0`. |
| `addItem`       | `(item, quantity?) => void` | Add or merge by `id`. |
| `removeItem`    | `(id) => void`          | Remove line by `id`. |
| `updateQuantity`| `(id, quantity) => void`| Set quantity; remove if ≤ 0. |
| `clearCart`     | `() => void`             | Remove all items. |
| `isSyncing`     | `boolean`               | **API mode only.** True while loading or mutating. |
| `lastError`     | `Error \| null`          | **API mode only.** Last API error, clear on next success. |
| `mergeGuestCart`| `() => Promise<void>`   | **API mode only.** Call after login to merge guest cart into user cart. |

### `useCheckout()`

**API mode only.** Returns:

| Property        | Type                    | Description |
|-----------------|-------------------------|-------------|
| `startCheckout` | `(body?) => Promise<CheckoutResponse \| null>` | `POST /checkout/?tenant_id&store_id` (query when set); empty body unless you pass a JSON `body`. |
| `isPending`     | `boolean`               | True while checkout request is in flight. |
| `error`         | `Error \| null`          | Checkout request error. |
| `result`        | `CheckoutResponse \| null` | Last successful response (`checkout_url`, `order_id`, etc.). |

### Types

- **`CartItem`** — `id` (string or number), optional `name`, `price`, `quantity` (defaults to 1 when adding), and any extra fields.
- **`CartSummary`** — `{ subtotal, total, itemCount }`.
- **`CheckoutResponse`** — Typed response from checkout (e.g. `checkout_url`, `order_id`). Import when using `useCheckout`.
- **`CartContextValue`** — Full context type if you need it.

```ts
import type { CartItem, CartSummary, CheckoutResponse } from "@ecommerce-store/cart-checkout-plugin";
```

---

## API mode (backend sync)

When you pass `apiBaseUrl` and `storeId`, the plugin switches to **API mode**:

- **Guest session:** The plugin calls `POST /cart/guest/session` to get a guest cart id, stores it in localStorage (key `cart_guest_id:{tenantId}:{storeId}`), and sends it as the `X-Guest-Cart-Id` header on all cart requests.
- **Logged-in users:** Provide `getHeaders={() => ({ "X-User-Id": currentUserId })}`. The plugin sends `X-User-Id` instead of (or with) the guest id. After login, call **`mergeGuestCart()`** so the backend merges the guest cart into the user cart; the plugin then stops using the stored guest id and refetches the cart.
- **Endpoints used:** `GET /cart/view`, `POST /cart/add`, `PUT /cart/item/{item_id}`, `DELETE /cart/item/{item_id}`, `DELETE /cart/clear?tenant_id&store_id`, `POST /cart/merge-guest-cart`, `POST /checkout/?tenant_id&store_id` (checkout body empty by default). Request bodies and query params use `tenant_id` and `store_id` as required by your API.

Example:

```jsx
<CartProvider
  tenantId={tenantId}
  storeId={storeId}
  apiBaseUrl="https://api.example.com"
  getHeaders={() => (user ? { "X-User-Id": user.id } : {})}
>
  <App />
</CartProvider>

// After user logs in:
const { mergeGuestCart } = useCart();
await mergeGuestCart();

// Checkout:
const { startCheckout, isPending, result } = useCheckout();
const res = await startCheckout();
if (res?.checkout_url) window.location.href = res.checkout_url;
```

---

## Multi-tenant behavior

- **Local-only mode:** Each `tenantId` gets its own cart in localStorage under the key `{storageKeyPrefix}:{tenantId}`. Persistence runs only after hydration so the cart is not overwritten on first paint.
- **API mode:** Cart is stored on the server. Guest cart id is stored per tenant+store and reused across refreshes. Use `mergeGuestCart()` after login to merge guest cart into the user cart.

---

## Building from source

```bash
npm install
npm run build
```

Output is in `dist/`: ESM and CJS bundles plus TypeScript declarations.
