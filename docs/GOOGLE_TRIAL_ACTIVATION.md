# Kích hoạt Google OAuth và trial thật — 21/10/2026

Trạng thái: đã push, build CI và deploy ngày21/10/2026; hai trial flags production đã bật, quota100. QA Google thật local PASS; production HTTPS/HMAC/Google start/API/cookies/browser PASS. Không tạo nhà hàng QA production.

## Quyết định đã được chủ dự án xác nhận

- QAVIO chính thức https://qavio.site; QuánPilot chuyển sang https://admin.qavio.site; CMS QAVIO chuyển về https://qavio.site/admin. Đây là thay đổi vai trò hostname được hỏi và xác nhận riêng, không tự suy diễn.
- Quota production tối đa100nhà hàng dùng thử.
- Client Secret đã rotate; người dùng xác nhận JSON hiện tại chứa secret mới. Client Web ID che bớt:1038026798441-…vgc5kui.apps.googleusercontent.com. Không in secret, không commit/upload JSON hoặc đưa vào image.
- QA Google thật được phép: huynhlong2303la@gmail.com. Không tạo nhà hàng QA production.
- Google Audience External/In production do chủ dự án xác nhận.

## Credential và callback

JSON gốc trong root QAVIO đã được gitignore/dockerignore, không tracked/staged và quét tracked files không có secret. Bản sao ngoài repository: C:/Users/LONG_IT/.codex/secrets/qavio/google-oauth-web.json; ACL chỉ current user/SYSTEM. Sau khi người dùng cho phép, bản gốc đã được kiểm tra trùng nội dung và chuyển sang google-oauth-web.original.json trong cùng thư mục bảo mật, không xóa bản sao. Repository không còn OAuth JSON gốc. HMAC production96ký tựhex được tạo bằng random cryptographic, giữ riêng ngoài repo; HMAC staging khác production. QAVIO chỉ nhận HMAC, không nhận Google client secret.

Callback production: https://admin.qavio.site/api/integrations/qavio/trial/google/callback . Callback local cô lập: http://127.0.0.1:3200/api/integrations/qavio/trial/google/callback . Chủ dự án đã lưu hai URI. Lần thử đầu Google trả redirect_uri_mismatch; sau khi chủ dự án cập nhật lại, Google chấp nhận và callback thật thành công. Không giả lập identity ở lượt QA này.

## QA thật local

Hai production build local Windows chạy loopback3100/3200, PostgreSQL loopback55432, qavio_test và restaurant_trial_test. Google credential được đọc từ thư mục bảo mật, NODE_ENV=production, QUANPILOT_TRIAL_TEST_MODE=false; không gọi adapter Google QA. Luồng thật: nút Google QAVIO → HMAC QuánPilot → Google sign-in → callback QuánPilot kiểm JWT/state/nonce/PKCE → callback QAVIO → email verified. DB xác minh Google subject/verifiedAt và PKCEverifier đã xóa sau callback.

Người dùng tạo nhà hàng local Long Phụng, slug long-phung, bằng email Google QA; không dùng tên QA gợi ý. DB xác nhận đúng1TrialRegistration/Googleidentity,1OWNER, TRAIN/BASIC/ACTIVE, settings, password hashbcrypt; bắt đầu2026-10-21T06:30:43.954Z, hết hạn2026-11-21T06:30:43.954Z. PaymentOrder/paidEntitlement cho nhà hàng=0. Thử request khác bằng chính proof Google thật bị409TRIAL_ALREADY_USED và vẫn đúng1nhà hàng. Người dùng xác nhận đăng nhập OWNER được; không hỏi/nhận mật khẩu thử trong chat. Chưa xóa dữ liệu local do người dùng vừa tạo khi vẫn đang nghiệm thu.

## Hồi quy và giới hạn

Restaurant lint/TypeScript PASS; integration22 PASS trên DBtest (identity adapter riêng của bộ hồi quy, không coi là chứng cứ OAuth thật). Sửa phép so contract để chuẩn hóa CRLF/LF giữa2checkout Windows; nội dung contract giống nhau, không thay businesslogic. QAVIO lint/TypeScript/Contact14 và origin checks PASS. Bộ22 xác nhận concurrent/retry/email/slug/quota/rollback/1month/BASIC/tenant isolation/shared Platform Admin factory/no paid records; forced failure trong log là lỗi QA chủ động.

Nginx dự kiến phục vụ CMS từ qavio.site và toàn bộ QuánPilot từ admin.qavio.site, cùng các container hiện có. TLS certificate đã bao phủ cả hai. Logging OAuth chỉ dùng format bỏ query/body/header, error log OAuth không ghi requestURL để tránh lộ code; no-store/no-referrer. Cookie CMS host-only trên qavio.site; cookie CMS cũ tại admin host được hết hạn, không sao chép phiên. NEXTAUTH_URL và origin trial QuánPilot chuyển sang admin.qavio.site/qavio.site.

Production chỉ bật2trial flags sau CI/build/backup/restore/hostname/API readiness đạt. Form Contact tiếp tục mở; email/QUOTE/newsletter/indexing không mở. Không migration/reset DB hoặc restart PostgreSQL/worker bảo trì/portfolio. Backup và rollback pin image/env/Nginx trước đổi.

## Phát hành thực tế

