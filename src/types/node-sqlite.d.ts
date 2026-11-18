declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      all(...args: (string | number | null)[]): Record<string, unknown>[];
      run(...args: (string | number | null)[]): unknown;
    };
  }
}
