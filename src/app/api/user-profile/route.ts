import { prisma } from '@/src/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

// Função para extrair token de diferentes fontes
function extractToken(request: NextRequest): string | null {
  // 1. Tentar pegar dos cookies (priority)
  const cookieToken = request.cookies.get('auth_token')?.value;
  if (cookieToken) {
    console.log('Token encontrado nos cookies');
    return cookieToken;
  }

  // 2. Tentar pegar do header Authorization
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const headerToken = authHeader.split(' ')[1];
    console.log('Token encontrado no header');
    return headerToken;
  }

  console.log('Nenhum token encontrado');
  return null;
}

export async function GET(request: NextRequest) {
  try {
    console.log('=== USER PROFILE API CALLED ===');
    
    // =========================
    // 1. pegar token (cookies OU header)
    // =========================
    const token = extractToken(request);

    if (!token) {
      console.log('❌ No token found');
      return NextResponse.json(
        { error: 'Não autenticado. Faça login novamente.' },
        { status: 401 }
      );
    }

    console.log('✅ Token found, length:', token.length);

    // =========================
    // 2. validar token
    // =========================
    const decoded = verifyToken(token);

    if (!decoded) {
      console.log('❌ Invalid token');
      return NextResponse.json(
        { error: 'Token inválido ou expirado. Faça login novamente.' },
        { status: 401 }
      );
    }

    console.log('✅ Token decoded, userId:', decoded.userId);

    // =========================
    // 3. buscar usuário
    // =========================
    try {
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
          { error: 'Usuário não encontrado' },
          { status: 404 }
        );
      }

      console.log('✅ User found:', user.name);

      // =========================
      // 4. normalizar skills
      // =========================
      let skills: string[] = [];

      if (Array.isArray(user.skills)) {
        skills = user.skills;
      } else if (typeof user.skills === 'string') {
        skills = (user.skills as string)
          .split(',')
          .map((s: string) => s.trim());
      } else if (user.skills) {
        skills = [String(user.skills)];
      }

      // =========================
      // 5. retorno
      // =========================
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          skills,
          location: user.location || 'Não informada',
          availability: user.availability || 'Não informada',
          description: user.description || 'Não informada',
          createdAt: user.createdAt
        }
      });

    } catch (prismaError: any) {
      console.error('❌ Prisma error:', prismaError);
      return NextResponse.json(
        { error: 'Erro ao acessar o banco de dados', details: prismaError.message },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ USER PROFILE ERROR:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor', details: error.message },
      { status: 500 }
    );
  }
}