import { prisma } from '@/src/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function GET(request: NextRequest) {
  try {
    // =========================
    // 1. pegar token dos cookies
    // =========================
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Não autenticado. Faça login novamente.' },
        { status: 401 }
      );
    }

    // =========================
    // 2. validar token
    // =========================
    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        { error: 'Token inválido ou expirado. Faça login novamente.' },
        { status: 401 }
      );
    }

    // =========================
    // 3. buscar usuário
    // =========================
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
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

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
    // 5. retorno padrão
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

  } catch (error) {
    console.error('Erro no perfil do usuário:', error);

    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}