import { CloudMigrationView } from "@/components/docs/cloud-migration-view";
import { getCloudMigrationDocument } from "@/lib/docs/cloud-migration";

export default function CloudMigrationPage() {
  return <CloudMigrationView document={getCloudMigrationDocument()} />;
}
