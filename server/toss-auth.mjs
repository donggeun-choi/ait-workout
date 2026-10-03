import https from 'node:https';
import { readFileSync } from 'node:fs';

export function createTossVerifier({ certPath, keyPath }) {
  if (!certPath || !keyPath) throw new Error('Toss mTLS certificate and key are required');
  const agent = new https.Agent({ cert: readFileSync(certPath), key: readFileSync(keyPath), rejectUnauthorized: true });
  const call = (path, body, token) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request({ hostname: 'apps-in-toss-api.toss.im', path: `/api-partner/v1/apps-in-toss/user/oauth2/${path}`, method: body ? 'POST' : 'GET', agent, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, timeout: 5000 }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; if (text.length > 65536) req.destroy(new Error('Oversized upstream response')); });
      res.on('end', () => { try { const value = JSON.parse(text); if (res.statusCode !== 200 || value.resultType !== 'SUCCESS') throw new Error('Toss authentication failed'); resolve(value.success); } catch (error) { reject(error); } });
    });
    req.on('timeout', () => req.destroy(new Error('Toss request timed out')));
    req.on('error', reject); req.end(data);
  });
  return {
    async verify({ authorizationCode, referrer }) {
      const token = await call('generate-token', { authorizationCode, referrer });
      if (typeof token.accessToken !== 'string') throw new Error('Invalid Toss token');
      const user = await call('login-me', undefined, token.accessToken);
      if (!Number.isSafeInteger(user.userKey) || user.userKey <= 0) throw new Error('Invalid verified userKey');
      // Do not persist Toss access/refresh tokens or encrypted personal information.
      return { subject: String(user.userKey), identityKind: 'toss' };
    },
    disconnect: subject => call('access/remove-by-user-key', { userKey: Number(subject) }),
  };
}
