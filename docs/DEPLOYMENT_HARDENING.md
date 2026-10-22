# QAVIO & QuánPilot — bảo vệ quy trình phát hành

Ngày: **22/10/2026 (Asia/Bangkok)**. **Đã được duyệt push và dọn tài nguyên VPS** sau báo cáo local. Source tooling/workflows đã push; cấu hình image-only/logging/RAM chưa áp production. Audit ban đầu chỉ đọc; đợt dọn tiếp theo đã xóa đúng image/archive được kiểm kê, kết quả ở phần11. Không deploy/recreate/build/pull, migration hoặc đổi dữ liệu production.

## 1. Trước / sau

| Hạng mục | Production hiện tại | Bản chuẩn bị |
| --- | --- | --- |
| Build | GitHub-hosted runner; Compose vẫn có build | Giữ build development/CI, overlay cuối xóa build khỏi model production |
| Chuyển image | GitHub Artifact → kiểm checksum → docker load | Thêm manifest ràng buộc source SHA, archive/config checksum, Linux amd64, layer list, kích thước |
| Pull | Deploy trước dùng image local | pull_policy never cho toàn model; up --no-build --pull never --no-deps đúng một service |
| Tag | Source SHA7 | Kiểm SHA40 + manifest digest được duyệt; sau load pin image ID trong cấu hình thi hành |
| Logs | QAVIO có giới hạn; QuánPilot thiếu | json-file, max-size10m, max-file3, không xóa/truncate log |
| RAM | QAVIO web512MiB, worker/PG128MiB; QuánPilot không cap | Không thay limit; preflight MemAvailable tối thiểu256MiB và đề xuất nâng VPS bên dưới |
| Disk | Kiểm/dọn theo đợt | Inventory + capacity gate; warning >80%, critical >90%; reserve tối thiểu10% ổ hoặc1.5GiB |
| Cleanup | Theo danh sách thủ công | Dry-run mặc định; xác nhận hash chính xác, giữ current/rollback, recheck trước mỗi lần rm |
| CD | Operator/agent chạy sau CI | Review workflow không SSH + CLI phê duyệt SHA:digest, snapshot private và rollback ứng dụng |

## 2. File thay đổi và cách dùng Compose

Mỗi repo có `compose.image-only.yaml`, `deploy/release_guard.py`, `deploy/review_release.py`, bốn file `deploy/test_*.py`, workflow `release-review.yml` và báo cáo này. Workflow build hiện có được bổ sung test an toàn, manifest/checksum và summary; `.gitignore` bỏ Python bytecode. Không sửa Dockerfile, base Compose, runtime overlay private, app source, schema, migrations hoặc dữ liệu.

Thứ tự file **bắt buộc**:

- QAVIO: `compose.yaml` → `compose.production.yaml` → `compose.release-candidate.yaml` → **`compose.image-only.yaml` cuối cùng**.
- QuánPilot: `docker-compose.yml` → **`.trial-runtime/production-release.yaml` hiện có trên VPS** → **`compose.image-only.yaml` cuối cùng**. Không bỏ runtime overlay: nó chứa cấu hình đã vận hành và không được đưa vào Git/artifact.

