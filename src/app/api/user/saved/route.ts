import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function POST(request: NextRequest) {
  try {
    console.log('📌 POST /api/user/saved - Salvando oportunidade');
    
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

    // 2. Buscar dados da requisição
    const body = await request.json();
    const {
      opportunityId,
      title,
      organization,
      location,
      description,
      skills,
      theme,
      matchScore,
      projectLink,
      notes
    } = body;

    if (!opportunityId || !title || !organization) {
      return NextResponse.json(
        { error: 'Campos obrigatórios faltando: opportunityId, title, organization' },
        { status: 400 }
      );
    }

    // 3. Salvar no banco
    const { prisma } = await import('@/src/lib/prisma');
    
    const saved = await prisma.savedOpportunity.upsert({
      where: {
        volunteerId_opportunityId: {
          volunteerId: decoded.userId,
          opportunityId: opportunityId
        }
      },
      update: {
        notes: notes || undefined,
        matchScore: matchScore || undefined
      },
      create: {
        volunteerId: decoded.userId,
        opportunityId,
        title,
        organization,
        location: location || '',
        description: description || '',
        skills: skills || [],
        theme: theme || null,
        matchScore: matchScore || null,
        projectLink: projectLink || null,
        notes: notes || null
      }
    });

    console.log('✅ Oportunidade salva com sucesso:', saved.id);
    
    return NextResponse.json({
      success: true,
      saved: saved,
      message: 'Oportunidade salva com sucesso!'
    });

  } catch (error: any) {
    console.error('❌ Erro ao salvar oportunidade:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    console.log('🗑️ DELETE /api/user/saved - Removendo oportunidade salva');
    
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

    // 2. Buscar opportunityId da query
    const { searchParams } = new URL(request.url);
    const opportunityId = searchParams.get('opportunityId');

    if (!opportunityId) {
      return NextResponse.json(
        { error: 'opportunityId é obrigatório' },
        { status: 400 }
      );
    }

    // 3. Remover do banco
    const { prisma } = await import('@/src/lib/prisma');
    
    await prisma.savedOpportunity.deleteMany({
      where: {
        volunteerId: decoded.userId,
        opportunityId: opportunityId
      }
    });

    console.log('✅ Oportunidade removida com sucesso');
    
    return NextResponse.json({
      success: true,
      message: 'Oportunidade removida dos salvos'
    });

  } catch (error: any) {
    console.error('❌ Erro ao remover oportunidade salva:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/user/saved - Listando oportunidades salvas');
    
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

    // 2. Buscar oportunidades salvas
    const { prisma } = await import('@/src/lib/prisma');
    
    const saved = await prisma.savedOpportunity.findMany({
      where: {
        volunteerId: decoded.userId
      },
      orderBy: {
        savedAt: 'desc'
      }
    });

    console.log(`✅ ${saved.length} oportunidades salvas encontradas`);
    
    return NextResponse.json({
      success: true,
      saved: saved,
      total: saved.length
    });

  } catch (error: any) {
    console.error('❌ Erro ao listar oportunidades salvas:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}