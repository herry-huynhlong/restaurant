# Nghiệm thu QR/PWA nhân viên trên hai iPhone

Ngày 02/11/2026. Bản sửa source `d06e3a7ac69dfcc66ceaa9a1bfd57f4e3497616b`.

Tài liệu này là hướng dẫn kiểm tra, không phải bằng chứng đã chạy thành công trên iPhone. Kết quả triển khai và manifest production được ghi riêng tại `STAFF_QR_PWA_PRODUCTION.md`.

## Cài lại icon cũ một lần

Thực hiện riêng trên từng iPhone:

1. Đóng app QuánPilot cũ trong trình chuyển ứng dụng. Nhấn giữ icon cũ ngoài màn hình chính, chọn xóa ứng dụng/dấu trang tương ứng giao diện iOS, rồi xác nhận xóa icon. Đây là bản cài trên điện thoại; không xóa cửa hàng, nhân viên hay dữ liệu bán hàng trên server. Không cần xóa lịch sử hoặc toàn bộ dữ liệu Safari.
2. Mở **Safari**. Dùng đúng QR hoặc liên kết bộ phận lấy từ trang **Nhân viên → Mã đăng nhập theo bộ phận** của cửa hàng. Địa chỉ phải thuộc `https://admin.qavio.site/{slug}/login?role=...`. Không cài từ trang `/welcome`, `/menu` hay QR dành cho khách tại bàn.
3. Đăng nhập tài khoản được cấp. Hoàn tất tên người sử dụng thiết bị nếu được yêu cầu. Kiểm tra đã ở đúng cửa hàng và khu vực làm việc của tài khoản.
4. Bấm **Chia sẻ → Thêm vào Màn hình chính → Thêm**. Nếu iOS có tùy chọn mở như ứng dụng web, bật tùy chọn đó. Thực hiện từ đúng trang nhân viên, không từ một tab gọi món của khách.
5. Mở app mới từ icon. Nếu cần đăng nhập lần đầu trong app, phải thấy tên đúng cửa hàng, nhãn bộ phận và hướng dẫn đăng nhập lại; dùng tài khoản đã được cấp. Không được xuất hiện “QR không hợp lệ” hoặc trang nhập tên khách tại bàn.

## Kiểm tra phiên còn hạn

1. Sau khi đã đăng nhập trong app, xác nhận đúng khu vực: Quản lý → quản trị; Phục vụ → phục vụ; Bếp → bếp; Thu ngân → thu ngân.
2. Đóng Safari, đóng app qua trình chuyển ứng dụng, rồi mở lại **icon mới**. Khi phiên và thiết bị còn hợp lệ, app phải vào khu vực làm việc mà không quét QR hoặc nhập lại thông tin.
3. Lặp lại đóng/mở app một lần nữa, rồi khóa/mở màn hình và thử lại. Không cần tạo order/thanh toán hoặc đổi dữ liệu bán hàng để kiểm tra.
4. Không đổi bộ phận bằng cách sửa query role. Quyền thực tế vẫn lấy từ tài khoản/membership và gói hiện có; không được tăng quyền để làm bài test. Nếu cửa hàng chưa có quyền dùng một bộ phận, ghi “không có entitlement/tài khoản phù hợp”, không coi đó là lỗi PWA.

Nếu thử nhiều tài khoản/bộ phận trên cùng điện thoại, đăng xuất tài khoản trước và cài từ đúng liên kết bộ phận; không dùng một phiên đã đăng nhập làm bằng chứng cho tất cả vai trò. Không chia sẻ mật khẩu, cookie hoặc token.

## Khi không có hoặc hết phiên

Điểm mở app là login của đúng slug, có tham số `pwa=1` và role đã whitelist. Trang phải hướng dẫn đăng nhập lại, không báo lỗi mã QR khách. Nếu app mới chưa có phiên của tab Safari, đăng nhập một lần ngay trong app rồi kiểm tra đóng/mở lần hai. Kiểm thử HTTP giữ cookie đã đạt không chứng minh Safari chuyển cookie sang app cài mới trên mọi phiên bản iOS.

## Bảng kết quả cần chủ dự án xác nhận

| Thiết bị | iOS/trình duyệt | Bộ phận | Icon mới mở đúng cửa hàng | Đăng nhập lần đầu nếu cần | Đóng/mở lại giữ phiên | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone 1 | Chờ xác nhận | Chờ xác nhận | Chờ | Chờ | Chờ | |
| iPhone 2 | Chờ xác nhận | Chờ xác nhận | Chờ | Chờ | Chờ | |

Cần kết quả theo từng bộ phận có tài khoản được phép sử dụng. Chưa có xác nhận này thì trạng thái nghiệm thu native iPhone vẫn **PENDING**, kể cả khi deploy và HTTP đều thành công. Android native cũng cần thử riêng.

Nếu còn lỗi, cung cấp tên cửa hàng/slug, bộ phận, phiên bản iOS, lỗi xảy ra lần mở đầu hay lần mở tiếp theo và phần pathname của URL (nếu nhìn thấy). Không gửi token, cookie, mã QR khách hoặc mật khẩu.
