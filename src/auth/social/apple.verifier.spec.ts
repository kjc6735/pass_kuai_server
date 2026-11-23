import { testConfig } from '../../../test/config';
import { JwtService } from '@nestjs/jwt';
import { ecKeyPair, json } from '../../../test/social-keys';
import { AppException } from '../../common/errors/app.exception';
import {
  APPLE_ISSUER,
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
} from '../../constants/social';
import { AppleVerifier } from './apple.verifier';

const BUNDLE = 'com.passkuai.app';

describe('AppleVerifier', () => {
  const fetchMock = jest.fn();
  const jwt = new JwtService();
  const ec = ecKeyPair();
  const env = {
    APPLE_CLIENT_ID: BUNDLE,
    APPLE_TEAM_ID: 'TEAM123',
    APPLE_KEY_ID: 'KEY123',
    APPLE_PRIVATE_KEY: ec.privateKey.replace(/\n/g, '\\n'),
  };
  const verifier = (over: object = {}) =>
    new AppleVerifier(testConfig({ ...env, ...over }), jwt);
  const appleReply = (claims: object = {}) =>
    json(200, {
      refresh_token: 'apple-refresh',
      id_token: jwt.sign(
        {
          sub: 'apple-001',
          ...claims,
        },
        { secret: 'signed-by-apple' },
      ),
    });
  const codeOf = async (p: Promise<unknown>) => {
    const err = await p.catch((e: unknown) => e);
    return err instanceof AppException ? err.code : err;
  };

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('authorizationCode를 Apple에 보내 사용자와 refresh token을 받는다', async () => {
    fetchMock.mockResolvedValueOnce(appleReply());
    await expect(
      verifier().verify({ token: 'id', authorizationCode: 'code-1' }),
    ).resolves.toEqual({
      providerUserId: 'apple-001',
      appleRefreshToken: 'apple-refresh',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(APPLE_TOKEN_URL);
    const form = new URLSearchParams(init.body as URLSearchParams);
    expect(form.get('client_id')).toBe(BUNDLE);
    expect(form.get('code')).toBe('code-1');
    expect(form.get('grant_type')).toBe('authorization_code');

    const secret = form.get('client_secret')!;
    await expect(
      jwt.verifyAsync(secret, {
        publicKey: ec.publicKey,
        algorithms: ['ES256'],
      }),
    ).resolves.toMatchObject({
      iss: 'TEAM123',
      sub: BUNDLE,
      aud: APPLE_ISSUER,
    });
    expect(jwt.decode(secret, { complete: true }).header).toMatchObject({
      alg: 'ES256',
      kid: 'KEY123',
    });
  });

  it('authorizationCode가 없으면 400이고 Apple을 부르지 않는다', async () => {
    expect(await codeOf(verifier().verify({ token: 'id' }))).toBe(
      'INVALID_INPUT',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Apple이 코드를 거절하면 SOCIAL_TOKEN_INVALID', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: 'invalid_grant' }));
    expect(
      await codeOf(
        verifier().verify({ token: 'id', authorizationCode: 'used' }),
      ),
    ).toBe('SOCIAL_TOKEN_INVALID');
  });

  it('Apple 응답에 사용자가 없으면 SOCIAL_TOKEN_INVALID', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { refresh_token: 'r' }));
    expect(
      await codeOf(verifier().verify({ token: 'id', authorizationCode: 'c' })),
    ).toBe('SOCIAL_TOKEN_INVALID');
  });

  it('Apple 서버가 응답하지 않으면 SOCIAL_PROVIDER_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValueOnce(json(503, {}));
    expect(
      await codeOf(verifier().verify({ token: 'id', authorizationCode: 'c' })),
    ).toBe('SOCIAL_PROVIDER_UNAVAILABLE');
  });

  it('설정이 빠지면 막는다', async () => {
    expect(
      await codeOf(
        verifier({ APPLE_PRIVATE_KEY: '' }).verify({
          token: 'id',
          authorizationCode: 'c',
        }),
      ),
    ).toBe('SOCIAL_PROVIDER_UNAVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('연결 해제는 refresh token으로 Apple revoke를 부르고, 빈 응답도 성공으로 본다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await verifier().disconnect({ token: 'id', appleRefreshToken: 'r-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(APPLE_REVOKE_URL);
    const form = new URLSearchParams(init.body as URLSearchParams);
    expect(form.get('client_id')).toBe(BUNDLE);
    expect(form.get('token')).toBe('r-1');
    expect(form.get('token_type_hint')).toBe('refresh_token');
    await expect(
      jwt.verifyAsync(form.get('client_secret')!, {
        publicKey: ec.publicKey,
        algorithms: ['ES256'],
      }),
    ).resolves.toMatchObject({ sub: BUNDLE });
  });

  it('저장된 refresh token이 없으면 Apple을 부르지 않는다', async () => {
    await verifier().disconnect({ token: 'id', appleRefreshToken: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
