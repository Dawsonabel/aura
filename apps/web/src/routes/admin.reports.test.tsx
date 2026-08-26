import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Reports } from './admin.reports';

const { useAdminReportsMock, resolveReportMutateMock } = vi.hoisted(() => ({ useAdminReportsMock: vi.fn(), resolveReportMutateMock: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useAdminReports', () => ({ useAdminReports: useAdminReportsMock }));
vi.mock('../hooks/useResolveReport', () => ({ useResolveReport: () => ({ mutate: resolveReportMutateMock }) }));

beforeEach(() => {
  useAdminReportsMock.mockReset();
  resolveReportMutateMock.mockReset();
});

describe('Reports (admin)', () => {
  test('open reports show a Resolve button; resolved ones do not', () => {
    useAdminReportsMock.mockReturnValue({
      data: [
        { id: 'rep_1', byName: 'Alex Kim', targetName: 'Sam Lee', reason: 'spam', status: 'open', ts: '2026-01-01T00:00:00Z' },
        { id: 'rep_2', byName: 'Bailey Ray', targetName: 'Jamie Fox', reason: 'harassment', status: 'resolved', ts: '2026-01-01T00:00:00Z' }
      ]
    });
    render(<Reports />);
    expect(screen.getAllByText('Resolve')).toHaveLength(1);
  });

  test('tapping Resolve calls resolveReport', () => {
    useAdminReportsMock.mockReturnValue({
      data: [{ id: 'rep_1', byName: 'Alex Kim', targetName: 'Sam Lee', reason: 'spam', status: 'open', ts: '2026-01-01T00:00:00Z' }]
    });
    render(<Reports />);
    fireEvent.click(screen.getByText('Resolve'));
    expect(resolveReportMutateMock).toHaveBeenCalledWith('rep_1');
  });
});
