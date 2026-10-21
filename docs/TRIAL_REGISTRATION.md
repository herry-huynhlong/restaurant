# QAVIO → QuánPilot: đăng ký TRAIN/BASIC một tháng

Ngày thực hiện: 21/10/2026. Giai đoạn phát triển dùng nhánh `codex/qavio-self-service-trial`, base QAVIO `5f734d6`, Restaurant `f1fc236`. Sau yêu cầu trực tiếp “oke lên web đi”, code đã merge/push main và triển khai riêng hai ứng dụng. QAVIO chạy source `41218f7`; QuánPilot chạy source `3408242`. Đăng ký dùng thử production vẫn đóng vì chưa có Google OAuth thật; Contact/DEMO intake hiện hành giữ mở. Kết quả local trước phát hành ở T4; bằng chứng triển khai Linux và giới hạn nghiệm thu ở phần cuối. Không tạo tài khoản/nhà hàng thử trên production.

## T1 — Luồng hiện tại và quyết định

Platform Admin dùng `src/app/platform/restaurants/actions.ts`, guard `requirePlatformAdmin`, cưỡng chế giới hạn PLATFORM_SUB_ADMIN rồi tạo Restaurant/User/RestaurantUser/RestaurantSetting/Area/AuditLog trong một transaction. Chủ quán tồn tại được upsert mà không đổi hash mật khẩu. Phần tạo bản ghi được tách sang `createRestaurantRecords` và cả action cũ lẫn API mới cùng gọi; guard, schema, upload và redirect của Platform Admin vẫn giữ. Self-registration dùng chế độ owner mới, tuyệt đối không chiếm hoặc gắn tài khoản đã tồn tại, kể cả tài khoản Platform Admin.

TRAIN hiện là gói miễn phí có hạn, không có doanh thu; quyền có thể BASIC hoặc PRO theo cấu hình quản trị. BASIC sử dụng ma trận quyền hiện hành: owner, phục vụ, QR/menu và các chức năng BASIC; không cấp luồng bếp/thu ngân/quản lý PRO. Luồng mới cưỡng chế TRAIN/BASIC, ACTIVE, subscription ACTIVE, không tạo subscription trả phí, entitlement đã thanh toán, payment order hoặc giao dịch. Business type mặc định RESTAURANT, vi/VND/Asia_Ho_Chi_Minh.

Platform Admin hiện nhập ngày TRAIN thủ công, theo biên ngày Việt Nam. Đăng ký mới lấy instant server, cộng một tháng lịch tại UTC+7, giữ giờ địa phương và chặn ngày vào ngày cuối tháng đích. Thuật toán cùng nguyên tắc clamp của addCalendarMonths hiện có nhưng xác định timezone rõ, không dựa timezone host. Không sửa expiry hoặc grace period của gói cũ. Kiểm tra Jan31, tháng 2 nhuận, thời điểm sau 17:00 UTC và qua năm. Kiểm tra quyền/expiry tiếp tục dùng guard và subscription status hiện hành.

Chủ dự án chọn Google OAuth để xác nhận chủ email. Không thêm SMTP. Khách xác nhận Google trước, rồi tự đặt mật khẩu QuánPilot. Đây không phải thay NextAuth credentials hiện hành bằng Google và không tự liên kết tài khoản có email đã tồn tại.

## T2 — Contract và xác thực

QuánPilot có POST `/api/integrations/qavio/trial/google-start`, `/google-exchange`, `/register`. Callback Google GET `/api/integrations/qavio/trial/google/callback`. Đây là API riêng, không gọi Server Action Platform Admin, không dùng tài khoản hoặc cookie quản trị. QAVIO có POST `/api/trial/google/start`, `/api/trial/register`, GET `/api/trial/google/callback`, `/api/trial/session`.

Contract được giữ giống nhau tại `src/lib/trial-contract.ts` của hai repo và có test đối soát. Payload register: restaurantName, slug, ownerName, email, password, timezone, language, currency; logo tùy chọn gồm MIME/base64. QAVIO tự gắn verificationToken từ cookie HttpOnly, không nhận quyền/gói/trạng thái/ngày hết hạn từ browser. Browser có confirmPassword, honeypot website và startedAt, được QAVIO validate rồi loại trước khi chuyển. Không có số điện thoại trong đăng ký thử.

