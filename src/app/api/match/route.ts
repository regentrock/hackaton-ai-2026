import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function GET(request: NextRequest) {
  try {
    console.log('=== MATCH API CALLED ===');
    
    // =========================
    // 0. pegar token (cookies OU header)
    // =========================
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      console.log('❌ No token found');
      return NextResponse.json(
        { error: 'Unauthorized - Token não fornecido' },
        { status: 401 }
      );
    }

    console.log('✅ Token found');

    // =========================
    // 1. Validar token
    // =========================
    const decoded = verifyToken(token);
    
    if (!decoded) {
      console.log('❌ Invalid token');
      return NextResponse.json(
        { error: 'Unauthorized - Token inválido' },
        { status: 401 }
      );
    }

    console.log('✅ Token decoded, userId:', decoded.userId);

    // =========================
    // 2. Buscar usuário DIRETAMENTE (sem chamar outra API)
    // =========================
    const { prisma } = await import('@/src/lib/prisma');
    
    const user = await prisma.volunteer.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        location: true,
        availability: true,
        description: true,
        skills: true,
        createdAt: true
      }
    });

    if (!user) {
      console.log('❌ User not found:', decoded.userId);
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    console.log('✅ User found:', user.name, 'Location:', user.location);

    if (!user.location || user.location === 'Não informada' || user.location === '') {
      console.log('❌ User location not set');
      return NextResponse.json(
        { error: "Localização do usuário não informada. Atualize seu perfil." },
        { status: 400 }
      );
    }

    // =========================
    // 3. Buscar oportunidades (via fetch interno)
    // =========================
    // Construir URL absoluta para a API de oportunidades
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    const opportunitiesUrl = `${baseUrl}/api/opportunities?city=${encodeURIComponent(user.location)}`;
    console.log('Fetching opportunities from:', opportunitiesUrl);
    
    const oppRes = await fetch(opportunitiesUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });

    if (!oppRes.ok) {
      console.error('Erro ao buscar oportunidades, status:', oppRes.status);
      const errorText = await oppRes.text();
      console.error('Error response:', errorText);
      return NextResponse.json(
        { error: "Failed to fetch opportunities" },
        { status: 500 }
      );
    }

    const oppData = await oppRes.json();

    if (!oppData || !oppData.opportunities) {
      console.error('Invalid opportunities data:', oppData);
      return NextResponse.json(
        { error: "Invalid opportunities data" },
        { status: 500 }
      );
    }

    console.log(`✅ Found ${oppData.opportunities.length} opportunities`);

    // =========================
    // 4. Processar match (filtro simples)
    // =========================
    // Filtrar oportunidades por habilidades do usuário
    const userSkills = user.skills.map(s => s.toLowerCase());
    
    const matchedOpportunities = oppData.opportunities
      .filter((opp: any) => {
        // Verificar se alguma habilidade do usuário corresponde à oportunidade
        const oppSkills = opp.skills?.map((s: string) => s.toLowerCase()) || [];
        return userSkills.some(skill => oppSkills.includes(skill));
      })
      .slice(0, 5)
      .map((opp: any) => ({
        title: opp.title,
        organization: opp.organization || 'Organização',
        location: opp.location,
        reason: `Match baseado nas suas habilidades: ${user.skills.join(', ')}`
      }));

    // Se não houver matches por habilidades, retornar baseado na localização
    let results = matchedOpportunities;
    if (results.length === 0) {
      results = oppData.opportunities.slice(0, 5).map((opp: any) => ({
        title: opp.title,
        organization: opp.organization || 'Organização',
        location: opp.location,
        reason: `Match baseado na sua localização: ${user.location}`
      }));
    }

    return NextResponse.json(results);

  } catch (error: any) {
    console.error("❌ MATCH ERROR:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}