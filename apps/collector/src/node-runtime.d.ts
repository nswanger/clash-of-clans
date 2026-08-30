// The collector bundle runs on Node but deliberately does not depend on @types/node,
// so main.ts declares `process` by hand. This declares the one other runtime shape it
// uses, on the same terms: only what is actually called.
declare module "node:fs/promises" {
  export function readFile(path: URL | string, encoding: "utf8"): Promise<string>;
}
