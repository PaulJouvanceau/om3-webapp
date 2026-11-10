import {renderHook, act} from '@testing-library/react';
import {OidcProvider, useOidc, cleanupUserManager} from '../OidcAuthContext';
import {UserManager, Log} from 'oidc-client-ts';
import {vi, describe, test, expect, beforeEach} from 'vitest';

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
    stopSilentRenew: vi.fn(),
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
        (Log as unknown as { logger?: Console; level?: number }).logger = console;
        (Log as unknown as { logger?: Console; level?: number }).level = 0;
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

        expect(mockUserManagerInstance.stopSilentRenew).toHaveBeenCalledTimes(1);
        expect(mockUserManagerInstance.clearStaleState).toHaveBeenCalled();

        expect(UserManager).toHaveBeenCalledTimes(2);
        expect(result.current.userManager).toBe(mockUserManagerInstance);
    });

    test('recreateUserManager asked again with the same settings keeps the manager', () => {
        const settings = {
            authority: 'https://example.com',
            client_id: 'test-client',
            redirect_uri: 'https://example.com/callback',
        };
        const {result} = renderHook(() => useOidc(), {wrapper});
        act(() => {
            result.current.recreateUserManager(settings);
        });
        act(() => {
            result.current.recreateUserManager({...settings});
        });
        expect(UserManager).toHaveBeenCalledTimes(1);
        expect(mockUserManagerInstance.stopSilentRenew).not.toHaveBeenCalled();
    });

    test('cleanupUserManager stops the silent renewal and clears stale state', () => {
        const mockUserManager = {
            stopSilentRenew: vi.fn(),
            clearStaleState: vi.fn().mockResolvedValue(undefined),
        };
        cleanupUserManager(mockUserManager as unknown as UserManager);
        expect(mockUserManager.stopSilentRenew).toHaveBeenCalled();
        expect(mockUserManager.clearStaleState).toHaveBeenCalled();
    });

    test('cleanupUserManager does nothing if userManager is null', () => {
        cleanupUserManager(null);
        expect(mockUserManagerInstance.stopSilentRenew).not.toHaveBeenCalled();
        expect(mockUserManagerInstance.clearStaleState).not.toHaveBeenCalled();
    });

    test('cleanupUserManager logs a failure to stop the renewal, and clears stale state still', () => {
        const mockError = new Error('Stop failed');
        const userManagerFailingToStop = {
            stopSilentRenew: vi.fn().mockImplementation(() => {
                throw mockError;
            }),
            clearStaleState: vi.fn().mockResolvedValue(undefined),
        };
        cleanupUserManager(userManagerFailingToStop as unknown as UserManager);
        expect(logger.debug).toHaveBeenCalledWith('Error stopping the silent renewal:', mockError);
        expect(userManagerFailingToStop.clearStaleState).toHaveBeenCalled();
    });

    test('cleanupUserManager logs error when clearStaleState rejects', async () => {
        const mockError = new Error('Clear stale state failed');
        const userManagerWithFailingClear = {
            stopSilentRenew: vi.fn(),
            clearStaleState: vi.fn().mockRejectedValue(mockError),
        };
        cleanupUserManager(userManagerWithFailingClear as unknown as UserManager);
        await new Promise(process.nextTick);
        expect(logger.debug).toHaveBeenCalledWith('Error during clearStaleState:', mockError);
    });

    test('useEffect cleanup is called on unmount with userManager', () => {
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
        unmount();
        expect(mockUserManagerInstance.stopSilentRenew).toHaveBeenCalled();
        expect(mockUserManagerInstance.clearStaleState).toHaveBeenCalled();
    });

    test('useEffect cleanup handles null userManager on unmount', () => {
        const {unmount} = renderHook(() => useOidc(), {wrapper});
        unmount();
        expect(mockUserManagerInstance.stopSilentRenew).not.toHaveBeenCalled();
        expect(mockUserManagerInstance.clearStaleState).not.toHaveBeenCalled();
    });
});