HMAC-SHA256 với secret riêng server-to-server, ký method/path/timestamp/nonce/client bucket/idempotency key/SHA256 body. Sai chữ ký hoặc timestamp ngoài180giây bị từ chối. Nonce lưu chống replay, bucket khách hàng do QAVIO suy ra từ proxy tin cậy; không tin X-Forwarded-For từ browser. Không chuyển service secret tới client. Chỉ nhận body tối đa3MiB. Rate limit bền vững ở cả QAVIO và QuánPilot; source không xác thực được IP dùng bucket chung bảo thủ. Có kill switch trên cả hai app.

Google sử dụng authorization code + PKCE S256 + state + nonce, SDK chính thức google-auth-library11.3.1. QuánPilot đổi code, verifyIdToken kiểm chữ ký/audience/issuer/expiry; kiểm thêm nonce và email_verified. Chỉ chấp nhận email Google có thẩm quyền: Gmail hoặc Google Workspace có hd; email bên thứ ba gắn với Google nhưng thiếu hd cần xác minh bổ sung và hiện bị từ chối. Không xin Gmail/Drive, offline access hoặc lưu refresh/access/id_token. PKCE verifier chỉ lưu tạm QuánPilot và xóa khi callback đạt.

OAuth được ràng buộc browser qua cookie flow ngẫu nhiên HttpOnly SameSite=Lax tại QAVIO, flowHash ở QuánPilot, PKCE và nonce. Callback chỉ trả ticket ngẫu nhiên về QAVIO; server exchange yêu cầu đúng flowHash trước khi tạo cookie grant có chữ ký, HttpOnly, Secure trên HTTPS, thời hạn10phút. JavaScript chỉ đọc email/tên đã xác minh từ session API; proof chỉ nằm trong cookie HttpOnly có chữ ký. Chưa tạo tài khoản nào chỉ vì Google callback thành công.

## Idempotency, transaction và media

UUIDv4 từ browser được giữ qua network retry và chuyển nguyên tới QuánPilot; QuánPilot lưu hash key, HMAC request fingerprint và kết quả sau transaction. Key trùng/payload khác trả409. Retry sau thành công hoặc mất response trả cùng ID, kể cả proof gốc hết hạn; proof làm mới không đổi semantic fingerprint. Nếu browser tải lại và mất key, cùng Google identity đã xác minh + cùng fingerprint vẫn trả kết quả cũ, không cấp thêm thời gian. Mỗi Google sub chỉ được nhận một trial, kể cả đổi email; email mới cũng phải chưa tồn tại trong hệ thống. Không tái sử dụng tài khoản cũ hoặc sửa hash của tài khoản đó.

Advisory lock và unique constraints bảo vệ đồng thời. Transaction tạo đủ nhà hàng, chủ quán, membership OWNER, settings, area, audit và TrialRegistration. Owner lỗi thì rollback cả transaction. Tổng quota phải cấu hình rõ bằng QUANPILOT_TRIAL_MAX_TOTAL, không có quota production ngầm. Rate/nonce/identity hết hạn được dọn ở request ký hợp lệ theo chu kỳ, registration giữ lại để chống nhận trial nhiều lần.

Logo tối đa2MiB, PNG/JPEG/WebP, tối đa4000×4000/16MP, không ảnh nhiều frame. Backend kiểm MIME, base64 và nội dung bằng sharp trước khi qua cơ chế media hiện có của QuánPilot, lưu WebP và thumbnail. Không lưu logo vào QAVIO DB. Lỗi transaction dọn media nếu DB xác nhận chưa thuộc nhà hàng đã commit; nếu commit chưa rõ thì giữ file để tránh xóa ảnh hợp lệ. Cần đối soát orphan sau sự cố tắt process/ổ đĩa như media hiện có. Không có plaintext password trong DB QAVIO/QuánPilot, audit, response, URL, analytics hoặc localStorage. Password chỉ truyền trong body HTTPS tới QuánPilot rồi bcrypt cost12, giới hạn72byte tránh bcrypt cắt ngầm.

Đối soát migrate diff trên DB mới: bốn bảng trial không có drift; có ba khác biệt tên index đã có ở SubscriptionPaymentOrder/SubscriptionPaymentTransaction do SQL migration cũ và tên Prisma mong đợi khác nhau. Không sửa/đổi tên index payment trong task này.

Migration additive duy nhất tại Restaurant: `20261021110000_qavio_trial_registration`, tạo TrialRegistration, TrialIdentityChallenge, TrialRateBucket, TrialServiceNonce và unique/index. Không sửa dữ liệu/table payment cũ. QAVIO không thêm migration hoặc bảng tài khoản.

