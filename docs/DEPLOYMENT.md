# Triển khai production

## Mô hình khuyến nghị

Ubuntu VPS -> Nginx/Caddy HTTPS -> `127.0.0.1:3000` -> Docker Compose (`app`, `postgres`, `maintenance-worker`). Dùng volume bền vững cho PostgreSQL, `public/uploads`, `backups`, `runtime`, `host-metrics`.

## Cài mới

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
cd /opt/websites
git clone <repository-url> restaurant
cd restaurant
cp .env.docker.example .env
mkdir -p public/uploads backups runtime host-metrics
chmod 700 backups runtime
docker compose build app maintenance-worker
docker compose up -d postgres
docker compose run --rm app pnpm prisma:deploy
# Chỉ hệ thống mới và sau khi kiểm tra seed:
# docker compose run --rm app pnpm prisma:seed
docker compose up -d app maintenance-worker
```

## Reverse proxy Nginx

```nginx
server {
  listen 80;
  server_name example.com;
  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 300s;
  }
}
```

Sau đó chạy `certbot --nginx -d example.com`, đặt `NEXTAUTH_URL=https://example.com`, rebuild app và kiểm tra HTTPS. HSTS nên cấu hình ở reverse proxy sau khi HTTPS ổn định.

## Host metrics

Collector phải chạy trên host, không trong container:

```bash
chmod +x scripts/collect-host-metrics.sh
sudo install -m 755 scripts/collect-host-metrics.sh /usr/local/bin/quanpilot-collect-metrics
```

Dùng systemd timer thay vì phụ thuộc `crontab`; collector phải ghi `host-metrics/metrics.json` atomically. Xác minh bằng `df -h /`, `free -h`, `swapon --show`.

## Cập nhật phiên bản

```bash
cd /opt/websites/restaurant
git pull
docker compose build app maintenance-worker
docker compose up -d postgres
docker compose run --rm app pnpm prisma:deploy
docker compose up -d app maintenance-worker
docker compose ps
docker compose logs app maintenance-worker --tail=150
```

Trước deploy: backup, kiểm tra checksum và có phương án rollback. Không chạy `prisma migrate dev/reset` trên production.

## Kiểm tra sau deploy

- `/login`, Platform Admin và một tenant admin.
- Khách QR -> order -> bếp -> phục vụ -> payment -> bill.
- Push foreground/background trên Android thật.
- Worker heartbeat, backup thủ công, file backup và retention.
- Header HTTPS, upload ảnh, PWA manifest/icon.
- `docker compose ps`, log không có vòng restart hoặc Prisma error.

## Rollback

1. Không rollback schema bằng cách xóa migration.
2. Chuyển app về commit/image trước tương thích schema.
3. Nếu migration không backward-compatible, dùng kế hoạch migration đảo đã review hoặc restore môi trường cô lập trước.
4. Restore dữ liệu production chỉ theo runbook backup/restore, có maintenance và pre-restore backup.

## Đổi domain

Trỏ DNS, cấp SSL, đổi `NEXTAUTH_URL`, giữ `NEXTAUTH_SECRET`, rebuild. Giữ domain cũ redirect bảo toàn path. Cookie/PWA/push gắn theo origin nên người dùng phải đăng nhập, cài PWA và đăng ký push lại; QR cũ cần redirect hoặc in lại.
