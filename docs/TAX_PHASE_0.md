# QUÁNPILOT — NGHIỆM THU GIAI ĐOẠN 0

**Đã phát hành production 27/10/2026:** source `cd82e8d7e73ce4a9203089172b0ba485ab47b516`, CI Linux 40438733493 SUCCESS, riêng app cutover lúc 09:41 UTC+7. Smoke và audit sau deploy đạt theo ngoại lệ đã duyệt, bill lịch sử không đổi; sáu container khác giữ nguyên. Xem [TAX_PHASE_0_PRODUCTION.md](TAX_PHASE_0_PRODUCTION.md) để biết image/checksum, backup, quan sát vận hành và kết luận GO. Các ghi nhận NO-GO bên dưới mô tả lần kiểm tra trước khi chủ dự án duyệt ngoại lệ.

**Ngoại lệ được duyệt 27/10/2026:** tiếp tục phát hành, giữ nguyên bill lịch sử có hai cảnh báo, đối soát chứng từ riêng và chưa xác minh. Không đổi Payment, snapshot, invoiceNumber, trạng thái phiên hay phạm vi báo cáo doanh thu. Đợt backup/audit mới vẫn cùng một ngoại lệ, không có cảnh báo mới. Báo cáo production sẽ ghi kết quả thực tế sau CI/deploy.

**Cập nhật phát hành 27/10/2026:** chủ dự án đã duyệt quy trình phát hành. Backup/off-host/restore PASS; audit bản sao production phát hiện một bill lịch sử thiếu snapshot và còn trạng thái phiên legacy PAID. Đã dừng trước commit/push/CI/deploy theo điều kiện dữ liệu. Xem [báo cáo phát hành](TAX_PHASE_0_DEPLOYMENT.md) để biết kết quả và quyết định NO-GO hiện tại. Các mục bên dưới giữ nguyên kết quả nghiệm thu local ngày 26/10.

Ngày: **26/10/2026**, Asia/Bangkok. Source nền: `50340f5b1d2d7051a9dc78f6a646b1a8672d4756`.

**Kết quả: đạt kiểm thử local trên PostgreSQL cô lập, chờ chủ dự án nghiệm thu. Chưa commit/push/deploy và chưa truy vấn production.** Không tạo migration, reset DB, sửa dữ liệu lịch sử thật, thay bảng giá/gói, authentication hoặc website QAVIO. Chưa xây module thuế, hóa đơn điện tử hoặc công thức thuế phải nộp.

## 1. Nguyên nhân lỗi ranh giới tháng

`getPeriodRange()` cũ đổi đầu tháng theo timezone sang UTC rồi gọi `setUTCMonth()`. Ví dụ đầu tháng 2 ở Việt Nam là `31/01 17:00 UTC`; cộng một tháng từ ngày 31 gây overflow. Tháng 2/2026 từng kết thúc sai tại `03/03 17:00 UTC`, thay vì `28/02 17:00 UTC`.

Test mới đã thất bại trên code cũ: kỳ trước không tiếp giáp kỳ hiện tại. Ngoài lỗi tháng, cộng 24 giờ vào ngày đã chuyển UTC không phản ánh ngày dài 23/25 giờ ở timezone có DST. Chuyển local → UTC một lần cũng sai offset vào ngày đổi DST ở Sydney; test đã tái hiện đầu ngày 05/04/2026 lệch một giờ.

## 2. Cách sửa

- Tính đầu/cuối ngày, tuần bắt đầu thứ Hai, tháng và năm trên **lịch địa phương** trước; tháng/năm luôn bắt đầu ngày 1. Sau đó chuyển từng ranh giới sang UTC.
- Giữ khoảng nửa mở `[start,end)`; truy vấn vẫn `paidAt: { gte: start, lt: end }`. Không đổi Payment để sửa báo cáo.
- Chuyển timezone xét offset hai phía của thời điểm đổi giờ; chọn lần đầu nếu nửa đêm lặp lại, mốc sau khoảng trống nếu nửa đêm bị bỏ qua.
- Kỳ trước lấy mốc ngay trước đầu kỳ hiện tại và dùng cùng phép tính lịch.
- Bucket biểu đồ đi theo ngày/tháng lịch, tránh tăng UTC từ ngày 30/31 hoặc qua DST. Đây là đồng bộ cách tính bucket; không kết luận mọi biểu đồ năm cũ đều sai.
- Báo cáo dùng cùng một `now` cho kỳ hiện tại và kỳ trước, tránh hai lần đọc giờ ở hai phía ranh giới. Tham số thời điểm tùy chọn giúp kiểm thử bằng ngày cố định; các caller hiện tại giữ cách gọi cũ.

