import {
  resolveSwaggerEnabled,
  shouldDocumentMockComplete,
  swaggerRequiresBasicAuth,
  assertSwaggerAccess,
} from './swagger.policy';

describe('swagger policy', () => {
  it('disables Swagger in production unless SWAGGER_ENABLED=true', () => {
    expect(resolveSwaggerEnabled('production', undefined)).toBe(false);
    expect(resolveSwaggerEnabled('production', 'false')).toBe(false);
    expect(resolveSwaggerEnabled('production', 'true')).toBe(true);
    expect(resolveSwaggerEnabled('development', undefined)).toBe(true);
    expect(resolveSwaggerEnabled('development', 'false')).toBe(false);
    expect(resolveSwaggerEnabled('test', undefined)).toBe(true);
  });

  it('omits mock-complete from the production spec only', () => {
    expect(shouldDocumentMockComplete('production')).toBe(false);
    expect(shouldDocumentMockComplete('development')).toBe(true);
    expect(shouldDocumentMockComplete('test')).toBe(true);
  });

  it('requires basic auth when Swagger is enabled in production or staging', () => {
    expect(swaggerRequiresBasicAuth('production', true, 'docs', 'secret')).toBe(
      true,
    );
    expect(() =>
      assertSwaggerAccess('production', true, undefined, undefined),
    ).toThrow(/SWAGGER_USER/);
    expect(() =>
      assertSwaggerAccess('production', false, undefined, undefined),
    ).not.toThrow();
    expect(
      swaggerRequiresBasicAuth('development', true, undefined, undefined),
    ).toBe(false);
  });
});
