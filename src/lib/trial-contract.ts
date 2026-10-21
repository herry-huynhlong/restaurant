import { z } from "zod";
export const TRIAL_MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const slugifyTrial = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
export const trialEmail = z
  .string()
  .trim()
  .email("Email chưa hợp lệ.")
  .max(254, "Email quá dài.")
  .transform((s) => s.toLowerCase());
export const trialLogo = z
  .object({
    type: z.enum(["image/png", "image/jpeg", "image/webp"]),
    base64: z
      .string()
      .max(Math.ceil(TRIAL_MAX_LOGO_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export const trialInput = z
  .object({
    restaurantName: z
      .string()
      .trim()
      .min(2, "Nhập tên nhà hàng từ 2 ký tự.")
      .max(160, "Tên nhà hàng tối đa 160 ký tự."),
    slug: z
      .string()
      .min(2, "Mã đường dẫn từ 2 ký tự.")
      .max(80, "Mã đường dẫn tối đa 80 ký tự.")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Chỉ dùng chữ thường, số và dấu gạch ngang.",
      )
      .refine(
        (s) =>
          ![
            "api",
            "admin",
            "platform",
            "login",
            "logout",
            "trial",
            "uploads",
            "media",
            "post-login",
            "restaurant-login",
            "restaurant-entry",
            "select-restaurant",
            "unauthorized",
            "_next",
            "favicon",
            "robots",
            "sitemap",
          ].includes(s),
        "Mã đường dẫn này được dành riêng.",
      ),
    ownerName: z
      .string()
      .trim()
      .min(2, "Nhập họ tên chủ quán từ 2 ký tự.")
      .max(120, "Họ tên tối đa 120 ký tự."),
    email: trialEmail,
    password: z
      .string()
      .min(8, "Mật khẩu cần ít nhất 8 ký tự.")
      .max(72, "Mật khẩu tối đa 72 byte.")
      .refine(
        (s) => new TextEncoder().encode(s).length <= 72,
        "Mật khẩu tối đa 72 byte.",
      ),
    timezone: z.literal("Asia/Ho_Chi_Minh"),
    language: z.literal("vi"),
    currency: z.literal("VND"),
    verificationToken: z.string().min(32).max(200),
    logo: trialLogo.optional(),
  })
  .strict();
export type TrialInput = z.infer<typeof trialInput>;
export const trialResultSchema = z
  .object({
    registrationId: z.string().uuid(),
    restaurantId: z.string().min(1),
    restaurantName: z.string().max(160),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ownerName: z.string().max(120),
    email: trialEmail,
    plan: z.literal("TRAIN"),
    entitlement: z.literal("BASIC"),
    startsAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    loginUrl: z.string().url(),
  })
  .strict();
export type TrialResult = z.infer<typeof trialResultSchema>;
