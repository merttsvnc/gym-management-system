import type { Env } from './env';

/** Boot-validated environment (see `validateEnv()` in `main.ts` and module factories). */
export const APP_VALIDATED_ENV = Symbol('APP_VALIDATED_ENV');

export type AppValidatedEnv = Env;
