import { generateKeyPairSync } from 'node:crypto';

export function ecKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });
