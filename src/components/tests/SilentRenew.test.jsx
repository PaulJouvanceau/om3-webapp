import React from 'react';
import {render, waitFor, screen} from '@testing-library/react';
import {vi} from 'vitest';
import SilentRenew from '../SilentRenew';

// ── Hoisted mock variables ──────────────────────────────────────────────
const {mockUseOidc, mockSigninSilentCallback} = vi.hoisted(() => ({
    mockUseOidc: vi.fn(),
    mockSigninSilentCallback: vi.fn(),
}));

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('../../context/OidcAuthContext.tsx', () => ({
    useOidc: mockUseOidc,
}));

vi.mock('../../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import logger from '../../utils/logger.js'; // after mock

describe('SilentRenew', () => {
    const mockUserManager = {
        signinSilentCallback: mockSigninSilentCallback,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('render default processing message', () => {
        mockUseOidc.mockReturnValue({userManager: mockUserManager});
        render(<SilentRenew/>);
        expect(screen.getByText('Silent renew processing...')).toBeInTheDocument();
    });

    test('call signinSilentCallback on component mount', async () => {
        mockUseOidc.mockReturnValue({userManager: mockUserManager});
        render(<SilentRenew/>);
        await waitFor(() => {
            expect(mockSigninSilentCallback).toHaveBeenCalledTimes(1);
        });
    });

    test('log success when signinSilentCallback succeeds', async () => {
        mockUseOidc.mockReturnValue({userManager: mockUserManager});
        mockSigninSilentCallback.mockResolvedValue(undefined);
        render(<SilentRenew/>);
        await waitFor(() => {
            expect(logger.info).toHaveBeenCalledWith('Silent renew callback processed successfully');
        });
    });

    test('log warning if userManager is unavailable', async () => {
        mockUseOidc.mockReturnValue({userManager: null});
        render(<SilentRenew/>);
        await waitFor(() => {
            expect(logger.warn).toHaveBeenCalledWith(
                'UserManager or signinSilentCallback unavailable in silent renew context'
            );
        });
    });

    test('log warning if signinSilentCallback is not a function', async () => {
        mockUseOidc.mockReturnValue({
            userManager: {signinSilentCallback: 'not-a-function'},
        });
        render(<SilentRenew/>);
        await waitFor(() => {
            expect(logger.warn).toHaveBeenCalledWith(
                'UserManager or signinSilentCallback unavailable in silent renew context'
            );
        });
    });

    test('log error if signinSilentCallback fails', async () => {
        mockUseOidc.mockReturnValue({userManager: mockUserManager});
        const testError = new Error('Test error');
        mockSigninSilentCallback.mockRejectedValue(testError);
        render(<SilentRenew/>);
        await waitFor(() => {
            expect(logger.error).toHaveBeenCalledWith(
                'Error during signinSilentCallback:',
                testError
            );
        });
    });

    test('do not call signinSilentCallback if userManager changes', () => {
        const {rerender} = render(<SilentRenew/>);
        expect(mockSigninSilentCallback).toHaveBeenCalledTimes(1);
        // Simulate userManager change
        rerender(<SilentRenew/>);
        // Verify that signinSilentCallback is not called again
        expect(mockSigninSilentCallback).toHaveBeenCalledTimes(1);
    });
});