## T3 — Giao diện

`/trial` là trang chính; `/request-demo` redirect308. Header/footer/CTA trang chủ, sản phẩm và bảng giá dẫn tới dùng thử. Giữ alias hợp lệ trong CMS, sitemap bỏ route redirect. Form hai nhóm, tự sinh slug tiếng Việt, cho sửa, logo tùy chọn, mặc định vi/VND/Vietnam; Google xác nhận email, email readonly, họ tên và mật khẩu/xác nhận có hiện/ẩn. Không có dropdown gói, PRO hoặc ngày hết hạn.

Loading, lỗi, giữ dữ liệu để retry, idempotency, thông báo đăng ký chưa mở khi thiếu cấu hình. Thành công hiển thị thông tin nhà hàng/chủ quán/email, TRAIN/BASIC, ngày bắt đầu/kết thúc và URL lấy từ QuánPilot, đối chiếu allowlist origin/path. Link owner dùng route thực tế `/<slug>/login?role=OWNER`; không chứa mật khẩu. Mật khẩu được xóa khỏi state sau thành công; có copy email/link.

`/contact` giữ ba trường, consent ngắn, Lead/chuông/CRM. Demo Lead cũ và API cũ giữ tương thích; không xóa dữ liệu. Trial thành công không được tạo Lead, mail outbox hoặc lưu bản sao user/media ở QAVIO. Website navy/vàng kim, không thay logo chính thức.

## T4 — Kiểm thử và giới hạn

- QuánPilot integration22 kiểm tra đạt trên restaurant_trial_test: HMAC/replay, Google claim rejection, flow/PKCE/nonce, idempotency/concurrent cùng key và khác key, tranh slug, email, một trial/Google sub, calendar month, bcrypt, transaction rollback bằng lỗi thật ở trigger test, media, guard BASIC, tenant isolation, owner login và Platform Admin query, shared factory không đổi password tài khoản cũ, kill switch/quota/rate limit, không payment. Log QA forced failure trong test là lỗi chủ động để kiểm rollback.
- HTTP qua hai production build local đạt: QAVIO → QuánPilot qua HMAC, callback/cookie flow thật, ngắt HTTP request bằng AbortController khi đang xử lý rồi retry cùng key đạt, double submit chỉ một nhà hàng/owner, login bằng NextAuth thật, tenant khác và Platform Admin bị chặn, link login hợp lệ, trial không tạo QAVIO Lead/User/Media, Contact vẫn tạo Lead không outbox, thông báo Admin vẫn chặn ẩn danh.
- Browser đạt: tự sinh ca-phe-long-phung, sửa slug, validation/mật khẩu không khớp, đăng ký QA thành công, hiển thị hạn21/10→21/11, mở login và vào admin TRAIN/BASIC; chọn file sai bị chặn, PNG hợp lệ được nhận. Mobile375/320px không tràn ngang, tất cả input có label.
- Google identity trong test được mô phỏng bằng adapter chỉ cho DB loopback có tên test và không chạy NODE_ENV=production. Callback/HTTP/service auth/transaction/login ứng dụng là thật. Không có debug endpoint public, không có bypass dùng được production. QAVIO kiểm tra grant HttpOnly trước khi đọc body chứa mật khẩu/logo.
- Google OAuth thật CHƯA được nghiệm thu: chưa có Client ID/Secret hợp lệ; ID QA hiển thị invalid_client đúng dự kiến. Không coi test adapter là staging/Google thật thành công.
- Lint, TypeScript và production build hai repository đạt. QAVIO hồi quy C29/Admin31/Contact14, HTTP API và Admin HTTP14 đạt; public14 trang/370liên kết, SEO/sitemap/404/logo/redirect308 đạt. Kiểm tra Admin HTTP yêu cầu tạo fixture trước khi chạy; lượt thiếu fixture ban đầu được sửa bằng setup đúng, không sửa code sản phẩm.

Bằng chứng riêng local ngoài Git tại QAVIO `.runtime/trial-evidence/`: trial-registration-success.png, quanpilot-owner-basic.png, trial-mobile-320.png. Chỉ là dữ liệu QA local, không ảnh production.

## T5 — Kế hoạch staging, chưa thực hiện

