"use client";

import { useEffect } from "react";

export function ActionFormEffects({ success }: { success?: string }) {
  useEffect(() => {
    if (!success) return;

    document.querySelectorAll<HTMLDetailsElement>("[data-action-panel]").forEach((panel) => {
      panel.open = false;
    });
    document.querySelectorAll<HTMLFormElement>("[data-reset-on-success]").forEach((form) => {
      form.reset();
    });
    document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((input) => {
      input.value = "";
    });
  }, [success]);

  return null;
}
