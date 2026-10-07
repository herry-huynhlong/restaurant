export function restaurantStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "Đang hoạt động";
    case "SUSPENDED":
      return "Đã khóa";
    case "INACTIVE":
      return "Chưa hoạt động";
    default:
      return status;
  }
}

export function subscriptionStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "Còn hạn";
    case "EXPIRED":
      return "Hết hạn";
    case "SUSPENDED":
      return "Tạm ngưng";
    default:
      return status;
  }
}

export function isRestaurantLocked(status: string) {
  return status === "SUSPENDED";
}
