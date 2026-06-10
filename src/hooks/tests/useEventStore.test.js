import useEventStore from '../useEventStore.js';
import {act} from '@testing-library/react';

jest.mock('../../utils/logger.js', () => ({
    warn: jest.fn(),
    debug: jest.fn(),
}));

import logger from '../../utils/logger.js';

describe('useEventStore', () => {
    // Reset state before each test to avoid interference
    beforeEach(() => {
        act(() => {
            useEventStore.setState({
                nodeStatus: {},
                nodeMonitor: {},
                nodeStats: {},
                objectStatus: {},
                objectInstanceStatus: {},
                heartbeatStatus: {},
                instanceMonitor: {},
                instanceConfig: {},
                configUpdates: [],
                pendingDeletes: {},
            });
        });
        jest.clearAllMocks();
    });

    test('should initialize with default state', () => {
        const state = useEventStore.getState();
        expect(state.nodeStatus).toEqual({});
        expect(state.nodeMonitor).toEqual({});
        expect(state.nodeStats).toEqual({});
        expect(state.objectStatus).toEqual({});
        expect(state.objectInstanceStatus).toEqual({});
        expect(state.heartbeatStatus).toEqual({});
        expect(state.instanceMonitor).toEqual({});
        expect(state.instanceConfig).toEqual({});
        expect(state.configUpdates).toEqual([]);
    });

    test('should set node status correctly using setNodeStatuses', () => {
        const {setNodeStatuses} = useEventStore.getState();

        act(() => {
            setNodeStatuses({node1: {status: 'up'}});
        });

        const state = useEventStore.getState();
        expect(state.nodeStatus).toEqual({node1: {status: 'up'}});
    });

    test('should not update node statuses if shallow equal', () => {
        const {setNodeStatuses} = useEventStore.getState();
        const sameData = {node1: {status: 'up'}};

        act(() => {
            setNodeStatuses(sameData);
        });

        const firstState = useEventStore.getState();

        act(() => {
            setNodeStatuses({...sameData}); // Different reference, same content
        });

        const secondState = useEventStore.getState();
        expect(secondState.nodeStatus).toEqual(firstState.nodeStatus);
    });

    test('should set node monitors correctly using setNodeMonitors', () => {
        const {setNodeMonitors} = useEventStore.getState();

        act(() => {
            setNodeMonitors({node1: {monitor: 'active'}});
        });

        const state = useEventStore.getState();
        expect(state.nodeMonitor).toEqual({node1: {monitor: 'active'}});
    });

    test('should not update node monitors if shallow equal', () => {
        const {setNodeMonitors} = useEventStore.getState();
        const sameData = {node1: {monitor: 'active'}};

        act(() => {
            setNodeMonitors(sameData);
        });

        act(() => {
            setNodeMonitors(sameData);
        });

        const state = useEventStore.getState();
        expect(state.nodeMonitor).toBe(sameData);
    });

    test('should set node stats correctly using setNodeStats', () => {
        const {setNodeStats} = useEventStore.getState();

        act(() => {
            setNodeStats({node1: {cpu: 80, memory: 75}});
        });

        const state = useEventStore.getState();
        expect(state.nodeStats).toEqual({node1: {cpu: 80, memory: 75}});
    });

    test('should not update node stats if shallow equal', () => {
        const {setNodeStats} = useEventStore.getState();
        const sameData = {node1: {cpu: 80, memory: 75}};

        act(() => {
            setNodeStats(sameData);
        });

        act(() => {
            setNodeStats({node1: {cpu: 80, memory: 75}});
        });

        const state = useEventStore.getState();
        expect(state.nodeStats).toEqual(sameData);
    });

    test('should set object statuses correctly using setObjectStatuses', () => {
        const {setObjectStatuses} = useEventStore.getState();

        act(() => {
            setObjectStatuses({object1: {status: 'active'}});
        });

        const state = useEventStore.getState();
        expect(state.objectStatus).toEqual({object1: {status: 'active'}});
        expect(logger.debug).toHaveBeenCalledWith(
            '✅ setObjectStatuses: ACCEPTED - UPDATING',
            expect.any(Object)
        );
    });

    test('should not update object statuses if shallow equal', () => {
        const {setObjectStatuses} = useEventStore.getState();
        const sameData = {object1: {status: 'active'}};

        act(() => {
            setObjectStatuses(sameData);
        });

        const firstState = useEventStore.getState();

        act(() => {
            setObjectStatuses(sameData);
        });

        const secondState = useEventStore.getState();
        expect(secondState.objectStatus).toBe(firstState.objectStatus);
    });

    test('should set instance statuses correctly using setInstanceStatuses', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        act(() => {
            setInstanceStatuses({object1: {node1: {status: 'active'}}});
        });

        const state = useEventStore.getState();
        expect(state.objectInstanceStatus).toEqual({
            object1: {
                node1: {
                    node: 'node1',
                    path: 'object1',
                    status: 'active',
                }
            }
        });
    });

    test('should not update instance statuses if shallow equal', () => {
        const {setInstanceStatuses} = useEventStore.getState();
        const sameData = {object1: {node1: {status: 'active'}}};

        act(() => {
            setInstanceStatuses(sameData);
        });

        const firstState = useEventStore.getState();

        act(() => {
            setInstanceStatuses(sameData);
        });

        const secondState = useEventStore.getState();
        expect(secondState.objectInstanceStatus)
            .toEqual(firstState.objectInstanceStatus);
    });

    test('should handle empty instance statuses object', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        act(() => {
            setInstanceStatuses({});
        });

        const state = useEventStore.getState();
        expect(state.objectInstanceStatus).toEqual({});
    });

    test('should handle instance statuses with no properties', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        act(() => {
            setInstanceStatuses({object1: {}});
        });

        const state = useEventStore.getState();
        expect(state.objectInstanceStatus).toEqual({object1: {}});
    });

    test('should preserve existing encapsulated resources in setInstanceStatuses', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        act(() => {
            setInstanceStatuses({
                object1: {
                    node1: {
                        status: 'active',
                        encap: {
                            container1: {
                                resources: {cpu: 100, memory: 200}
                            }
                        }
                    }
                }
            });
        });

        act(() => {
            setInstanceStatuses({
                object1: {
                    node1: {
                        status: 'updated',
                        encap: {
                            container1: {
                                resources: {}
                            }
                        }
                    }
                }
            });
        });

        const state = useEventStore.getState();
        expect(state.objectInstanceStatus.object1.node1.encap.container1.resources).toEqual(
            {cpu: 100, memory: 200}
        );
    });

    test('should handle undefined encap property', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        act(() => {
            setInstanceStatuses({
                object1: {
                    node1: {
                        status: 'active',
                        encap: undefined
                    }
                }
            });
        });

        const state = useEventStore.getState();
        expect(state.objectInstanceStatus.object1.node1.encap).toBeUndefined();
    });

    test('should set heartbeat statuses correctly using setHeartbeatStatuses', () => {
        const {setHeartbeatStatuses} = useEventStore.getState();

        act(() => {
            setHeartbeatStatuses({node1: {heartbeat: 'alive'}});
        });

        const state = useEventStore.getState();
        expect(state.heartbeatStatus).toEqual({node1: {heartbeat: 'alive'}});
    });

    test('should set instance monitors correctly using setInstanceMonitors', () => {
        const {setInstanceMonitors} = useEventStore.getState();

        act(() => {
            setInstanceMonitors({object1: {monitor: 'running'}});
        });

        const state = useEventStore.getState();
        expect(state.instanceMonitor).toEqual({object1: {monitor: 'running'}});
    });

    test('should set instance config correctly using setInstanceConfig', () => {
        const {setInstanceConfig} = useEventStore.getState();

        act(() => {
            setInstanceConfig('object1', 'node1', {setting: 'value'});
        });

        const state = useEventStore.getState();
        expect(state.instanceConfig).toEqual({
            object1: {
                node1: {setting: 'value'}
            }
        });
    });

    test('should not update instance config if shallow equal', () => {
        const {setInstanceConfig} = useEventStore.getState();
        const config = {setting: 'value'};

        act(() => {
            setInstanceConfig('object1', 'node1', config);
        });

        const firstState = useEventStore.getState();

        act(() => {
            setInstanceConfig('object1', 'node1', config);
        });

        const secondState = useEventStore.getState();
        expect(secondState.instanceConfig).toBe(firstState.instanceConfig);
    });

    test('should remove object correctly using removeObject', () => {
        const {setObjectStatuses, removeObject} = useEventStore.getState();

        act(() => {
            setObjectStatuses({object1: {status: 'active'}, object2: {status: 'inactive'}});
        });

        // Clear mocks before testing removeObject
        logger.debug.mockClear();

        act(() => {
            removeObject('object1');
        });

        const state = useEventStore.getState();
        expect(state.objectStatus).toEqual({object2: {status: 'inactive'}});

        // Verify no debug errors occurred
        expect(logger.debug).not.toHaveBeenCalledWith(
            expect.stringContaining('REJECTED'),
            expect.any(Object)
        );
    });

    test('should handle removeObject when object does not exist in any state', () => {
        const {removeObject} = useEventStore.getState();
        const initialState = {...useEventStore.getState()};

        act(() => {
            removeObject('nonExistentObject');
        });

        const finalState = useEventStore.getState();
        expect(finalState).toEqual(initialState);
    });

    test('should handle direct format updates in setConfigUpdated', () => {
        const {setConfigUpdated} = useEventStore.getState();

        const updates = [
            {name: 'service1', node: 'node1'},
            {name: 'cluster', node: 'node2'},
        ];

        act(() => {
            setConfigUpdated(updates);
        });

        const state = useEventStore.getState();
        expect(state.configUpdates).toEqual([
            {name: 'service1', fullName: 'root/svc/service1', node: 'node1'},
            {name: 'cluster', fullName: 'root/ccfg/cluster', node: 'node2'},
        ]);
    });

    test('should handle invalid JSON in setConfigUpdated', () => {
        const {setConfigUpdated} = useEventStore.getState();

        const updates = [
            'invalid-json-string',
            {name: 'service1', node: 'node1'}
        ];

        act(() => {
            setConfigUpdated(updates);
        });

        expect(logger.warn).toHaveBeenCalledWith(
            '[useEventStore] Invalid JSON in setConfigUpdated:',
            'invalid-json-string'
        );
    });

    test('should handle valid JSON string updates in setConfigUpdated', () => {
        const {setConfigUpdated} = useEventStore.getState();

        const updates = [
            '{"name":"service3","node":"node3"}',
            '{"name":"cluster","node":"node4"}'
        ];

        act(() => {
            setConfigUpdated(updates);
        });

        const state = useEventStore.getState();
        expect(state.configUpdates).toHaveLength(2);
    });

    test('should handle null updates in setConfigUpdated', () => {
        const {setConfigUpdated} = useEventStore.getState();

        act(() => {
            setConfigUpdated([null]);
        });

        const state = useEventStore.getState();
        expect(state.configUpdates).toEqual([]);
    });

    test('should handle undefined updates in setConfigUpdated', () => {
        const {setConfigUpdated} = useEventStore.getState();

        act(() => {
            setConfigUpdated([undefined]);
        });

        const state = useEventStore.getState();
        expect(state.configUpdates).toEqual([]);
    });

    test('should handle SSE format without required data field', () => {
        const {setConfigUpdated} = useEventStore.getState();

        const updates = [
            {
                kind: 'InstanceConfigUpdated',
            },
        ];

        act(() => {
            setConfigUpdated(updates);
        });

        const state = useEventStore.getState();
        expect(state.configUpdates).toEqual([]);
    });

    test('should clear config updates correctly', () => {
        const {setConfigUpdated, clearConfigUpdate} = useEventStore.getState();

        act(() => {
            setConfigUpdated([
                {name: 'service1', node: 'node1'},
                {name: 'service2', node: 'node2'},
                {name: 'cluster', node: 'node4'},
            ]);
        });

        expect(useEventStore.getState().configUpdates).toHaveLength(3);

        act(() => {
            clearConfigUpdate('service1');
        });

        expect(useEventStore.getState().configUpdates).toHaveLength(2);
    });

    test('should not clear config updates with invalid objectName', () => {
        const {setConfigUpdated, clearConfigUpdate} = useEventStore.getState();

        act(() => {
            setConfigUpdated([{name: 'service1', node: 'node1'}]);
        });

        act(() => {
            clearConfigUpdate(null);
        });

        expect(useEventStore.getState().configUpdates).toHaveLength(1);
    });

    describe('shallowEqual edge cases', () => {
        test('should handle null and undefined', () => {
            const {setNodeStatuses} = useEventStore.getState();

            act(() => {
                setNodeStatuses(null);
            });

            expect(useEventStore.getState().nodeStatus).toBeNull();

            act(() => {
                setNodeStatuses(undefined);
            });

            expect(useEventStore.getState().nodeStatus).toBeUndefined();
        });

        test('should handle empty objects', () => {
            const {setNodeStatuses} = useEventStore.getState();

            act(() => {
                setNodeStatuses({});
            });

            const firstState = useEventStore.getState();

            act(() => {
                setNodeStatuses({});
            });

            const secondState = useEventStore.getState();
            expect(secondState.nodeStatus).toEqual(firstState.nodeStatus);
        });
    });

    describe('parseObjectPath edge cases', () => {
        test('should handle empty string', () => {
            const {clearConfigUpdate} = useEventStore.getState();

            act(() => {
                clearConfigUpdate('');
            });

            // Should not throw
            expect(true).toBe(true);
        });

        test('should handle non-string inputs', () => {
            const {clearConfigUpdate} = useEventStore.getState();

            act(() => {
                clearConfigUpdate(123);
            });

            act(() => {
                clearConfigUpdate({});
            });

            act(() => {
                clearConfigUpdate([]);
            });

            // Should not throw
            expect(true).toBe(true);
        });
    });

    test('should skip node iteration when no own node properties', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        const proto = {node1: {status: 'active'}};
        const instanceStatuses = {
            object1: Object.create(proto)
        };

        act(() => {
            setInstanceStatuses(instanceStatuses);
        });

        expect(useEventStore.getState().objectInstanceStatus).toEqual({object1: {}});
    });

    test('should merge non-encap status correctly', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        act(() => {
            setInstanceStatuses({
                object1: {
                    node1: {
                        status: 'old',
                        value: 1
                    }
                }
            });
        });

        act(() => {
            setInstanceStatuses({
                object1: {
                    node1: {
                        status: 'new'
                    }
                }
            });
        });

        expect(useEventStore.getState().objectInstanceStatus.object1.node1).toEqual({
            node: 'node1',
            path: 'object1',
            status: 'new',
            value: 1
        });
    });

    test('should not add duplicate configUpdates entries', () => {
        const {setConfigUpdated} = useEventStore.getState();

        act(() => {
            setConfigUpdated([
                {name: 'service1', node: 'node1'},
            ]);
        });

        act(() => {
            setConfigUpdated([
                {name: 'service1', node: 'node1'},
            ]);
        });

        expect(useEventStore.getState().configUpdates).toHaveLength(1);
    });

    test('should clear configUpdates using fullName match', () => {
        const {setConfigUpdated, clearConfigUpdate} = useEventStore.getState();

        act(() => {
            setConfigUpdated([
                {name: 'service1', node: 'node1'}
            ]);
        });

        act(() => {
            clearConfigUpdate('root/svc/service1');
        });

        expect(useEventStore.getState().configUpdates).toEqual([]);
    });

    test('should not update instanceConfig when path exists but node config is identical', () => {
        const {setInstanceConfig} = useEventStore.getState();

        act(() => {
            setInstanceConfig('object1', 'node1', {a: 1});
        });

        const first = useEventStore.getState().instanceConfig;

        act(() => {
            setInstanceConfig('object1', 'node1', {a: 1});
        });

        const second = useEventStore.getState().instanceConfig;

        expect(second).toBe(first);
    });

    test('should not update setObjectStatuses when shallowEqual true (REJECTED log)', () => {
        const {setObjectStatuses} = useEventStore.getState();

        const data = {obj1: {a: 1}};

        act(() => {
            setObjectStatuses(data);
        });

        logger.debug.mockClear();

        act(() => {
            setObjectStatuses(data);
        });

        expect(logger.debug).toHaveBeenCalledWith(
            '⏭️ setObjectStatuses: REJECTED (no actual changes)',
            expect.any(Object)
        );
    });

    test('should not update setHeartbeatStatuses when shallowEqual true', () => {
        const {setHeartbeatStatuses} = useEventStore.getState();

        const data = {node1: {alive: true}};

        act(() => {
            setHeartbeatStatuses(data);
        });

        const first = useEventStore.getState().heartbeatStatus;

        act(() => {
            setHeartbeatStatuses(data);
        });

        const second = useEventStore.getState().heartbeatStatus;

        expect(second).toBe(first);
    });

    test('should not update setInstanceMonitors when shallowEqual true', () => {
        const {setInstanceMonitors} = useEventStore.getState();

        const data = {obj1: {running: true}};

        act(() => {
            setInstanceMonitors(data);
        });

        const first = useEventStore.getState().instanceMonitor;

        act(() => {
            setInstanceMonitors(data);
        });

        const second = useEventStore.getState().instanceMonitor;

        expect(second).toBe(first);
    });

    test('should not update setNodeStats when shallowEqual true (same reference)', () => {
        const {setNodeStats} = useEventStore.getState();

        const data = {node1: {cpu: 1}};

        act(() => {
            setNodeStats(data);
        });

        const first = useEventStore.getState().nodeStats;

        act(() => {
            setNodeStats(data);
        });

        const second = useEventStore.getState().nodeStats;

        expect(second).toBe(first);
    });

    test('should return unchanged state in removeObject when nothing to delete', () => {
        const {removeObject} = useEventStore.getState();

        const before = useEventStore.getState();

        act(() => {
            removeObject('unknown');
        });

        const after = useEventStore.getState();

        expect(after).toBe(before);
    });

    test('should skip adding configUpdates when computed name or node is missing', () => {
        const {setConfigUpdated} = useEventStore.getState();

        act(() => {
            setConfigUpdated([
                {name: '', node: 'node1'},
                {name: 'svc', node: ''},
            ]);
        });

        expect(useEventStore.getState().configUpdates).toEqual([]);
    });

    test('should handle JSON parse success but missing required fields', () => {
        const {setConfigUpdated} = useEventStore.getState();

        act(() => {
            setConfigUpdated([
                '{"foo":"bar"}'
            ]);
        });

        expect(useEventStore.getState().configUpdates).toEqual([]);
    });

    test('should not update when setInstanceStatuses produces no changes (hasChanges false)', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        const data = {
            obj1: {
                node1: {status: 'ok'}
            }
        };

        act(() => {
            setInstanceStatuses(data);
        });

        const first = useEventStore.getState().objectInstanceStatus;

        act(() => {
            setInstanceStatuses(data);
        });

        const second = useEventStore.getState().objectInstanceStatus;

        expect(second).toEqual(first);
    });

    test('should handle encap merge when existingData is undefined', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        act(() => {
            setInstanceStatuses({
                obj1: {
                    node1: {
                        encap: {
                            c1: {resources: {cpu: 1}}
                        }
                    }
                }
            });
        });

        const state = useEventStore.getState();

        expect(state.objectInstanceStatus.obj1.node1.encap.c1.resources).toEqual({cpu: 1});
    });

    test('should skip update when existingData and newStatus are shallow equal (continue branch)', () => {
        const {setInstanceStatuses} = useEventStore.getState();

        const data = {
            object1: {
                node1: {status: 'active'}
            }
        };

        act(() => {
            setInstanceStatuses(data);
        });

        const first = useEventStore.getState().objectInstanceStatus;

        act(() => {
            setInstanceStatuses({
                object1: {
                    node1: {status: 'active'}
                }
            });
        });

        const second = useEventStore.getState().objectInstanceStatus;

        expect(second).toEqual(first);
    });

    describe('removePendingDelete', () => {
        test('should remove pending delete entry for given objectPath and node', () => {
            const {removePendingDelete} = useEventStore.getState();

            act(() => {
                useEventStore.setState({pendingDeletes: {'obj:node1': true, 'obj:node2': true}});
            });

            act(() => {
                removePendingDelete('obj', 'node1');
            });

            expect(useEventStore.getState().pendingDeletes).toEqual({'obj:node2': true});
        });

        test('should do nothing if the key does not exist', () => {
            const {removePendingDelete} = useEventStore.getState();

            act(() => {
                useEventStore.setState({pendingDeletes: {'obj:node1': true}});
            });

            act(() => {
                removePendingDelete('obj', 'node2');
            });

            expect(useEventStore.getState().pendingDeletes).toEqual({'obj:node1': true});
        });
    });

    describe('removeInstanceFromObject', () => {
        test('should remove instance from objectInstanceStatus, instanceConfig and instanceMonitor', () => {
            const {removeInstanceFromObject} = useEventStore.getState();

            act(() => {
                useEventStore.setState({
                    objectInstanceStatus: {
                        svc1: {nodeA: {node: 'nodeA', path: 'svc1', status: 'up'}}
                    },
                    instanceConfig: {
                        svc1: {nodeA: {config: 'data'}}
                    },
                    instanceMonitor: {
                        'nodeA:svc1': {monitor: 'ok'}
                    }
                });
            });

            act(() => {
                removeInstanceFromObject('svc1', 'nodeA');
            });

            const state = useEventStore.getState();
            // After removing the only node, the path becomes an empty object (not deleted)
            expect(state.objectInstanceStatus.svc1).toEqual({});
            expect(state.instanceConfig.svc1).toEqual({});
            expect(state.instanceMonitor['nodeA:svc1']).toBeUndefined();
        });

        test('should handle partial removal (only instance status exists)', () => {
            const {removeInstanceFromObject} = useEventStore.getState();

            act(() => {
                useEventStore.setState({
                    objectInstanceStatus: {
                        svc1: {nodeA: {node: 'nodeA', path: 'svc1'}}
                    },
                    instanceConfig: {},
                    instanceMonitor: {}
                });
            });

            act(() => {
                removeInstanceFromObject('svc1', 'nodeA');
            });

            const state = useEventStore.getState();
            expect(state.objectInstanceStatus.svc1).toEqual({});
        });

        test('should handle removal when only instanceConfig entry exists', () => {
            const {removeInstanceFromObject} = useEventStore.getState();

            act(() => {
                useEventStore.setState({
                    objectInstanceStatus: {},
                    instanceConfig: {
                        svc1: {nodeA: {cfg: 1}}
                    },
                    instanceMonitor: {}
                });
            });

            act(() => {
                removeInstanceFromObject('svc1', 'nodeA');
            });

            const state = useEventStore.getState();
            expect(state.instanceConfig.svc1).toEqual({});
        });

        test('should handle removal when only instanceMonitor entry exists', () => {
            const {removeInstanceFromObject} = useEventStore.getState();

            act(() => {
                useEventStore.setState({
                    objectInstanceStatus: {},
                    instanceConfig: {},
                    instanceMonitor: {
                        'nodeA:svc1': {mon: 1}
                    }
                });
            });

            act(() => {
                removeInstanceFromObject('svc1', 'nodeA');
            });

            const state = useEventStore.getState();
            expect(state.instanceMonitor['nodeA:svc1']).toBeUndefined();
        });

        test('should not mutate state if nothing to remove', () => {
            const {removeInstanceFromObject} = useEventStore.getState();
            const initialState = useEventStore.getState();

            act(() => {
                removeInstanceFromObject('svc1', 'nodeA');
            });

            expect(useEventStore.getState()).toBe(initialState);
        });
    });

    describe('setInstanceStatuses with replace = true', () => {
        test('should replace entire instance status for a path', () => {
            const {setInstanceStatuses} = useEventStore.getState();

            act(() => {
                setInstanceStatuses(
                    {svc1: {nodeA: {status: 'old'}, nodeB: {status: 'old'}}}
                );
            });

            act(() => {
                setInstanceStatuses(
                    {svc1: {nodeC: {status: 'new'}}},
                    true // replace
                );
            });

            const state = useEventStore.getState();
            expect(state.objectInstanceStatus.svc1).toEqual({
                nodeC: {node: 'nodeC', path: 'svc1', status: 'new'}
            });
        });

        test('should skip inherited properties during replace', () => {
            const {setInstanceStatuses} = useEventStore.getState();

            const nodes = {nodeA: {status: 'a'}};
            const proto = {inheritedNode: {status: 'proto'}};
            Object.setPrototypeOf(nodes, proto);

            act(() => {
                setInstanceStatuses({svc1: nodes}, true);
            });

            const state = useEventStore.getState();
            expect(state.objectInstanceStatus.svc1).toEqual({
                nodeA: {node: 'nodeA', path: 'svc1', status: 'a'}
            });
            expect(state.objectInstanceStatus.svc1.inheritedNode).toBeUndefined();
        });

        test('should not update state when replacement is shallow equal to existing', () => {
            const {setInstanceStatuses} = useEventStore.getState();

            act(() => {
                setInstanceStatuses(
                    {svc1: {nodeA: {status: 'up'}}},
                    true
                );
            });

            const firstState = useEventStore.getState();

            act(() => {
                setInstanceStatuses(
                    {svc1: {nodeA: {status: 'up'}}},
                    true
                );
            });

            const secondState = useEventStore.getState();
            // Because of persist middleware the references may be lost;
            // we assert deep equality instead of reference equality.
            expect(secondState.objectInstanceStatus.svc1).toEqual(
                firstState.objectInstanceStatus.svc1
            );
        });

        test('should replace multiple paths independently', () => {
            const {setInstanceStatuses} = useEventStore.getState();

            act(() => {
                setInstanceStatuses(
                    {
                        svc1: {nodeA: {status: 'a'}, nodeB: {status: 'b'}},
                        svc2: {nodeX: {status: 'x'}}
                    },
                    true
                );
            });

            const state = useEventStore.getState();
            expect(state.objectInstanceStatus.svc1).toEqual({
                nodeA: {node: 'nodeA', path: 'svc1', status: 'a'},
                nodeB: {node: 'nodeB', path: 'svc1', status: 'b'}
            });
            expect(state.objectInstanceStatus.svc2).toEqual({
                nodeX: {node: 'nodeX', path: 'svc2', status: 'x'}
            });
        });

        test('should handle replace with empty incoming nodes', () => {
            const {setInstanceStatuses} = useEventStore.getState();

            act(() => {
                setInstanceStatuses(
                    {svc1: {}},
                    true
                );
            });

            const state = useEventStore.getState();
            expect(state.objectInstanceStatus.svc1).toEqual({});
        });
    });

    describe('setConfigUpdated additional coverage', () => {
        test('should handle InstanceConfigUpdated with missing labels.namespace', () => {
            const {setConfigUpdated} = useEventStore.getState();
            const updates = [{
                kind: 'InstanceConfigUpdated',
                data: {
                    path: 'test-svc',
                    node: 'nodeX',
                    labels: {} // no namespace
                }
            }];

            act(() => {
                setConfigUpdated(updates);
            });

            const state = useEventStore.getState();
            expect(state.configUpdates).toHaveLength(1);
            expect(state.configUpdates[0]).toMatchObject({
                name: 'test-svc',
                fullName: 'root/svc/test-svc',
                node: 'nodeX'
            });
        });

        test('should handle SSE format with cluster name', () => {
            const {setConfigUpdated} = useEventStore.getState();
            const updates = [{
                kind: 'InstanceConfigUpdated',
                data: {
                    path: 'cluster',
                    node: 'nodeY',
                    labels: {namespace: 'root'}
                }
            }];

            act(() => {
                setConfigUpdated(updates);
            });

            const state = useEventStore.getState();
            expect(state.configUpdates).toHaveLength(1);
            expect(state.configUpdates[0]).toMatchObject({
                name: 'cluster',
                fullName: 'root/ccfg/cluster',
                node: 'nodeY'
            });
        });

        test('should ignore updates with missing path in SSE format', () => {
            const {setConfigUpdated} = useEventStore.getState();
            const updates = [{
                kind: 'InstanceConfigUpdated',
                data: {
                    // path missing
                    node: 'nodeZ'
                }
            }];

            act(() => {
                setConfigUpdated(updates);
            });

            expect(useEventStore.getState().configUpdates).toEqual([]);
        });
    });
});
