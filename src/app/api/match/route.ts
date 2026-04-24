import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function GET(request: NextRequest) {
  try {
    console.log('=== MATCH API ===');
    
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
    // 2. Buscar oportunidades reais
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
      console.error('Opportunities API returned:', opportunitiesRes.status);
      return NextResponse.json(
        { error: 'Failed to fetch opportunities from GlobalGiving' },
        { status: 500 }
      );
    }

    const data = await opportunitiesRes.json();
    
    if (!data.success || !data.opportunities) {
      return NextResponse.json(
        { error: 'No opportunities found' },
        { status: 500 }
      );
    }

    return NextResponse.json(data.opportunities);

  } catch (error: any) {
    console.error('Match API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}