Cần chủ dự án xác định môi trường staging được phép dùng và hostname QAVIO/QuánPilot thật; không suy đoán domain sản phẩm từ IP hoặc tên repo. Dùng host/container/database/media/secret staging riêng, không nối DB hoặc volume production. Build Linux trên CI/host riêng ngoài VPS1GB. Chạy migration additive trên DB staging trống/đã backup; QAVIO không migration.

Tạo Google OAuth Web Application Client trong project chủ dự án kiểm soát, chỉ scope openid/email/profile, authorized redirect URI đúng `https://<quanpilot-staging>/api/integrations/qavio/trial/google/callback`; production dùng URI riêng sau phê duyệt. Client secret và HMAC mới nhập qua env/CLI an toàn, không gửi lên chat/Git. QAVIO callback đích cố định theo QUANPILOT_TRIAL_QAVIO_ORIGIN. Không dùng client QA hoặc credential production trong staging.

Proxy chỉ log method + `$uri` + status, không `$request`/`$request_uri`/`$args`, request body, Authorization hoặc các header ký. Áp dụng cho hai callback OAuth để không lưu code/ticket. Request body giới hạn3MiB, timeout khoảng35giây, HTTPS, no-store và trusted proxy riêng. Thêm health checks của mỗi ứng dụng, không restart Docker Engine hay container dự án khác.

Bật riêng staging QAVIO_TRIAL_ENABLED và QUANPILOT_TRIAL_REGISTRATION_ENABLED sau cấu hình; quota staging được chủ dự án chọn. Tài khoản Google QA do chủ dự án kiểm soát phải kiểm chứng đủ: đồng ý/cancel/sai flow, Gmail/Workspace, hết phiên, tài khoản đã tồn tại, đăng ký logo, retry sau timeout, login OWNER/BASIC, tenant isolation, Platform Admin thấy nhà hàng và CONTACT/CRM không hồi quy. Không tạo nhà hàng QA trên production. Báo cáo staging riêng rồi xin xác nhận T6.

## T6 — Production và rollback, chưa được duyệt

Chỉ thực hiện sau staging đạt và chủ dự án xác nhận riêng theo attachment mục9: “Chỉ phát hành sau khi có báo cáo staging đạt và tôi xác nhận riêng.” Quy định này thay thế ủy quyền tự deploy thông thường cho task tích hợp hai hệ thống. Không tự mở public provisioning.

Trước phát hành: xác nhận cam kết TRAIN/BASIC một tháng lịch,0VND/không trả trước, quota tổng, hostname sản phẩm và OAuth production; backup mới cả hai phần liên quan, off-host/restore cô lập, image digest và rollback image. Đặt hai flag=false khi cài migration và images. Recreate riêng từng web đã duyệt, smoke test read-only, rồi bật flags theo quyết định T6. Không thay subscription/payment đang hoạt động.

Rollback: tắt hai trial flag trước, giữ CONTACT intake như hiện hành; quay về image trước bằng quy trình riêng từng repo, không drop DB/tables/trial đã tạo, không rollback dữ liệu khách. Migration mới additive có thể giữ khi chạy image cũ. Media đã thuộc trial giữ nguyên; không xóa tài khoản/nhà hàng tự động. Dùng idempotency record để đối chiếu request chưa rõ, không tạo lại thủ công khi chưa kiểm tra.

## Những thông tin còn cần

1. Domain QuánPilot chính thức và cặp hostname/môi trường staging được phép triển khai.
2. Google Cloud project/OAuth Web Client ID và Client Secret được cấu hình qua kênh an toàn; client QA hiện không hợp lệ. Không gửi secret trong chat.
3. Giới hạn tổng số trial muốn mở; mặc định ứng dụng không tự đặt quota production.
4. Sau nghiệm thu staging, xác nhận phát hành T6 và cam kết dùng thử nêu trên.

Tham khảo chính thức: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [verify ID token và email authoritative](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs).

## Chạy lại kiểm tra tại workspace

Dùng PostgreSQL loopback127.0.0.1:55432 với hai DB riêng qavio_test và restaurant_trial_test. Không dùng DB production. QuánPilot cần DATABASE_URL và TRIAL_TEST_DATABASE_URL bằng cùng URL restaurant_trial_test; NODE_ENV=test, QUANPILOT_TRIAL_TEST_MODE=true cùng các biến server trial trong .env.example, quota QA, Google client giả chỉ dùng adapter. Chạy prisma generate/migrate deploy trên DB test trước, rồi `node --import tsx scripts/trial-registration-checks.ts`. QAVIO đọc .env.local với QAVIO_TEST_DATABASE_URL=qavio_test.

