# Bảng giá QuánPilot và đồng bộ QAVIO

Ngày phát hành: 22/10/2026. **Đã commit, push và deploy production cả QAVIO và QuánPilot**, theo phê duyệt “oke lên đi”.

## Nguồn giá và đồng bộ

Nguồn duy nhất là `Restaurant.PlatformPlanPrice`: `priceVnd` là tổng tiền bán cho kỳ 3/6/12 tháng. Checkout tiếp tục lấy chính dòng này; QAVIO không có bảng giá trong PostgreSQL của mình và không kết nối DB Restaurant.

Platform Owner và Platform Admin chỉnh tại `/platform/plans`. Platform Sub Admin và tài khoản nhà hàng không có quyền. Guard của Server Action giữ nguyên; service kiểm tra lại vai trò và tài khoản active. Transaction khóa sửa giá, ghi lịch sử before/after, actor và AuditLog cùng lúc. Mô tả nội bộ không đi ra API.

`GET https://admin.qavio.site/api/public/pricing` đang hoạt động, chỉ đọc những kỳ active, published, giá dương. Response whitelist: plan/name/term/currency/final/monthly/original/discount/features/status/updatedAt, version SHA256, generatedAt/validUntil. Không seed DB; không trả id dòng giá, actor, khách hàng, subscription, ngân hàng, secret. POST/PUT/PATCH/DELETE trả 405. Không cần CORS vì QAVIO đọc từ server rồi proxy GET cùng origin `/api/public/pricing`.

QAVIO có cache RAM public 15 giây, fetch timeout 2,5 giây, client poll 15 giây và refresh khi trở lại tab. Mục tiêu cập nhật trong 35 giây khi tab foreground và nguồn hoạt động. Dữ liệu hết hạn sau 60 giây từ nguồn: timer phía client loại bỏ giá hết hạn; server không kéo dài validUntil khi lỗi. Cache còn hạn được dùng trong sự cố ngắn. Không còn giá tin cậy thì card chuyển sang “Liên hệ nhận báo giá”, trang vẫn HTTP 200. Proxy API trả 503 khi không còn dữ liệu hợp lệ.

Có thể cấu hình server-only `QUANPILOT_PRICING_API_ORIGIN`; mặc định dùng `QUANPILOT_PUBLIC_URL`, rồi hostname chính thức `https://admin.qavio.site`. Kiểm thử dùng loopback 3200. Không cần rebuild khi sửa tiền/công bố trong Admin. Không có endpoint QAVIO ghi giá.

## Tiền và ưu đãi

Giữ nguyên cách thương mại hiện hành: Admin nhập **giá cuối cả kỳ**, không sinh thêm bộ giá hay phép tính nâng cấp. Bổ sung **giá gốc cả kỳ** tùy chọn; chỉ hợp lệ khi lớn hơn giá bán dương. Để trống là không ưu đãi. Chỉ công bố kỳ đang bán, tổng lớn hơn 0.

Tiền lưu integer VND. Bình quân tháng dùng chia integer half-up, tương đương Math.round của checkout hiện tại cho số dương. Tổng tiền là số chốt; bình quân có nhãn làm tròn đến đồng. Discount tính từ chênh lệch thật bằng BigInt, floor tới 0,01% để không phóng đại. Nếu mức giảm nhỏ hơn độ phân giải đó, QAVIO hiện tiết kiệm VND thay vì badge 0%. Không tự tạo ưu đãi khi kỳ dài có bình quân thấp hơn kỳ ngắn.

Không sửa logic tạo subscription request/payment order, snapshot ngân hàng, thanh toán, entitlement hoặc PRO upgrade. Order cũ giữ số tiền/snapshot đã chốt; request/checkout mới dùng giá hiện tại. Trong khoảng cache truyền giá, khách vẫn xác nhận giá hiện hành trong QuánPilot; marketing không tạo checkout hoặc báo giá nâng cấp cá nhân.

## Migration đã triển khai

`Restaurant/prisma/migrations/20261022090000_public_plan_pricing/migration.sql`:

- Thêm nullable `originalPriceVnd`, `isPublished NOT NULL DEFAULT false` vào bảng giá hiện có.
- Thêm old/new original price và publication vào bảng lịch sử hiện có.
- CHECK giá gốc NULL hoặc lớn hơn giá bán dương.
- Không UPDATE/DELETE dữ liệu cũ, không sửa giá, không đổi schema payment/subscription/nhà hàng.

