/**
 * API request/response types for cart backend.
 * Align these with your actual API (e.g. Swagger) if field names differ.
 */

export type GuestSessionResponse = {
  guest_cart_id?: string;
  id?: string;
  cart_id?: string;
};

export type ApiCartItem = {
  id: string | number;
  item_id?: string;
  product_id?: string;
  name?: string;
  price?: number;
  quantity: number;
  [key: string]: unknown;
};

export type ApiCartViewResponse = {
  items?: ApiCartItem[];
  subtotal?: number;
  total?: number;
  item_count?: number;
};

export type AddToCartBody = {
  tenant_id: string;
  store_id: string;
  product_id: string;
  quantity: number;
};

export type UpdateCartItemBody = {
  quantity: number;
};

export type CheckoutResponse = {
  checkout_url?: string;
  order_id?: string;
  redirect_url?: string;
  [key: string]: unknown;
};

/** Normalized cart shape returned by API client (plugin CartItem[] / CartSummary compatible) */
export type NormalizedCartItem = {
  id: string | number;
  name?: string;
  price?: number;
  quantity: number;
  [key: string]: unknown;
};

export type NormalizedCartSummary = {
  subtotal: number;
  total: number;
  itemCount: number;
};

export type NormalizedCart = {
  items: NormalizedCartItem[];
  summary: NormalizedCartSummary;
};
