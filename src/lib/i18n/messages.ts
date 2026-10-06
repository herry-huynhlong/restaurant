export const messages = {
  vi: {
    common: {
      signIn: "Đăng nhập",
      signOut: "Đăng xuất"
    }
  },
  en: {
    common: {
      signIn: "Sign in",
      signOut: "Sign out"
    }
  }
} as const;

export type Locale = keyof typeof messages;
