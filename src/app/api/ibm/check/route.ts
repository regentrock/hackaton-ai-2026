import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const ibmToken = request.cookies.get('ibm_token')?.value;
  
  if (!ibmToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  
  return NextResponse.json({ authenticated: true });
}