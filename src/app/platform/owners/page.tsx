import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PlatformOwnersManager } from "@/components/platform/owners-manager";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { getPlatformOwners } from "@/server/services/platform-service";

export default async function PlatformOwnersPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string };
}) {
  await requirePlatformAdmin();
  const owners = await getPlatformOwners();
  return (
    <PlatformShell title="Tài khoản chủ quán">
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />
      <PlatformOwnersManager
        returnTo={platformRoutes.owners}
        owners={owners.map((owner) => ({
          membershipId: owner.id,
          restaurantId: owner.restaurantId,
          restaurantName: owner.restaurant.name,
          restaurantStatus: owner.restaurant.status,
          ownerUserId: owner.userId,
          name: owner.user.name,
          username: owner.username && owner.username !== "owner" ? owner.username : owner.user.email,
          email: owner.user.email,
          isActive: owner.isActive && owner.user.isActive
        }))}
      />
    </PlatformShell>
  );
}
