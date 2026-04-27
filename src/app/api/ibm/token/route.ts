import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`
    });
    
    const data = await response.json();
    
    if (!data.access_token) {
      return NextResponse.json({ error: 'Failed to get token' }, { status: 500 });
    }
    
    const res = NextResponse.json({ success: true, token: data.access_token });
    res.cookies.set('ibm_token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 55 * 60,
      path: '/',
    });
    
    return res;
  } catch (error) {
    console.error('Erro IBM token:', error);
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 });
  }
}