# Rà soát giao diện đăng nhập PWA nhân viên

**Cập nhật phát hành:** sau khi chủ dự án duyệt, bản sửa đã được commit/push/deploy. Xem [báo cáo production](PWA_DUAL_FLOW_PRODUCTION.md). Nội dung dưới ghi lại trạng thái tại thời điểm QA trước phát hành; native acceptance vẫn PENDING.

Ngày: 02/11/2026. Chưa commit/push/deploy. Bổ sung cho `PWA_DUAL_FLOW_IMPLEMENTATION.md`.

## Phạm vi và nguyên nhân ảnh trước

Chữ “PWA dual-flow QA” trong ảnh cũ là tên nhà hàng fixture trên database test, không phải chuỗi hardcode của giao diện production. Trang đăng nhập vẫn hiển thị tên nhà hàng theo slug. Không đổi tên hoặc dữ liệu nhà hàng production. Bộ ảnh mới dùng nhà hàng tổng hợp tên “Nhà hàng QAVIO” để trình bày giao diện dự kiến; đây vẫn là **ảnh QA**, không phải production.

Giữ cấu trúc đăng nhập hiện có: tên nhà hàng, tiêu đề đúng bộ phận, hướng dẫn tài khoản, username/email, mật khẩu và nút đăng nhập. Không đổi authentication, membership, tenant hoặc kiểm soát thiết bị.

## Điều chỉnh

- Đưa cài app xuống sau form. Chỉ còn nút nhỏ “Cài App” và câu “Truy cập nhanh từ màn hình chính.”; không có khối giải thích hai quy trình chiếm chỗ phía trên form.
- Hướng dẫn cài chỉ mở khi bấm nút; đóng được, giới hạn chiều rộng theo viewport.
- Provider có trạng thái `ready`. SSR và thời gian trước khi nhận diện môi trường không hiển thị nút/hướng dẫn cài đặt. Tránh nút xuất hiện thoáng qua trên PWA.
- Sau nhận diện, trình duyệt được thấy tùy chọn cài; standalone (`display-mode: standalone` hoặc `navigator.standalone`) không render cả nút lẫn phần hướng dẫn, kể cả ở workspace.
- Giữ server startup kiểm tra session/membership/device và tự chuyển workspace khi hợp lệ. Không thêm việc đăng nhập hoặc quét QR lại.

File source thay đổi thêm trong lần rà soát này:

1. `src/components/app-shell/pwa-install-provider.tsx`
2. `src/components/app-shell/install-app-button.tsx`
3. `src/app/[rSlug]/login/page.tsx`
4. `scripts/staff-pwa-install-ui-checks.ts` (mới)
5. `scripts/staff-pwa-http-checks.ts` (đổi kỳ vọng SSR cho cơ chế không nhấp nháy)
6. `.github/workflows/quanpilot-release.yml` (thêm UI check vào quy trình CI đang chuẩn bị, chưa chạy GitHub mới)

## Kiểm tra

| Trường hợp | Kết quả |
| --- | --- |
| Bốn bộ phận, browser không có phiên | PASS: đúng tiêu đề, có form và nút cài dưới form |
| Bốn bộ phận, standalone mô phỏng không có phiên | PASS: đúng form, không nút cài, không hướng dẫn cài |
| Standalone mô phỏng có phiên phục vụ hợp lệ | PASS: login URL chuyển vào workspace; reload giữ workspace, không nút cài |
| Hướng dẫn cài trong browser | PASS: chỉ mở sau click, đóng được; môi trường kết nối hiện hiển thị hướng dẫn desktop |
| Responsive browser 320/375/390/768px | PASS: không tràn ngang, nút đăng nhập nằm trong viewport 844px cao |
| React install UI tests | PASS: SSR/chưa nhận diện không CTA; standalone không CTA/help; browser có lựa chọn gọn |
| Session/install controller, install help, icon checks | PASS chạy lại bốn script, gồm UI check mới |
| HTTP/PostgreSQL PWA | PASS 25 nhóm trên candidate production-build sau thay đổi UI; đủ bốn quyền, A/B/session/revocation/tenant |
| Lint/typecheck/production build | PASS trên candidate sạch, Next build gồm lint và typecheck |
| Browser console/hydration trong các kiểm tra UI | Không ghi nhận lỗi trước bước đăng xuất/kết thúc fixture |
| Native iOS/Android installation | **PENDING** |

