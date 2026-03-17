# @ecommerce-store/cart-checkout-plugin

A small React SDK for cart state and persistence in multi-tenant storefronts. Supports per-tenant localStorage, typed cart items, and a simple summary (subtotal, total, item count).

**Requirements:** React 18+

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
| `storageKeyPrefix`   | `string` | `"cart"`  | Prefix for localStorage key: `{prefix}:{tenantId}` |
| `children`          | `ReactNode` | required | Your app or subtree.                             |

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

### Types

- **`CartItem`** — `id` (string or number), optional `name`, `price`, `quantity` (defaults to 1 when adding), and any extra fields.
- **`CartSummary`** — `{ subtotal, total, itemCount }` (total is same as subtotal in this version).
- **`CartContextValue`** — Full context type if you need it (e.g. for custom hooks or wrappers).

```ts
import type { CartItem, CartSummary } from "@ecommerce-store/cart-checkout-plugin";
```

---

## Multi-tenant behavior

- Each `tenantId` gets its own cart in localStorage under the key `{storageKeyPrefix}:{tenantId}` (e.g. `cart:my-store-id`).
- Switching `tenantId` (e.g. different store) loads and persists a separate cart for that tenant.
- Persistence runs only in the browser and only after the initial load from storage, so the cart is not overwritten with an empty array on first paint.

---

## Building from source

```bash
npm install
npm run build
```

Output is in `dist/`: ESM and CJS bundles plus TypeScript declarations.