Để HTTP E2E: chạy build QAVIO trên loopback3100, QuánPilot trên3200, đều nối DB test tương ứng; hai app dùng cùng service HMAC secret QA. Bật riêng trial và CONSULTATION ở local, tắt mail/legacy forms. QAVIO_REPOSITORY_PATH mặc định ../qavio, có thể đặt khi checkout khác vị trí. Tạo thư mục .trial-runtime tại Restaurant để chứa fixture tạm rồi chạy `node --import tsx scripts/trial-http-integration.ts` trong environment QA trên. Script gọi helper có trong Git `scripts/trial-test-counts.mjs` tại QAVIO và `scripts/trial-google-fixture.ts` tại Restaurant; không cần helper .runtime riêng của agent để chạy hai suite. Không chạy đồng thời test HTTP khác có sửa Lead vì suite đối soát counts trước/sau.

QAVIO regression: integration.ts, integration-admin.ts, integration-contact.ts. Admin HTTP cần admin-browser-fixtures.ts trước, rồi check-admin-http.ts và cleanup fixture sau. Tất cả fixture là QA local; không dùng client giả hoặc adapter test trên staging/production.

## Trạng thái bàn giao

Fixture browser nhà hàng/chủ quán và fixture Admin/Lead của lượt QA đã được dọn theo đúng ID/prefix. Không xóa dữ liệu QA có từ task trước hoặc dữ liệu production. Thư mục .trial-runtime của Restaurant được loại khỏi cả Git và Docker build context; .runtime QAVIO đã có loại trừ. Các secret QA chỉ nằm ở thư mục tạm bị ignore, không nằm trong source được push.


## Phát hành code production — 21/10/2026

Người dùng trực tiếp yêu cầu “oke lên web đi” sau báo cáo T4. Yêu cầu mới là phê duyệt triển khai code hai ứng dụng. Chưa có Google OAuth thật nên đây là phát hành code với kill switch đóng; không coi là nghiệm thu Google/staging hoặc hoàn tất mở self-registration. Không yêu cầu lại quyền push/deploy đã có.

