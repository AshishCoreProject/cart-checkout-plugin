import { createContext, useEffect, useMemo, useRef, useState } from "react";

export type CartItem = {
  id: string | number;
  name?: string;
  price?: number;
  quantity: number;
  // Allow extra fields like image, variantId, etc.
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
  addItem: (item: any, quantity?: number) => void;
  removeItem: (id: CartItem["id"]) => void;
  updateQuantity: (id: CartItem["id"], quantity: number) => void;
  clearCart: () => void;
};

type CartProviderProps = {
  tenantId: string;
  storageKeyPrefix?: string;
  children: React.ReactNode;
};

export const CartContext = createContext<CartContextValue | undefined>(
  undefined,
);

const getStorageKey = (tenantId: string, prefix: string) =>
  `${prefix}:${tenantId}`;

export const CartProvider = ({
  tenantId,
  storageKeyPrefix = "cart",
  children,
}: CartProviderProps) => {
  const storageKey = getStorageKey(tenantId, storageKeyPrefix);
  const hasHydrated = useRef(false);

  const [items, setItems] = useState<CartItem[]>([]);

  // Load from localStorage once per storageKey (client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;

    hasHydrated.current = false;

    try {
      const raw = window.localStorage.getItem(storageKey);

      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(
            parsed.map((item) => ({
              ...item,
              quantity:
                typeof item.quantity === "number" && item.quantity > 0
                  ? item.quantity
                  : 1,
            })),
          );
        }
      }
    } catch {
      // ignore storage errors
    } finally {
      hasHydrated.current = true;
    }
  }, [storageKey]);

  // Persist only after hydration so we never overwrite storage with [] on first mount.
  useEffect(() => {
    if (typeof window === "undefined" || !hasHydrated.current) return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  }, [items, storageKey]);

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

  const addItem: CartContextValue["addItem"] = (item, quantity = 1) => {
    if (item == null || (item as CartItem).id === undefined) {
      return;
    }
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (existing) => existing.id === (item as CartItem).id,
      );

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
  };

  const removeItem: CartContextValue["removeItem"] = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity: CartContextValue["updateQuantity"] = (
    id,
    quantity,
  ) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity } : item,
      ),
    );
  };

  const clearCart: CartContextValue["clearCart"] = () => {
    setItems([]);
  };

  const value: CartContextValue = {
    items,
    summary,
    tenantId,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  };

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
};
