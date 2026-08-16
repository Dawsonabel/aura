import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GodModeOverlay } from './GodModeOverlay';

const { useFlamesMock, activateGodModeMutateMock } = vi.hoisted(() => ({
  useFlamesMock: vi.fn(),
  activateGodModeMutateMock: vi.fn()
}));

vi.mock('../hooks/useFlames', () => ({ useFlames: useFlamesMock }));
vi.mock('../hooks/useActivateGodMode', () => ({ useActivateGodMode: () => ({ mutate: activateGodModeMutateMock, isError: false }) }));

beforeEach(() => {
  useFlamesMock.mockReset();
  activateGodModeMutateMock.mockReset();
});

describe('GodModeOverlay', () => {
  test('shows the real count of locked flames, not a fabricated number', () => {
    useFlamesMock.mockReturnValue({
      data: {
        flames: [
          { revealed: false, godMode: false },
          { revealed: false, godMode: false },
          { revealed: true, godMode: false } // already revealed — not counted as "locked"
        ]
      }
    });
    render(<GodModeOverlay onClose={vi.fn()} />);
    expect(screen.getByText(/2 people like you/)).toBeInTheDocument();
  });

  test('hides the teaser line when there are no locked flames', () => {
    useFlamesMock.mockReturnValue({ data: { flames: [] } });
    render(<GodModeOverlay onClose={vi.fn()} />);
    expect(screen.queryByText(/people like you/)).not.toBeInTheDocument();
  });

  test('tapping the CTA activates God Mode', () => {
    useFlamesMock.mockReturnValue({ data: { flames: [] } });
    render(<GodModeOverlay onClose={vi.fn()} />);
    screen.getByText('Unlock God Mode · $6.99/week').click();
    expect(activateGodModeMutateMock).toHaveBeenCalledWith(undefined, expect.any(Object));
  });
});
