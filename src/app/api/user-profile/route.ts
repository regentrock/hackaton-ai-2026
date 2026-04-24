// src/app/api/user-profile/route.ts

import { prisma } from '@/src/lib/prisma';
import jwt from 'jsonwebtoken';

type JWTPayload = {
  id: string;
};

export async function GET(req: Request) {
  try {
    // =========================
    // 1. pegar token
    // =========================
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return Response.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];

    // =========================
    // 2. validar token
    // =========================
    let decoded: JWTPayload;

    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as JWTPayload;
    } catch (err) {
      return Response.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // =========================
    // 3. buscar usuário
    // =========================
    const user = await prisma.volunteer.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return Response.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // =========================
    // 4. normalizar skills (SEM ERRO TS)
    // =========================
    let skills: string[] = [];

    if (Array.isArray(user.skills)) {
      skills = user.skills as string[];
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
    return Response.json({
      name: user.name,
      skills,
      location: user.location || 'Unknown',
    });

  } catch (error) {
    console.error('USER PROFILE ERROR:', error);

    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}