|Ứng dụng|Source/image|CI thành công|OCI image ID|
|---|---|---|---|
|QAVIO|cf2a207d957342faa8b017d60fe3fc54930031eb / qavio-web:cf2a207|[39556382879](https://github.com/herry-huynhlong/qavio/actions/runs/39556382879)|sha256:18a5473896fe4988f49ac1d74d9cb92d4087820cce76989010c51d925fbab63c|
|QuánPilot|2e8d0b17c4c07841574b5470726ce8c8bbf0e357 / quanpilot-app:2e8d0b1|[39556447009](https://github.com/herry-huynhlong/restaurant/actions/runs/39556447009)|sha256:8a14e5843385c68d0026c7953a87cd4bb5ba4f57a9dbf21d5ecc85bbcf60d758|

Config digests tương ứng: QAVIO sha256:8f9799b62e528fdcbede2793c2d74264c60b8f1f99f126be9b3cd93b8294800b; QuánPilot sha256:26aa7758909a7e87806a7aae67d27fbf1c5c48a577aeb93ea778b4e3ff1e7d7f. Kiểm tra SHA256 artifact ZIP, archive, OCI manifest/config/layers và revision khớp image đã chạy. Build Linux ở GitHub Actions, không build VPS.

Backup mới hai DB và media/uploads đã mã hóa, tải off-host, giải mã và restore vào hai DB disposable loopback: QAVIO5migration, QuánPilot27migration PASS. Ciphertext SHA256:9faa414980cfa105254b013957e1cb4528d579bab0ecb869e5dce9fea619f374. Đã dọn DB restore/plaintext local, giữ bản mã hóa và proof; giữ dữ liệu nhà hàng QA local người dùng vừa tạo. Không migration production trong lần này.

Triển khai hai ứng viên đóng trial để kiểm readiness và Nginx trước; chuyển proxy sang ứng viên, recreate riêng hai app chính với cấu hình mới, kiểm tra rồi chuyển proxy về và dọn đúng hai ứng viên. Nginx graceful reload, không restart Docker Engine. PostgreSQL, worker QAVIO, maintenance worker Restaurant và Portfolio giữ nguyên container ID/start/restart count. Core business row counts QuánPilot không đổi trước khi mở proxy công khai. Portfolio HTTPS200.

Production QAVIO_TRIAL_ENABLED=true; QUANPILOT_TRIAL_REGISTRATION_ENABLED=true; QUANPILOT_TRIAL_MAX_TOTAL=100; QUANPILOT_TRIAL_TEST_MODE=false. Contact/DEMO=true, legacy forms/policy/indexing=false, EMAIL_PROVIDER=disabled; QUOTE/newsletter vẫn đóng. Không tự bật thanh toán hoặc cấp quyền Platform Admin cho khách.

### Kiểm tra sau deploy

- HTTPS200: qavio.site, /trial, /admin/login, /api/ready; admin.qavio.site/login và NextAuth CSRF. TLS được xác minh bình thường, không bỏ kiểm chứng certificate.
- Cookie CMS __Host-qavio_login Secure/HttpOnly/SameSite=Strict/Path=/, không Domain; NextAuth cookie __Host-next-auth.csrf-token đúng hostname mới. Phiên CMS cũ ở admin subdomain bị hết hạn; người dùng đăng nhập lại tại root CMS bằng tài khoản cũ.
- Anonymous CMS leads401; provisioning thiếu HMAC401 SERVICE_AUTH_REQUIRED; CONTACT/DEMO rỗng422, QUOTE/newsletter503.
- Gọi Google start thật từ QAVIO qua HMAC QuánPilot200; Google URL đúng callback production, scope openid/email/profile và PKCE S256; không lộ client secret. Chỉ tạo pending identity challenge, không user/nhà hàng QA production.
- Browser production: nút Google đã enabled; form chờ xác minh email đúng thiết kế; trang QuánPilot login đúng ứng dụng. Contact14 và CI Admin regression PASS. Platform list helper trên DB cô lập nhìn thấy nhà hàng Google thật Long Phụng TRAIN/BASIC và OWNER.
- Google callback/token exchange, tạo quán, chống trial lần hai và OWNER login thật đã kiểm ở local cô lập bằng credential thật; không tuyên bố đã tạo quán hoặc đăng nhập OWNER production. Không yêu cầu người dùng tạo QA tenant production.

Disk trước khi load image:7.031.320.576bytes trống; sau deploy:5.372.719.104bytes trống, df -h báo5.1G/79% sử dụng. Không prune chung hoặc xóa volume/rollback image.

### Rollback

Snapshot private: /opt/websites/qavio/.runtime/oauth-live-release-20261021/snapshot; backup/proof và deployed.json cùng release folder. Khôi phục đúng QAVIO.env/.env.production, Restaurant.env/overlay và hai Nginx configs từ snapshot; pin lại qavio-web:f891017 và quanpilot-app:3408242, chỉ recreate web/app, nginx -t rồi graceful reload. Snapshot chứa cấu hình nhạy cảm, không đưa vào Git/log. Tắt trial hai phía trước rollback; không restore/reset DB và không xóa dữ liệu khách mới. Vai trò hostname cũ trở lại (CMS admin.qavio.site, QuánPilot demo.longh.org); demo DNS đã bị chủ dự án xóa nên cần cân nhắc hostname khi rollback. Script tự rollback nếu cutover lỗi, không rollback sau khi có khách mới mà chưa đánh giá tương thích.

Liên kết sử dụng: https://qavio.site/trial ; CMS https://qavio.site/admin/login ; QuánPilot Platform login https://admin.qavio.site/login . OWNER dùng đường dẫn riêng /{slug}/login?role=OWNER trả về sau đăng ký.

Không còn blocker kỹ thuật được phát hiện trong phạm vi này. Production OAuth callback thực hiện bởi Google sau lần đăng nhập thật đầu tiên chưa được nghiệm thu riêng; QA callback thật ở local đã PASS. Bản báo cáo sau deploy chỉ là tài liệu, không yêu cầu rebuild image.
