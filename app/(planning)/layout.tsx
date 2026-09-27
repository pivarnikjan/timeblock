import { Suspense } from "react";
import { PlanningTabs } from "@/components/planning-tabs";

/**
 * Week, Month and Year share the Planning tab: the rituals that decide what the
 * work is, as opposed to the Calendar, where it is put into time. The URLs stay
 * /week, /month and /year.
 */
export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {/* The tabs read ?date= to keep it; the page renders regardless. */}
      <Suspense fallback={null}>
        <PlanningTabs />
      </Suspense>
      {children}
    </div>
  );
}
