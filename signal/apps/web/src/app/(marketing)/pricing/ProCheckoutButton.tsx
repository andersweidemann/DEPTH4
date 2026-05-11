"use client";

import { CheckoutButton } from "./CheckoutButton";

const proMonthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "";

export function ProCheckoutButton() {
  return <CheckoutButton priceId={proMonthly} label="Go to Pro checkout" />;
}
