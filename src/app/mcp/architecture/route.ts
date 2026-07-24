import { handleProductionArchitectureMcpRequest } from "@/lib/mcp/architecture/http-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleProductionArchitectureMcpRequest;

export async function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}
