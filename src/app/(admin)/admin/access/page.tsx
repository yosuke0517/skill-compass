import { AccessControlView } from "@/components/admin/access-control-view";
import { getAccessControlData } from "@/lib/admin/access-control";

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const data = await getAccessControlData(params.user);
  return <AccessControlView data={data} feedback={{ error: params.error, saved: params.saved }} />;
}
