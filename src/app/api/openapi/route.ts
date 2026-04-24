// /api/openapi/route.ts

export async function GET() {
  return Response.json(require("../../../../openapi.json"));
}