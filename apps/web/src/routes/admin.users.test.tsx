import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Users } from './admin.users';

const { useSchoolsMock, useAdminUsersMock, updateUserMutateMock, deleteUserMutateMock, useSearchMock } = vi.hoisted(() => ({
  useSchoolsMock: vi.fn(),
  useAdminUsersMock: vi.fn(),
  updateUserMutateMock: vi.fn(),
  deleteUserMutateMock: vi.fn(),
  useSearchMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({
  // Users reads schoolId via `Route.useSearch()` — the real createFileRoute-built Route object
  // has that method attached; the plain-passthrough stub other route tests use doesn't, so this
  // one needs to add it.
  createFileRoute: () => (opts: unknown) => ({ ...(opts as object), useSearch: useSearchMock })
}));
vi.mock('../hooks/useSchools', () => ({ useSchools: useSchoolsMock }));
vi.mock('../hooks/useAdminUsers', () => ({ useAdminUsers: useAdminUsersMock }));
vi.mock('../hooks/useAdminUpdateUser', () => ({ useAdminUpdateUser: () => ({ mutate: updateUserMutateMock }) }));
vi.mock('../hooks/useAdminDeleteUser', () => ({ useAdminDeleteUser: () => ({ mutate: deleteUserMutateMock }) }));

const SCHOOL = { id: 'sch_1', name: 'Test High', city: 'Testville' };
const STUDENT = {
  id: 'usr_1', schoolId: 'sch_1', firstName: 'Alex', lastName: 'Kim', username: 'alexk',
  gender: 'girl', grade: '10', coins: 2, infiniteAura: false
};

beforeEach(() => {
  useSchoolsMock.mockReset();
  useAdminUsersMock.mockReset();
  updateUserMutateMock.mockReset();
  deleteUserMutateMock.mockReset();
  useSearchMock.mockReset();
  useSchoolsMock.mockReturnValue({ data: [SCHOOL] });
  useAdminUsersMock.mockReturnValue({ data: [STUDENT] });
  useSearchMock.mockReturnValue({ schoolId: undefined });
});

describe('Users (admin)', () => {
  test('renders the users table', () => {
    render(<Users />);
    expect(screen.getByText('Alex Kim')).toBeInTheDocument();
    expect(screen.getByText('@alexk')).toBeInTheDocument();
  });

  test('search filters by name/username', () => {
    render(<Users />);
    fireEvent.change(screen.getByPlaceholderText('Search name…'), { target: { value: 'nobody' } });
    expect(screen.queryByText('Alex Kim')).not.toBeInTheDocument();
  });

  test('toggling Infinite Aura calls adminUpdateUser', () => {
    render(<Users />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(updateUserMutateMock).toHaveBeenCalledWith({ id: 'usr_1', infiniteAura: true });
  });

  test('editing coins on blur calls adminUpdateUser', () => {
    render(<Users />);
    const coinsInput = screen.getByDisplayValue('2');
    fireEvent.change(coinsInput, { target: { value: '500' } });
    fireEvent.blur(coinsInput);
    expect(updateUserMutateMock).toHaveBeenCalledWith({ id: 'usr_1', coins: 500 });
  });

  describe('with window.prompt/confirm stubbed', () => {
    const originalPrompt = window.prompt;
    const originalConfirm = window.confirm;
    afterEach(() => {
      window.prompt = originalPrompt;
      window.confirm = originalConfirm;
    });

    test('Edit prompts for name/username then calls adminUpdateUser', () => {
      window.prompt = vi.fn().mockReturnValueOnce('Alexa').mockReturnValueOnce('Kim').mockReturnValueOnce('alexak');
      render(<Users />);
      fireEvent.click(screen.getByText('Edit'));
      expect(updateUserMutateMock).toHaveBeenCalledWith({ id: 'usr_1', firstName: 'Alexa', lastName: 'Kim', username: 'alexak' });
    });

    test('Delete confirms then calls adminDeleteUser', () => {
      window.confirm = vi.fn().mockReturnValue(true);
      render(<Users />);
      fireEvent.click(screen.getByText('✕'));
      expect(deleteUserMutateMock).toHaveBeenCalledWith('usr_1');
    });
  });
});
