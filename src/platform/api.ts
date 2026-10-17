
const scope = globalThis as unknown as { browser?: typeof chrome; chrome?: typeof chrome };

export const ext: typeof chrome = (__TARGET__ === 'firefox' ? scope.browser : scope.chrome) as typeof chrome;
