// src/app/api/opportunities/route.ts

export async function GET() {
  return Response.json({
    opportunities: [
      {
        title: "Community Kitchen",
        location: "São Paulo",
        city: "São Paulo",
        skills_required: ["cooking"]
      },
      {
        title: "Food Distribution NGO",
        location: "Campinas",
        city: "Campinas",
        skills_required: ["organization"]
      },
      {
        title: "Shelter Support",
        location: "São Paulo",
        city: "São Paulo",
        skills_required: ["general help"]
      }
    ]
  });
}