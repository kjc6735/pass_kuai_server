import type { IncomingMessage } from 'node:http';
import { pathOf, requestIdOf } from './logger.config';

const reqWith = (headers: Record<string, string>) =>
  ({ headers }) as unknown as IncomingMessage;

describe('requestIdOf', () => {
  it('앞단에서 준 요청 번호를 그대로 쓴다', () => {
    expect(requestIdOf(reqWith({ 'x-request-id': 'abc-123' }))).toBe('abc-123');
  });

  it('없거나 이상한 값이면 새로 만든다', () => {
    const uuid = /^[0-9a-f-]{36}$/;
    expect(requestIdOf(reqWith({}))).toMatch(uuid);
    expect(requestIdOf(reqWith({ 'x-request-id': 'a\nb' }))).toMatch(uuid);
    expect(requestIdOf(reqWith({ 'x-request-id': 'x'.repeat(65) }))).toMatch(
      uuid,
    );
  });
});

describe('pathOf', () => {
  it('쿼리를 떼고 경로만 남긴다', () => {
    expect(pathOf('/health?x=1')).toBe('/health');
    expect(pathOf(undefined)).toBe('/');
  });
});
