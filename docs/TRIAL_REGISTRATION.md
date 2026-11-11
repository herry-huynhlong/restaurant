# QAVIO → QuánPilot: đăng ký dùng thử TRAIN/BASIC

## Luồng hiện hành

Khách nhập tên nhà hàng, mã đường dẫn, logo tùy chọn, họ tên, email và mật khẩu tại QAVIO. Không dùng Google OAuth và không cần xác nhận tài khoản Google.

QAVIO kiểm tra dữ liệu trình duyệt, honeypot, thời gian điền form, rate limit và idempotency key. Yêu cầu hợp lệ được chuyển tới QuánPilot bằng HMAC server-to-server. Browser không nhận secret tích hợp và không gọi trực tiếp API provisioning của QuánPilot.

QuánPilot kiểm tra HMAC, timestamp, nonce chống replay, client bucket, rate limit, quota, email trùng, slug trùng và idempotency. Việc tạo Restaurant, User, membership OWNER, RestaurantSetting, area và audit diễn ra trong cùng một transaction.

## Dữ liệu mặc định

Form không hiển thị hoặc gửi múi giờ, ngôn ngữ và đơn vị tiền tệ. QuánPilot luôn gán:

- timezone: Asia/Ho_Chi_Minh
- primaryLanguage: vi
- currency: VND

Slug được tạo từ tên quán bằng chữ thường không dấu và dấu gạch ngang. Người dùng có thể sửa slug; QuánPilot là nơi quyết định cuối cùng về tính duy nhất.

## Bảo toàn dữ liệu

Migration 20261111090000_qavio_trial_remove_google_identity chỉ nới nullable hai cột Google lịch sử của TrialRegistration. Không xóa TrialIdentityChallenge, TrialRegistration, nhà hàng hoặc người dùng cũ.

## Cấu hình và triển khai

Hai ứng dụng cần bật kill switch riêng và cùng secret HMAC dài tối thiểu 32 ký tự:

- QAVIO_TRIAL_ENABLED=true tại QAVIO.
- QUANPILOT_TRIAL_REGISTRATION_ENABLED=true tại QuánPilot.
- QUANPILOT_QAVIO_TRIAL_SECRET phải giống nhau ở hai server.
- QUANPILOT_TRIAL_API_ORIGIN, QUANPILOT_TRIAL_PUBLIC_ORIGIN và quota trial phải được cấu hình trước.

Không chạy migration trên production trước khi đã backup và kiểm thử bằng database cô lập.
