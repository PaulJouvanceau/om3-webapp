import {renderHook, act} from '@testing-library/react';
import {OidcProvider, useOidc, cleanupUserManager} from '../OidcAuthContext';
import {UserManager, Log} from 'oidc-client-ts';
import {vi, describe, test, expect, beforeEach, afterEach} from 'vitest';

vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

const mockUserManagerInstance = {
    events: {
        removeUserLoaded: vi.fn(),
        removeUserUnloaded: vi.fn(),
        removeAccessTokenExpired: vi.fn(),
        removeAccessTokenExpiring: vi.fn(),
        removeSilentRenewError: vi.fn(),
    },
    clearStaleState: vi.fn().mockResolvedValue(undefined),
};

vi.mock('oidc-client-ts', () => ({
    UserManager: vi.fn().mockImplementation(() => mockUserManagerInstance),
    Log: {
        logger: console,
        level: 0,
        DEBUG: 3,
    },
}));

import logger from '../../utils/logger';

describe('OidcAuthContext', () => {
    const wrapper = ({children}: { children: React.ReactNode }) => (
        <OidcProvider>{children}</OidcProvider>
    );

    beforeEach(() => {
        vi.clearAllMocks();
        delete (window as any).oidcUserManager;
        (Log as unknown as { logger?: Console; level?: number }).logger = console;
        (Log as unknown as { logger?: Console; level?: number }).level = 0;
    });

    afterEach(() => {
        delete (window as any).oidcUserManager;
    });

    test('provides userManager context', () => {
        const {result} = renderHook(() => useOidc(), {wrapper});
        expect(result.current.userManager).toBeDefined();
        expect(result.current.recreateUserManager).toBeInstanceOf(Function);
        expect(result.current.isInitialized).toBe(false);
    });

    test('throws when used outside provider', () => {
        expect(() => {
            renderHook(() => useOidc());
        }).toThrow('useOidc must be used within an OidcProvider');
    });

    test('recreateUserManager updates userManager with new settings, sets global reference, and configures Log', () => {
        const settings = {
            authority: 'https://example.com',
            client_id: 'test-client',
            redirect_uri: 'https://example.com/callback',
        };
        const {result} = renderHook(() => useOidc(), {wrapper});

        act(() => {
            result.current.recreateUserManager(settings);
        });

        expect(logger.info).toHaveBeenCalledWith(
            'Recreating UserManager with settings:',
            settings
        );

        const logMock = Log as unknown as { logger?: Console; level?: number; DEBUG?: number };
        expect(logMock.logger).toBe(console);
        expect(logMock.level).toBe(logMock.DEBUG);

        expect(UserManager).toHaveBeenCalledWith(settings);
        expect((window as any).oidcUserManager).toBe(mockUserManagerInstance);

        expect(result.current.userManager).toBe(mockUserManagerInstance);
        expect(result.current.isInitialized).toBe(true);
    });

    test('recreateUserManager handles error when configuring Log', () => {
        const originalLog = Log as unknown as { logger?: Console; level?: number; DEBUG?: number };
        const originalLogger = originalLog.logger;
        const originalLevel = originalLog.level;

        Object.defineProperty(Log, 'logger', {
            configurable: true,
            set() {
                throw new Error('Cannot set logger');
            },
            get() {
                return originalLogger;
            },
        });

        const settings = {
            authority: 'https://example.com',
            client_id: 'test-client',
            redirect_uri: 'https://example.com/callback',
        };

        const {result} = renderHook(() => useOidc(), {wrapper});

        act(() => {
            result.current.recreateUserManager(settings);
        });

        expect(logger.debug).toHaveBeenCalledWith(
            'Failed to configure oidc-client-ts Log:',
            expect.any(Error)
        );

        Object.defineProperty(Log, 'logger', {
            configurable: true,
            value: originalLogger,
            writable: true,
        });
        originalLog.level = originalLevel;

        expect(UserManager).toHaveBeenCalledWith(settings);
        expect(result.current.userManager).toBe(mockUserManagerInstance);
        expect(result.current.isInitialized).toBe(true);
    });

    test('recreateUserManager cleans up previous userManager before creating new one', () => {
        const settings1 = {
            authority: 'https://one.example.com',
            client_id: 'client1',
            redirect_uri: 'https://one.example.com/callback',
        };
        const settings2 = {
            authority: 'https://two.example.com',
            client_id: 'client2',
            redirect_uri: 'https://two.example.com/callback',
        };

        const {result} = renderHook(() => useOidc(), {wrapper});

        act(() => {
            result.current.recreateUserManager(settings1);
        });
        expect(result.current.userManager).toBeDefined();

        act(() => {
            result.current.recreateUserManager(settings2);
        });

        expect(mockUserManagerInstance.events.removeUserLoaded).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.events.removeUserUnloaded).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.events.removeAccessTokenExpired).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.events.removeAccessTokenExpiring).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.events.removeSilentRenewError).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.clearStaleState).toHaveBeenCalled();

        expect(UserManager).toHaveBeenCalledTimes(2);
        expect(result.current.userManager).toBe(mockUserManagerInstance);
    });

    test('handles failure when setting window.oidcUserManager', () => {
        const settings = {
            authority: 'https://example.com',
            client_id: 'test-client',
            redirect_uri: 'https://example.com/callback',
        };

        const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'oidcUserManager');
        Object.defineProperty(window, 'oidcUserManager', {
            configurable: true,
            set() {
                throw new Error('Assignment failed');
            },
            get() {
                return undefined;
            },
        });

        const {result} = renderHook(() => useOidc(), {wrapper});
        act(() => {
            result.current.recreateUserManager(settings);
        });

        expect(logger.debug).toHaveBeenCalledWith(
            'Unable to set window.oidcUserManager:',
            expect.any(Error)
        );

        if (originalDescriptor) {
            Object.defineProperty(window, 'oidcUserManager', originalDescriptor);
        } else {
            delete (window as any).oidcUserManager;
        }

        expect(result.current.userManager).toBe(mockUserManagerInstance);
        expect(result.current.isInitialized).toBe(true);
    });

    test('cleanupUserManager removes event listeners and clears stale state', () => {
        const mockUserManager = {
            events: {
                removeUserLoaded: vi.fn(),
                removeUserUnloaded: vi.fn(),
                removeAccessTokenExpired: vi.fn(),
                removeAccessTokenExpiring: vi.fn(),
                removeSilentRenewError: vi.fn(),
            },
            clearStaleState: vi.fn().mockResolvedValue(undefined),
        };
        cleanupUserManager(mockUserManager as unknown as UserManager);
        expect(mockUserManager.events.removeUserLoaded).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManager.events.removeUserUnloaded).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManager.events.removeAccessTokenExpired).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManager.events.removeAccessTokenExpiring).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManager.events.removeSilentRenewError).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManager.clearStaleState).toHaveBeenCalled();
    });

    test('cleanupUserManager does nothing if userManager is null', () => {
        cleanupUserManager(null);
        expect(mockUserManagerInstance.events.removeUserLoaded).not.toHaveBeenCalled();
        expect(mockUserManagerInstance.clearStaleState).not.toHaveBeenCalled();
    });

    test('cleanupUserManager handles missing event methods gracefully', () => {
        const userManagerWithMissingEvents = {
            events: {
                removeUserUnloaded: vi.fn(),
                removeAccessTokenExpired: vi.fn(),
                removeAccessTokenExpiring: vi.fn(),
                removeSilentRenewError: vi.fn(),
            },
            clearStaleState: vi.fn().mockResolvedValue(undefined),
        };
        expect(() => {
            cleanupUserManager(userManagerWithMissingEvents as unknown as UserManager);
        }).not.toThrow();
        expect(userManagerWithMissingEvents.events.removeUserUnloaded).toHaveBeenCalled();
        expect(userManagerWithMissingEvents.clearStaleState).toHaveBeenCalled();
    });

    test('cleanupUserManager catches errors from event removal', () => {
        const mockError = new Error('Removal failed');
        const userManagerWithFailingEvents = {
            events: {
                removeUserLoaded: vi.fn().mockImplementation(() => {
                    throw mockError;
                }),
                removeUserUnloaded: vi.fn(),
                removeAccessTokenExpired: vi.fn(),
                removeAccessTokenExpiring: vi.fn(),
                removeSilentRenewError: vi.fn(),
            },
            clearStaleState: vi.fn().mockResolvedValue(undefined),
        };
        cleanupUserManager(userManagerWithFailingEvents as unknown as UserManager);
        expect(logger.debug).toHaveBeenCalledWith('Error removing UserManager listener:', mockError);
        expect(userManagerWithFailingEvents.clearStaleState).toHaveBeenCalled();
    });

    test('cleanupUserManager logs error when clearStaleState rejects', async () => {
        const mockError = new Error('Clear stale state failed');
        const userManagerWithFailingClear = {
            events: {
                removeUserLoaded: vi.fn(),
                removeUserUnloaded: vi.fn(),
                removeAccessTokenExpired: vi.fn(),
                removeAccessTokenExpiring: vi.fn(),
                removeSilentRenewError: vi.fn(),
            },
            clearStaleState: vi.fn().mockRejectedValue(mockError),
        };
        cleanupUserManager(userManagerWithFailingClear as unknown as UserManager);
        await new Promise(process.nextTick);
        expect(logger.debug).toHaveBeenCalledWith('Error during clearStaleState:', mockError);
    });

    test('useEffect cleanup is called on unmount with userManager and deletes global reference', () => {
        const settings = {
            authority: 'https://example.com',
            client_id: 'test-client',
            redirect_uri: 'https://example.com/callback',
        };
        const {result, unmount} = renderHook(() => useOidc(), {wrapper});
        act(() => {
            result.current.recreateUserManager(settings);
        });
        expect(result.current.userManager).toBe(mockUserManagerInstance);
        expect((window as any).oidcUserManager).toBe(mockUserManagerInstance);
        unmount();
        expect(mockUserManagerInstance.events.removeUserLoaded).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.events.removeUserUnloaded).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.events.removeAccessTokenExpired).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.events.removeAccessTokenExpiring).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.events.removeSilentRenewError).toHaveBeenCalledWith(expect.any(Function));
        expect(mockUserManagerInstance.clearStaleState).toHaveBeenCalled();
        expect((window as any).oidcUserManager).toBeUndefined();
    });

    test('useEffect cleanup handles null userManager on unmount', () => {
        const {unmount} = renderHook(() => useOidc(), {wrapper});
        unmount();
        expect(mockUserManagerInstance.events.removeUserLoaded).not.toHaveBeenCalled();
        expect(mockUserManagerInstance.clearStaleState).not.toHaveBeenCalled();
        expect((window as any).oidcUserManager).toBeUndefined();
    });
});