Đã chạy đủ 28 migration trên PostgreSQL `pricing_test` cô lập tại loopback 55432. Giá tạo bằng cơ chế hiện có giữ unpublished; đọc public không seed. **Đã áp migration production thành công: Restaurant 27 → 28, QAVIO giữ 5.** SQL có BEGIN/COMMIT; dry-run trên bản restore production cô lập đạt trước khi áp thật. Chủ dự án tự công bố các kỳ trong Platform Admin; migration không tự phê duyệt giá/giảm giá đang có. QAVIO không có migration.

## Giao diện

Navy/vàng kim, BASIC/PRO cạnh nhau trên desktop và xếp dọc trên mobile, PRO nhãn “Gói nâng cao”. Giá bình quân lớn, tổng kỳ rõ, giá gốc gạch ngang/badge chỉ khi có ưu đãi thật. Bộ chọn 3/6/12 tháng native button, aria-pressed, focus rõ, CTA >=48px. Bỏ box “Thông tin gói cần được xác nhận” và nội dung cấu hình nội bộ. CTA dùng thử `/trial`, đăng nhập tập trung vào `https://admin.qavio.site/restaurant-login`; không đoán route mua gói.

Không có file ảnh mẫu bảng giá được đính kèm ở yêu cầu này; đã bám bố cục chi tiết bằng chữ, không tuyên bố đối chiếu pixel với ảnh chưa xem.

## Kết quả kiểm thử

- Hai repository: lint, TypeScript, production build PASS trên máy local, không build VPS.
- Restaurant `scripts/public-pricing-integration.ts`: PostgreSQL riêng, read-only/no seed, unpublished mặc định, Owner/Admin service, chặn USER/Sub Admin, validation tiền/giá gốc/công bố, integer rounding, discount/không discount, whitelist, history actor, checkout parity, snapshot order cũ bất biến, order mới dùng giá mới, unpublish PASS.
- `scripts/subscription-postgres-integration.ts`: subscription/concurrent checkout/idempotency/webhook/payment/entitlement PASS. Log unique constraint là tình huống duplicate webhook có chủ đích, suite đạt.
- Checkout và entitlement-credit checks PASS; không thay luồng upgrade bị chặn khi thiếu entitlement.
- Login HTTP integration: anonymous/sai/đúng password/phiên còn hạn/đúng tenant/tenant khác/multi-restaurant/logout/hết hạn/không coi cookie Google verification là login PASS. Chạy trên pricing_test; không tác động quán local Long Phụng.
- Trial regression 22 ca PASS trên restaurant_trial_test, adapter cô lập; không thử Google production lại trong task giá.
- QAVIO contact consultation 14 ca và Admin 31 ca PASS trên qavio_test; không outbox/email sản xuất.
- Public routes: 14 trang, 378 link nội bộ, metadata/canonical/OG/Twitter/sitemap/404/logo gốc PASS.
- QAVIO cache unit: refresh 15s, giữ cache còn hạn, bỏ cache hết hạn, cold outage, reject giá không nhất quán PASS.
- HTTP hai API: dữ liệu đồng nhất, no-store, write methods 405, Admin anonymous bị chặn PASS.
- Browser đăng nhập Platform Owner QA qua form thật, chỉnh/công bố BASIC và PRO qua Server Action; QAVIO đang mở tự cập nhật không reload. BASIC quan sát sau 23.767ms, PRO 13.247ms (đều dưới 35s). BASIC 700.001/3 → 233.334/tháng, từ 900.000 có giảm 22,22%; sau đổi 810.000 thì đúng 10%. PRO không có giá gốc không có discount. Đây là dữ liệu QA, không phải giá/khuyến mại đã duyệt production.
- Browser chọn 3/6/12 tháng, thao tác Enter, link dùng thử/login PASS; no-discount không có phần tử del. Console/hydration không có lỗi ở trang kiểm thử.
- Responsive 320/375/390/768/1024/1440 PASS: không phần tử main tràn ngang, hai card cùng hàng >=768, xếp dọc mobile, selector cao48px. Riêng320 đã sửa 12 tháng không xuống dòng. Ảnh desktop lưu thêm ở1200px để vừa khung chụp ứng dụng.
- Đã dừng riêng QuánPilot local để mô phỏng sự cố nguồn: cache còn hạn dùng được, khi hết hạn proxy trả503, trang pricing vẫn200 và hai card bỏ giá cũ/chuyển liên hệ. Browser xác nhận hai fallback, không còn giá hết hạn và không lỗi console. Khởi động lại nguồn, HTTP hai API đồng nhất trở lại PASS; xem QAVIO `docs/pricing/outage.json` và `outage-browser.jpg`.

