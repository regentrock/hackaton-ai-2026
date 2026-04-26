import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function POST(request: NextRequest) {
  try {
    // Verificar o usuário atual
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

    // Gerar um token específico para o Orchestrate
    const orchestrateToken = jwt.sign(
      { 
        userId: decoded.userId,
        source: 'voluntare-chat',
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hora
      },
      process.env.JWT_SECRET || 'default-secret'
    );

    return NextResponse.json({
      success: true,
      token: orchestrateToken
    });

  } catch (error: any) {
    console.error('Erro ao gerar token:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}