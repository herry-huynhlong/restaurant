# Sửa đồng bộ bảng giá — 22/10/2026

## Nguyên nhân đã chứng minh trước khi sửa

Production QuánPilot `1edbfd9`, QAVIO `cc06d0f` đã có đồng bộ. Cả6dòng BASIC/PRO ×3/6/12 tháng của `PlatformPlanPrice` có isActive=true nhưng **isPublished=false**. Nguồn và proxy đều HTTP200, version SHA256 của mảng rỗng, prices=[]. QAVIO fallback đúng theo điều kiện công bố; không có bằng chứng lỗi cache/network/domain/prerender.

BASIC12 đúng là giá chuẩn100.000VND, monthlyPriceVnd8333. PRO được đối chiếu cùng bảng giá chuẩn, không lấy báo giá nâng cấp tenant. Toàn bộ6dòng hiện tổng100.000VND; originalPriceVnd=null, không có ưu đãi. Các giá3/6/12 tháng bằng nhau là dữ liệu được chủ dự án xác nhận, không phải giá hardcode frontend.

Code liên quan:

- Restaurant `src/server/services/plan-pricing-service.ts`: getPublishedPlanPricing lọc active+published+positive; updatePlatformPlanPrice validate/lock/update/history/audit.
- `src/app/platform/plans/actions.ts`: updatePlanPriceAction; `src/app/platform/plans/page.tsx`: nơi chỉnh/công bố từng kỳ.
- `src/server/services/subscription-service.ts`: getPublicPlanPrices và createSubscriptionRequest đọc cùng PlatformPlanPrice cho checkout. isActive của checkout độc lập isPublished marketing; không đổi cách thanh toán.
- QAVIO `src/server/pricing.ts`: createPricingReader/readPublicPricing; `src/components/pricing-table.tsx`: poll/expiry; `src/app/(public)/pricing/page.tsx`: force-dynamic; không đọc DB Restaurant.

Environment không đặt origin riêng; fallback chính thức https://admin.qavio.site hoạt động. Fetch từ trong container QAVIO cũng200/prices[]. Mẫu1000dòng log không có marker pricing failure; vì route cũ catch lỗi không log chi tiết, không suy diễn rằng đã loại trừ mọi lỗi lịch sử chỉ từ log. Bằng chứng chính là truy vấn read-only và hai API200 cùng dữ liệu rỗng.

## Phạm vi đã duyệt và cách sửa

Sau chẩn đoán, chủ dự án trực tiếp chọn **“Công bố cả6kỳ với giá hiện tại”**. Đã bật duy nhất isPublished=true, updatedAt và ghi6history/6audit trong transaction khóa cùng bảng giá. Không thay priceVnd/monthlyPriceVnd/giá gốc/đề xuất/mô tả/active, không tạo ưu đãi. Operation CLI ghi actorKind OPERATOR_CLI, không mạo danh một tài khoản Platform Admin; lịch sử không có actor hiển thị “Thao tác hệ thống”.

API vẫn chỉ đọc giá được phép công bố; không bỏ điều kiện isPublished, không auto-publish giá mặc định và không tạo nguồn giá thứ hai. Không có endpoint public ghi giá.

Để tránh lặp lại nhầm lẫn “Đang bán” với “Đã công bố”, Admin thêm tổng số kỳ đang công bố và hướng dẫn ngay trên bảng giá. Lưu thành công nói rõ đã công bố hay chưa; hai câu cố định được thêm vào allowlist sanitizeFeedbackMessage, không nới cho phép thông báo tùy ý hoặc lộ lỗi kỹ thuật.

## Nguồn giá, API và TTL

Nguồn authoritative: Restaurant.PlatformPlanPrice.priceVnd là tổng kỳ; monthly bình quân làm tròn half-up như checkout. originalPriceVnd chỉ có nếu lớn hơn giá bán; discountBasisPoints lấy chênh lệch thật, floor0.01%. Không có giá gốc thì không del/badge.

- Source GET https://admin.qavio.site/api/public/pricing.
- Proxy GET https://qavio.site/api/public/pricing; whitelist các trường công khai, no-store, write methods405.
- Server cache15s, client poll15s, fetch timeout2.5s, hiệu lực tối đa60s từ nguồn. Mục tiêu35s khi nguồn hoạt động và tab foreground. Không build/deploy lại khi sửa giá đã công bố.
- Ngừng công bố phản ánh mảng mới; source lỗi chỉ dùng cache còn hạn, hết hạn bỏ số tiền, fallback liên hệ, API503, trang200.

## Kiểm thử

