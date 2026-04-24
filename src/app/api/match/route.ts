import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';
import { MatchService } from '@/src/lib/ai/matchService';

export async function GET(request: NextRequest) {
  try {
    console.log('=== MATCH API WITH WATSONX ===');
    
    // =========================
    // 1. Autenticação
    // =========================
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // =========================
    // 2. Buscar perfil do usuário
    // =========================
    const { prisma } = await import('@/src/lib/prisma');
    
    const user = await prisma.volunteer.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        location: true,
        skills: true,
        description: true,
        availability: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    console.log('User:', user.name);
    console.log('User Skills:', user.skills);

    // =========================
    // 3. Buscar projetos reais do GlobalGiving
    // =========================
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                   (request.headers.get('host') ? `https://${request.headers.get('host')}` : 'http://localhost:3000');
    
    const opportunitiesRes = await fetch(`${baseUrl}/api/opportunities`, {
      headers: {
        'Cookie': `auth_token=${token}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!opportunitiesRes.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch opportunities' },
        { status: 500 }
      );
    }

    const data = await opportunitiesRes.json();
    
    if (!data.success || !data.opportunities || data.opportunities.length === 0) {
      return NextResponse.json({
        matches: [],
        message: 'Nenhuma oportunidade encontrada',
        total: 0
      });
    }

    console.log(`Found ${data.opportunities.length} opportunities to analyze`);

    // =========================
    // 4. Usar WatsonX para match inteligente
    // =========================
    const matchService = new MatchService();
    
    const userProfile = {
      name: user.name,
      skills: user.skills || [],
      location: user.location || '',
      description: user.description || '',
      availability: user.availability || ''
    };
    
    const projects = data.opportunities.map((opp: any) => ({
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      description: opp.description,
      theme: opp.theme || '',
      location: opp.location,
      skills: opp.skills || []
    }));
    
    const matches = await matchService.findBestMatches(userProfile, projects, 15);
    
    // =========================
    // 5. Enriquecer matches com dados dos projetos
    // =========================
    const enrichedMatches = matches.map(match => {
      const project = data.opportunities.find((p: any) => p.id === match.projectId);
      return {
        ...match,
        ...project,
        id: match.projectId
      };
    });

    return NextResponse.json({
      success: true,
      matches: enrichedMatches,
      total: enrichedMatches.length,
      usingAI: true,
      userSkills: user.skills || []
    });

  } catch (error: any) {
    console.error('Match API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}