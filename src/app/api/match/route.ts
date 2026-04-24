import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';
import { MatchService } from '@/src/lib/ai/matchService';

export async function GET(request: NextRequest) {
  try {
    console.log('=== MATCH API ===');
    
    // 1. Autenticação
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

    // 2. Buscar perfil do usuário
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

    console.log('User skills:', user.skills);

    // 3. Buscar oportunidades
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
    
    if (!data.success || !data.opportunities) {
      return NextResponse.json({
        matches: [],
        message: 'No opportunities found'
      });
    }

    console.log(`Found ${data.opportunities.length} opportunities`);

    // 4. Filtrar oportunidades baseado nas skills do usuário
    const userSkills = (user.skills || []).map((s: string) => s.toLowerCase());
    
    let relevantOpportunities = data.opportunities;
    
    if (userSkills.length > 0) {
      relevantOpportunities = data.opportunities.filter((opp: any) => {
        const oppSkills = (opp.skills || []).map((s: string) => s.toLowerCase());
        const oppText = `${opp.title} ${opp.description} ${opp.theme || ''}`.toLowerCase();
        
        // Verificar se alguma skill do usuário aparece nas skills da oportunidade OU na descrição
        return userSkills.some((skill: string) => 
          oppSkills.some((oppSkill: string) => oppSkill.includes(skill) || skill.includes(oppSkill)) ||
          oppText.includes(skill)
        );
      });
      
      console.log(`After skill filter: ${relevantOpportunities.length} opportunities`);
      
      if (relevantOpportunities.length === 0 && data.opportunities.length > 0) {
        relevantOpportunities = data.opportunities.slice(0, 10);
        console.log('No skill matches found, using first 10 opportunities');
      }
    }

    // 5. Usar MatchService para análise inteligente
    const matchService = new MatchService();
    
    const userProfile = {
      name: user.name,
      skills: user.skills || [],
      location: user.location || '',
      description: user.description || '',
      availability: user.availability || ''
    };
    
    const projects = relevantOpportunities.map((opp: any) => ({
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      description: opp.description,
      theme: opp.theme || '',
      location: opp.location,
      skills: opp.skills || []
    }));
    
    const matches = await matchService.findBestMatches(userProfile, projects, 15);
    
    // 6. Enriquecer matches com dados completos
    const enrichedMatches = matches.map((match: any) => {
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