Ảnh QAVIO `docs/pricing/`: desktop.jpg, mobile-320.jpg, mobile-375.jpg, mobile-390.jpg, tablet-768.jpg, desktop-1024.jpg, discount-qa.jpg; responsive.json, sync-browser.json, outage.json. Ảnh Admin ở Restaurant/docs/pricing/admin-qa.jpg. Các giá trong ảnh là giá fixture local; ảnh desktop kỳ12 dùng những số đã có sẵn trong code trước task, không xác nhận chúng được duyệt công bố thật.

## Phạm vi file

Restaurant: prisma/schema.prisma; migration SQL mới; src/lib/plan/pricing.ts; src/server/services/plan-pricing-service.ts; src/app/api/public/pricing/route.ts; platform/plans actions.ts và page.tsx; subscription-service.ts chỉ bổ sung tên actor trong dashboard; scripts/public-pricing-integration.ts; scripts/restaurant-login-integration.ts chỉ thêm cho phép DB pricing_test; tài liệu/ảnh.

QAVIO: AGENTS.md cập nhật trạng thái phát hành; .env.example; src/lib/site-config.ts chỉ metadata pricing; src/lib/pricing-contract.ts; src/server/pricing.ts; src/app/api/public/pricing/route.ts; src/components/pricing-table.tsx và module.css; src/app/(public)/pricing/page.tsx; scripts/pricing-cache-checks.ts và pricing-http-checks.mjs; tài liệu/ảnh.

Không sửa auth, NextAuth, mật khẩu, phân quyền tenant, QR, payment, trial, contact, email, flag production, Nginx hoặc dịch vụ khác. File Qavio.png root và upload/qavio untracked có sẵn không thuộc task, không stage.

## Phát hành và rollback — ĐÃ ĐƯỢC DUYỆT

1. Chủ dự án duyệt hai repo + additive migration, và tự chọn kỳ/giá cần công bố. Không phê duyệt giá thông qua fixture QA.
2. Kiểm tra git diff/secret scan; commit riêng từng repo và push; CI build Linux bên ngoài VPS. Migration/schema đổi nên không dùng đường build UI-only bỏ qua runtime/schema.
3. Kiểm tra disk/inventory mới, giữ toàn bộ container/volume và ảnh hiện tại. Không prune chung, không down-v.
4. Backup DB/media mới, tải off-host, xác minh checksum và restore trên DB cô lập trước migration.
5. Áp additive migration Restaurant, triển khai image QuánPilot trước; verify API/publication/auth/checkout guards. Deploy QAVIO sau, cấu hình origin chính thức. Không tái khởi động PG/worker/Portfolio không liên quan.
6. Smoke HTTPS hai domain, health, GET pricing, cookie/auth, API405, SEO, trial/contact; xác nhận update/expiry và monitoring. Không tạo dữ liệu QA vào production.
7. Rollback web về images hiện có trước task: QAVIO5f10868 và QuánPilot3574ce4. Giữ cột mới khi rollback; không drop cột/restore đè DB. Nếu quay lại Admin cũ, cần kiểm tra tương tác CHECK giá gốc trước chỉnh giá; ưu tiên bản sửa tiến thay vì gỡ ràng buộc tùy tiện. Nếu QAVIO cũ thì API mới không ảnh hưởng checkout.

Đã hoàn tất quy trình trên. Bằng chứng production, nguồn image và dung lượng ghi ở phần kết quả bên dưới.

## Bàn giao local

Đã đăng xuất Platform Owner QA và dọn tài khoản, nhà hàng, request/order test trong pricing_test; xóa file credential fixture riêng. Giữ sáu dòng giá fixture có sẵn để xem thử public tại loopback3100/pricing, không có discount sau cleanup. Hai server local được khôi phục; kiểm tra HTTP/điều hướng sau hồi phục đạt. Secret scan QAVIO không có giá trị secret trong Git candidates.

## Quyết định phát hành mới

