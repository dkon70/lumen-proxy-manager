import type * as ChromePlatform from './chrome';
import type * as FirefoxPlatform from './firefox';

type Shape = Pick<typeof ChromePlatform, 'TARGET' | 'BROWSER_NAME' | 'EXACT_ROUTE_CHECK' | 'background' | 'createPacEvaluator'>;

export type ChromeMatchesContract = typeof ChromePlatform extends Shape ? true : never;
export type FirefoxMatchesContract = typeof FirefoxPlatform extends Shape ? true : never;
export const contractHolds: [ChromeMatchesContract, FirefoxMatchesContract] = [true, true];
