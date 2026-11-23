import { testConfig } from '../../../test/config';
import { json } from '../../../test/social-keys';
import { AppException } from '../../common/errors/app.exception';
import { GOOGLE_TOKENINFO_URL } from '../../constants/social';
import { GoogleVerifier } from './google.verifier';

const CLIENT = 'ios-client.apps.googleusercontent.com';
const info = (over: object = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  sub: 'g-123',
  ...over,
});

describe('GoogleVerifier', () => {
  const fetchMock = jest.fn();
  const verifier = (ids = `web-client, ${CLIENT}`) =>
    new GoogleVerifier(testConfig({ GOOGLE_CLIENT_IDS: ids }));
  const codeOf = async (p: Promise<unknown>) => {
    const err = await p.catch((e: unknown) => e);
    return err instanceof AppException ? err.code : err;
  };

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('Google에 idToken을 보내 확인하고 sub을 준다', async () => {
    fetchMock.mockResolvedValueOnce(json(200, info()));
    await expect(verifier().verify({ token: 'id.tok' })).resolves.toEqual({
      providerUserId: 'g-123',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${GOOGLE_TOKENINFO_URL}?id_token=id.tok`,
    );
  });

  it('Google이 거절하면 SOCIAL_TOKEN_INVALID', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: 'invalid_token' }));
    expect(await codeOf(verifier().verify({ token: 't' }))).toBe(
      'SOCIAL_TOKEN_INVALID',
    );
  });

  it.each([
    ['다른 앱용 토큰', { aud: 'evil-client' }],
    ['발급자가 다른 토큰', { iss: 'https://evil.com' }],
  ])('%s은 SOCIAL_TOKEN_INVALID', async (_, over) => {
    fetchMock.mockResolvedValueOnce(json(200, info(over)));
    expect(await codeOf(verifier().verify({ token: 't' }))).toBe(
      'SOCIAL_TOKEN_INVALID',
    );
  });

  it('Google이 응답하지 않으면 SOCIAL_PROVIDER_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValueOnce(new Error('down'));
    expect(await codeOf(verifier().verify({ token: 't' }))).toBe(
      'SOCIAL_PROVIDER_UNAVAILABLE',
    );
  });

  it('GOOGLE_CLIENT_IDS가 없으면 Google을 부르지 않고 막는다', async () => {
    expect(await codeOf(verifier('').verify({ token: 't' }))).toBe(
      'SOCIAL_PROVIDER_UNAVAILABLE',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
