// /api/user-profile

import prisma from "@/src/lib/prisma";

export async function GET() {
  const user = await prisma.volunteer.findFirst(); // TEMPORÁRIO

  return Response.json({
    name: user?.name || "Test User",
    skills: user?.skills || ["cooking"],
    location: user?.location || "São Paulo"
  });
}