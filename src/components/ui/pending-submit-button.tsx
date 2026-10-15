"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  pendingLabel = "Đang xử lý...",
  className = "",
  disabled = false,
  name,
  value
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
      disabled={disabled || pending}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormCancelButton({
  children = "Hủy",
  className = "",
  onClick
}: {
  children?: React.ReactNode;
  className?: string;
  onClick: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
      disabled={pending}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
