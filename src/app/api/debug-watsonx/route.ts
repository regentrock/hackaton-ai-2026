import { NextResponse } from 'next/server';

export async function GET() {
  const results: any = {
    hasApiKey: !!process.env.IBM_API_KEY,
    hasUrl: !!process.env.IBM_URL,
    hasProjectId: !!process.env.IBM_PROJECT_ID,
    apiKeyPreview: process.env.IBM_API_KEY ? `${process.env.IBM_API_KEY.substring(0, 10)}...` : null,
  };

  if (!process.env.IBM_API_KEY || !process.env.IBM_URL || !process.env.IBM_PROJECT_ID) {
    results.error = 'WatsonX not configured';
    return NextResponse.json(results);
  }

  // Testar IAM token
  try {
    const iamRes = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`,
    });
    
    const iamData = await iamRes.json();
    results.iamTokenObtained = !!iamData.access_token;
    results.iamStatus = iamRes.status;
    
    if (iamData.access_token) {
      // Testar WatsonX com um prompt simples
      const watsonRes = await fetch(`${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${iamData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: 'Say "WatsonX is working" in JSON format: {"status": "ok"}',
          model_id: "ibm/granite-3-8b-instruct",
          project_id: process.env.IBM_PROJECT_ID,
          parameters: {
            max_new_tokens: 50,
            temperature: 0.1,
          },
        }),
      });
      
      results.watsonXStatus = watsonRes.status;
      if (watsonRes.ok) {
        const watsonData = await watsonRes.json();
        results.watsonXWorking = true;
        results.watsonXResponse = watsonData.results?.[0]?.generated_text;
      } else {
        results.watsonXWorking = false;
        results.watsonXError = await watsonRes.text();
      }
    }
  } catch (error: any) {
    results.error = error.message;
  }

  return NextResponse.json(results);
}