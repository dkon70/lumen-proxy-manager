import type { Localized } from '../shared/i18n';
import type { Settings } from '../shared/types';

export type Target = 'chrome' | 'firefox';

export interface ProxyErrorEvent {
  code: string;
  fatal: boolean;
}

export interface AuthRequest {
  requestId: string;
  host: string;
  port: number;
}

export interface AuthResponse {
  cancel?: boolean;
  authCredentials?: { username: string; password: string };
}

export interface ObservedRoute {
  tabId: number;
  host: string;
  proxy: string | null;
  at: number;
}

export interface PacRouteResult {
  url: string;
  host: string;
  result: string;
}

export interface PacEvaluator {
  check(pac: string): Promise<Localized | null>;
  route(pac: string, urls: string[]): Promise<PacRouteResult[] | Localized | null>;
}

export interface BackgroundPlatform {
  applyProxy(settings: Settings, pac: string | null): Promise<void>;
  controlledByOther(): Promise<boolean>;
  watchControl(onChange: (controlledByOther: boolean) => void): void;
  onProxyError(listener: (event: ProxyErrorEvent) => void): void;
  watchRoutes(listener: (route: ObservedRoute) => void): void;
  registerAuth(handler: (request: AuthRequest) => Promise<AuthResponse>): void;
  validatePac(pac: string): Promise<Localized | null>;
  accessProblem(): Promise<Localized | null>;
}
