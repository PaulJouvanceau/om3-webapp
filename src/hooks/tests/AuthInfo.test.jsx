import {renderHook, act} from '@testing-library/react';
import useAuthInfo from '../AuthInfo';
import {URL_AUTH_INFO} from '../../config/apiPath';
import logger from '../../utils/logger.js';

vi.mock('../../config/apiPath', () => ({
    URL_AUTH_INFO: 'http://mock-api/auth-info',
}));

describe('useAuthInfo hook', () => {
    let originalFetch;
    let loggerErrorSpy;
    beforeEach(() => {
        originalFetch = global.fetch;
        loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        loggerErrorSpy.mockClear();
    });
    afterEach(() => {
        global.fetch = originalFetch;
        loggerErrorSpy.mockRestore();
    });
    test('returns undefined initially', () => {
        global.fetch = jest.fn();
        const {result} = renderHook(() => useAuthInfo());
        expect(result.current).toBeUndefined();
    });
    test('fetches and sets authInfo on successful response', async () => {
        const mockData = {user: 'testuser', role: 'admin'};
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue(mockData),
        });
        const {result} = renderHook(() => useAuthInfo());
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current).toEqual(mockData);
        expect(global.fetch).toHaveBeenCalledWith(URL_AUTH_INFO);
    });
    test('keeps authInfo undefined and logs error on fetch failure', async () => {
        const error = new Error('Network error');
        global.fetch = jest.fn().mockRejectedValue(error);
        const {result} = renderHook(() => useAuthInfo());
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current).toBeUndefined();
        expect(loggerErrorSpy).toHaveBeenCalledWith(error);
    });
    test('keeps authInfo undefined and logs error on JSON parsing failure', async () => {
        const error = new Error('Invalid JSON');
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockRejectedValue(error),
        });
        const {result} = renderHook(() => useAuthInfo());
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current).toBeUndefined();
        expect(loggerErrorSpy).toHaveBeenCalledWith(error);
    });
    test('fetch is called only once on mount', async () => {
        const mockData = {user: 'testuser'};
        const fetchMock = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue(mockData),
        });
        global.fetch = fetchMock;
        const {result, rerender} = renderHook(() => useAuthInfo());
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current).toEqual(mockData);
        rerender();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    test('does not update state after unmount', async () => {
        const mockData = {user: 'testuser'};
        let resolveJson;
        const jsonPromise = new Promise((res) => (resolveJson = res));
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn(() => jsonPromise),
        });
        const {result, unmount} = renderHook(() => useAuthInfo());
        unmount();
        await act(async () => {
            resolveJson(mockData);
            await jsonPromise;
        });
        expect(result.current).toBeUndefined();
    });
    test('does not log error after unmount on fetch failure', async () => {
        const error = new Error('Network error');
        let rejectFetch;
        const fetchPromise = new Promise((_, rej) => (rejectFetch = rej));
        global.fetch = jest.fn(() => fetchPromise);
        const {result, unmount} = renderHook(() => useAuthInfo());
        unmount();
        await act(async () => {
            rejectFetch(error);
            await Promise.resolve();
        });
        expect(result.current).toBeUndefined();
        expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
    test('does not log error after unmount on JSON parsing failure', async () => {
        const error = new Error('Invalid JSON');
        let rejectJson;
        const jsonPromise = new Promise((_, rej) => (rejectJson = rej));
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn(() => jsonPromise),
        });
        const {result, unmount} = renderHook(() => useAuthInfo());
        unmount();
        await act(async () => {
            rejectJson(error);
            await Promise.resolve();
        });
        expect(result.current).toBeUndefined();
        expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
    test('logs unhandled error if error occurs during error handling', async () => {
        const networkError = new Error('Network error');
        const handlingError = new Error('Error in error handler');
        loggerErrorSpy.mockImplementationOnce(() => { throw handlingError; });
        global.fetch = jest.fn().mockRejectedValue(networkError);
        const {result} = renderHook(() => useAuthInfo());
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current).toBeUndefined();
        expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
        expect(loggerErrorSpy.mock.calls[0][0]).toEqual(networkError);
        expect(loggerErrorSpy.mock.calls[1][0]).toBe("Unhandled error in fetchData:");
        expect(loggerErrorSpy.mock.calls[1][1]).toEqual(handlingError);
    });
});
