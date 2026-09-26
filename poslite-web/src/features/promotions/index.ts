// Public API of the promotions feature (automatic discounts evaluated offline, ADR-016).
export { type AppliedDiscount, applyPromotions, isScheduled, localMoment, type Promotion } from "./domain/promotion-engine";
