"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import styles from "./restaurant-login.module.css";
import { useId, useState } from "react";

export function LoginForm({ destination, restaurantStyle = false }: { destination?: string; restaurantStyle?: boolean }) {
  const passwordId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const callbackUrl = destination ?? searchParams.get("callbackUrl") ?? "/post-login";

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Email hoặc mật khẩu không đúng.");
      return;
    }

    router.push(result?.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <form className={restaurantStyle ? styles.form : "space-y-4"} onSubmit={onSubmit}>
      <label className={restaurantStyle ? styles.label : "block text-sm font-medium"}>
        Email
        <input
          className={restaurantStyle ? styles.input : "mt-1 h-11 w-full rounded-md border px-3 outline-none focus:border-teal-600"}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <div>
        <label className={restaurantStyle ? styles.label : "block text-sm font-medium"} htmlFor={passwordId}>Mật khẩu</label>
        <div className={restaurantStyle ? styles.passwordField : undefined}>
          <input id={passwordId} className={restaurantStyle ? styles.passwordInput : "mt-1 h-11 w-full rounded-md border px-3 outline-none focus:border-teal-600"} name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
          {restaurantStyle && <button type="button" className={styles.passwordToggle} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button>}
        </div>
      </div>
      {error ? <p role="alert" className={restaurantStyle ? styles.error : "text-sm text-red-600"}>{error}</p> : null}
      <button
        className={restaurantStyle ? styles.submit : "h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"}
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
    </form>
  );
}
