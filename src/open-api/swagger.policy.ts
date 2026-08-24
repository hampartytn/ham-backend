export function resolveSwaggerEnabled(
  nodeEnv: string,
  rawFlag: string | undefined,
): boolean {
  if (nodeEnv === 'production') {
    return rawFlag === 'true';
  }
  return rawFlag !== 'false';
}

export function shouldDocumentMockComplete(nodeEnv: string): boolean {
  return nodeEnv !== 'production';
}

export function swaggerRequiresBasicAuth(
  nodeEnv: string,
  enabled: boolean,
  user: string | undefined,
  password: string | undefined,
): boolean {
  if (!enabled) {
    return false;
  }
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    return true;
  }
  return Boolean(user && password);
}

export function assertSwaggerAccess(
  nodeEnv: string,
  enabled: boolean,
  user: string | undefined,
  password: string | undefined,
): void {
  if (!enabled) {
    return;
  }
  if (
    swaggerRequiresBasicAuth(nodeEnv, enabled, user, password) &&
    (!user || !password)
  ) {
    throw new Error(
      'SWAGGER_USER and SWAGGER_PASSWORD are required when Swagger is enabled in production or staging',
    );
  }
}