- Lint/TypeScript hai repo PASS. Restaurant production build local PASS; build Linux/integration CI và image digest được ghi sau phát hành ở dưới.
- PostgreSQL pricing_test cô lập: quyền Owner/Admin, chặn tenant/sub-admin/disabled; validation/discount/rounding; API không seed hoặc lộ id/actor/bank/subscription; đổi giá mới dùng cho checkout, order cũ giữ amount/snapshot; unpublish PASS.
- Subscription PostgreSQL integration và checkout checks PASS. Log unique-constraint thuộc ca duplicate webhook có chủ đích. Login integration PASS: đúng/sai/phiên/tenant/platform/multi-restaurant/logout/expired/Google verification-cookie separation; không ghi trial/subscription từ login.
- Browser đăng nhập Platform Owner QA, lưu form thật: BASIC12 từ100000→90000, original100000: website tự hiện7500/tháng, tổng90000, giảm10%, quan sát trong16.510ms. PRO12 tổng300000/original360000,25000/tháng, giảm16.66%, quan sát trong33.667ms. Đây là thời điểm quan sát, không phải độ trễ mạng chính xác; cả hai dưới35s, không reload QAVIO.
- Chọn3/6/12 đúng dữ liệu kỳ; no-discount không có badge. Ngừng công bố PRO qua form thật làm API bỏ kỳ và card fallback mà không reload; HTTP source/proxy deadline35s PASS. Snapshot số đo browser unpublish có thể ghi muộn do kiểm tra khác xen kẽ, không dùng observation lag đó làm latency.
- Responsive320/375/390/768/1440 không overflow. Console/hydration trước giả lập outage không lỗi.
- Cố ý dừng duy nhất server QuánPilot QA: sau expiry API QAVIO503, trang200, cả hai card bỏ giá cũ; sau khởi động lại dữ liệu hồi phục. Helper đầu có lỗi đọc UTF-8 khiến regex kiểm tiếng Việt sai dù503/expiry đã đạt; đã kiểm lại trực tiếp HTTP/DOM/screenshot và ghi proof PASS. Không ghi lỗi helper thành lỗi ứng dụng.
- Không stress/đổi giá production để test, không tạo customer/order QA trong production. Thử Google OAuth thật không cần lặp vì không sửa code OAuth; regression dùng adapter cô lập và các guard hiện có.

Ảnh và JSON trong `docs/pricing-sync-fix/` phân biệt qa-* và production-*. Dữ liệu QA không phải giá công khai đã duyệt.

## Backup và publication production

Backup mới hai DB+upload/media, mã hóa và tải off-host. SHA256 encrypted `db411f50577ef321a8cc3d87bbc584a4efef114e942ecd86a2341a71e2bf867a`. Restore riêng QAVIO5migrations/Restaurant28migrations PASS, DB restore và plaintext đã dọn, giữ backup mã hóa. Không migration mới.

Publication transaction kiểm cả6giá vẫn100000, monthly đúng kỳ, active và không có giá gốc; lệch dữ liệu thì dừng, không overwrite. Đã thay6publication flags và ghi audit; hash amount/pricing snapshots của request/order trước/sau không đổi.

Hai public API sau công bố trả đúng6giá và cùng version. Kỳ12 trên production QAVIO đã quan sát BASIC/PRO tổng100.000đ,8.333đ/tháng. Các kỳ3/6 lần lượt33.333đ/16.667đ mỗi tháng; tổng mỗi kỳ100.000đ. Không badge ưu đãi.

## Phát hành và rollback

QAVIO frontend không thay code: giữ imagecc06d0f, không cần recreate để đọc giá mới. Bản Admin QuánPilot chỉ thay phần hướng dẫn/status/feedback và tên actor hệ thống; triển khai riêng app qua CI ngoài VPS, image-only --no-build --pull never --no-deps. Không restart PostgreSQL/worker/Portfolio, không thay flags/env/auth/payment/OAuth.

Source SHA, CI, image digest và kết quả deploy được bổ sung ở phần cuối sau xác minh. Hardening overlay chưa áp production; dùng quy trình image-only đang vận hành, kiểm source/artifact/config/rootfs và disk, giữ current image để rollback. Không giả định guard mới đã cài trên host.

Rollback app về image1edbfd9 nếu bản UI có lỗi; giữ publication đã được chủ duyệt (API cũ đã hỗ trợ). Không rollback schema hoặc restore đè DB. Gỡ công bố chỉ qua quyết định riêng của chủ dự án, không tự hoàn tác business approval vì lỗi UI.