Lần chạy HTTP đầu sau sửa UI thất bại ở assertion cũ yêu cầu nút cài hiện trong HTML SSR. Đã sửa test theo yêu cầu mới: SSR ẩn nút cho tới khi biết môi trường; React UI/browser E2E kiểm tra nút xuất hiện sau hydration trong browser. Sau cập nhật, toàn bộ 25 nhóm đạt. Không bỏ kiểm tra khả năng cài trước đăng nhập.

Không thay đổi logic nghiệp vụ trong lần chỉnh UI; các regression tài chính/pricing/subscription đã đạt ở vòng trước, không chạy lại những nhóm đó chỉ vì thay layout.

## Ảnh và giới hạn bằng chứng

Ảnh lấy từ bản production-build local với source component thực, dữ liệu tổng hợp trên PostgreSQL test cô lập. **Không phải ảnh chụp production.**

| Bộ phận | Browser trước cài | Standalone mô phỏng chưa có phiên |
| --- | --- | --- |
| Quản lý | [Ảnh](pwa-ui-review/browser-manager.png) | [Ảnh](pwa-ui-review/standalone-simulated-manager.png) |
| Phục vụ | [Ảnh](pwa-ui-review/browser-waiter.png) | [Ảnh](pwa-ui-review/standalone-simulated-waiter.png) |
| Bếp | [Ảnh](pwa-ui-review/browser-kitchen.png) | [Ảnh](pwa-ui-review/standalone-simulated-kitchen.png) |
| Thu ngân | [Ảnh](pwa-ui-review/browser-cashier.png) | [Ảnh](pwa-ui-review/standalone-simulated-cashier.png) |

[Workspace standalone mô phỏng có phiên](pwa-ui-review/standalone-simulated-workspace.png). [Kết quả máy đọc](pwa-ui-review/results.json).

Không có thiết bị iPhone/Android hoặc dịch vụ native kết nối. Ảnh standalone được tạo bằng proxy QA **chỉ GET**, đặt tín hiệu `navigator.standalone=true` trước hydration. Proxy nằm ngoài app/release; không thay xác thực hoặc tự tạo phiên. Mô phỏng này kiểm tra nhánh render thực của provider/component, không thực hiện cài app bằng OS và không chứng minh Safari chuyển cookie. Phiên hợp lệ dùng trong kiểm tra điều hướng là phiên đã đăng nhập ở ứng dụng QA, không phải bằng chứng chuyển phiên native.

Ảnh native thật khi mở từ icon vẫn chưa thể chụp trong môi trường hiện có. Không gọi các ảnh này là native acceptance. Yêu cầu ảnh riêng hai trạng thái được đáp ứng ở mức QA browser/mô phỏng; phần chụp native thực tế còn **PENDING**.

## Trạng thái bàn giao

Rà soát UI tự động hiện tại đạt. Fixture đã đăng xuất/dọn khỏi database QA, file credential fixture đã xóa, server/proxy QA do tác vụ tạo đã dừng. Không chạm production/database thật hoặc dịch vụ khác. Chưa commit/push/deploy; native acceptance vẫn PENDING theo quyết định trước của chủ dự án.

Source candidate hiện gồm 27 file (thêm script UI check); SHA-256 cập nhật tại `pwa-dual-flow/source-manifest.json`. Bộ ảnh cũ được giữ để đối chiếu, không dùng làm ảnh phát hành. Cần nghiệm thu native và phê duyệt release trước khi triển khai.
