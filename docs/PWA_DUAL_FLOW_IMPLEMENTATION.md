# PWA nhân viên — hỗ trợ hai quy trình cài đặt

Ngày kiểm tra: 02/11/2026. Trạng thái: source QA đạt; native acceptance **PENDING**; chưa commit, push hoặc deploy.

## Kết luận

Hỗ trợ đồng thời A (đăng nhập trước, cài sau) và B (cài trước, đăng nhập trong app). A tự vào workspace khi trình duyệt/hệ điều hành chuyển đủ cookie hợp lệ. B chỉ cần một lần nhập tài khoản/mật khẩu trong PWA. Không thể bảo đảm A trên mọi phiên bản/hồ sơ trình duyệt: việc sao chép cookie thuộc nền tảng, không phải API ứng dụng có thể ép thực hiện.

Khi cookie không được chuyển, ứng dụng giữ ngữ cảnh nhà hàng/bộ phận, hiển thị đăng nhập phù hợp thay vì lỗi QR hoặc chuyển sang trang khách. Đây là fallback an toàn, **không phải** kết quả PASS đăng nhập một lần của A. Không chuyển token qua URL hoặc localStorage để giả lập SSO.

## Nguyên nhân và thay đổi

- `getStaffDeviceId()` trước đây có thể lấy localStorage cũ hoặc tạo ID mới dù cookie thiết bị đã hợp lệ. Nay cookie hợp lệ được ưu tiên; storage trống/bị chặn không ghi đè cookie. Cookie lỗi không âm thầm đổi danh tính thiết bị. Đây là lỗi nhận diện thiết bị, không phải bằng chứng JWT bị xóa trên iPhone.
- Startup server kiểm tra session, membership, tenant, entitlement và thiết bị; điều hướng vào workspace theo quyền thực tế. API `/api/restaurants/[rSlug]/pwa/status` chỉ đọc, trả trạng thái rõ ràng, private/no-store. Không tự enroll, bật ca hoặc gia hạn quyền.
- Phân biệt thiếu session, cần thiết lập thiết bị, thiết bị bị thu hồi, thiếu quyền, tenant khóa và lỗi mạng. Thiết bị bị thu hồi không được tự kích hoạt lại qua API thiết lập; transaction khóa bản ghi hiện có trước khi kiểm tra.
- Khôi phục truy cập dùng chung khi API trả 401/403, gộp request đồng thời theo slug, timeout 8 giây. Lỗi mạng không xóa session; không thêm vòng polling xác thực mới.
- Nút cài đặt có cả trước và sau đăng nhập. Provider giữ sự kiện cài đặt sớm, không tái dùng sự kiện khi đổi manifest nhà hàng/bộ phận; ngăn nhấn đôi, xử lý hủy/lỗi và standalone. Hướng dẫn iOS/Android dựa trên môi trường, không tuyên bố biết chắc cookie đã được chuyển.
- Đưa phần sửa icon 192/512 và hướng dẫn cài đặt đang chờ trong working tree vào phạm vi vì liên quan trực tiếp cài PWA. Không thay logo; giữ tỷ lệ tài sản gốc.
- Giữ nguyên NextAuth/JWT, cookie session, mật khẩu, schema, subscription, tenant isolation và quyền bốn bộ phận. Các bộ lọc báo cáo đang sửa riêng không nằm trong candidate này.

## Source và môi trường kiểm thử

Base: `6429de72ec1959371c40506d0e4eabb726d262ad`.

Candidate sạch: `D:\anh\Restaurant\.trial-runtime\dual-flow-candidate-20261102`, dựng từ Git archive base và chỉ chép 26 file thuộc nhiệm vụ. Không chép `.env` production. Danh sách và SHA-256 từng file ở [source-manifest.json](pwa-dual-flow/source-manifest.json); các file báo cáo mới là tài liệu bổ sung ngoài manifest source này.

QA dùng PostgreSQL localhost:55432, các database `staff_pwa_test`, `tax_phase0_test`, `pricing_test`; ứng dụng production-build local ở localhost:3450. Migrations hiện hữu chỉ được áp dụng lên database QA. Không có migration mới; không ghi/truy vấn dữ liệu production trong lần triển khai source này. Fixture browser chỉ dùng tài khoản tổng hợp `example.invalid`, không có giao dịch khách hàng.

## Kết quả kiểm thử

