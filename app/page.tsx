import { Dashboard } from "@/components/dashboard";
import { getDashboardSnapshot } from "@/lib/data";

export default async function HomePage() {
  const snapshot = await getDashboardSnapshot();
  return <Dashboard initialData={snapshot} />;
}
