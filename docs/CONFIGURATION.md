# Cấu hình môi trường

Không commit `.env`. Giá trị dưới đây chỉ là ví dụ an toàn.

| Biến | Bắt buộc | Công dụng / sai cấu hình |
|---|---|---|
| `DATABASE_URL` | Có | PostgreSQL URL; sai thì Prisma không kết nối. |
| `POSTGRES_PASSWORD` | Docker | Mật khẩu DB dùng chung postgres/app/worker. |
| `NEXTAUTH_URL` | Production | Origin chuẩn cho Auth.js, QR và link đăng nhập. |
| `NEXTAUTH_SECRET` | Có | Ký JWT và cookie khách; đổi sẽ đăng xuất phiên. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Nếu dùng push | Public VAPID, được bundle lúc build. |
| `VAPID_PRIVATE_KEY` | Nếu dùng push | Private VAPID, không đưa ra client/log. |
| `VAPID_SUBJECT` | Nếu dùng push | `mailto:ops@example.com` hoặc URL liên hệ. |
| `APP_DEBUG_LOGS` | Không | `true` bật debug log đã redact; production để `false`. |
| `TENANT_RESTORE_ENABLED` | Không | Feature gate restore tenant; mặc định `false`. |
| `BACKUP_DIR` | Không | Root backup; Docker `/app/backups`. |
| `PLATFORM_RUNTIME_DIR` | Không | Lock/job/maintenance; Docker `/app/runtime`. |
| `SERVER_METRICS_FILE` | Không | File collector host; Docker `/app/host-metrics/metrics.json`. |
| `MAINTENANCE_WORKER_INTERVAL_MS` | Không | Chu kỳ worker, mặc định 30000 ms. |
| `NODE_ENV` | Hệ thống | Production bật secure cookie và giảm log. |

Tạo secret bằng `openssl rand -base64 48`. `NEXT_PUBLIC_*` thay đổi cần rebuild image. Khi đổi domain, đổi `NEXTAUTH_URL`; người dùng đăng nhập lại, cài lại PWA/push và QR cũ cần redirect hoặc tạo lại.
