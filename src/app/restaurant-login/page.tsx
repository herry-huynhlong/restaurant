import Image from "next/image";
import styles from "@/components/app-shell/restaurant-login.module.css";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/app-shell/login-form";
import { authOptions } from "@/lib/auth/options";
import { getRestaurantPostLoginPath } from "@/server/services/auth-redirect-service";

export const dynamic = "force-dynamic";

export default async function RestaurantAccountLoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const path = await getRestaurantPostLoginPath(session.user.id);
    if(path !== "/restaurant-login") redirect(path);
  }
  return <main className={styles.page}>
    <section className={styles.card} aria-label="Đăng nhập QuánPilot">
      <aside className={styles.brand} aria-label="Về QuánPilot">
        <div className={styles.identity}>
          <Image className={styles.logo} src="/icons/icon-512.png" alt="Logo QuánPilot" width={96} height={96} priority />
          <div><p className={styles.brandName}>QuánPilot</p><p className={styles.tagline}>Nền tảng quản lý nhà hàng</p></div>
        </div>
        <div className={styles.introduction}>
          <h2>Vận hành thuận tiện hơn mỗi ngày.</h2>
          <p>Quản lý bàn, đơn hàng, nhân viên và hoạt động kinh doanh trên một hệ thống.</p>
        </div>
        <p className={styles.signature}>Một sản phẩm của <strong>QAVIO</strong></p>
      </aside>
      <div className={styles.formPanel}>
        <div className={styles.formContent}>
          <h1>Chào mừng trở lại</h1>
          <p className={styles.formIntro}>Đăng nhập tài khoản QuánPilot</p>
          <LoginForm destination="/restaurant-entry" restaurantStyle />
          <p className={styles.trial}>Chưa có tài khoản? <a href="https://qavio.site/trial">Đăng ký dùng thử <span aria-hidden="true">→</span></a></p>
        </div>
      </div>
    </section>
  </main>;
}
