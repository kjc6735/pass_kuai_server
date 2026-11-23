import { testConfig } from '../../../test/config';
import { AppException } from '../../common/errors/app.exception';
import { KAKAO_UNLINK_URL } from '../../constants/social';
import { KakaoVerifier } from './kakao.verifier';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe('KakaoVerifier', () => {
  const fetchMock = jest.fn();
  const verifier = (appId: string | undefined = '1000') =>
    new KakaoVerifier(testConfig({ KAKAO_APP_ID: appId }));

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  const codeOf = async (p: Promise<unknown>) => {
    const err = await p.catch((e: unknown) => e);
    return err instanceof AppException ? err.code : err;
  };

  it('우리 앱 토큰이면 카카오 회원번호를 준다', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 77, app_id: 1000 }));

    await expect(verifier().verify({ token: 'tok' })).resolves.toEqual({
      providerUserId: '77',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('다른 앱에서 받은 토큰이면 거절한다', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 77, app_id: 9999 }));
    expect(await codeOf(verifier().verify({ token: 'tok' }))).toBe(
      'SOCIAL_TOKEN_INVALID',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('카카오가 401을 주면 SOCIAL_TOKEN_INVALID', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { code: -401 }));
    expect(await codeOf(verifier().verify({ token: 'tok' }))).toBe(
      'SOCIAL_TOKEN_INVALID',
    );
  });

  it('카카오가 응답하지 않거나 5xx면 SOCIAL_PROVIDER_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    expect(await codeOf(verifier().verify({ token: 'tok' }))).toBe(
      'SOCIAL_PROVIDER_UNAVAILABLE',
    );
    fetchMock.mockResolvedValueOnce(json(500, {}));
    expect(await codeOf(verifier().verify({ token: 'tok' }))).toBe(
      'SOCIAL_PROVIDER_UNAVAILABLE',
    );
  });

  it('KAKAO_APP_ID가 없으면 카카오를 부르지 않고 막는다', async () => {
    expect(await codeOf(verifier('').verify({ token: 'tok' }))).toBe(
      'SOCIAL_PROVIDER_UNAVAILABLE',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('연결 끊기는 사용자 토큰으로 카카오 unlink를 부른다', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 77 }));
    await verifier().disconnect({ token: 'tok' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(KAKAO_UNLINK_URL);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('토큰이 만료돼 unlink가 401이면 SOCIAL_TOKEN_INVALID', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { code: -401 }));
    expect(await codeOf(verifier().disconnect({ token: 'tok' }))).toBe(
      'SOCIAL_TOKEN_INVALID',
    );
  });
});
