// Public API of the checkout feature.
export { type PlaceOrderInput, placeOrder } from "./application/place-order";
export { pressCashKey, suggestCashAmounts, type CashKey } from "./domain/cash";
export { remainingDue, settle, type Settlement, type TenderedPayment } from "./domain/payment";
export { calculate, type Discount, type PriceBreakdown, type Rates } from "./domain/pricing";
