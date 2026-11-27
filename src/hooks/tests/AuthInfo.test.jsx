import {renderHook, act} from '@testing-library/react';
import {vi, describe, test, expect, beforeEach, afterEach} from 'vitest';
import useAuthInfo, {RETRY_DELAYS, resetAuthInfo, useAuthInfoState} from '../AuthInfo';
import {URL_AUTH_INFO} from '../../config/apiPath';
import logger from '../../utils/logger.js';

vi.mock('../../config/apiPath', () => ({
    URL_AUTH_INFO: 'http://mock-api/auth-info',
}));

const ok = (data) => ({ok: true, status: 200, json: vi.fn().mockResolvedValue(data)});
const notOk = (status) => ({ok: false, status, statusText: 'Service Unavailable', json: vi.fn().mockResolvedValue({title: 'down'})});
/** The promises of a read settled, and the renders after them. */
const settle = () => act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
});
/** The delay before a new read gone by. */
const wait = (ms) => act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
});

describe('useAuthInfo', () => {
    const info = {methods: ['basic'], openid: {issuer: 'https://idp', client_id: 'om3'}};
    let originalFetch;

    beforeEach(() => {
        vi.useFakeTimers();
        resetAuthInfo();
        originalFetch = global.fetch;
        vi.spyOn(logger, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        global.fetch = originalFetch;
        vi.useRealTimers();
        vi.restoreAllMocks();
        resetAuthInfo();
    });

    test('undefined until read, then the methods the cluster advertises', async () => {
        global.fetch = vi.fn().mockResolvedValue(ok(info));
        const {result} = renderHook(() => useAuthInfo());
        expect(result.current).toBeUndefined();
        await settle();
        expect(result.current).toEqual(info);
        expect(global.fetch).toHaveBeenCalledWith(URL_AUTH_INFO);
    });

    test('a read failed at the load of the page: tried again a little later, read then', async () => {
        global.fetch = vi.fn()
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce(ok(info));
        const {result} = renderHook(() => useAuthInfoState());
        await settle();
        expect(result.current).toEqual({info: undefined, failed: true});
        // Not before its delay.
        await wait(RETRY_DELAYS[0] - 1);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        await wait(1);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        // The next, a longer delay.
        await wait(RETRY_DELAYS[1]);
        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(result.current).toEqual({info, failed: false});
        // Read, not read again.
        await wait(RETRY_DELAYS.at(-1) * 2);
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('an answer not ok, a daemon starting: not taken for the methods, tried again', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce(notOk(503)).mockResolvedValueOnce(ok(info));
        const {result} = renderHook(() => useAuthInfoState());
        await settle();
        expect(result.current).toEqual({info: undefined, failed: true});
        await wait(RETRY_DELAYS[0]);
        expect(result.current.info).toEqual(info);
    });

    test('the delays grow up to the last, then repeat it', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('down'));
        renderHook(() => useAuthInfo());
        await settle();
        for (const [i, delay] of [...RETRY_DELAYS, RETRY_DELAYS.at(-1)].entries()) {
            await wait(delay);
            expect(global.fetch).toHaveBeenCalledTimes(i + 2);
        }
    });

    test('the browser online again: tried again at once, not after its delay', async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok(info));
        const {result} = renderHook(() => useAuthInfo());
        await settle();
        await act(async () => {
            window.dispatchEvent(new Event('online'));
        });
        await settle();
        expect(result.current).toEqual(info);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('read once for all who ask: the app, the sign-in choice, the return from the provider', async () => {
        global.fetch = vi.fn().mockResolvedValue(ok(info));
        const app = renderHook(() => useAuthInfo());
        const choice = renderHook(() => useAuthInfo());
        await settle();
        expect(app.result.current).toEqual(info);
        expect(choice.result.current).toEqual(info);
        // Asked again later, given at once.
        const callback = renderHook(() => useAuthInfo());
        expect(callback.result.current).toEqual(info);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('no one asking any more: not tried again; asked again, read anew', async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(ok(info));
        const {unmount} = renderHook(() => useAuthInfo());
        await settle();
        unmount();
        await wait(RETRY_DELAYS.at(-1) * 2);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const {result} = renderHook(() => useAuthInfo());
        await settle();
        expect(result.current).toEqual(info);
    });
});
