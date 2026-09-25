export interface SalesOrder {
  status: "paid" | "voided";
  total: number;
  discountAmount: number;
  serviceCharge: number;
  tax: number;
  changeAmount: number;
  lines: { productName: string; categoryName: string; quantity: number; lineTotal: number }[];
  payments: { methodName: string; methodType: string; amount: number }[];
}

export interface SalesSummary {
  revenue: number;
  transactions: number;
  voided: number;
  discount: number;
  service: number;
  tax: number;
  byPaymentMethod: { name: string; amount: number; count: number }[];
  byCategory: { name: string; quantity: number; amount: number }[];
  byProduct: { name: string; quantity: number; amount: number }[];
}

type Bucket = { name: string; quantity: number; amount: number };

function add(map: Map<string, Bucket>, name: string, quantity: number, amount: number) {
  const b = map.get(name) ?? { name, quantity: 0, amount: 0 };
  map.set(name, { name, quantity: b.quantity + quantity, amount: b.amount + amount });
}

const byAmount = (a: Bucket, b: Bucket) => b.amount - a.amount || a.name.localeCompare(b.name);

/** Local shift/day report (prototype analytics): paid orders only; cash is counted net of change. */
export function summarizeSales(orders: SalesOrder[]): SalesSummary {
  const paid = orders.filter((o) => o.status === "paid");
  const methods = new Map<string, { name: string; amount: number; count: number }>();
  const categories = new Map<string, Bucket>();
  const products = new Map<string, Bucket>();

  for (const o of paid) {
    let change = o.changeAmount;
    for (const p of o.payments) {
      const kept = p.methodType === "cash" ? p.amount - Math.min(change, p.amount) : p.amount;
      if (p.methodType === "cash") change -= p.amount - kept;
      const m = methods.get(p.methodName) ?? { name: p.methodName, amount: 0, count: 0 };
      methods.set(p.methodName, { name: p.methodName, amount: m.amount + kept, count: m.count + 1 });
    }
    for (const l of o.lines) {
      add(categories, l.categoryName, l.quantity, l.lineTotal);
      add(products, l.productName, l.quantity, l.lineTotal);
    }
  }

  const sum = (f: (o: SalesOrder) => number) => paid.reduce((s, o) => s + f(o), 0);
  return {
    revenue: sum((o) => o.total),
    transactions: paid.length,
    voided: orders.length - paid.length,
    discount: sum((o) => o.discountAmount),
    service: sum((o) => o.serviceCharge),
    tax: sum((o) => o.tax),
    byPaymentMethod: [...methods.values()].sort((a, b) => b.amount - a.amount),
    byCategory: [...categories.values()].sort(byAmount),
    byProduct: [...products.values()].sort(byAmount),
  };
}
