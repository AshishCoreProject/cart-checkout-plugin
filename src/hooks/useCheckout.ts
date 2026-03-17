import { useCallback, useState } from "react";
import { CartContext } from "../context/CartProvider";
import { useContext } from "react";
import type { CheckoutResponse } from "../api/types";

export type UseCheckoutReturn = {
  startCheckout: (body?: Record<string, unknown>) => Promise<CheckoutResponse | null>;
  isPending: boolean;
  error: Error | null;
  result: CheckoutResponse | null;
};

export const useCheckout = (): UseCheckoutReturn => {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCheckout must be used inside CartProvider");
  }

  const { checkout } = context;
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<CheckoutResponse | null>(null);

  const startCheckout = useCallback(
    async (body?: Record<string, unknown>) => {
      setIsPending(true);
      setError(null);
      setResult(null);
      try {
        const res = await checkout(body);
        setResult(res);
        return res;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [checkout],
  );

  return { startCheckout, isPending, error, result };
};
