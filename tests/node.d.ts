/**
 * Just enough of Node's standard library for the one test that writes files.
 *
 * `@types/node` would pull a whole platform's typings into a project whose
 * `lib` is deliberately DOM-only, to type four functions used in one place.
 * These are those four.
 */

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding: string): void;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
