import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function PUT(request: NextRequest) {
  try {
    console.log('=== UPDATE PROFILE API ===');
    
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

    // 2. Buscar dados do body
    const body = await request.json();
    const { name, location, availability, description, skills } = body;

    // 3. Validar dados
    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Nome é obrigatório' },
        { status: 400 }
      );
    }

    // 4. Atualizar no banco
    const { prisma } = await import('@/src/lib/prisma');
    
    const updatedUser = await prisma.volunteer.update({
      where: { id: decoded.userId },
      data: {
        name: name.trim(),
        location: location?.trim() || '',
        availability: availability?.trim() || '',
        description: description?.trim() || '',
        skills: skills || []
      },
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

    console.log('User updated:', updatedUser.name);

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'Perfil atualizado com sucesso!'
    });

  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao atualizar perfil' },
      { status: 500 }
    );
  }
}