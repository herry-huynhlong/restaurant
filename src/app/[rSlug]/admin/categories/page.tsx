import { redirect } from "next/navigation";
import { restaurantRoutes } from "@/lib/routes";

export default function CategoriesPage({ params }: { params: { rSlug: string } }) {
  redirect(restaurantRoutes.adminMenu(params.rSlug));
}
