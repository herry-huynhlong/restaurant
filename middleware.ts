import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login"
  }
});

export const config = {
  matcher: ["/platform/:path*", "/((?!api|_next|.*\\..*|login$)[^/]+)/(admin|staff|kitchen|cashier)/:path*"]
};