## 3. Unit test timezone

`scripts/period-checks.ts`: **65 bộ ranh giới cố định đạt**, kèm tính tiếp giáp kỳ trước, đầu kỳ/giây cuối kỳ và 72 tổ hợp bucket.

| Phạm vi | Đã kiểm tra |
|---|---|
| Asia/Ho_Chi_Minh | Đủ 12 tháng của 2024, 2025, 2026, 2028; tháng 2 thường/nhuận, 30/31 ngày |
| Tuần/năm | Tuần qua năm mới, năm nhuận, kỳ trước tiếp giáp |
| Ranh giới | `end - 1 ms` còn trong kỳ, `end` sang kỳ tiếp theo; ngày nhập sai bị từ chối |
| Timezone khác | UTC, Bangkok, Tokyo, Kathmandu, New York, Berlin, Sydney, Santiago, Havana |
| DST | Ngày 23/25 giờ; Sydney đổi offset trước UTC guess; nửa đêm bị bỏ qua/lặp lại |
| Bucket | 8 timezone × 3 ngày cố định × tuần/tháng/năm: đúng số lượng và không trùng key |

Hệ thống hiện lưu timezone dạng chuỗi IANA, không có danh sách enum giới hạn. Không khẳng định đã kiểm thử mọi timezone và mọi thay đổi lịch sử của IANA; HCM vẫn là mặc định.

## 4. Concurrency: tái hiện và sửa tối thiểu

### Lỗi A — yêu cầu muộn ghi đè PAID

Customer context được đọc trước transaction. Route service-request cũ không khóa/kiểm tra lại phiên khi ghi Payment `PENDING` và DiningSession `AWAITING_PAYMENT`.

Test chặn đọc JSON **sau khi route đã lấy context OPEN**, cho thu ngân xác nhận CARD thành công rồi tiếp tục yêu cầu khách. Code cũ trả 200 và Payment thực tế thành `PENDING` (assertion: `'PENDING' !== 'PAID'`). Đây là lỗi đã chứng minh trên PostgreSQL, không chỉ giả định từ source.

Sửa: khóa bàn rồi phiên trong transaction, kiểm tra lại tenant/table/trạng thái active. Nếu đã đóng, trả 409 và không tạo request/thông báo mới. Yêu cầu mới sau khi phiên đóng bị lớp customer-context trả 401 như trước. Khóa cũng tuần tự hóa double-click nên chỉ tạo một ServiceRequest đang mở và một Payment pending.

### Lỗi B — deadlock nhân viên thêm món và thu ngân

Route nhân viên giữ khóa bàn rồi ghi phiên, trong khi xác nhận thanh toán giữ khóa phiên rồi ghi bàn. Test HTTP dùng trigger/gate **chỉ trong DB test** dừng INSERT Order của fixture để tạo đúng giao cắt này. PostgreSQL trả `40P01 deadlock detected` trên code trước sửa.

Sửa: các writer liên quan dùng thứ tự **RestaurantTable → DiningSession**, luôn scoped tenant. Route nhân viên bổ sung khóa phiên active trước khi đọc/tạo order; hành vi mở phiên mới khi bàn trống giữ nguyên. Customer order cũng lấy khóa bàn trước khóa phiên. QR welcome đã dùng khóa bàn nên không cần sửa nghiệp vụ QR.

Xác nhận thanh toán giữ nguyên phép tính bill, expectedGrandTotal, invoice/seller/table snapshot, confirmedBy, idempotency key, cập nhật order/item/request và giải phóng bàn. Nếu đã có Payment PAID thì trả lại bill hiện có, không tính/lưu lại theo phương thức retry, kể cả trạng thái phiên lịch sử không nhất quán. Không âm thầm sửa trạng thái lịch sử đó.

### Bất biến đã kiểm chứng

- PAID không bị request retry đổi thành PENDING; CLOSED không bị mở lại.
- Xác nhận đồng thời hoặc retry trả cùng paymentId; chỉ một bill PAID cho phiên thanh toán thử.
- Đổi phương thức trên retry không đổi snapshot, số tiền, paidAt, invoice, confirmedBy hoặc updatedAt của bill đã xác nhận.
- Order đến trước điểm chốt được tính vào bill; đến sau khi phiên đóng bị từ chối. Nếu tổng hiển thị đã cũ, trả BILL_CHANGED trước khi ghi PAID.
- Hai order cùng idempotency key chỉ lưu một order; retry staff order sau khi chốt không ghi thêm món.
- AuditLog fixture có sẵn được giữ nguyên. Phase 0 không bổ sung hay tuyên bố đã có sổ audit tài chính mới.
- Tenant khác không thể thanh toán phiên, dùng sản phẩm/cookie của nhau; tham chiếu bàn sai tenant bị từ chối trước khi ghi.

