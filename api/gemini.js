export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const keyJson = process.env.SERVICE_ACCOUNT_KEY;
    if (!keyJson) {
      return res.status(500).json({ error: 'SERVICE_ACCOUNT_KEY 환경변수가 없습니다.' });
    }
    const key = JSON.parse(keyJson);

    // Google OAuth 토큰 발급
    const now = Math.floor(Date.now() / 1000);
    const jwtHeader = { alg: "RS256", typ: "JWT" };
    const jwtPayload = {
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    };

    const base64url = (source) => Buffer.from(JSON.stringify(source))
      .toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

    const unsignedToken = `${base64url(jwtHeader)}.${base64url(jwtPayload)}`;
    const sign = require('crypto').createSign('RSA-SHA256');
    sign.update(unsignedToken);
    const signature = sign.sign(key.private_key, 'base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const jwt = `${unsignedToken}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(500).json({ error: tokenData });
    }

    // Gemini API 호출
    const geminiRes = await fetch(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/npi-ai-proto/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokenData.access_token}`
        },
        body: JSON.stringify(req.body)
      }
    );

    const geminiData = await geminiRes.json();
    res.status(geminiRes.status).json(geminiData);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
