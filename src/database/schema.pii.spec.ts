import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Prisma schema PII rules', () => {
  it('does not define an Aadhaar column', () => {
    const schema = readFileSync(
      join(__dirname, '../../prisma/schema.prisma'),
      'utf8',
    );
    expect(schema).not.toMatch(/^\s*aadhaar\s/im);
    expect(schema).toMatch(/Do not store full Aadhaar/);
  });
});
