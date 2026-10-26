export interface QueryCall {
  method: string;
  args: unknown[];
}

export type QueryStub<T> = PromiseLike<T> & {
  calls: QueryCall[];
  [method: string]: unknown;
};

/** supabase-js 쿼리 빌더 대역. 체인 메서드를 기록하고 await하면 result를 준다. result가 함수면 기록한 체인으로 결과를 정한다. */
export function queryStub<T>(
  result: T | ((calls: QueryCall[]) => T),
): QueryStub<T> {
  const calls: QueryCall[] = [];
  const proxy: QueryStub<T> = new Proxy({} as QueryStub<T>, {
    get(_target, property) {
      if (property === "then") {
        return (
          resolve: (value: T) => unknown,
          reject: (reason: unknown) => unknown,
        ) =>
          Promise.resolve(
            typeof result === "function"
              ? (result as (calls: QueryCall[]) => T)(calls)
              : result,
          ).then(resolve, reject);
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
