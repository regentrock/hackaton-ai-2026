import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  
  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }
  
  // Trocar o código por um token
  const tokenResponse = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=authorization_code&code=${code}&` +
          `client_id=${process.env.IBM_CLIENT_ID}&` +
          `client_secret=${process.env.IBM_CLIENT_SECRET}&` +
          `redirect_uri=${encodeURIComponent(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ibm/callback`)}`
  });
  
  const tokenData = await tokenResponse.json();
  
  // Salvar token em cookie para o chat usar
  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  response.cookies.set('ibm_token', tokenData.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 // 1 hora
  });
  
  return response;
}