"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CheckoutScreen } from "@/features/checkout";

function Checkout() {
  return <CheckoutScreen startSplit={useSearchParams().get("split") === "1"} />;
}

export default function CheckoutPage() {
  // useSearchParams needs a Suspense boundary so the page can still be prerendered statically.
  return (
    <Suspense>
      <Checkout />
    </Suspense>
  );
}
