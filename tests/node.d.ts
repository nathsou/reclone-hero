// Minimal typings for the Node built-ins used by tests (avoids depending on @types/node).
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, opts: { skip?: boolean | string }, fn: () => void | Promise<void>): void;
}
declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    throws(fn: () => unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string, opts: { withFileTypes: true }): { name: string; isDirectory(): boolean; isFile(): boolean }[];
}
declare const process: { argv: string[]; env: Record<string, string | undefined>; exitCode?: number; memoryUsage(): { heapUsed: number } };
declare module 'node:inspector/promises' {
  export class Session {
    connect(): void;
    post(method: string, params?: object): Promise<unknown>;
  }
}
