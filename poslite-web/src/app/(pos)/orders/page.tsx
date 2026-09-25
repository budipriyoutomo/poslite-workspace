import { Suspense } from "react";

import { OrdersScreen } from "@/features/orders";

export default function OrdersPage() {
  // useSearchParams needs a Suspense boundary so the page can still be prerendered statically.
  return (
    <Suspense>
      <OrdersScreen />
    </Suspense>
  );
}
