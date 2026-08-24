import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('jobs payment isolation', () => {
  it('does not import the payments module or payment adapter', () => {
    const files = readdirSync(__dirname, { recursive: true }) as string[];
    for (const file of files) {
      if (!file.endsWith('.ts') || file.includes('.spec.')) {
        continue;
      }
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source).not.toMatch(
        /modules\/payments|integrations\/payment|PaymentProvider|PaymentsService|PaymentsModule/,
      );
    }
  });
});
