import { HorizonScreen } from "@/components/horizon-screen";

export const dynamic = "force-dynamic";

export default async function WeekPage({ searchParams }: PageProps<"/week">) {
  const { date } = await searchParams;
  return <HorizonScreen level="week" date={typeof date === "string" ? date : undefined} />;
}
