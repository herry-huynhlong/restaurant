#!/usr/bin/env bash
set -euo pipefail

TARGET_PATH="${HOST_METRICS_TARGET_PATH:-/opt/websites/restaurant}"
OUTPUT_FILE="${HOST_METRICS_OUTPUT_FILE:-/opt/websites/restaurant/host-metrics/metrics.json}"
BACKUP_DIR="${HOST_BACKUP_DIR:-/opt/websites/restaurant/backups}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

disk_line="$(df -Pk "$TARGET_PATH" | awk 'NR==2 {print $2" "$3" "$4}')"
read -r disk_total_kb disk_used_kb disk_available_kb <<< "$disk_line"

mem_total_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
mem_available_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
swap_total_kb="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
swap_free_kb="$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)"

mem_used_kb=$((mem_total_kb - mem_available_kb))
swap_used_kb=$((swap_total_kb - swap_free_kb))

backup_bytes=0
if [ -d "$BACKUP_DIR" ]; then
  backup_bytes="$(du -sb "$BACKUP_DIR" 2>/dev/null | awk '{print $1}')"
fi

export disk_total_kb disk_used_kb disk_available_kb
export mem_total_kb mem_available_kb mem_used_kb
export swap_total_kb swap_used_kb backup_bytes

percent() {
  awk -v used="$1" -v total="$2" 'BEGIN { if (total <= 0) printf "0"; else printf "%.1f", (used / total) * 100 }'
}

disk_total_bytes=$((disk_total_kb * 1024))
disk_used_bytes=$((disk_used_kb * 1024))
disk_available_bytes=$((disk_available_kb * 1024))
mem_total_bytes=$((mem_total_kb * 1024))
mem_used_bytes=$((mem_used_kb * 1024))
mem_available_bytes=$((mem_available_kb * 1024))
swap_total_bytes=$((swap_total_kb * 1024))
swap_used_bytes=$((swap_used_kb * 1024))

tmp_file="${OUTPUT_FILE}.tmp"
cat > "$tmp_file" <<JSON
{
  "collectedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "disk": {
    "totalBytes": $disk_total_bytes,
    "usedBytes": $disk_used_bytes,
    "availableBytes": $disk_available_bytes,
    "percentUsed": $(percent "$disk_used_bytes" "$disk_total_bytes")
  },
  "memory": {
    "totalBytes": $mem_total_bytes,
    "usedBytes": $mem_used_bytes,
    "availableBytes": $mem_available_bytes,
    "percentUsed": $(percent "$mem_used_bytes" "$mem_total_bytes")
  },
  "swap": {
    "totalBytes": $swap_total_bytes,
    "usedBytes": $swap_used_bytes,
    "percentUsed": $(percent "$swap_used_bytes" "$swap_total_bytes")
  },
  "backupBytesOnDisk": $backup_bytes
}
JSON

mv "$tmp_file" "$OUTPUT_FILE"
