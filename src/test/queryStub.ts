export interface QueryCall {
  method: string;
  args: unknown[];
}

export type QueryStub<T> = PromiseLike<T> & {
  calls: QueryCall[];
  [method: string]: unknown;
};

/** supabase-js 쿼리 빌더 대역. 체인 메서드를 기록하고 await하면 result를 준다. */
export function queryStub<T>(result: T): QueryStub<T> {
  const calls: QueryCall[] = [];
  const proxy: QueryStub<T> = new Proxy({} as QueryStub<T>, {
    get(_target, property) {
      if (property === "then") {
        return (
          resolve: (value: T) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject);
      }
      if (property === "calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(property), args });
        return proxy;
      };
    },
  });
  return proxy;
}
