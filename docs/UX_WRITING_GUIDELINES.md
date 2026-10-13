# Quy chuẩn nội dung giao diện tiếng Việt

Tài liệu này dùng cho toàn bộ giao diện người dùng của QuánPilot. Mục tiêu là giữ cách gọi thống nhất, dễ hiểu với chủ quán, nhân viên và quản trị nền tảng; tránh để lộ thuật ngữ kỹ thuật trong giao diện production.

## Nguyên tắc chung

- Viết ngắn, rõ, đúng ngữ cảnh vận hành nhà hàng.
- Ưu tiên từ ngữ người dùng quen dùng trong thực tế: nhà hàng, chủ quán, nhân viên, bàn, món, đơn, thanh toán.
- Không hiển thị thuật ngữ kỹ thuật nội bộ trên UI nếu người dùng không cần biết.
- Không dùng tiếng Anh khi đã có cách gọi tiếng Việt tự nhiên.
- Không đưa đường dẫn file, tên source code, tên bảng dữ liệu, tên API hoặc cơ chế backend vào giao diện.
- Thông báo lỗi phải nói rõ người dùng cần làm gì tiếp theo.

## Thương hiệu

- Tên sản phẩm: `QuánPilot`
- Khu vực quản trị nền tảng: `QuánPilot Admin`
- Không dùng lại tên cũ như `Restaurant SaaS` trong UI.

## Cách gọi vai trò

| Enum/code | Label UI |
| --- | --- |
| OWNER | Chủ quán |
| MANAGER | Quản lý |
| WAITER | Nhân viên phục vụ |
| KITCHEN | Bếp |
| CASHIER | Thu ngân |
| PLATFORM_ADMIN | Quản trị nền tảng |

Không hiển thị raw enum vai trò cho người dùng cuối.

## Cách gọi trạng thái

### Nhà hàng

| Enum/code | Label UI |
| --- | --- |
| ACTIVE | Đang hoạt động |
| INACTIVE | Chưa hoạt động |
| SUSPENDED | Đã khóa |
| DELETED | Đã xóa |

### Bàn

| Enum/code | Label UI |
| --- | --- |
| AVAILABLE | Đang trống |
| OCCUPIED | Đang phục vụ |
| PAYMENT_REQUESTED | Chờ thanh toán |
| DISABLED | Ngừng sử dụng |

### Thanh toán

| Enum/code | Label UI |
| --- | --- |
| PAID | Đã thanh toán |
| PENDING | Chờ thanh toán |
| CANCELLED | Đã hủy |
| REFUNDED | Đã hoàn tiền |

## Cách gọi gói dịch vụ

- Dùng `BASIC` và `PRO` khi hiển thị badge ngắn.
- Khi cần mô tả, dùng: `Gói BASIC`, `Gói PRO`.
- Không hiển thị `FREE` trong luồng thương mại chính nếu sản phẩm đã chốt chỉ còn BASIC/PRO.
- Không dùng cụm `feature gating` trên UI. Dùng `Quyền lợi gói dịch vụ` hoặc `Tính năng theo gói`.

## Thuật ngữ nên dùng

| Nên dùng | Tránh dùng trên UI |
| --- | --- |
| Mã đường dẫn | Slug |
| Múi giờ | Timezone |
| Đơn vị tiền tệ | Currency |
| Đặt lại mật khẩu | Reset pass |
| Chủ quán | Owner |
| Quản trị nền tảng | Platform Admin |
| Dữ liệu lịch sử | Audit / audit log |
| Hệ thống lưu trữ | Database |
| Hệ thống chưa được cập nhật | Migration / Prisma error |
| Thông báo đẩy | Push API / Service Worker Push API |
| Quyền lợi gói dịch vụ | Feature flags / feature gating |
| Khu vực thao tác nhạy cảm | Danger Zone |

## Form và nút

- Label form dùng danh từ rõ ràng: `Tên nhà hàng`, `Mã đường dẫn`, `Email chủ quán`, `Mật khẩu khởi tạo`.
- Nút hành động dùng động từ: `Tạo nhà hàng`, `Lưu thay đổi`, `Đặt lại mật khẩu`, `Xóa nhà hàng`.
- Nút nguy hiểm phải mô tả đúng hậu quả và có xác nhận.
- Tránh nút mơ hồ như `OK`, `Submit`, `Save`, `Reset`.

## Thông báo thành công

Viết theo mẫu:

- `Đã lưu thay đổi.`
- `Đã tạo nhà hàng.`
- `Đã đặt lại mật khẩu chủ quán.`
- `Đã ghi nhận xác nhận quyền lợi gói dịch vụ.`

Không cần nói cơ chế kỹ thuật đã chạy.

## Thông báo lỗi

Thông báo lỗi nên:

- Nói rõ vấn đề.
- Dùng từ người dùng hiểu được.
- Không lộ stack trace, model, query, table, API route.

Ví dụ:

- Dùng: `Mã đường dẫn này đã được sử dụng. Vui lòng chọn mã khác.`
- Tránh: `Unique constraint failed on Restaurant.slug.`

- Dùng: `Hệ thống lưu trữ chưa được cập nhật cấu trúc mới. Vui lòng cập nhật hệ thống rồi thử lại.`
- Tránh: `Prisma P2022: column does not exist.`

## Trang quản trị nền tảng

Các trang platform phải dùng cách gọi nhất quán:

- `/platform`: `Tổng quan`
- `/platform/restaurants`: `Nhà hàng`
- `/platform/plans`: `Gói dịch vụ`
- `/platform/owners`: `Tài khoản chủ quán`
- `/platform/activity`: `Hoạt động hệ thống`
- `/platform/settings`: `Cài đặt nền tảng`

Không dùng cụm kỹ thuật trong mô tả trang như `source of truth`, `runtime`, `backend`, `frontend`, `database`, `API`, `hardcode`.

## Trang quản trị nhà hàng

Sidebar nhà hàng dùng:

- `Tổng quan`
- `Menu`
- `Khu vực & Bàn`
- `Order`
- `Nhân viên`
- `Top món`
- `Báo cáo`
- `Cài đặt`

Nếu cần đổi `Order` sang tiếng Việt sau này, ưu tiên `Đơn gọi món` hoặc `Đơn hàng theo bàn`, nhưng phải đổi đồng bộ toàn hệ thống.

## Kiểm tra trước khi merge

Trước khi hoàn thành một tính năng có UI, hãy rà:

- Có lộ raw enum không?
- Có tiếng Anh không cần thiết không?
- Có thuật ngữ kỹ thuật như API, DB, Prisma, backend, frontend, source, runtime không?
- Có dùng cùng một khái niệm với nhiều tên khác nhau không?
- Thông báo lỗi có hướng xử lý cho người dùng không?
- Mobile có bị cắt chữ hoặc tràn nút không?

## Ghi chú cho lập trình

Tên biến, field, route và schema vẫn có thể dùng tiếng Anh theo chuẩn codebase. Quy chuẩn này áp dụng cho nội dung hiển thị với người dùng: label, heading, button, toast, dialog, empty state, validation message và metadata sản phẩm.
