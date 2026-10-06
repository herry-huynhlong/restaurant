import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login"
  }
});

export const config = {
  matcher: [
    "/platform/:path*",
    "/post-login",
    "/select-restaurant",
    "/((?!api|_next|.*\\..*|login$|unauthorized$)[^/]+)/(admin|staff|kitchen|cashier)/:path*"
  ]
};
