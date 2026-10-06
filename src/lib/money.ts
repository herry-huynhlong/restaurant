export function formatVnd(amount: number) {
  return `${amount.toLocaleString("vi-VN")} ₫`;
}

export function parseVndInteger(value: string) {
  const normalized = value.replace(/[^\d]/g, "");
  return Number.parseInt(normalized || "0", 10);
}
