/**
 * API request/response types for cart backend.
 * Align these with your actual API (e.g. Swagger) if field names differ.
 */

export type GuestSessionResponse = {
  guest_id?: string;
  cookie_name?: string;
  message?: string;
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
  tenant_id?: string;
  store_id?: string;
  product_id: string;
  quantity: number;
};

export type UpdateCartItemBody = {
  quantity: number;
};

/** Line item in checkout success response (e.g. devbaascart API) */
export type CheckoutOrderLineItem = {
  cart_item_id?: string;
  product_id?: string;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
  discount?: number;
  final_amount?: number;
  [key: string]: unknown;
};

/** Response from POST /checkout/?tenant_id&store_id (empty body, X-User-Id / X-Guest-Cart-Id) */
export type CheckoutResponse = {
  message?: string;
  order_id?: string;
  cart_id?: string;
  user_id?: string | null;
  guest_id?: string | null;
  promo?: {
    promo_id?: string | null;
    coupon_code?: string | null;
    [key: string]: unknown;
  };
  summary?: {
    subtotal?: number;
    discount?: number;
    total_paid?: number;
    [key: string]: unknown;
  };
  items?: CheckoutOrderLineItem[];
  checkout_url?: string;
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