Chủ dự án đã duyệt commit/push/deploy cả hai repo và additive migration. Phát hành giữ bản gỡ newsletter đã lên production; không tự công bố giá hoặc thêm giảm giá. Rollback hiện tại QAVIO5f10868 (thay d590b1c ở kế hoạch trước), QuánPilot3574ce4. Kết quả production đã được kiểm chứng bên dưới.


## Kết quả production — 22/10/2026

- Restaurant source `1edbfd9b1800cfa3dae4d6af7e7a9d99bc7ed2c1`, image `quanpilot-app:1edbfd9`; CI [39716133490](https://github.com/herry-huynhlong/restaurant/actions/runs/39716133490) SUCCESS. Full Linux build, không dùng runtime UI-only vì có schema đổi.
- QAVIO source `cc06d0fef6994f46e7812cd5c33672c6e350152f`, image `qavio-web:cc06d0f`; CI [39716137026](https://github.com/herry-huynhlong/qavio/actions/runs/39716137026) SUCCESS. Lint, TypeScript, build và integration CI đạt.
- Hai artifact được kiểm tra checksum, manifest/config digest, revision và rootfs layers trước deploy. Xem `pricing/image-integrity.json`.
- Backup mới PostgreSQL + media/upload của hai dự án, mã hóa, tải off-host và restore cô lập PASS (QAVIO5/Restaurant27 migrations); migration dry-run trên backup Restaurant PASS. Cipher SHA256 `746d7dfaae087c9b852658ced68584ce20cb53f090da51b4e5265df9e6819d3e`. Backup mã hóa giữ ở thư mục riêng ngoài Git.
- Production migration 28 PASS; fingerprint giá/lịch sử, payment snapshots, tenant và dữ liệu newsletter cũ không đổi. Không có giá nào tự công bố. Xem `pricing/production-migration.json`, `production-snapshots.json`.
- HTTPS source API và QAVIO proxy đều200, cùng version và dữ liệu; POST/PUT/PATCH/DELETE405. Pricing200, Admin guard, login/CSRF/HTTPS đạt. Không sửa giá hoặc tạo khách/order QA trên production.
- **Hiện có 0 kỳ giá được công bố.** Vì thế https://qavio.site/pricing hiện “Liên hệ nhận báo giá”. Vào https://admin.qavio.site/platform/plans → bật **Công bố trên QAVIO** cho các kỳ cần hiển thị → Lưu. Các lần sửa/công bố tiếp theo tự đồng bộ mục tiêu trong35giây khi nguồn hoạt động và tab foreground; không cần deploy lại. Các giá/ưu đãi trong ảnh QA không phải giá đã công bố.
- Browser production desktop và mobile375: trang hiển thị đúng, không tràn ngang, không lỗi console/hydration được ghi nhận. Ảnh `pricing/production-desktop.jpg`, `production-mobile-375.jpg`. Tốc độ cập nhật số tiền/expiry đã kiểm thử trên QA cô lập; không công bố giá thử trên production.
- Hồi quy newsletter:14trang/439liên kết, subscribe308, nhận mới/resend/confirm410, legacy token pages200/noindex, unsubscribe rỗng422, contact/demo rỗng422; guards/trial/login đạt. Bằng chứng `newsletter-removal/production-http.json`.
- QAVIO web healthy; Restaurant app running và HTTP PASS (không cấu hình Docker healthcheck). Hai PostgreSQL và QAVIO worker healthy; maintenance worker/Portfolio running. Năm container không liên quan giữ nguyên ID/start/restart; env, mounts và flags nghiệp vụ không đổi. Xem `pricing/production-final.json`.
- Disk trước73%/6.5G trống, sau79%/4.9G trống (5,247,184,896bytes). Chỉ bỏ archive của lần phát hành sau load; không prune image/volume, không build VPS.
- Rollback: dùng cấu hình triển khai hiện có đặt lại image QAVIO`5f10868` và Restaurant`3574ce4`, recreate riêng web/app; hai image được giữ. Giữ migration additive, không drop cột hoặc restore đè DB. Kiểm tra CHECK giá gốc nếu chỉnh giá bằng Admin cũ; ưu tiên sửa tiến. Không động PG/worker/Portfolio.

Các commit tài liệu sau source SHA ở trên chỉ bổ sung báo cáo/bằng chứng; không cần rebuild hoặc recreate container.
