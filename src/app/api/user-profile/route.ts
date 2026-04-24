// src/app/api/user-profile/route.ts

export async function GET() {
  return Response.json({
    name: "João",
    skills: ["cooking", "organization"],
    location: "Sumaré",
    city: "Sumaré"
  });
}