- QAVIO main/source `41218f7aeaff0caca8d42238dbdd8a408f81e40f`, image `qavio-web:41218f7`, Docker OCI index `sha256:0792c57314a02033e79e41d68b18afbdca0cc7fd38e9d6983bf4a09cf7dd7eca`, config `sha256:f852b5b46ec61e7059f2bcfe40281588cfeaad27f36f5f1cab2def9641d646e3`.
- QuánPilot main/source `3408242005c8d5978676ed0277bdee84a3a8b785`, image `quanpilot-app:3408242`, Docker OCI index `sha256:cc7502545791f9f2799119f974a507662a750eb41f43dc0ef9c3dfa43f561c84`, config `sha256:51f9f8bcf858c5fc935b2fffdb83e00110bd3f796884f5667db30cdaf6a66a19`.
- Linux CI ngoài VPS: QAVIO [39545084829](https://github.com/herry-huynhlong/qavio/actions/runs/39545084829) đạt lint/C/Admin/Contact/check-visible-poll, build và package; Restaurant [39545239052](https://github.com/herry-huynhlong/restaurant/actions/runs/39545239052) đạt lint/TypeScript, build Docker và package. Restaurant thêm workflow dispatch riêng; giữ đúng public VAPID key đang dùng qua build input, không gửi private key lên CI.
- Artifact ZIP SHA256 QAVIO `cc06f0463e3d3cc374cb90fde5e50ced206a45d162a99f5795da5dc594aaa1dd`; Restaurant `454564822471e1b1ce947eab2359f5b5574ef015589cda67325e5c2ff0e9bf1e`. Đối chiếu GitHub artifact digest, gzip checksum, OCI index → manifest amd64 → config, layers và revision trước khi recreate. Lần đầu verifier dừng trước recreate do giả định image ID luôn là config; đã sửa verifier để kiểm đúng chuỗi OCI digest, không bỏ kiểm integrity.
- Backup mới: cả hai PostgreSQL custom dump và uploads/media, mã hóa AES-256-CBC/PBKDF2, khóa ngẫu nhiên bọc RSA-OAEP SHA256 bằng public key backup hiện có. SHA256 ciphertext `f0ac53f750f906adfc52f8a003fb31d1f93a847def35c9a62414f35684684c3b`. Bản mã hóa có trên VPS và off-host local; private key không đưa lên server/CI.
- Off-host restore đạt trên PostgreSQL local loopback55432: QAVIO5 migration, Restaurant26 migration. Migration mới được chạy thử trên bản Restaurant đã restore:27 migration, số bản ghi36 bảng cũ không đổi. Sau kiểm chứng đã xóa database restore cùng bản plaintext local, giữ archive mã hóa và bằng chứng. Không restore/reset production.
- Production migration `20261021110000_qavio_trial_registration` đã áp dụng, tổng27 migration. Bốn bảng trial mới trống; số bản ghi36 bảng cũ giữ nguyên ngay trước/sau migration. QAVIO không cần migration, vẫn5.
- Chỉ recreate `qavio-web-1` và `restaurant-app-1` lần lượt. Worker/PostgreSQL hai dự án và portfolio giữ nguyên ID/thời điểm khởi động. QAVIO worker vẫn `qavio-operations:c205bbd`; không đổi secret/quyền/bootstrapping Admin, không build trên VPS.
- Domain QuánPilot được xác nhận từ NEXTAUTH_URL đang chạy: `https://demo.longh.org`; QAVIO `https://qavio.longh.org`. Không lấy domain từ file example.
- Production HTTP đạt14 trang, `/request-demo`308→`/trial`, QAVIO ready200, QuánPilot login200, Contact/DEMO intake mở và validation422 với payload rỗng, anonymous Admin401, QUOTE/newsletter503, email disabled, noindex. QAVIO trial session `{enabled:false,identity:null}`; trial POST503; QuánPilot trial POST503/TRIAL_DISABLED. Không gửi PII hoặc tạo QA trial production.
- Browser production: menu mobile mở/đóng,375px/1280px không tràn ngang,0 input thiếu label; Contact hiển thị đang tiếp nhận và nút gửi enabled; Google/trial submit disabled đúng trạng thái. Không nhập hoặc gửi dữ liệu khách; không thấy console error/warning ở lượt kiểm tra. Screenshot local `D:/anh/qavio/.runtime/trial-evidence/production-trial-closed.png`.
- Sau rollout: QAVIO web healthy, cả hai login sẵn sàng; khoảng7.9GiB disk trống. QAVIOweb82MiB, QuánPilot app101MiB tại thời điểm kiểm tra; worker/database khác tiếp tục hoạt động.

### Cấu hình và rollback

QAVIO dùng compose.yaml + compose.production.yaml + compose.release-candidate.yaml như trước; `.env` pin QAVIO_IMAGE_TAG=41218f7, operations=c205bbd; `.env.production` QAVIO_TRIAL_ENABLED=false. QAVIO_CONSULTATION_FORMS_ENABLED=true; QUOTE/newsletter/mail/indexing giữ đóng.

Restaurant production dùng `docker compose -f docker-compose.yml -f .trial-runtime/production-release.yaml up -d --no-build --no-deps app`. Overlay riêng trên VPS pin image3408242 và QUANPILOT_TRIAL_REGISTRATION_ENABLED=false, public origins thực tế. Các biến OAuth/service secret/quota chưa cấu hình. Những lần phát hành sau phải giữ overlay/image pin này, không dùng lệnh build trên VPS hoặc base compose để vô tình quay về image cũ.

Rollback code: QAVIO phục hồi `.env`/`.env.production` từ `.runtime/trial-release-20261021/qavio/env-before`, recreate riêng web bằng image5ef3970. Restaurant đổi image trong overlay sang `quanpilot-rollback:pre-trial-20261021`, recreate riêng app; giữ kill switch false. Migration chỉ thêm bảng, có thể giữ nguyên khi rollback app; không xóa bảng/dữ liệu hoặc restore production. Bằng chứng deploy/backup nằm trong `/opt/websites/qavio/.runtime/trial-release-20261021`.

### Để mở đăng ký dùng thử thật

Cần OAuth Web Client thực với callback `https://demo.longh.org/api/integrations/qavio/trial/google/callback`; Client Secret nhập qua môi trường bảo mật, không chat/Git. Sau cấu hình: thiết lập secret HMAC riêng hai phía và quota hữu hạn; nghiệm thu Google thực/flow/end-to-end trên staging được duyệt rồi mới bật hai trial flags. Không mở QUOTE/newsletter/email/indexing. Đợt này chỉ đưa code lên web với trạng thái trung thực; tính năng tạo nhà hàng tự động chưa mở công khai.
