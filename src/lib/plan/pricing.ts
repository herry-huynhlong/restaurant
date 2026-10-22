/** VND integers; half-up averaging preserves the existing checkout convention. */
export function monthlyAverage(total: number, months: number) {
  if (!Number.isSafeInteger(total) || total < 0 || ![3, 6, 12].includes(months)) throw new Error("Invalid price");
  return Number((BigInt(total) * 2n + BigInt(months)) / (2n * BigInt(months)));
}

/** Floor to hundredths of a percent, never overstate an actual saving. */
export function discountBasisPoints(original: number | null, final: number) {
  if (original === null || original <= final || final <= 0) return 0;
  return Number((BigInt(original - final) * 10000n) / BigInt(original));
}
