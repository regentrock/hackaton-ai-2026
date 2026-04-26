import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';
import { prisma } from '@/src/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    console.log('📌 POST /api/user/saved - Salvando oportunidade');
    
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

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
        { error: 'Campos obrigatórios faltando' },
        { status: 400 }
      );
    }

    // Usar $executeRaw para executar SQL diretamente (mais confiável)
    try {
      await prisma.$executeRaw`
        INSERT INTO "SavedOpportunity" (
          "id", "opportunityId", "title", "organization", "location", 
          "description", "skills", "theme", "matchScore", "projectLink", 
          "notes", "volunteerId", "savedAt"
        ) VALUES (
          gen_random_uuid(), ${opportunityId}, ${title}, ${organization}, ${location || ''},
          ${description || ''}, ${skills || []}::text[], ${theme || null}, ${matchScore || null}, ${projectLink || null},
          ${notes || null}, ${decoded.userId}, NOW()
        )
        ON CONFLICT ("volunteerId", "opportunityId") DO NOTHING
      `;
    } catch (sqlError: any) {
      // Se a tabela não existir, vamos criá-la
      if (sqlError.message?.includes('relation') || sqlError.message?.includes('does not exist')) {
        console.log('Tabela não existe, criando...');
        
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS "SavedOpportunity" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "opportunityId" TEXT NOT NULL,
            "title" TEXT NOT NULL,
            "organization" TEXT NOT NULL,
            "location" TEXT NOT NULL,
            "description" TEXT NOT NULL,
            "skills" TEXT[] DEFAULT '{}',
            "theme" TEXT,
            "matchScore" INTEGER,
            "projectLink" TEXT,
            "savedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "notes" TEXT,
            "volunteerId" TEXT NOT NULL,
            CONSTRAINT "SavedOpportunity_volunteerId_opportunityId_key" UNIQUE ("volunteerId", "opportunityId")
          )
        `;
        
        // Tentar inserir novamente
        await prisma.$executeRaw`
          INSERT INTO "SavedOpportunity" (
            "id", "opportunityId", "title", "organization", "location", 
            "description", "skills", "theme", "matchScore", "projectLink", 
            "notes", "volunteerId", "savedAt"
          ) VALUES (
            gen_random_uuid(), ${opportunityId}, ${title}, ${organization}, ${location || ''},
            ${description || ''}, ${skills || []}::text[], ${theme || null}, ${matchScore || null}, ${projectLink || null},
            ${notes || null}, ${decoded.userId}, NOW()
          )
          ON CONFLICT ("volunteerId", "opportunityId") DO NOTHING
        `;
      } else {
        throw sqlError;
      }
    }

    console.log('✅ Oportunidade salva com sucesso');
    
    return NextResponse.json({
      success: true,
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
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const opportunityId = searchParams.get('opportunityId');

    if (!opportunityId) {
      return NextResponse.json(
        { error: 'opportunityId é obrigatório' },
        { status: 400 }
      );
    }

    await prisma.$executeRaw`
      DELETE FROM "SavedOpportunity" 
      WHERE "volunteerId" = ${decoded.userId} AND "opportunityId" = ${opportunityId}
    `;

    return NextResponse.json({
      success: true,
      message: 'Oportunidade removida dos salvos'
    });

  } catch (error: any) {
    console.error('❌ Erro ao remover:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const saved = await prisma.$queryRaw`
      SELECT * FROM "SavedOpportunity" 
      WHERE "volunteerId" = ${decoded.userId}
      ORDER BY "savedAt" DESC
    `;

    return NextResponse.json({
      success: true,
      saved: saved,
      total: (saved as any[]).length
    });

  } catch (error: any) {
    console.error('❌ Erro ao listar:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}