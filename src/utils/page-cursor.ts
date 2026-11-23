import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../constants/error-code';

export interface PageCursor {
  savedAt: Date;
  id: bigint;
}

export function encodeCursor({ savedAt, id }: PageCursor): string {
  return Buffer.from(`${savedAt.getTime()}:${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): PageCursor {
  const match = /^(\d+):(\d+)$/.exec(
    Buffer.from(cursor, 'base64url').toString(),
  );
  if (!match) throw new AppException(ErrorCode.INVALID_INPUT);
  return { savedAt: new Date(Number(match[1])), id: BigInt(match[2]) };
}

export function afterCursor(cursor?: string) {
  if (!cursor) return {};
  const { savedAt, id } = decodeCursor(cursor);
  return { OR: [{ savedAt: { lt: savedAt } }, { savedAt, id: { lt: id } }] };
}

export function toPage<R extends PageCursor, T>(
  rows: R[],
  limit: number,
  map: (row: R) => T,
): { items: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
}
