import { redirect } from "next/navigation";

/** The Planning tab opens on the week — the level planned most often. */
export default function PlanningPage() {
  redirect("/week");
}