| Nhóm | Kết quả thực tế |
| --- | --- |
| Lint, TypeScript, production build | PASS trên candidate sạch; Next build bao gồm lint/typecheck |
| Unit/regression | PASS 22 script: session, manifest, install help, icon, period, staff, QR, bill, subscription và deployment safeguards |
| Offline deploy safety | PASS 22 Python tests |
| HTTP/PostgreSQL PWA | PASS 25 nhóm trên bản production-build local, đủ MANAGER/WAITER/KITCHEN/CASHIER |
| Tài chính PostgreSQL | PASS 11 kịch bản Phase 0, gồm concurrency/idempotency/tenant |
| Pricing/subscription PostgreSQL | PASS hai integration suites; negative duplicate cases có P2002 dự kiến |
| Browser E2E | PASS bốn bộ phận, cài trước/sau có hướng dẫn, login một lần, reload/start_url giữ workspace; WAITER thêm đóng/mở tab mới |
| Responsive browser | PASS 375/390px, không tràn ngang; console/hydration không ghi nhận lỗi |
| iOS/Android capabilities | PASS unit/browser boundary simulation; **không phải native install** |
| Native iPhone/Android | **PENDING**, chưa có thiết bị/device farm/Appium kết nối |
| Linux CI/image phát hành mới | Chưa chạy: source chưa commit/push |
| Load 100–1.000 thiết bị | Chưa kiểm chứng; không suy từ unit/E2E thành bảo đảm capacity VPS |

HTTP/PG kiểm tra có bộ đếm Credentials POST: A với cookie được chuyển nhập đúng một lần; B nhập đúng một lần; mở lại không nhập thêm. Kiểm tra cả localStorage rỗng/cũ, storage bị chặn, thiếu/hết JWT, thiếu cookie thiết bị, revoked, sai tenant/role, membership/user inactive, tenant khóa và giới hạn BASIC. Startup không ghi audit/device hoặc tự bật ca. Không có mật khẩu/token trong evidence.

Browser không thực hiện cài ứng dụng bằng hệ điều hành. Test browser xác nhận giao diện và luồng điều hướng/session; mô phỏng cookie xác nhận logic ứng dụng khi cookie có/không tồn tại. Chưa chứng minh Safari thực sự sao chép cookie hoặc PWA native giữ phiên khi bị OS đóng.

Lệnh kiểm tra candidate đã thực hiện từ root qua wrapper QA riêng:

```text
node .trial-runtime/dual-flow-run.mjs units
node .trial-runtime/dual-flow-run.mjs build
node .trial-runtime/dual-flow-run.mjs start
node .trial-runtime/dual-flow-run.mjs test
node .trial-runtime/dual-flow-run.mjs financial
node .trial-runtime/dual-flow-run.mjs pricing
python -m unittest discover -s deploy -p 'test_*.py' -v
```

Wrapper chỉ là tiện ích QA local, không đưa cấu hình database/credential vào release. Manifest workflow bổ sung unit session/install/icon trước HTTP/PG hiện hữu; chưa chạy GitHub Actions mới.

## Evidence

- [Browser results](pwa-dual-flow/browser-results.json)
- [Trước đăng nhập — desktop](pwa-dual-flow/install-before-login.png)
- [Trước đăng nhập — mobile browser 375px](pwa-dual-flow/install-before-login-mobile.png)
- [Workspace phục vụ QA](pwa-dual-flow/waiter-workspace.png)
- [Source manifest](pwa-dual-flow/source-manifest.json)

## Giới hạn nền tảng và nghiệm thu native

WebKit công bố sao chép cookie lúc tạo Home Screen web app từ Safari 17.2: https://webkit.org/blog/14787/webkit-features-in-safari-17-2/ . Đây không phải chia sẻ toàn bộ storage hoặc đồng bộ cookie liên tục. Không dùng localStorage làm nguồn session, không nới Secure/SameSite/Path/Domain để ép chuyển phiên.

Không thể phát hiện chắc chắn trước khi cài rằng OS sẽ sao chép đầy đủ cookie. Nhiều app Chromium cùng origin/profile có thể dùng chung tài khoản cookie; manifest ID không phải ranh giới tài khoản. Kiểm tra quyền phía server luôn bắt buộc.

Nhóm QA đại diện cần kiểm tra trên iOS Safari và Android Chrome thật, cả bốn bộ phận, A/B, đóng app/mở lại, hết phiên, thu hồi thiết bị và mất mạng. Ghi OS/browser, cách cài và kết quả cookie/session dưới dạng trạng thái, không thu token. Người dùng đã xác nhận chưa có hạ tầng này và đồng ý giữ native PENDING; không yêu cầu cấu hình từng điện thoại nhân viên.

## Sẵn sàng phát hành

**Sẵn sàng review source, chưa đủ điều kiện tuyên bố nghiệm thu native hoặc phát hành production.** Chưa commit/push/deploy. Production không thay đổi, vẫn bản `d06e3a7` theo lần phát hành trước.

Trước release: hoàn tất native acceptance đại diện, duyệt phạm vi source 26 file và tài liệu, chạy CI Linux trên SHA đã commit, xác minh image/checksum, backup/capacity/rollback theo runbook và nhận phê duyệt phát hành. Không build trên VPS; chỉ recreate app khi được duyệt, không migration/restart PostgreSQL/worker. Rollback bằng image app trước, không restore database để đảo code.
