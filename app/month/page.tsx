import { HorizonScreen } from "@/components/horizon-screen";

export const dynamic = "force-dynamic";

export default async function MonthPage({ searchParams }: PageProps<"/month">) {
  const { date } = await searchParams;
  return <HorizonScreen level="month" date={typeof date === "string" ? date : undefined} />;
}
