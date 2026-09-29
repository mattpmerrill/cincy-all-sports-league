import { requireAdminOrNotFound } from "@/features/auth/guards";
import { PageHeader, PageMain } from "@/ui/page";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Layouts don't re-render between sibling pages, so each page checks again too.
  await requireAdminOrNotFound("/admin");
  return (
    <PageMain>
      <PageHeader title="Admin" description="Run the league." />
      <AdminNav />
      {children}
    </PageMain>
  );
}
