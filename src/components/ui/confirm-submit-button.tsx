"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  children,
  message,
  description,
  className,
  disabled = false
}: {
  children: React.ReactNode;
  message: string;
  description?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
      disabled={isDisabled}
      type="submit"
      onClick={(event) => {
        if (isDisabled) return;
        const text = description ? `${message}\n\n${description}` : message;
        if (!window.confirm(text)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
