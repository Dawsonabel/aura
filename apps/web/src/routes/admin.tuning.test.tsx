import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TuningPage } from './admin.tuning';

const { useTuningDialsMock, updateDialMutateMock } = vi.hoisted(() => ({
  useTuningDialsMock: vi.fn(),
  updateDialMutateMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useTuningDials', () => ({ useTuningDials: useTuningDialsMock }));
vi.mock('../hooks/useUpdateTuningDial', () => ({ useUpdateTuningDial: () => ({ mutate: updateDialMutateMock }) }));

const DIALS = [
  { key: 'rerollCost', value: 5, default: 5, overridden: false },
  { key: 'boostRandomCost', value: 250, default: 100, overridden: true }
];

beforeEach(() => {
  useTuningDialsMock.mockReset();
  updateDialMutateMock.mockReset();
  useTuningDialsMock.mockReturnValue({ data: DIALS });
});

describe('TuningPage (admin)', () => {
  test('renders dials with default and override marker', () => {
    render(<TuningPage />);
    expect(screen.getByText('rerollCost')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('default 100')).toBeInTheDocument();
    expect(screen.getByText('override')).toBeInTheDocument();
  });

  describe('with window.prompt stubbed', () => {
    const originalPrompt = window.prompt;
    const originalAlert = window.alert;
    afterEach(() => {
      window.prompt = originalPrompt;
      window.alert = originalAlert;
    });

    test('editing a dial sends the typed value', () => {
      window.prompt = vi.fn().mockReturnValue('12');
      render(<TuningPage />);
      fireEvent.click(screen.getAllByText('Edit')[0]);
      expect(updateDialMutateMock).toHaveBeenCalledWith({ key: 'rerollCost', value: 12 });
    });

    test('a non-numeric or negative value never reaches the mutation', () => {
      window.alert = vi.fn();
      window.prompt = vi.fn().mockReturnValue('-3');
      render(<TuningPage />);
      fireEvent.click(screen.getAllByText('Edit')[0]);
      expect(updateDialMutateMock).not.toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalled();
    });
  });

  test('Clear appears only on overridden dials and sends null', () => {
    render(<TuningPage />);
    const clears = screen.getAllByText('Clear');
    expect(clears).toHaveLength(1); // boostRandomCost only
    fireEvent.click(clears[0]);
    expect(updateDialMutateMock).toHaveBeenCalledWith({ key: 'boostRandomCost', value: null });
  });
});
