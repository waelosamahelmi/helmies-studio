import AdminShell from "@/components/admin/AdminShell";

/* The console is behind an account and behind the admin role; it must never
   be indexed. Keeping the original metadata verbatim. */
export const metadata = { title: "Admin Panel", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminShell />;
}
