import type { ReactNode } from "react";
import { Utensils } from "lucide-react";
import { formatVnd } from "@/lib/money";
import { servedUploadUrl } from "@/lib/upload-url";

export function FoodItemDisplayCard({
  imageUrl,
  name,
  quantity,
  unitPrice,
  subtotal,
  note,
  meta,
  statusLabel,
  actions
}: {
  imageUrl?: string | null;
  name: string;
  quantity: number;
  unitPrice?: number;
  subtotal?: number;
  note?: string | null;
  meta?: ReactNode;
  statusLabel?: string | null;
  actions?: ReactNode;
}) {
  const resolvedImage = servedUploadUrl(imageUrl ?? null) ?? imageUrl;

  return (
    <article className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 sm:h-24 sm:w-24">
          {resolvedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={name} className="h-full w-full object-cover" src={resolvedImage} />
          ) : (
            <Utensils className="h-8 w-8 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {meta ? <div className="mb-1 text-xs font-semibold uppercase text-teal-700">{meta}</div> : null}
              <h4 className="break-words text-base font-semibold leading-snug text-slate-950 sm:text-lg">{name}</h4>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-base font-bold text-teal-700">x{quantity}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            {unitPrice !== undefined ? <span>Đơn giá: {formatVnd(unitPrice)}</span> : null}
            {subtotal !== undefined ? <span className="font-semibold text-slate-900">Thành tiền: {formatVnd(subtotal)}</span> : null}
            {statusLabel ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{statusLabel}</span> : null}
          </div>
          {note ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-800">Ghi chú: {note}</p> : null}
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </article>
  );
}
