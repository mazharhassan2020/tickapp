/**
 * Minimal ambient types for `jsonwebtoken`.
 *
 * The package ships no types of its own and `@types/jsonwebtoken` is not a
 * dependency here. Adding it would mean touching package-lock.json, which is
 * already out of sync with package.json (`npm ci` fails on it), so this
 * declares just the two calls the server actually makes.
 */
declare module "jsonwebtoken" {
  export interface SignOptions {
    expiresIn?: number | string;
    issuer?: string;
    subject?: string;
    audience?: string | string[];
    algorithm?: string;
    notBefore?: number | string;
  }

  export interface VerifyOptions {
    issuer?: string | string[];
    audience?: string | string[];
    algorithms?: string[];
    clockTolerance?: number;
    maxAge?: number | string;
  }

  export function sign(
    payload: string | object | Buffer,
    secretOrPrivateKey: string | Buffer,
    options?: SignOptions
  ): string;

  /** Throws on a bad signature, expiry, or any failed option check. */
  export function verify(
    token: string,
    secretOrPublicKey: string | Buffer,
    options?: VerifyOptions
  ): string | { [key: string]: any };

  export function decode(
    token: string,
    options?: { complete?: boolean; json?: boolean }
  ): null | string | { [key: string]: any };

  const _default: {
    sign: typeof sign;
    verify: typeof verify;
    decode: typeof decode;
  };
  export default _default;
}
