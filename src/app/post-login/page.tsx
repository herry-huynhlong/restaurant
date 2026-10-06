import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/rbac/guards";
import { getPostLoginPath } from "@/server/services/auth-redirect-service";

export default async function PostLoginPage() {
  const user = await requireAuthenticatedUser();
  const path = await getPostLoginPath(user.id, user.platformRole);

  redirect(path);
}
