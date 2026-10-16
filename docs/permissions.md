# Ma trận phân quyền

Authorization được kiểm tra phía server. Quyền còn phụ thuộc trạng thái nhà hàng, subscription, feature gói và thiết bị nhân viên.

| Khu vực | Platform Owner | Sub Admin | Owner | Manager | Waiter | Kitchen | Cashier |
|---|---:|---:|---:|---:|---:|---:|---:|
| Platform dashboard/danh sách | Có | Có | Không | Không | Không | Không | Không |
| Giá, gói, trạng thái, xóa/restore | Có | Không | Không | Không | Không | Không | Không |
| Reset mật khẩu chủ quán | Có | Không | Không | Không | Không | Không | Không |
| Thông tin không nhạy cảm nhà hàng | Có | Có | Không | Không | Không | Không | Không |
| Admin cửa hàng | Không | Không | Có | Có | Không | Không | Không |
| Menu, khu vực, bàn, nhân viên | Không | Không | Có | Có | Không | Không | Không |
| Xem bàn/order | Không | Không | Có | Có | Có | Theo màn bếp | Có |
| Thêm món tại bàn | Không | Không | Có | Có | Có | Không | Không |
| Luồng bếp | Không | Không | Có | Có | Không | Có nếu gói cho phép | Không |
| Xác nhận thanh toán | Không | Không | Có | Có | Không | Không | Có nếu gói cho phép |
| Báo cáo | Không | Không | Có | Có | Không | Không | Chỉ lịch sử bill được cấp |

## Quyền gói

- BASIC: Phục vụ, yêu cầu/xác nhận thanh toán, in bill, báo cáo.
- PRO: BASIC + Quản lý, Bếp, Thu ngân và màn hình nghiệp vụ tương ứng.
- TRAIN: dùng `planEntitlement` BASIC hoặc PRO.
- Quán nước (`DRINK_SHOP`) được chuẩn hóa về quyền BASIC theo logic hiện tại.

## Nguyên tắc

- Platform Sub Admin không được nâng quyền qua form/API.
- Manager không được quản lý OWNER hoặc tự nâng thành OWNER.
- Staff cần membership active; WAITER/KITCHEN/CASHIER cần thiết bị hợp lệ cho luồng làm việc.
- Tenant A không được đọc/ghi ID của tenant B; mọi query phải scope `restaurantId`.