## 5. Kết quả PostgreSQL/HTTP

Môi trường: Windows local, Node **24.22.1**, PostgreSQL **16.15**, Prisma **6.19.3**, Next.js **14.2.35**. DB mới `tax_phase0_test` trên **127.0.0.1:55432**, áp dụng 28 migration hiện có để chuẩn bị DB test; không tạo migration mới. HTTP server **127.0.0.1:3300** dùng chính DB này, JWT/cookie QA và fixture tự tạo. Không dùng tài khoản thật.

`scripts/tax-phase0-postgres.ts --http`: **13 nhóm đạt trên bản production build chạy local**:

1. Context cũ không hạ PAID hoặc mở CLOSED.
2. Bốn payment request đồng thời chỉ một yêu cầu và một pending payment.
3. Hai xác nhận, hai order, retry/đổi phương thức và giữ AuditLog.
4. Request so với confirm, lặp 5 lần.
5. Order double-click/idempotency và expectedGrandTotal cũ.
6. Order bị dừng sau context rồi chốt bill; race order/confirm lặp 5 lần.
7. Tenant isolation cho phiên, sản phẩm và cookie.
8. Báo cáo thật trên PostgreSQL tháng 2/2024: bản ghi tại start và end−1ms được tính, start−1ms/end bị loại; 2 bill = 22.000đ, kỳ trước 11.000đ, 29 bucket và tổng bucket khớp tổng báo cáo.
9. HTTP staff order/confirm với gate tái hiện deadlock; nay cả hai hoàn tất, bill 22.000đ; staff retry không đổi bill.
10. HTTP confirm double-click/retry, thiếu session, BILL_CHANGED, thiếu đăng nhập/role, tenant khác; API bill/history 200; trang bàn/thu ngân/báo cáo và QR welcome 200.
11. Audit phát hiện fixture lỗi, không thay đổi Payment và DB chặn UPDATE trong transaction read-only.
12. Phiên lịch sử có PAID nhưng còn OPEN không ghi đè snapshot, không tự backfill trạng thái.
13. Tham chiếu bàn sai tenant không ghi Payment hoặc thay bàn tenant khác.

Test tự dọn đúng fixture do lần chạy tạo ra; không reset DB. Trigger/function/advisory gate được gỡ khi kết thúc test HTTP. **Chạy suite này tuần tự, không chạy hai bản --http đồng thời trên cùng DB.**

Log Prisma có thể ghi P2002 ở phép thử gửi trùng; test xác nhận catch trả đúng order/bill và chỉ lưu một bản ghi. Đây là tình huống dự kiến, không phải test bị bỏ qua.

## 6. Công cụ audit read-only

`scripts/financial-source-audit.ts` gọi `src/server/services/financial-audit-service.ts` bằng PrismaClient riêng, không qua middleware ứng dụng có thể upsert policy. Một transaction **RepeatableRead + SET TRANSACTION READ ONLY** cho snapshot nhất quán; PostgreSQL thực thi giới hạn chỉ đọc.

| Mã kiểm tra | Ý nghĩa |
|---|---|
| PAID_WITHOUT_PAID_AT | PAID thiếu thời điểm thu |
| BILL_TOTAL_MISMATCH | subtotal + tax khác grandTotal hoặc amount khác grandTotal; ép bigint tránh overflow trong audit |
| MISSING_BILL_SNAPSHOT | Thiếu invoiceNumber, tên/id bàn, tên đơn vị/tên hiển thị bill |
| MULTIPLE_PAID_PER_SESSION | Nhiều PAID cho một phiên |
| PAYMENT_TENANT_MISMATCH | Tenant Payment/phiên/bàn lệch nhau |
| ORDER_TENANT_MISMATCH | Tenant Order/phiên/bàn hoặc tableId không nhất quán |
| ITEM_TENANT_MISMATCH | Tenant dòng hàng/Order/Product lệch nhau |
| DUPLICATE_INVOICE_NUMBER | Trùng invoiceNumber |
| DUPLICATE_IDEMPOTENCY_KEY | Trùng key trong cùng tenant; key giống nhau ở tenant khác không phải trùng |
| LEGACY_INCOMPLETE | Thiếu người xác nhận/key/dòng hàng hoặc snapshot dòng hàng không đủ/không hợp lệ |
| PAID_SOURCE_TOTAL_MISMATCH | Tổng dòng hàng nguồn khác subtotal bill |
| PAID_SESSION_STATE_MISMATCH | PAID nhưng phiên chưa CLOSED/PAID hoặc thiếu closedAt |

