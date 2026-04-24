import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

// URL base - usar variável de ambiente ou fallback
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 
                 process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                 'http://localhost:3000';

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
    // 1. Validar token e buscar usuário
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

    // Buscar usuário - chamada interna (mesmo servidor)
    const userProfileUrl = `${BASE_URL}/api/user-profile`;
    console.log('Fetching user from:', userProfileUrl);
    
    const userRes = await fetch(userProfileUrl, {
      headers: {
        'Cookie': `auth_token=${token}`,
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store'
    });

    const userData = await userRes.json();
    console.log('User profile response status:', userRes.status);
    console.log('User profile response:', JSON.stringify(userData, null, 2));

    if (!userRes.ok || userData.error) {
      console.error('Erro ao buscar usuário:', userData);
      return NextResponse.json(
        { error: "Failed to fetch user", details: userData },
        { status: 500 }
      );
    }

    const user = userData.user;

    if (!user) {
      console.log('❌ User not found in response');
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    console.log('✅ User found:', user.name, 'Location:', user.location);

    if (!user.location || user.location === 'Não informada') {
      console.log('❌ User location not set');
      return NextResponse.json(
        { error: "Localização do usuário não informada. Atualize seu perfil." },
        { status: 400 }
      );
    }

    // =========================
    // 2. Buscar oportunidades
    // =========================
    const opportunitiesUrl = `${BASE_URL}/api/opportunities?city=${encodeURIComponent(user.location)}`;
    console.log('Fetching opportunities from:', opportunitiesUrl);
    
    const oppRes = await fetch(opportunitiesUrl, { cache: 'no-store' });
    const oppData = await oppRes.json();

    if (!oppRes.ok || !oppData || !oppData.opportunities) {
      console.error('Erro ao buscar oportunidades:', oppData);
      return NextResponse.json(
        { error: "Failed to fetch opportunities" },
        { status: 500 }
      );
    }

    console.log(`✅ Found ${oppData.opportunities.length} opportunities`);

    // =========================
    // 3. Gerar IAM token (se necessário para WatsonX)
    // =========================
    // Se você está usando WatsonX, mantenha o código
    // Se não, pule esta parte

    // =========================
    // 4. Processar match (exemplo sem IA por enquanto)
    // =========================
    // Por enquanto, retornar oportunidades sem IA para testar
    const matchedOpportunities = oppData.opportunities.slice(0, 5).map((opp: any) => ({
      title: opp.title,
      organization: opp.organization || 'Organização',
      location: opp.location,
      reason: `Match baseado na sua localização: ${user.location}`
    }));

    return NextResponse.json(matchedOpportunities);

  } catch (error: any) {
    console.error("❌ MATCH ERROR:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}