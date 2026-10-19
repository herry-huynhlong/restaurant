const usernamePattern = /^[a-z0-9_-]{3,30}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export function isValidUsername(value: string) {
  return usernamePattern.test(value.trim());
}

export function usernameValidationMessage() {
  return "Tên đăng nhập chỉ dùng a-z, 0-9, _ hoặc -, dài 3-30 ký tự.";
}

export function makeInternalStaffEmail(restaurantId: string, username: string, uniqueKey: string) {
  const restaurantKey = restaurantId.replace(/[^a-z0-9]/gi, "").slice(-10).toLowerCase();
  const accountKey = uniqueKey.replace(/[^a-z0-9]/gi, "").slice(0, 16).toLowerCase();
  return `staff-${restaurantKey}-${username.trim().toLowerCase()}-${accountKey}@staff.local`;
}
