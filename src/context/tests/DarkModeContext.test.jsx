import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { DarkModeProvider, useDarkMode } from '../DarkModeContext';

// Helper component to consume the context
const TestConsumer = () => {
    const { isDarkMode, toggleDarkMode } = useDarkMode();
    return (
        <div>
            <span data-testid="mode">{isDarkMode ? 'dark' : 'light'}</span>
            <button onClick={toggleDarkMode}>Toggle</button>
        </div>
    );
};

// Component that uses the hook without a provider (for error test)
const UnwrappedConsumer = () => {
    useDarkMode();
    return null;
};

describe('DarkModeContext', () => {
    beforeEach(() => {
        localStorage.clear();
        // Mock classList methods
        document.documentElement.classList.add = jest.fn();
        document.documentElement.classList.remove = jest.fn();
        document.body.classList.add = jest.fn();
        document.body.classList.remove = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('provides default isDarkMode as false when localStorage is empty', () => {
        render(
            <DarkModeProvider>
                <TestConsumer />
            </DarkModeProvider>
        );
        expect(screen.getByTestId('mode').textContent).toBe('light');
    });

    test('reads initial isDarkMode from localStorage if present', () => {
        localStorage.setItem('darkMode', 'true');
        render(
            <DarkModeProvider>
                <TestConsumer />
            </DarkModeProvider>
        );
        expect(screen.getByTestId('mode').textContent).toBe('dark');
    });

    test('toggleDarkMode toggles isDarkMode and updates localStorage', () => {
        render(
            <DarkModeProvider>
                <TestConsumer />
            </DarkModeProvider>
        );

        const button = screen.getByText('Toggle');

        // Initial light mode
        expect(screen.getByTestId('mode').textContent).toBe('light');
        expect(localStorage.getItem('darkMode')).toBe('false');

        // Toggle to dark
        act(() => {
            button.click();
        });
        expect(screen.getByTestId('mode').textContent).toBe('dark');
        expect(localStorage.getItem('darkMode')).toBe('true');

        // Toggle back to light
        act(() => {
            button.click();
        });
        expect(screen.getByTestId('mode').textContent).toBe('light');
        expect(localStorage.getItem('darkMode')).toBe('false');
    });

    test('adds dark class to document.documentElement and document.body when dark mode is on', () => {
        render(
            <DarkModeProvider>
                <TestConsumer />
            </DarkModeProvider>
        );

        // Initially no dark class
        expect(document.documentElement.classList.add).not.toHaveBeenCalledWith('dark');
        expect(document.body.classList.add).not.toHaveBeenCalledWith('dark');

        // Toggle on
        act(() => {
            screen.getByText('Toggle').click();
        });

        expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
        expect(document.body.classList.add).toHaveBeenCalledWith('dark');
    });

    test('removes dark class from document.documentElement and document.body when dark mode is off', () => {
        // Start with dark mode true
        localStorage.setItem('darkMode', 'true');
        render(
            <DarkModeProvider>
                <TestConsumer />
            </DarkModeProvider>
        );

        jest.clearAllMocks();

        act(() => {
            screen.getByText('Toggle').click(); // now light
        });

        expect(document.documentElement.classList.remove).toHaveBeenCalledWith('dark');
        expect(document.body.classList.remove).toHaveBeenCalledWith('dark');
    });

    test('useDarkMode throws error when used outside DarkModeProvider', () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => {
            render(<UnwrappedConsumer />);
        }).toThrow('useDarkMode must be used within a DarkModeProvider');
        consoleError.mockRestore();
    });

    test('renders children correctly', () => {
        render(
            <DarkModeProvider>
                <div data-testid="child">Hello</div>
            </DarkModeProvider>
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });
});
