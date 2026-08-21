import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfiniteAuraOverlay } from './InfiniteAuraOverlay';

const { useAurasMock, activateInfiniteAuraMutateMock } = vi.hoisted(() => ({
  useAurasMock: vi.fn(),
  activateInfiniteAuraMutateMock: vi.fn()
}));

vi.mock('../hooks/useAuras', () => ({ useAuras: useAurasMock }));
vi.mock('../hooks/useActivateInfiniteAura', () => ({ useActivateInfiniteAura: () => ({ mutate: activateInfiniteAuraMutateMock, isError: false }) }));

beforeEach(() => {
  useAurasMock.mockReset();
  activateInfiniteAuraMutateMock.mockReset();
});

describe('InfiniteAuraOverlay', () => {
  test('shows the real count of locked auras, not a fabricated number', () => {
    useAurasMock.mockReturnValue({
      data: {
        auras: [
          { name: null, anonymous: false },
          { name: null, anonymous: false },
          { name: 'Sam Lee', anonymous: false }, // already flipped — not counted as "locked"
          { name: null, anonymous: true } // protected sender — never openable, so not a teaser either
        ]
      }
    });
    render(<InfiniteAuraOverlay onClose={vi.fn()} />);
    expect(screen.getByText(/2 people like you/)).toBeInTheDocument();
  });

  test('hides the teaser line when there are no locked auras', () => {
    useAurasMock.mockReturnValue({ data: { auras: [] } });
    render(<InfiniteAuraOverlay onClose={vi.fn()} />);
    expect(screen.queryByText(/people like you/)).not.toBeInTheDocument();
  });

  test('tapping the CTA activates Infinite Aura', () => {
    useAurasMock.mockReturnValue({ data: { auras: [] } });
    render(<InfiniteAuraOverlay onClose={vi.fn()} />);
    screen.getByText('Unlock Infinite Aura · $6.99/week').click();
    expect(activateInfiniteAuraMutateMock).toHaveBeenCalledWith(undefined, expect.any(Object));
  });
});
