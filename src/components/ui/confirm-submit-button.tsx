"use client";

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
  return (
    <button
      className={className}
      disabled={disabled}
      type="submit"
      onClick={(event) => {
        if (disabled) return;
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
