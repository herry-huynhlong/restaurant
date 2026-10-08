import { PlatformShell } from "@/components/app-shell/platform-shell";
import { requirePlatformAdmin } from "@/lib/rbac/guards";

export default async function PlatformPlansPage() {
  await requirePlatformAdmin();
  return <PlatformShell title="Gói dịch vụ"><Placeholder text="Luồng thương mại hiện chỉ dùng BASIC và PRO. BASIC tập trung QR/Menu/Phục vụ; PRO mở thêm Bếp/Thu ngân/Thanh toán/Báo cáo nâng cao." /></PlatformShell>;
}

function Placeholder({ text }: { text: string }) {
  return <section className="rounded-lg border bg-white p-5 text-sm text-slate-600 shadow-sm">{text}</section>;
}
