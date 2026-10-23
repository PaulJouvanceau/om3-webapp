import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {actionRequest, postAction} from '../objectActions';
import {clearConfigStamps, recordConfigWrite} from '../../app/config-stamps';
import {trackWrite} from '../../app/action-tracker';

const written = (stamp) => new Response(null, {status: 200, headers: stamp ? {'OM-Last-Modified': stamp} : {}});

describe('the request of an action', () => {
    afterEach(() => clearConfigStamps());

    test('no option, the address alone, as before', () => {
        expect(actionRequest({path: 'ns1/svc/web', action: 'switch'}))
            .toEqual({url: '/api/object/path/ns1/svc/web/action/switch'});
        expect(actionRequest({path: 'ns1/svc/web', action: 'start', node: 'n1'}))
            .toEqual({url: '/api/node/name/n1/instance/path/ns1/svc/web/action/start'});
    });

    test('the object switch to a node, live, in its json body', () => {
        expect(actionRequest({path: 'ns1/svc/web', action: 'switch', options: {destination: 'n2', live: true}})).toEqual({
            url: '/api/object/path/ns1/svc/web/action/switch',
            body: JSON.stringify({destination: ['n2'], live: true}),
        });
    });

    test('the options of a resource action after its rid', () => {
        expect(actionRequest({path: 'ns1/svc/web', action: 'start', node: 'n1', rid: 'fs#1,fs#2', options: {force: true}}))
            .toEqual({url: '/api/node/name/n1/instance/path/ns1/svc/web/action/start?rid=fs%231%2Cfs%232&force=true'});
    });

    test('the cluster object takes none: its freeze is the cluster\'s', () => {
        expect(actionRequest({path: 'root/ccfg/cluster', action: 'freeze', options: {force: true}}))
            .toEqual({url: '/api/cluster/action/freeze'});
    });

    test('an instance action asks for the configuration last written here, the object and a refresh do not', () => {
        recordConfigWrite('ns1/svc/web', written('2026-10-23T09:00:00.123456789Z'));
        expect(actionRequest({path: 'ns1/svc/web', action: 'start', node: 'n1', options: {force: true}}).url)
            .toBe('/api/node/name/n1/instance/path/ns1/svc/web/action/start?force=true&config_updated_at=2026-10-23T09%3A00%3A00.123456789Z');
        expect(actionRequest({path: 'ns1/svc/web', action: 'status', node: 'n1'}).url)
            .toBe('/api/node/name/n1/instance/path/ns1/svc/web/action/status');
        expect(actionRequest({path: 'ns1/svc/web', action: 'start'}).url)
            .toBe('/api/object/path/ns1/svc/web/action/start');
        // Another object written nothing: asks nothing.
        expect(actionRequest({path: 'ns1/svc/db', action: 'start', node: 'n1'}).url)
            .toBe('/api/node/name/n1/instance/path/ns1/svc/db/action/start');
    });
});

describe('the configuration written, kept for the actions that follow', () => {
    afterEach(() => clearConfigStamps());

    test('from the answer of a write tracked; an older one does not replace it', async () => {
        const info = {action: 'config', subject: 'ns1/svc/web', label: 'config', path: 'ns1/svc/web'};
        await trackWrite(written('2026-10-23T09:00:02Z'), info, async () => '');
        await trackWrite(written('2026-10-23T09:00:01Z'), info, async () => '');
        expect(actionRequest({path: 'ns1/svc/web', action: 'stop', node: 'n1'}).url)
            .toContain('config_updated_at=2026-10-23T09%3A00%3A02Z');
    });

    test('a write refused, or answered without the time, keeps nothing', async () => {
        const info = {action: 'config', subject: 'ns1/svc/web', label: 'config', path: 'ns1/svc/web'};
        await trackWrite(new Response(null, {status: 403, headers: {'OM-Last-Modified': '2026-10-23T09:00:00Z'}}), info, async () => 'no');
        await trackWrite(written(), info, async () => '');
        expect(actionRequest({path: 'ns1/svc/web', action: 'stop', node: 'n1'}).url).not.toContain('config_updated_at');
    });
});

describe('postAction', () => {
    beforeEach(() => {
        localStorage.setItem('authToken', 'tok');
        global.fetch = vi.fn().mockResolvedValue(new Response(null, {status: 204}));
    });
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.removeItem('authToken');
    });

    test('posts the body of the options as json', async () => {
        await postAction({path: 'ns1/svc/web', action: 'switch', options: {destination: 'n2'}});
        expect(global.fetch).toHaveBeenCalledWith('/api/object/path/ns1/svc/web/action/switch', {
            method: 'POST',
            headers: {Authorization: 'Bearer tok', 'Content-Type': 'application/json'},
            body: JSON.stringify({destination: ['n2'], live: false}),
        });
    });

    test('without one, no body, as before', async () => {
        await postAction({path: 'ns1/svc/web', action: 'start', node: 'n1', options: {}});
        expect(global.fetch).toHaveBeenCalledWith('/api/node/name/n1/instance/path/ns1/svc/web/action/start', {
            method: 'POST',
            headers: {Authorization: 'Bearer tok'},
        });
    });
});
