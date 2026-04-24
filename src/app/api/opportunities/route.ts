// src/app/api/opportunities/route.ts

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city") || "São Paulo";

    // Exemplo de endpoint (ajuste conforme necessário)
    const res = await fetch(
      `https://mapaosc.ipea.gov.br/api/osc?municipio=${city}`
    );

    const data = await res.json();

    // Adaptar resposta
    const opportunities = data.items?.slice(0, 20).map((item: any) => ({
      title: item.nome || "ONG",
      location: item.municipio,
      skills_required: ["general help"], // API não fornece → IA resolve
    }));

    return Response.json({ opportunities });

  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Failed to fetch opportunities" },
      { status: 500 }
    );
  }
}