// Dynamic QRIS (ADR-019): online only; offline the cashier keeps static QRIS + a typed reference.

export interface QrisCharge {
  id: string; // ULID from this device: retrying the create returns the same charge
  amount: number;
  status: "pending" | "paid" | "expired";
  qrString: string;
  expiresAt: string;
}

/** Port to the API's charge endpoints, implemented in infrastructure. */
export interface QrisClient {
  create(id: string, amount: number): Promise<QrisCharge>;
  status(id: string): Promise<QrisCharge>;
}
