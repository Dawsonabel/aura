import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShopOverlay } from './ShopOverlay';

const { useMeMock, useSuggestionsMock, boostRandomMutateMock, boostCrushMutateMock } = vi.hoisted(() => ({
  useMeMock: vi.fn(),
  useSuggestionsMock: vi.fn(),
  boostRandomMutateMock: vi.fn(),
  boostCrushMutateMock: vi.fn()
}));

vi.mock('../hooks/useMe', () => ({ useMe: useMeMock }));
vi.mock('../hooks/useSuggestions', () => ({ useSuggestions: useSuggestionsMock }));
vi.mock('../hooks/useBoostRandom', () => ({ useBoostRandom: () => ({ mutate: boostRandomMutateMock, isError: false }) }));
vi.mock('../hooks/useBoostCrush', () => ({ useBoostCrush: () => ({ mutate: boostCrushMutateMock, isError: false }) }));

beforeEach(() => {
  useMeMock.mockReset();
  useSuggestionsMock.mockReset();
  boostRandomMutateMock.mockReset();
  boostCrushMutateMock.mockReset();
  useMeMock.mockReturnValue({ data: { coins: 150 } });
  useSuggestionsMock.mockReturnValue({ data: { contacts: [{ id: 'usr_1', firstName: 'Alex', lastName: 'Kim' }], fof: [] } });
});

describe('ShopOverlay', () => {
  test('shows the current balance and the two shop cards', () => {
    render(<ShopOverlay onClose={vi.fn()} />);
    expect(screen.getByText('🪙 150')).toBeInTheDocument();
    expect(screen.getByText('100 🪙')).toBeInTheDocument();
    expect(screen.getByText('300 🪙')).toBeInTheDocument();
  });

  test('buying the random boost calls boostRandom', () => {
    render(<ShopOverlay onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('100 🪙').closest('button')!);
    expect(boostRandomMutateMock).toHaveBeenCalled();
  });

  test('tapping the crush card opens the crush picker, and picking someone calls boostCrush', () => {
    render(<ShopOverlay onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('300 🪙').closest('button')!);
    expect(screen.getByText('Pick your crush')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Alex Kim'));
    expect(boostCrushMutateMock).toHaveBeenCalledWith('usr_1', expect.any(Object));
  });
});
