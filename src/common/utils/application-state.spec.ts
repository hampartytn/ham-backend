import { canEmployeeWithdraw, canEmployerSetStatus } from './application-state';

describe('application state', () => {
  it('allows withdraw unless hired or already withdrawn', () => {
    expect(canEmployeeWithdraw('SUBMITTED')).toBe(true);
    expect(canEmployeeWithdraw('VIEWED')).toBe(true);
    expect(canEmployeeWithdraw('SHORTLISTED')).toBe(true);
    expect(canEmployeeWithdraw('REJECTED')).toBe(true);
    expect(canEmployeeWithdraw('HIRED')).toBe(false);
    expect(canEmployeeWithdraw('WITHDRAWN')).toBe(false);
  });

  it('allows employer status updates except withdrawn/hired and employee-only states', () => {
    expect(canEmployerSetStatus('SUBMITTED', 'VIEWED')).toBe(true);
    expect(canEmployerSetStatus('VIEWED', 'SHORTLISTED')).toBe(true);
    expect(canEmployerSetStatus('SHORTLISTED', 'HIRED')).toBe(true);
    expect(canEmployerSetStatus('SUBMITTED', 'REJECTED')).toBe(true);
    expect(canEmployerSetStatus('SUBMITTED', 'WITHDRAWN')).toBe(false);
    expect(canEmployerSetStatus('WITHDRAWN', 'VIEWED')).toBe(false);
    expect(canEmployerSetStatus('HIRED', 'REJECTED')).toBe(false);
  });
});
