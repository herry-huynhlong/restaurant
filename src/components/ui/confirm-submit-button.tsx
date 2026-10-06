"use client";

export function ConfirmSubmitButton({
  children,
  message,
  description,
  className
}: {
  children: React.ReactNode;
  message: string;
  description?: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      type="submit"
      onClick={(event) => {
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
