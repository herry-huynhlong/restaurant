import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { getRestaurantPostLoginPath } from "@/server/services/auth-redirect-service";

export const dynamic = "force-dynamic";

export default async function RestaurantEntryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/restaurant-login");
  redirect(await getRestaurantPostLoginPath(session.user.id));
}
