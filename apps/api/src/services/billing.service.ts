export interface RateSnapshot {
  rateId?: string;
  key: string;
  version?: number;
  name: string;
  consoleType?: string | null;
  billingMode: 'HOURLY' | 'PACKAGE';
  amount: number;
  durationMinutes?: number | null;
  minimumMinutes: number;
  roundingMinutes: number;
}

export interface BillingResult {
  actualMinutes: number;
  billedDurationMinutes: number;
  totalAmount: number;
  subtotal: number;
  discount: number;
  rateSnapshot: RateSnapshot;
  breakdown: string;
}

/**
 * Calculates rental session bill based on frozen rate snapshot.
 * Preserves integer Rupiah and explicit rounding rules.
 */
export function calculateSessionBill(
  startedAt: Date,
  endedAt: Date,
  rateSnapshot: RateSnapshot
): BillingResult {
  const diffMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
  const actualMinutes = Math.max(1, Math.ceil(diffMs / 60000));

  if (rateSnapshot.billingMode === 'PACKAGE') {
    const packageMinutes = rateSnapshot.durationMinutes || 180;
    const baseAmount = rateSnapshot.amount;

    if (actualMinutes <= packageMinutes) {
      return {
        actualMinutes,
        billedDurationMinutes: packageMinutes,
        totalAmount: baseAmount,
        subtotal: baseAmount,
        discount: 0,
        rateSnapshot,
        breakdown: `Paket ${packageMinutes / 60} Jam: ${packageMinutes} menit (Rp ${baseAmount.toLocaleString('id-ID')})`,
      };
    }

    // Overtime calculation with block rounding
    const overtimeMinutes = actualMinutes - packageMinutes;
    const rounding = rateSnapshot.roundingMinutes || 15;
    const roundedOvertime = Math.ceil(overtimeMinutes / rounding) * rounding;
    const hourlyEquivalent = Math.round(baseAmount / (packageMinutes / 60));
    const overtimeAmount = Math.round((roundedOvertime / 60) * hourlyEquivalent);
    const totalAmount = baseAmount + overtimeAmount;

    return {
      actualMinutes,
      billedDurationMinutes: packageMinutes + roundedOvertime,
      totalAmount,
      subtotal: totalAmount,
      discount: 0,
      rateSnapshot,
      breakdown: `Paket (${packageMinutes} menit = Rp ${baseAmount.toLocaleString('id-ID')}) + Lebih Waktu (${roundedOvertime} menit = Rp ${overtimeAmount.toLocaleString('id-ID')})`,
    };
  }

  // HOURLY Mode
  const minMinutes = rateSnapshot.minimumMinutes || 60;
  const rounding = rateSnapshot.roundingMinutes || 15;
  const effectiveMinutes = Math.max(minMinutes, actualMinutes);
  const roundedMinutes = Math.ceil(effectiveMinutes / rounding) * rounding;
  const hourlyRate = rateSnapshot.amount;
  const totalAmount = Math.round((roundedMinutes / 60) * hourlyRate);

  return {
    actualMinutes,
    billedDurationMinutes: roundedMinutes,
    totalAmount,
    subtotal: totalAmount,
    discount: 0,
    rateSnapshot,
    breakdown: `Per Jam: ${roundedMinutes} menit (dibulatkan per ${rounding} mnt, min ${minMinutes} mnt) @ Rp ${hourlyRate.toLocaleString('id-ID')}/jam = Rp ${totalAmount.toLocaleString('id-ID')}`,
  };
}
