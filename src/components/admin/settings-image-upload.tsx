"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

export function SettingsImageUpload({
  name,
  label,
  currentUrl,
  previewClassName = "h-24 w-24"
}: {
  name: string;
  label: string;
  currentUrl?: string | null;
  previewClassName?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreviewUrl(currentUrl ?? null);
  }, [currentUrl]);

  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {previewUrl ? (
          <img className={`${previewClassName} rounded-md border object-contain`} src={previewUrl} alt={label} />
        ) : (
          <div className={`${previewClassName} flex items-center justify-center rounded-md border bg-slate-50 text-xs text-slate-500`}>
            Chưa có ảnh
          </div>
        )}
        <div className="min-w-0 flex-1">
          <input
            className="block w-full text-sm"
            name={name}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              setError(null);
              if (!file) return;

              if (!allowedImageTypes.includes(file.type)) {
                input.value = "";
                setError("Chỉ hỗ trợ JPG, PNG hoặc WEBP.");
                return;
              }

              if (file.size > MAX_IMAGE_SIZE) {
                input.value = "";
                setError("Ảnh tối đa 5MB.");
                return;
              }

              setPreviewUrl(URL.createObjectURL(file));
            }}
          />
          <p className="mt-1 text-xs text-slate-500">JPG, PNG hoặc WEBP. Tối đa 5MB.</p>
          {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
        </div>
      </div>
    </label>
  );
}
