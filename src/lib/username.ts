const usernamePattern = /^[a-z0-9_-]{3,30}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return usernamePattern.test(normalizeUsername(value));
}

export function usernameValidationMessage() {
  return "Tên đăng nhập chỉ dùng a-z, 0-9, _ hoặc -, dài 3-30 ký tự.";
}

export function makeInternalStaffEmail(restaurantId: string, username: string) {
  return `${normalizeUsername(username)}.${restaurantId}@staff.local`;
}