Overlay dùng `build: !reset null`, không dùng `build: null` thông thường vì merge có thể giữ cấu hình cũ. Đã kiểm bằng Compose local5.1.4 và production5.6.0. Chuẩn tối thiểu vận hành: Compose>=2.24.4 và luôn render/validate trước. Docker giải thích [cơ chế reset/merge](https://docs.docker.com/reference/compose-file/merge/) và [cờ no-build/pull](https://docs.docker.com/reference/cli/docker/compose/up/).

Các biến `RELEASE_IMAGE`, `RELEASE_WORKER_IMAGE`, `RELEASE_POSTGRES_IMAGE` không có mặc định. Guard điền từ artifact đã duyệt và image đang chạy. Thiếu biến thì Compose dừng. Mọi service, kể cả profile migration của QAVIO, phải có image và pull_policy never. Service migration không được chạy bởi guard.

Guard so sánh toàn bộ model trước/sau; chỉ cho khác build/image/pull_policy/logging. Environment, mounts, named volumes, networks, ports, commands, healthcheck, labels, limits, profiles và project name phải giữ nguyên. Guard còn đối chiếu env hiện chạy với model để phát hiện file runtime bị lệch. Không in cấu hình đã resolve vì có thể chứa secret.

**Giới hạn:** base files vẫn build được cho development/CI. Người có root vẫn có thể cố ý bỏ overlay hoặc chạy Docker trực tiếp. Bảo vệ áp dụng cho đường phát hành được chuẩn hóa; đây không phải sandbox chống root.

## 3. Log rotation và phạm vi recreate

Docker hiện dùng json-file. QAVIO web đang10m×3; worker và PG5m×2. QuánPilot app/worker/PG chưa có log options; Docker daemon cũng không có mặc định giới hạn.

Overlay chuẩn hóa10m×3 cho các service hai dự án. Mỗi service khoảng30MiB log theo rotation, không phải quota tuyệt đối cho cả Docker. Không sửa logging của Portfolio hoặc daemon.

Thay logging chỉ có hiệu lực khi recreate. Guard mặc định chỉ recreate `web` hoặc `app`: worker/PG ghi rõ **deferred**, dù model mong muốn đã có rotation. Áp logging worker/PG cần đợt riêng được duyệt; PostgreSQL recreate có thể ngắt kết nối ngắn, cần khung bảo trì và backup. Không tuyên bố rotation đã áp trên production hoặc restart PG trong lượt này.

## 4. Đo RAM Linux và đề xuất

Đo chỉ đọc, không tạo login/upload/load QA trên production. Cgroup peak là từ lúc container khởi động, bao gồm file cache; khác số Docker stats đã trừ cache và **không chứng nhận peak tải nhiều khách**.

| Container | Cgroup current ở mẫu cuối (MiB) | Cgroup peak (MiB) | Limit hiện tại (MiB) | Đề xuất để rehearsal, chưa áp |
| --- | ---: | ---: | ---: | --- |
| QAVIO web | 109 | 240 | 512 | Giữ512 |
| QAVIO worker | 58 | 128 | 128 | Thử256 sau nâng RAM |
| QuánPilot app | 131 | 309 | Không giới hạn | Thử640, cần peak login/upload/realtime |
| QuánPilot maintenance worker | 36 | 194 | Không giới hạn | Thử384, cần backup/restore rehearsal |
| QAVIO PostgreSQL | 12 | 117 | 128 | Thử256, kiểm peak query/backup |
| Restaurant PostgreSQL | 33 | 71 | Không giới hạn | Thử256, kiểm connection/query peak |

Ở mẫu cuối tất cả memory.events oom/oom_kill=0; worker QAVIO có `max=88631`, cho thấy đã nhiều lần chạm ngưỡng để reclaim, **không đồng nghĩa đã OOM**. Maintenance worker có restart lịch sử1, không suy diễn nguyên nhân từ mẫu này.

Host RAM955MiB; một mẫu MemAvailable438MiB, swap dùng730MiB/2047MiB. Không cộng RSS nhàn rỗi để chứng minh đủ tải. Các cap thử ở trên tổng2304MiB, chưa gồm OS, Docker, Portfolio và headroom; không phù hợp để cùng ép vào VPS1GB.

Rà source: QAVIO scrypt N65536/r8/p2/maxmem128MiB, một tác vụ mỗi process với queue tối đa8; sharp cho ảnh tới16triệu pixel. QuánPilot dùng bcrypt12, sharp và Prisma. Prisma connections, Next.js SSR/cache, decode ảnh, tác vụ bảo trì/pg_dump và request đồng thời vẫn có peak ngoài V8 heap; NODE_OPTIONS không phải giới hạn toàn container.

**Đề xuất dung lượng:** VPS RAM4GB và ổ>=50GB để có headroom cho sáu service, Portfolio, rollback/artifact/backup. Đây là sizing sơ bộ từ số đo, không phải cam kết sức tải. Chưa áp bất kỳ memory/swap limit mới.

Trước chốt limits: rehearsal trên Linux cô lập, fixture DB riêng; đo cgroup current/peak/events + latency khi login đồng thời (scrypt/bcrypt), Prisma query, sharp upload, Next public/Admin và backup worker cùng chạy. Tăng tải từng nấc, kiểm429/5xx/OOM và soak. Không stress production hoặc dùng dữ liệu khách thật. Lượt này chưa chạy bài tải nhiều khách mới; không hạ limit dựa trên 22 test điều khiển deploy.

## 5. Inventory và disk gate

Chỉ đọc trên VPS sau khi công cụ được duyệt cài:

```sh
python3 deploy/release_guard.py inventory
python3 deploy/release_guard.py capacity --archive-bytes ARCHIVE_BYTES --image-bytes IMAGE_BYTES --path /opt/websites
```

Thay các placeholder bằng byte trong báo cáo review; không chạy nguyên placeholder. Inventory đo disk/free, Docker storage, memory stats, log directories, volume/bind mounts (PG/media/uploads/runtime/backups), release `.runtime`/`.trial-runtime`, cache host. `du -x` không đi sang filesystem khác, không tự xóa gì. Một số đường dẫn/volume trùng giữa các container: **không cộng các hàng để ra tổng ổ**.

Pre-transfer capacity dự trù `imageBytes + 2×archiveBytes + reserve` (ZIP/tar staging), khi deploy sau download dùng upper bound uncompressed archive/image + reserve. Rollback hiện có vẫn nằm trên disk, không coi reclaimable là available. Reserve=max(1.5GiB,10% tổng ổ), hiện khoảng2.43GiB. Dừng nếu disk>90%, free không đủ hoặc MemAvailable<256MiB; >80% trả warning và phải xem inventory trước tiếp tục. Ngưỡng256MiB chỉ là điều kiện vào deploy, không đảm bảo chịu tải lâu dài.

Số đo audit: disk79.9%, available5,246,861,312bytes (~4.89GiB); build cache0B. Docker image logical size13.04GB, reclaimable4.787GB, không bằng dung lượng có thể xóa an toàn. Logs từng container khoảng40KiB–1MiB. Hai PG volumes khoảng47.4/66.9MiB; uploads3.74MiB; media60KiB; Restaurant backups19.4MiB. QAVIO `.runtime` khoảng1.79GiB gồm dữ liệu vận hành/release/backup cần phân loại; **không tự dọn thư mục này**.

Inventory là công cụ on-demand; chưa cài cron/timer hay gửi cảnh báo ra ngoài. Sau duyệt có thể gọi định kỳ bằng hệ thống giám sát hiện có và dùng severity; không thêm SMTP hoặc tự tạo automation.

## 6. Cleanup image: mặc định dry-run

Tạo private `rollback-images.json` từ các image đã được xác minh chạy tốt. Ví dụ cấu trúc (ID phải lấy thật từ docker image inspect, không dùng placeholder):

```json
{
  "qavio-web": {"ref":"qavio-web:5f10868","id":"sha256:EXACT_ID","verified":true},
  "quanpilot-app": {"ref":"quanpilot-app:3574ce4","id":"sha256:EXACT_ID","verified":true}
}
```

```sh
python3 deploy/release_guard.py cleanup --rollback-file /private/rollback-images.json
```

Không có cờ xác nhận thì không gọi rm. Sau người có thẩm quyền duyệt **đúng danh sách mới nhất**, operator thêm `--confirm-plan HASH_TRONG_BAO_CAO`. Đây là xác nhận cụ thể cho một plan, không phải quyền dọn định kỳ.

- Whitelist chỉ qavio-web/quanpilot-app/qavio-staging-web; không dựa vào tuổi image.
- Giữ toàn bộ image của container đang chạy **và đã dừng**; giữ ít nhất một rollback khác image đang chạy của cả hai app, kiểm ref+ID. File verified là ghi nhận nghiệm thu của operator, không tự biến một image bất kỳ thành rollback đã kiểm thử.
- Image có tag thuộc app khác, image không tag, PostgreSQL/worker/Portfolio và mọi repo ngoài whitelist giữ nguyên. Worker không thuộc cleanup, do đó không mất runtime/rollback của worker.
- So lại ref/ID/containers/rollback trước mỗi lần rm; Docker rm theo tag cụ thể, không force, không prune. Shared layers do Docker quản lý; không cộng Size để hứa dung lượng thu hồi.
- Deploy và cleanup dùng chung flock `/run/lock/qavio-release.lock`; không chạy Docker thủ công song song. Lock không ngăn người root dùng công cụ khác.

Audit dry-run ban đầu tìm5image ứng viên: quanpilot-app05ff9ad/be133f2 và qavio-web7ebeb22/d590b1c/898451b. **Đã lập lại plan và dọn5image theo yêu cầu tiếp theo của chủ dự án; xem phần11.** Các lần dọn tiếp cần lập plan mới, vì container/tag có thể thay đổi. Rollback giữ QAVIO5f10868/QuánPilot3574ce4; sản xuất cc06d0f/1edbfd9.

## 7. CI và CD có kiểm soát

Không có push trigger, SSH credential, self-hosted runner hoặc production secret trong workflow mới. Không tạo GitHub Environment, đổi quyền hay tự thêm reviewer.

1. Owner/operator chạy build workflow bằng workflow_dispatch trên main.
2. GitHub ubuntu-latest: offline safety tests, lint, TypeScript, integration trên PG test; Docker build toàn app. QAVIO có TypeScript check sau build; QuánPilot giữ check hiện có. QAVIO worker/QuánPilot worker không bị thay image bởi release web.
3. Build tạo archive, images.json, release-manifest.json và SHA256SUMS. Manifest gồm SHA40, scope, image tag, Linux/amd64, config hash/rootfs, byte sizes và tổng layer sau giải nén. Docker/containerd có thể báo Size nén: guard đo streaming gzip từng layer, không đoán tỷ lệ nở; gặp Zstandard chưa có decoder thì dừng an toàn. Package chỉ cho phép4file payload, chặn file thừa như .env. Shell build có pipefail; đóng gói lỗi phải làm workflow fail.
4. Upload artifact giữ7ngày. Summary ghi SHA40 và manifest SHA256. Không có production env/private snapshot trong artifact.
5. Chạy workflow **Review built release** với build_run_id + source_sha. Nó kiểm đúng repository/workflow, eventmanual, main, run success, SHA và artifact name/digest từ GitHub; tải signed URL không gửi GitHub token sang host download, chỉ giải nén4tên file cho phép. Verify lại archive/config/platform rồi xuất review JSON. **Không SSH/deploy**.
6. Chủ dự án duyệt source SHA, manifest digest, phạm vi service và plan. Approval token kỹ thuật không thay thế quyền duyệt của người dùng.
7. Operator chụp inventory/capacity **trước transfer**, giữ rollback đã kiểm chứng; backup theo kế hoạch phát hành. Không tải file lớn nếu thiếu headroom.
8. Chuyển payload đã xác minh vào thư mục private trên VPS, xác minh hash rồi chạy guard deploy **không có --approve** để dry-run. Không chạy review downloader nặng trên VPS; có thể tải/kiểm bên ngoài rồi chuyển archive trực tiếp.
9. Khi được duyệt, operator chạy lại guard với exact `--approve SHA40:MANIFEST_SHA256` và snapshot-dir mới trong `.runtime` hoặc `.trial-runtime` đã ignore. Script không có migration.
10. Guard kiểm config/live env/dependency local images, disk/RAM, lưu private snapshots0600/dir0700, docker load, so image Config/rootfs/revision, pin ID và recreate **một** web/app bằng no-build/pull never/no-deps.
11. Kiểm loopback ready/HTTP và Docker health nếu có, HTTPS/public routes; chứng minh container khác không đổi ID/start/restarts và mounts giữ nguyên. Lỗi sau cutover thì rollback image, kiểm HTTP lại; lỗi rollback báo cần phục hồi thủ công. App không có Docker healthcheck dùng HTTP probes, không tuyên bố Docker healthy.
12. Lưu result private; đưa bản đã lược secret vào báo cáo. Archive mới không tự xóa bởi guard; sau thành công operator có thể lập danh sách file staging riêng để duyệt dọn, không xóa backup/volume.

Ví dụ dry-run QAVIO (đổi placeholder; chạy sau duyệt cài tooling):

```sh
python3 deploy/release_guard.py deploy \
  --directory /private/verified-release \
  --sha FULL_SOURCE_SHA --manifest-sha APPROVED_MANIFEST_SHA256 \
  --project-dir /opt/websites/qavio \
  --base /opt/websites/qavio/compose.yaml \
  --base /opt/websites/qavio/compose.production.yaml \
  --base /opt/websites/qavio/compose.release-candidate.yaml \
  --rollback-image qavio-web:CURRENT_VERIFIED_TAG
```

QuánPilot đổi project-dir sang `/opt/websites/restaurant`, base là docker-compose.yml và .trial-runtime/production-release.yaml, rollback-image là quanpilot-app:CURRENT_VERIFIED_TAG. Overlay cuối do guard tự thêm; không thêm vào --base. --rollback-image ở deploy phải trỏ image đang chạy để quay lại chính trạng thái trước cutover; khác với cleanup giữ bản rollback trước đó.

Khi thực thi mới thêm `--snapshot-dir /opt/websites/qavio/.runtime/release-UNIQUE` (QuánPilot dùng .trial-runtime) và --approve token đã duyệt. Config JSON private chứa env: không cat, không commit, không upload artifact. Manifest nhỏ nên lưu ngoài VPS cùng backup/image payload được duyệt nếu cần rollback sau khi artifact7ngày hết hạn.

**GitHub Environments chưa bật:** cần chủ dự án chọn reviewer/tài khoản, branch policy, khả năng hỗ trợ của gói repo và quyền quản trị. Không thêm environment trống vì tên environment tự nó không tạo required-reviewers gate. [GitHub giải thích approval theo Environment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments). Hiện gate là duyệt cụ thể ngoài workflow và CLI operator; chưa phải CD tự động từ GitHub đến VPS.

## 8. Kiểm thử và giới hạn chứng minh

- **22 test ở mỗi repo PASS**: parser Compose thật (không cần Engine), bảo toàn runtime/volumes/network; chặn build/pull, manifest/source/checksum, reject secret payload, disk/RAM gate, cleanup mặc định không mutation, stopped/active/rollback/other repos, thay đổi inventory/race, exact deletion list, pinned ID, scope một service và mô phỏng health failure/rollback. Workflow YAML parse PASS.
- Lint và TypeScript hai repo PASS. Không đổi app source/schema nên không tạo test nghiệp vụ phản chiếu implementation.
- Audit Linux qua SSH **chỉ đọc**: truyền overlay qua stdin cho docker compose config, không ghi config mới. Cả hai model noBuild/pullNever/logBounded/runtimePreserved PASS với runtime overlay thật. Inventory và cleanup_plan dry-run dùng code mới ở bộ nhớ, không cài lên VPS. Bằng chứng `deployment-hardening/read-only-audit.json`.
- 7container giữ nguyên ID/start/restarts, origin ready và bốn HTTPS routes200. Node fetch từ máy local cũng200. Lần đầu probe Python urllib bị403 từ phía public; đã đổi sang TLS-verified curl chuẩn runbook, kiểm lại thành công, không thay Cloudflare.
- Không load image/recreate thật bằng guard mới. Docker Engine local đang tắt; không khởi động Engine dùng chung. Build/review GitHub của bản tooling ban đầu đã PASS; bản tính layer sau giải nén cũng được push và kiểm tra lại. Kết quả source/run cuối ghi ở phần11. Chưa có cutover thật bằng guard mới; cần rehearsal cô lập trước apply production. 22test không thay thế bài capacity/concurrent load hoặc thử ngắt nguồn thật.
- Đây là báo cáo local chuẩn bị, không tuyên bố đã áp rotation/limits hay CD mới vào production.

## 9. Ảnh hưởng và các quyết định còn chờ

Không migration/reset/DB write, không thay subscription/payment/OAuth/trial/Admin/CMS/contact/pricing, secret/quyền/DNS/Nginx, Docker Engine hoặc Portfolio. Ở đợt audit ban đầu không xóa gì. Đợt dọn được duyệt sau đó chỉ xóa5image và11archive Docker ở phần11; log/backup/volume/dữ liệu khách giữ nguyên. Không thay tài khoản và dữ liệu Restaurant.

Cần chủ dự án quyết định trước bước tiếp theo:

1. Commit/push và CI đã được duyệt thực hiện; vẫn cần rehearsal và duyệt áp image-only deploy/log rotation cho web/app. Không suy diễn quyền dọn thành quyền recreate.
2. Chọn khung bảo trì cho recreate worker/PG để rotation có hiệu lực; giữ volumes, backup và kiểm readiness. Không gộp restart PG vào deploy web.
3. Duyệt sizing/nâng VPS và rehearsal trước áp RAM limits; không áp các cap đề xuất trên host1GB hiện tại.
4. Đã dọn5image theo phê duyệt trực tiếp tiếp theo. Mọi lần dọn khác cần plan và xác nhận phạm vi mới; không bật xóa tự động.
5. Nếu muốn GitHub Environment, xác nhận người duyệt và quyền; nếu muốn monitor định kỳ, xác nhận cơ chế nhận cảnh báo. Chưa cấu hình hai mục này.

## 10. Rollback

Trước apply: giữ image hiện chạy và image rollback kiểm chứng, runtime overlays/env, private snapshot và backup/off-host. Thay logging không thay dữ liệu DB.

Guard lưu `rollback-pinned.json` dưới private snapshot, pin ID image trước release và log policy cũ của app. Nếu lỗi health/cutover, chỉ app rollback; kiểm HTTP lại. Phục hồi thủ công, sau duyệt:

```sh
docker compose --project-directory /opt/websites/qavio -p qavio \
  -f /opt/websites/qavio/.runtime/release-UNIQUE/rollback-pinned.json \
  up -d --no-build --pull never --no-deps web
```

QuánPilot tương tự project restaurant, .trial-runtime và service app. Không down, down-v, prune, drop cột hay restore đè DB. Worker/PG logging nếu được duyệt triển khai sau cần snapshot riêng và khung bảo trì rollback riêng. Các base/dev Compose vẫn giữ nguyên để phục hồi cấu hình trước hardening; không quay về dùng build trên VPS.


## 11. Push và dọn VPS theo phê duyệt tiếp theo — 22/10/2026

Chủ dự án yêu cầu “oke push, sau đó check trên sever ... logs cache dự phòng ... xóa bớt”. Đây là phê duyệt riêng cho push/CI và dọn tài nguyên đã xác định không cần; chưa bao gồm áp config/recreate production.

- Hardening ban đầu: QAVIO`a314019`, Restaurant`49c94dc`. Build Linux GitHub39722007600/39722010546 và review39722333362/39722440818 đều SUCCESS. Không SSH hoặc deploy từ workflows.
- Đã bổ sung dự trù đúng layer OCI sau giải nén: QAVIO`3c30c53`, Restaurant`db1f6da`; kết quả build/review cuối cập nhật bên dưới. 22test/repo vẫn PASS, có fixture nén>100lần để chứng minh không dùng kích thước nén làm dung lượng cần load.
- Dọn bằng plan mới, so container/image/mount/env hashes và12volumes trước/sau. Giữ QAVIOcc06d0f, QuánPilot1edbfd9 và rollback5f10868/3574ce4; giữ toàn bộ image container tham chiếu, worker/runtime/Portfolio/PostgreSQL.
- Đã xóa đúng5image: quanpilot-app05ff9ad/be133f2, qavio-web7ebeb22/d590b1c/898451b. Các quy định giữ những tag này trong báo cáo lịch sử được thay bằng phê duyệt cleanup hiện tại. Không force/prune.
- Đã xóa11file staging ở7đợt release cũ, tổng1,886,980,315bytes. Đây là10Docker image tar.gz và1ZIP trùng payload, **không phải DB backup**. Kiểm SHA256 với SHA256SUMS, metadata image, ZIP chỉ chứa payload release, path chính xác không symlink/mount và không tiến trình nào mở file; không xóa thư mục hoặc file khác.
- Thu hồi tổng3,949,465,600bytes (~3.68GiB), gồm shared-layer image thực tế và archive. Free5,246,750,720→9,196,216,320bytes (~4.89→8.56GiB). df -h trước79%, sau63%, còn8.6G. Docker Images17→12, logical size13.04→10.98GB; không cộng image Size để hứa dung lượng thu hồi. QAVIO .runtime1.8G→34M, vẫn giữ metadata/backup/chứng cứ cần thiết.
- Build cache0B, apt archives16KiB; không có cache build lớn cần dọn. Logs tổng khoảng241MiB, journal199MiB; giữ để chẩn đoán, không truncate/xóa Docker log hoặc mất lịch sử để đổi lấy lượng nhỏ. Bản logging mới vẫn cần recreate được duyệt.
- Giữ12volumes;7container không đổi ID/image/start/restarts/mounts/env hash; PostgreSQL, upload/media, payment/subscription, OAuth/trial/CMS/contact/pricing và backup không bị thay/xóa. Bốn HTTPS checks PASS. Không restart engine hoặc service.
- Còn4.407GB Docker “reclaimable” không được coi là rác: có rollback/worker/tool images ngoài whitelist. Không dọn tiếp chỉ vì Docker báo reclaimable.
- Bằng chứng chính xác: `deployment-hardening/cleanup-20261022.json`; private plan/checksum trên VPS `.runtime/hardening-cleanup-20261022`. Script guard copy vào thư mục này chỉ phục vụ cleanup, không thay cấu hình deploy đang chạy.
- Nếu cần phục hồi bản cũ hơn hai rollback đang giữ, phải lấy lại image từ nguồn build/off-host được kiểm chứng; không dựa vào những tag/archive vừa xóa. Hai rollback bắt buộc vẫn có sẵn trên VPS.


### Kết quả CI cuối sau sửa dung lượng layer

- QAVIO source `3c30c53d65b32be7cebd6318d99aab8de0d02087`: [build39722661715](https://github.com/herry-huynhlong/qavio/actions/runs/39722661715) SUCCESS, [review39722916957](https://github.com/herry-huynhlong/qavio/actions/runs/39722916957) SUCCESS. Archive132,613,359bytes; layer/size budget374,820,864bytes (không dùng133MB nén để dự trù load). Xem `deployment-hardening/qavio-release-review-final.json`.
- QuánPilot source `db1f6dac2b4057c0fc6d84645ed56971096e6165`: [build39722664876](https://github.com/herry-huynhlong/restaurant/actions/runs/39722664876) SUCCESS; full build, không dùng nhánh UI runtime reuse. [Review39723092797](https://github.com/herry-huynhlong/restaurant/actions/runs/39723092797) SUCCESS, artifact checksum/source/manifest và layer budget đã xác minh. Archive313,249,635bytes, image budget1,175,590,912bytes; xem `deployment-hardening/restaurant-release-review-final.json`.
- Cả hai CI chạy safety tests22ca/repo, lint/typecheck, integration PG cô lập và Docker build trên ubuntu-latest. Artifact mới có manifest/checksum đã pin SHA; workflow review không dùng SSH/secret production. Không load các image này lên VPS, không recreate hoặc áp config mới.
- Những commit docs/evidence sau source SHA này không đổi runtime, không cần rebuild. CI của source không được diễn giải là đã deploy hardening trên production.
