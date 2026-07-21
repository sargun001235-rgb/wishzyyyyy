import { getDashboardData } from "@/app/actions/admin";
import { AdminDashboardClient } from "@/components/admin/dashboard-client";

export const dynamic = "force-dynamic"; // always show fresh sync/order status

export default async function AdminDashboardPage() {
  const result = await getDashboardData();

  if (!result.success) {
    return (
      <main className="min-h-screen bg-ivory-bg p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          {result.error}
        </div>
      </main>
    );
  }

  return <AdminDashboardClient initialData={result.data} />;
}
