# Đồng bộ thời gian thực và thông báo

## Kiến trúc hiện tại

Ứng dụng cập nhật giao diện nhân viên bằng Server-Sent Events (SSE) tại route notification stream. Mỗi kết nối được xác thực, kiểm tra thành viên, vai trò, thiết bị và chỉ nhận sự kiện của đúng `restaurantId`.

Kênh logic có dạng:

```text
restaurant:{restaurantId}
```

Event bus hiện được giữ trong bộ nhớ của tiến trình Node.js. Vì vậy cơ chế này phù hợp khi chạy một replica ứng dụng; nếu mở rộng nhiều replica cần chuyển event bus sang Redis Pub/Sub hoặc hạ tầng tương đương.

## Sự kiện nghiệp vụ

Các thay đổi order, món bếp, yêu cầu phục vụ và thanh toán phát tín hiệu để client tải lại dữ liệu đúng tenant. Database `Notification` hiện lưu các loại:

- `ORDER_CREATED`
- `SERVICE_REQUEST_CREATED`
- `PAYMENT_REQUESTED`
- `ORDER_READY`
- `SUBSCRIPTION_EXPIRING`

Tên sự kiện SSE nội bộ có thể chi tiết hơn enum lưu database; client không được dùng payload SSE như nguồn dữ liệu có thẩm quyền mà phải gọi lại API/action đã kiểm tra quyền.

## Push notification

Web Push dùng VAPID và `PushSubscription`. Subscription gắn đồng thời với người dùng, cửa hàng và thiết bị. Endpoint hết hạn được vô hiệu hóa khi nhà cung cấp push trả trạng thái không còn hợp lệ.

Điều kiện vận hành:

1. HTTPS hợp lệ.
2. Có đủ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
3. Trình duyệt đã cấp quyền thông báo.
4. Service worker được đăng ký đúng scope.
5. Nhân viên đã mở ca trên thiết bị hợp lệ.

Âm thanh trong ứng dụng cần một tương tác người dùng để vượt chính sách autoplay của trình duyệt. HTTP 201 từ nhà cung cấp push chỉ xác nhận yêu cầu gửi được chấp nhận, không chứng minh Android đã hiển thị popup.

## Kiểm tra thủ công bắt buộc

- Ứng dụng đang mở, chạy nền và đã đóng.
- Màn hình khóa Android.
- Chrome thường và PWA đã cài.
- Subscription cũ sau khi cài lại PWA.
- Thiết bị bị thu hồi phiên hoặc nhân viên ngoài ca.
- Hai cửa hàng khác nhau không nhận chéo thông báo.
