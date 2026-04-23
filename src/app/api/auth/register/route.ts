import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, generateToken } from '@/lib/auth/authUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, location, availability, description, skills } = body;

    // Validações
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, senha e nome são obrigatórios' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Senha deve ter pelo menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Verificar se email já existe
    const existingUser = await prisma.volunteer.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email já cadastrado' },
        { status: 400 }
      );
    }

    // Hash da senha
    const passwordHash = await hashPassword(password);

    // Criar usuário
    const volunteer = await prisma.volunteer.create({
      data: {
        email,
        passwordHash,
        name,
        location: location || '',
        availability: availability || '',
        description: description || '',
        skills: skills || []
      },
      select: {
        id: true,
        email: true,
        name: true,
        location: true,
        availability: true,
        description: true,
        skills: true,
        createdAt: true
      }
    });

    // Gerar token
    const token = generateToken(volunteer.id, volunteer.email);

    // Criar resposta
    const response = NextResponse.json(
      { 
        success: true, 
        user: volunteer,
        message: 'Cadastro realizado com sucesso'
      },
      { status: 201 }
    );

    // Set cookie com token
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 dias
    });

    return response;

  } catch (error) {
    console.error('Erro no registro:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}