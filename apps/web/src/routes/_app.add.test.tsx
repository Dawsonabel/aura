import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Add } from './_app.add';

const { useSuggestionsMock, addFriendMutateMock } = vi.hoisted(() => ({
  useSuggestionsMock: vi.fn(),
  addFriendMutateMock: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock('../hooks/useSuggestions', () => ({ useSuggestions: useSuggestionsMock }));
vi.mock('../hooks/useAddFriend', () => ({ useAddFriend: () => ({ mutate: addFriendMutateMock }) }));

const CONTACT = { id: 'usr_1', firstName: 'Alex', lastName: 'Kim', grade: '10th' };
const FOF = { id: 'usr_2', firstName: 'Bailey', lastName: 'Ray', grade: '11th' };

beforeEach(() => {
  useSuggestionsMock.mockReset();
  addFriendMutateMock.mockReset();
  useSuggestionsMock.mockReturnValue({ data: { contacts: [CONTACT], fof: [FOF] }, isLoading: false });
});

describe('Add+', () => {
  test('renders both sections with their respective rows', () => {
    render(<Add />);
    expect(screen.getByText('Contacts on Aura')).toBeInTheDocument();
    expect(screen.getByText('Alex Kim')).toBeInTheDocument();
    expect(screen.getByText('Friends of Friends')).toBeInTheDocument();
    expect(screen.getByText('Bailey Ray')).toBeInTheDocument();
  });

  test('search filters both sections by name', () => {
    render(<Add />);
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'alex' } });
    expect(screen.getByText('Alex Kim')).toBeInTheDocument();
    expect(screen.queryByText('Bailey Ray')).not.toBeInTheDocument();
    expect(screen.queryByText('Friends of Friends')).not.toBeInTheDocument(); // empty section is hidden entirely
  });

  test('Hide removes a row locally with no network call', () => {
    render(<Add />);
    const contactRow = screen.getByText('Alex Kim').closest('div.rounded.border') as HTMLElement;
    fireEvent.click(within(contactRow).getByText('HIDE'));
    expect(screen.queryByText('Alex Kim')).not.toBeInTheDocument();
    expect(addFriendMutateMock).not.toHaveBeenCalled();
  });

  test('Add calls the mutation with the user id', () => {
    render(<Add />);
    const contactRow = screen.getByText('Alex Kim').closest('div.rounded.border') as HTMLElement;
    fireEvent.click(within(contactRow).getByText('ADD'));
    expect(addFriendMutateMock).toHaveBeenCalledWith('usr_1');
  });
});
