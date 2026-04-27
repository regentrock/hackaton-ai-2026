import { NextResponse } from 'next/server';

export async function GET() {
  // Configurações do OAuth da IBM
  const clientId = process.env.IBM_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/ibm/callback`;
  const scope = 'openid email profile';
  
  const authUrl = `https://iam.cloud.ibm.com/identity/authorize?` + 
    `client_id=${clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scope)}`;
  
  return NextResponse.json({ authUrl });
}