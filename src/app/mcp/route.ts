import { handleProductionMcpRequest } from "@/lib/mcp/http-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleProductionMcpRequest;

export async function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}
