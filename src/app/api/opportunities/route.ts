// src/app/api/opportunities/route.ts

export async function GET() {
  return Response.json({
    opportunities: [
      {
        title: "Community Kitchen Volunteer",
        location: "São Paulo",
        skills_required: ["cooking", "kitchen"]
      },
      {
        title: "Food Distribution NGO",
        location: "Campinas",
        skills_required: ["logistics", "organization"]
      },
      {
        title: "Shelter Support",
        location: "São Paulo",
        skills_required: ["general help"]
      }
    ]
  });
}