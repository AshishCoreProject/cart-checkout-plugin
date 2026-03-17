import { useContext } from "react";
import { CartContext } from "../context/CartProvider";

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
  };
};