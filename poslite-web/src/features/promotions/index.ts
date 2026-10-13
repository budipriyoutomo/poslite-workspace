// Public API of the promotions feature (discounts the cashier chooses at payment, evaluated offline, ADR-016).
export { type AppliedDiscount, applyPromotions, type AvailablePromotion, availablePromotions, isScheduled, localMoment, type Promotion } from "./domain/promotion-engine";