Output JSON chỉ có mã, số lượng và tối đa 20 ID/mã; không xuất tên/số điện thoại/nội dung khách. Exit code: **0** không phát hiện, **2** có phát hiện, **1** không chạy được. Findings là danh sách cần đối soát, không phải kết luận gian lận hay căn cứ tự chỉnh dữ liệu. Trường thuế/địa chỉ/điện thoại/email người bán có thể tùy chọn nên không mặc định xem trống là dữ liệu giả.

Phải cấp riêng `FINANCIAL_AUDIT_DATABASE_URL`; không fallback DATABASE_URL. Mặc định chỉ nhận DB local có tên chứa `test`. Đích khác cần phê duyệt đọc production riêng rồi mới dùng `--allow-non-test-read`; **chưa được phê duyệt/chưa chạy tùy chọn này**. Nên dùng tài khoản PostgreSQL chỉ có quyền SELECT khi nghiệm thu thực tế.

Đã chạy CLI trên DB test sau khi dọn fixture: exit 0, 12 mã đều 0. Quan trọng hơn, test có dữ liệu hợp lệ trước khi gây lỗi cũng có 0 findings; sau khi gây lỗi có cảnh báo tương ứng. Hai loại duplicate đang được unique constraints chặn trên DB test; test chứng minh insert trùng bị từ chối, không tháo constraint để tạo dữ liệu hỏng. Không suy diễn kết quả này thành dữ liệu production sạch.

## 7. Lệnh chạy lại

Dùng DB test mới trên 127.0.0.1:55432, tên đúng `tax_phase0_test`. Cấp DATABASE_URL và TAX_PHASE0_TEST_DATABASE_URL cùng một URL test; NEXTAUTH_SECRET chỉ dành cho QA. Không lấy URL production. Trước test HTTP, build/start ứng dụng với chính DB test và secret đó trên port 3300, NEXTAUTH_URL tương ứng.

```text
pnpm exec prisma migrate deploy       # Chỉ DB test đã xác minh ở trên
pnpm test:period
pnpm test:tax-phase0                  # PostgreSQL, không cần HTTP server
pnpm test:tax-phase0 -- --http         # Hoặc pnpm exec tsx scripts/tax-phase0-postgres.ts --http
pnpm audit:financial-source           # Cần FINANCIAL_AUDIT_DATABASE_URL riêng
pnpm lint
pnpm typecheck
pnpm build
```

Runner local dùng Node gọi trực tiếp TSX/Next/TypeScript do npm không có trên PATH; cấu hình credential nằm ngoài Git. Không đưa credential vào báo cáo hoặc lệnh mẫu. Thư mục `.trial-runtime` đã được ignore từ trước.

## 8. Hồi quy và build

| Kiểm tra | Kết quả |
|---|---|
| Unit period/timezone/bucket | PASS |
| PostgreSQL + HTTP, bản Next production chạy local | PASS, 13 nhóm |
| Subscription PostgreSQL integration có sẵn | PASS, DB test cô lập; không đổi subscription source |
| Lint | PASS, không warning/error |
| TypeScript `tsc --noEmit` | PASS |
| Next production build | PASS, compile/type/lint/static generation hoàn tất |
| Git diff whitespace check | PASS |
| 18 script hồi quy | PASS: period, hardening, backup/restore, form UX, customer name/cookie, paid bill, in 58/80mm, cashier realtime, staff POS/device/soft-delete, kitchen/waiter claims, responsive tables, subscription lifecycle/credit/checkout/SePay |

Ba static test cũ thất bại vì assertion source đã lỗi thời ở HEAD nền: popup dùng tên ref cũ, cashier đã tách query sang service, schema căn cột bằng nhiều khoảng trắng. Chỉ cập nhật assertion để kiểm tra đúng implementation hiện tại; không sửa các UI/subscription/schema tương ứng và không bỏ test.

Phân biệt mức kiểm chứng: financial/report/API đã thực thi với PostgreSQL và HTTP; responsive tables/in bill là regression source checks hiện có. Chưa thực hiện in máy in thật, kiểm thử tải peak, browser visual QA hoặc nghiệm thu production trong nhiệm vụ này.

## 9. File thay đổi

