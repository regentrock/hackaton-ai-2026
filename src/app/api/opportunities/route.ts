// src/app/api/opportunities/route.ts

export async function GET() {
  try {
    const res = await fetch(
      "https://mapaosc.ipea.gov.br/api/osc?limit=20"
    );

    const data = await res.json();

    // ⚠️ Ajuste dependendo da resposta real da API
    const opportunities = data.data.map((osc: any) => ({
      title: osc.nome,
      location: osc.municipio?.nome || "Unknown",
      city: osc.municipio?.nome || "Unknown",
      skills_required: ["general help"], // API não tem isso → você pode enriquecer depois
    }));

    return Response.json({ opportunities });

  } catch (error) {
    console.error(error);

    return Response.json(
      { opportunities: [] },
      { status: 500 }
    );
  }
}