const usernamePattern = /^[a-z0-9_-]{3,30}$/;

export function normalizeUsername(value: string) {
  return value.trim();
}

export function isValidUsername(value: string) {
  return usernamePattern.test(value.trim());
}

export function usernameValidationMessage() {
  return "Tên đăng nhập chỉ dùng a-z, 0-9, _ hoặc -, dài 3-30 ký tự.";
}

export function makeInternalStaffEmail(restaurantId: string, username: string) {
  return `${username.trim().toLowerCase()}.${restaurantId}@staff.local`;
}
