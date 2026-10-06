import { redirect } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";
import { restaurantRoutes } from "@/lib/routes";

export default async function RestaurantHomePage({ params }: { params: { rSlug: string } }) {
  await getRestaurantBySlug(params.rSlug);
  redirect(restaurantRoutes.welcome(params.rSlug));
}
