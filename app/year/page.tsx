import { HorizonScreen } from "@/components/horizon-screen";

export const dynamic = "force-dynamic";

export default async function YearPage({ searchParams }: PageProps<"/year">) {
  const { date } = await searchParams;
  return <HorizonScreen level="year" date={typeof date === "string" ? date : undefined} />;
}
