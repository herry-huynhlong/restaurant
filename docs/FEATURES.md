# Chức năng và luồng nghiệp vụ

## Khách gọi món QR

- **Ai dùng:** khách không đăng nhập.
- **Frontend:** `src/app/[rSlug]/welcome`, `menu`, `cart`, `orders`, `payment`; component trong `src/components/customer`.
- **Backend:** welcome action; API `customer/order`, `customer/bill`, `customer/service-request`.
- **Dữ liệu:** RestaurantTable, DiningSession, Order, OrderItem, ServiceRequest, Payment.
- **Luồng:** QR token -> nhập tên -> cookie ký -> menu -> tạo order idempotent -> bếp/phục vụ nhận thông báo -> khách xem bill/yêu cầu thanh toán.
- **Lưu ý:** không dùng tên bàn hoặc `tableId` đơn lẻ để xác thực; luôn đối chiếu token, slug và tenant.

## Quản trị cửa hàng

- **Ai dùng:** OWNER và MANAGER, tùy quyền gói.
- **Frontend:** `src/app/[rSlug]/admin/*`, `src/components/admin/*`.
- **Backend:** `admin/actions.ts`, API `admin/menu`, các service restaurant/table/order/report.
- **Chức năng:** tổng quan, menu, khu vực/bàn/QR, order theo bàn, thêm món, nhân viên, top món, báo cáo, subscription và cài đặt.
- **Lưu ý:** OWNER mới được đổi mật khẩu chủ quán; quản lý nhân viên không được sửa/xóa OWNER.

## Phục vụ

- **Ai dùng:** WAITER; OWNER/MANAGER có thể quan sát/thao tác theo guard.
- **Frontend:** `src/app/[rSlug]/staff`, `staff-workspace-tabs`, bảng bàn/order dùng chung.
- **Backend:** `ops/actions.ts`, API state/order/request/notification.
- **Chức năng:** món chờ đi, yêu cầu khách, khu vực & bàn, order theo bàn, thêm món trực tiếp.
- **Lưu ý:** WAITER cần thiết bị đã đăng ký và chưa bị thu hồi.

## Bếp

- **Ai dùng:** KITCHEN trong gói có `KITCHEN_FLOW`, cùng OWNER/MANAGER.
- **Frontend:** `src/app/[rSlug]/kitchen`, `food-item-display-card`.
- **Backend:** claim/ready actions trong `ops/actions.ts`.
- **Chức năng:** nhận món, chuyển đang làm, hoàn thành; ảnh lấy từ Product hiện tại, tên/giá lịch sử lấy snapshot.

## Thu ngân và bill

- **Ai dùng:** CASHIER trong gói phù hợp; OWNER/MANAGER.
- **Frontend:** `src/app/[rSlug]/cashier`, `cashier-workspace`, `invoice-print-button`, lịch sử payment thu gọn theo ngày.
- **Backend:** `ops/pay-session`, `payment-service`, `payment-detail-service`.
- **Chức năng:** theo dõi mọi phiên bàn đang mở kể cả chưa có món, xem Order/tạm tính, xử lý yêu cầu, chủ động thanh toán, chống xác nhận trùng, đóng phiên, giải phóng bàn và in/in lại bill 58/80 mm.
- **Lưu ý:** in không tạo Payment và không đổi trạng thái; chỉ Payment PAID được in nhãn đã thanh toán.

## Nhân sự và thiết bị

- **Frontend:** `/[rSlug]/admin/staff`, thiết lập thiết bị, ca làm và notification settings.
- **Backend:** staff actions, API `device-session`, `shift`, `push/subscribe`.
- **Dữ liệu:** User, RestaurantUser, StaffDeviceSession, PushSubscription, AuditLog.
- **Lưu ý:** username unique trong từng nhà hàng; tài khoản User có thể có membership nhưng thao tác phải scope tenant.

## Báo cáo

- **Quyền:** feature `REPORTS`, hiện BASIC/PRO/TRAIN đều có.
- **Frontend:** reports, top-items, payment history.
- **Backend:** reporting-service, top-items-service, payment-detail-service.
- **Nguồn:** chỉ Payment PAID và snapshot đơn hàng; timezone lấy cấu hình nhà hàng.

## Gói dịch vụ

- **Gói:** BASIC, PRO, TRAIN với `planEntitlement` BASIC/PRO cho TRAIN.
- **Luồng:** cửa hàng gửi request -> Platform Owner xác nhận thanh toán/từ chối -> service khóa row request -> cập nhật gói/thời hạn và audit event.
- **Dữ liệu:** PlatformPlanPrice, PriceHistory, SubscriptionRequest/Event, PlatformSubscriptionPolicy.

## Platform Admin

- **PLATFORM_OWNER/legacy PLATFORM_ADMIN:** toàn quyền nền tảng.
- **PLATFORM_SUB_ADMIN:** xem và chỉnh thông tin không nhạy cảm; không đổi giá/gói/trạng thái, xóa/restore hoặc reset mật khẩu chủ quán.
- **Chức năng:** dashboard, nhà hàng, chủ quán, admin phụ, plan/pricing, audit, settings, storage.

## Backup, restore và tài nguyên

- Worker chạy lịch backup, cleanup, heartbeat và job restore.
- Collector host ghi atomic `metrics.json`; UI chỉ đọc và báo stale.
- Backup/restore theo cửa hàng chỉ tác động tenant tương ứng.
- Restore production được khóa mặc định bởi `TENANT_RESTORE_ENABLED=false`.

## Notification

- Notification trong app lưu PostgreSQL.
- Foreground cập nhật qua SSE/polling và phát âm thanh sau khi người dùng mở khóa audio.
- Background dùng PushSubscription/Web Push; HTTP 201 từ push provider không bảo đảm Android đã hiển thị.