- `src/lib/period.ts`: ranh giới lịch/timezone và bucket keys.
- `src/server/services/reporting-service.ts`: bucket theo lịch, một anchor thời điểm cho hai kỳ.
- `src/server/services/payment-service.ts`: table → session locks, giữ nguyên PAID snapshot.
- `src/app/api/restaurants/[rSlug]/customer/service-request/route.ts`: lock/revalidate transaction, từ chối phiên đóng/đã PAID.
- `src/app/api/restaurants/[rSlug]/customer/order/route.ts`: cùng thứ tự khóa, kiểm tra bàn scoped tenant.
- `src/app/api/restaurants/[rSlug]/admin/tables/[tableId]/order/route.ts`: khóa phiên active sau khóa bàn.
- `src/server/services/financial-audit-service.ts`, `scripts/financial-source-audit.ts`: audit read-only.
- `scripts/period-checks.ts`, `scripts/tax-phase0-postgres.ts`: automated tests mới.
- `scripts/paid-bill-flow-checks.ts`, `scripts/popup-form-ux-checks.ts`, `scripts/staff-device-name-checks.ts`: sửa assertion regression cũ.
- `package.json`: thêm lệnh test/audit, không đổi dependency/lockfile.
- `docs/TAX_PHASE_0.md`: báo cáo này.

`docs/TAX_MODULE_READINESS.md` và các asset/thư mục untracked đã tồn tại trước nhiệm vụ được giữ nguyên; không gom vào commit vì chưa có bước commit nào.

## 10. Rủi ro còn lại và rollout an toàn

1. **Chưa biết chất lượng dữ liệu production.** Cần duyệt riêng audit read-only, chọn cửa sổ ít tải và tài khoản SELECT; xem findings trước mọi ý định sửa/backfill. Không có script auto-fix.
2. Lock bàn tuần tự hóa thao tác trên cùng bàn, không khóa toàn tenant. Chưa load test peak; transaction có thể timeout khi contention cao. Khi lỗi, transaction rollback, client có thể retry; cần theo dõi thời gian khóa/P2028/40P01 khi nghiệm thu.
3. Unique key đảm bảo luồng hiện tại; DB chưa có unique constraint “mỗi phiên chỉ một PAID” hay composite tenant FK. Không thêm migration khi chưa cần; audit nhận diện dữ liệu lệch và code bảo vệ các đường đã kiểm thử. SQL/script ngoài các đường này vẫn phải tuân thủ bất biến.
4. Không khôi phục bằng suy đoán các PAID lịch sử đã bị hạ PENDING hoặc snapshot thiếu. Audit cảnh báo không thể chứng minh toàn bộ nguồn thu lịch sử đúng.
5. Không thay semantics doanh thu: tổng bill đã PAID gồm tax POS, theo paidAt; chưa phải doanh thu tính thuế hoặc thuế phải nộp. Chưa có sổ hủy/hoàn/giảm giá, khóa kỳ hoặc lịch sử cấu hình thuế.

**Đề xuất phát hành sau nghiệm thu:** review diff/tests → commit/push riêng phạm vi này → build Linux bằng CI GitHub runner → xác minh source SHA/image/checksum → kiểm disk/RAM và giữ image rollback → backup/off-host theo runbook hiện tại → image-only recreate đúng QuánPilot app, không DB/worker nếu không đổi runtime → readiness/health và smoke có kiểm soát. Không build trên VPS, không migration, không down -v/prune dữ liệu. Không tạo giao dịch khách giả trên production; nghiệm thu thanh toán dùng môi trường QA hoặc giao dịch được chủ dự án duyệt rõ.

Rollback: trả app về image production trước đã xác minh, giữ nguyên env/network/volumes. Không rollback/restore database chỉ để đảo thay đổi code này. Image cũ vẫn chứa lỗi concurrency và ranh giới kỳ; nếu phải quay lại, hạn chế luồng thanh toán đồng thời và thông báo rủi ro, không xem rollback là sửa dữ liệu.

## 11. Điều kiện bắt đầu Giai đoạn A

- Chủ dự án nghiệm thu Phase 0 và quyết định phát hành riêng; hiện chưa commit/push/deploy.
- Duyệt và hoàn tất audit read-only trên nguồn production hoặc bản sao backup cô lập; đối soát findings với người phụ trách, lập kế hoạch xử lý riêng nếu có dữ liệu lịch sử thiếu/lệch.
- Thống nhất định nghĩa doanh thu POS, phạm vi xuất báo cáo và giới hạn dữ liệu hỗ trợ kế toán; không gọi đó là số thuế phải nộp.
- Có backup/restore và rollback kiểm chứng, smoke sau phát hành; xác nhận không hồi quy vận hành thanh toán.
- Mọi sửa dữ liệu lịch sử, migration hoặc nghiệp vụ thuế tiếp theo phải có phạm vi và phê duyệt riêng. Phase 0 không tự bắt đầu Phase A.
