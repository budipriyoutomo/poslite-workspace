import { TenantDetailScreen } from "@/features/tenants";

export default async function TenantPage({ params }: PageProps<"/tenants/[id]">) {
  const { id } = await params;
  return <TenantDetailScreen tenantId={id} />;
}
