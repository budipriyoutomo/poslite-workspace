/** Structural match of checkout's PricedLine — features only share data shapes, not imports. */
export interface PricedLine {
  unitPrice: number;
  modifiersTotal: number;
  quantity: number;
}
