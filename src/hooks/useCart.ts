import { useContext } from "react";
import { CartContext } from "../context/CartProvider";

/**
 * Cart state and actions. Must be used inside CartProvider.
 * Implementation: context/CartProvider.tsx; API calls: api/cartApi.ts.
 */
export const useCart = () => {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  const {
    items,
    summary,
    tenantId,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    isSyncing,
    lastError,
    mergeGuestCart,
  } = context;

  const isEmpty = items.length === 0;

  return {
    items,
    summary,
    tenantId,
    isEmpty,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    isSyncing,
    lastError,
    mergeGuestCart,
  };
};