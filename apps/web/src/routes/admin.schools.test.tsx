import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Schools } from './admin.schools';

const { useSchoolsMock, createSchoolMutateMock, updateSchoolMutateMock, deleteSchoolMutateMock } = vi.hoisted(() => ({
  useSchoolsMock: vi.fn(),
  createSchoolMutateMock: vi.fn(),
  updateSchoolMutateMock: vi.fn(),
  deleteSchoolMutateMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>
}));
vi.mock('../hooks/useSchools', () => ({ useSchools: useSchoolsMock }));
vi.mock('../hooks/useCreateSchool', () => ({ useCreateSchool: () => ({ mutate: createSchoolMutateMock }) }));
vi.mock('../hooks/useUpdateSchool', () => ({ useUpdateSchool: () => ({ mutate: updateSchoolMutateMock }) }));
vi.mock('../hooks/useDeleteSchool', () => ({ useDeleteSchool: () => ({ mutate: deleteSchoolMutateMock }) }));

const SCHOOL = { id: 'sch_1', name: 'Test High', city: 'Testville' };

beforeEach(() => {
  useSchoolsMock.mockReset();
  createSchoolMutateMock.mockReset();
  updateSchoolMutateMock.mockReset();
  deleteSchoolMutateMock.mockReset();
  useSchoolsMock.mockReturnValue({ data: [SCHOOL] });
});

describe('Schools (admin)', () => {
  test('renders the schools table', () => {
    render(<Schools />);
    expect(screen.getByText('Test High')).toBeInTheDocument();
    expect(screen.getByText('Testville')).toBeInTheDocument();
  });

  describe('with window.prompt/confirm stubbed', () => {
    const originalPrompt = window.prompt;
    const originalConfirm = window.confirm;
    afterEach(() => {
      window.prompt = originalPrompt;
      window.confirm = originalConfirm;
    });

    test('Add school prompts for name/city then calls createSchool', () => {
      window.prompt = vi.fn().mockReturnValueOnce('New High').mockReturnValueOnce('New City');
      render(<Schools />);
      fireEvent.click(screen.getByText('+ Add school'));
      expect(createSchoolMutateMock).toHaveBeenCalledWith({ name: 'New High', city: 'New City' });
    });

    test('Edit prompts for name/city then calls updateSchool', () => {
      window.prompt = vi.fn().mockReturnValueOnce('Renamed High').mockReturnValueOnce('New City');
      render(<Schools />);
      fireEvent.click(screen.getByText('Edit'));
      expect(updateSchoolMutateMock).toHaveBeenCalledWith({ id: 'sch_1', name: 'Renamed High', city: 'New City' });
    });

    test('Delete confirms then calls deleteSchool', () => {
      window.confirm = vi.fn().mockReturnValue(true);
      render(<Schools />);
      fireEvent.click(screen.getByText('Delete'));
      expect(deleteSchoolMutateMock).toHaveBeenCalledWith('sch_1');
    });
  });
});
