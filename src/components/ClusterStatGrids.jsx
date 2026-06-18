import React, {memo, useMemo, useCallback, useState} from "react";
import {Chip, Box, Tooltip, CircularProgress} from "@mui/material";
import StatCard from "./StatCard.jsx";
import {prepareForNavigation} from "../eventSourceManager";

const ClickLoader = memo(({isLoading}) => (
    <Box sx={{display: 'inline-flex', alignItems: 'center', ml: 1}}>
        {isLoading && <CircularProgress size={12}/>}
    </Box>
));

export const GridNodes = memo(({nodeCount, frozenCount, onClick}) => {
    const [isLoading, setIsLoading] = useState(false);
    const handleClick = useCallback(() => {
        setIsLoading(true);
        prepareForNavigation();
        setTimeout(() => {
            onClick();
            setIsLoading(false);
        }, 50);
    }, [onClick]);

    const handleChipClick = useCallback((e) => {
        e.stopPropagation();
        handleClick();
    }, [handleClick]);

    const subtitle = useMemo(() => (
        <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, width: '100%'}}>
            <Chip
                label={`Frozen ${frozenCount}`}
                size="small"
                sx={{
                    backgroundColor: 'info.main',
                    color: 'white',
                    cursor: isLoading ? 'default' : 'pointer',
                    opacity: isLoading ? 0.7 : 1,
                }}
                onClick={handleChipClick}
                disabled={isLoading}
            />
            <ClickLoader isLoading={isLoading}/>
        </Box>
    ), [frozenCount, isLoading, handleChipClick]);

    return <StatCard title="Nodes" value={nodeCount} subtitle={subtitle} onClick={handleClick}/>;
});

export const GridObjects = memo(({objectCount, statusCount, onClick}) => {
    const [loadingStatus, setLoadingStatus] = useState('');

    const handleChipClick = useCallback((status) => {
        setLoadingStatus(status);
        prepareForNavigation();
        setTimeout(() => {
            onClick(status);
            setLoadingStatus('');
        }, 50);
    }, [onClick]);

    const handleCardClick = useCallback(() => {
        setLoadingStatus('all');
        prepareForNavigation();
        setTimeout(() => {
            onClick();
            setLoadingStatus('');
        }, 50);
    }, [onClick]);

    const subtitle = useMemo(() => {
        const chips = [];
        const statuses = ['up', 'warn', 'down', 'unprovisioned'];
        for (const status of statuses) {
            const count = statusCount[status] || 0;
            if (count > 0) {
                chips.push(
                    <StatusChip
                        key={status}
                        status={status}
                        count={count}
                        isLoading={loadingStatus === status}
                        onClick={() => handleChipClick(status)}
                    />
                );
            }
        }
        return (
            <Box sx={{display: "flex", justifyContent: "center", gap: 1, flexWrap: "wrap"}}>
                {chips}
                {loadingStatus === 'all' && <CircularProgress size={20}/>}
            </Box>
        );
    }, [statusCount, loadingStatus, handleChipClick]);

    return <StatCard title="Objects" value={objectCount} subtitle={subtitle} onClick={handleCardClick}/>;
});

const StatusChip = memo(({status, count, isLoading, onClick}) => {
    const colors = {up: 'green', warn: 'orange', down: 'red', unprovisioned: 'red'};
    const handleClick = useCallback((e) => {
        e.stopPropagation();
        if (!isLoading) onClick();
    }, [onClick, isLoading]);
    return (
        <Box sx={{display: 'inline-flex', alignItems: 'center', gap: 0.5}}>
            <Chip
                label={`${status.charAt(0).toUpperCase() + status.slice(1)} ${count}`}
                size="small"
                sx={{
                    backgroundColor: colors[status] || 'grey',
                    color: 'white',
                    cursor: isLoading ? 'default' : 'pointer',
                    opacity: isLoading ? 0.7 : 1,
                }}
                onClick={handleClick}
                disabled={isLoading}
            />
            {isLoading && <CircularProgress size={12}/>}
        </Box>
    );
});

// ==================== NAMESPACES ====================
export const GridNamespaces = memo(({namespaceCount, namespaceSubtitle, onClick}) => {
    const [loadingNamespace, setLoadingNamespace] = useState('');
    const [isCardLoading, setIsCardLoading] = useState(false);

    const handleCardClick = useCallback(() => {
        setIsCardLoading(true);
        prepareForNavigation();
        setTimeout(() => {
            onClick('/namespaces');
            setIsCardLoading(false);
        }, 50);
    }, [onClick]);

    const subtitle = useMemo(() => (
        <Box sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            pt: 1,
            justifyContent: 'flex-start'
        }}>
            {namespaceSubtitle.map(({namespace, status}) => (
                <NamespaceChip
                    key={namespace}
                    namespace={namespace}
                    status={status}
                    isLoading={loadingNamespace === namespace}
                    onClick={onClick}
                    onLoadingChange={setLoadingNamespace}
                />
            ))}
        </Box>
    ), [namespaceSubtitle, loadingNamespace, onClick]);

    return (
        <StatCard
            title="Namespaces"
            value={namespaceCount}
            subtitle={subtitle}
            onClick={handleCardClick}
            isLoading={isCardLoading}
            dynamicHeight={true}
            maxSubtitleHeight={220}
        />
    );
});

const NamespaceChip = memo(({namespace, status, isLoading, onClick, onLoadingChange}) => {
    const getStatusColor = useCallback((stat) => {
        const colors = {
            up: 'green',
            warn: 'orange',
            down: 'red',
            'n/a': 'grey',
            unprovisioned: 'red'
        };
        return colors[stat] || 'grey';
    }, []);

    const handleStatClick = useCallback((stat, e) => {
        e.stopPropagation();
        onLoadingChange(namespace);
        prepareForNavigation();
        setTimeout(() => {
            onClick(`/objects?namespace=${namespace}&globalState=${stat}`);
            onLoadingChange('');
        }, 50);
    }, [namespace, onClick, onLoadingChange]);

    const statusElements = useMemo(() => {
        const elements = [];
        const statusTypes = ['up', 'warn', 'down', 'unprovisioned'];
        for (const stat of statusTypes) {
            const count = status[stat] || 0;
            if (count > 0) {
                elements.push(
                    <Tooltip key={stat}
                             title={stat === "unprovisioned" ? "Not Provisioned" : stat.charAt(0).toUpperCase() + stat.slice(1)}>
                        <Box
                            sx={{
                                width: 15.5,
                                height: 15.5,
                                borderRadius: stat === "unprovisioned" ? '3px' : '50%',
                                clipPath: stat === "unprovisioned" ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
                                backgroundColor: getStatusColor(stat),
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 7.8,
                                fontWeight: 'bold',
                                border: '1px solid white',
                                cursor: 'pointer',
                                zIndex: 1,
                                opacity: isLoading ? 0.5 : 1
                            }}
                            onClick={(e) => !isLoading && handleStatClick(stat, e)}
                            aria-label={`${stat} status for namespace ${namespace}: ${count} objects`}
                        >
                            {count}
                        </Box>
                    </Tooltip>
                );
            }
        }
        return elements;
    }, [namespace, status, isLoading, handleStatClick, getStatusColor]);

    const handleChipClick = useCallback((e) => {
        e.stopPropagation();
        if (isLoading) return;
        onLoadingChange(namespace);
        prepareForNavigation();
        setTimeout(() => {
            onClick(`/objects?namespace=${namespace}`);
            onLoadingChange('');
        }, 50);
    }, [namespace, isLoading, onClick, onLoadingChange]);

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'inline-flex',
                flexShrink: 0,
                margin: "4px",
                alignItems: "center",
                opacity: isLoading ? 0.7 : 1
            }}
        >
            <Chip
                label={namespace}
                size="small"
                sx={{
                    backgroundColor: 'default',
                    cursor: isLoading ? 'default' : 'pointer',
                    minWidth: "100px",
                    px: 2,
                    height: 24,
                    pr: 4
                }}
                onClick={handleChipClick}
                disabled={isLoading}
            />
            <Box sx={{
                position: 'absolute',
                top: -8,
                right: -4,
                display: 'flex',
                gap: 0.5,
                flexWrap: 'wrap'
            }}>
                {statusElements}
            </Box>
            {isLoading && (
                <Box sx={{position: 'absolute', top: -5, right: -5}}>
                    <CircularProgress size={16}/>
                </Box>
            )}
        </Box>
    );
});

// ==================== HEARTBEATS ====================
export const GridHeartbeats = memo(({heartbeatCount, perHeartbeatStats = {}, onClick}) => {
    const [loadingId, setLoadingId] = useState('');

    const handleCardClick = useCallback(() => {
        setLoadingId('card');
        prepareForNavigation();
        setTimeout(() => {
            onClick();
            setLoadingId('');
        }, 50);
    }, [onClick]);

    const handleChipClick = useCallback((baseId) => (e) => {
        e.stopPropagation();
        if (loadingId) return;
        setLoadingId(baseId);
        prepareForNavigation();
        setTimeout(() => {
            onClick(null, null, baseId);
            setLoadingId('');
        }, 50);
    }, [onClick, loadingId]);

    const subtitle = useMemo(() => {
        const groups = new Map();
        for (const [fullId, {running, beating}] of Object.entries(perHeartbeatStats)) {
            if (running === 0 && beating === 0) continue;
            let baseId = fullId;
            if (fullId.endsWith('.rx')) baseId = fullId.slice(0, -3);
            else if (fullId.endsWith('.tx')) baseId = fullId.slice(0, -3);
            if (!groups.has(baseId)) groups.set(baseId, {total: 0, healthy: 0});
            const group = groups.get(baseId);
            group.total += 1;
            if (running > 0 && beating === running) group.healthy += 1;
        }
        const chips = [];
        for (const [baseId, {total, healthy}] of groups.entries()) {
            const isHealthy = (total === healthy);
            const isLoading = loadingId === baseId;
            chips.push(
                <Box key={baseId} sx={{display: 'inline-flex', alignItems: 'center', gap: 0.5}}>
                    <Chip
                        label={baseId}
                        size="small"
                        sx={{
                            backgroundColor: isHealthy ? 'green' : 'red',
                            color: 'white',
                            cursor: isLoading ? 'default' : 'pointer',
                            opacity: isLoading ? 0.7 : 1,
                        }}
                        onClick={handleChipClick(baseId)}
                        disabled={isLoading}
                    />
                    {isLoading && <CircularProgress size={12}/>}
                </Box>
            );
        }
        return (
            <Box sx={{display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 1, minHeight: "40px"}}>
                {chips}
            </Box>
        );
    }, [perHeartbeatStats, loadingId, handleChipClick]);

    return <StatCard title="Heartbeats" value={heartbeatCount} subtitle={subtitle} onClick={handleCardClick}
                     isLoading={loadingId === 'card'}/>;
});

// ==================== POOLS ====================
export const GridPools = memo(({poolCount, pools, onClick}) => {
    const [isLoading, setIsLoading] = useState(false);
    const handleClick = useCallback(() => {
        setIsLoading(true);
        prepareForNavigation();
        setTimeout(() => {
            onClick();
            setIsLoading(false);
        }, 50);
    }, [onClick]);

    const subtitle = useMemo(() => {
        if (!pools || pools.length === 0) return null;
        return (
            <Box sx={{display: "flex", flexWrap: "wrap", gap: 1, justifyContent: 'flex-start'}}>
                {pools.map((pool) => {
                    const usagePercentage = pool.size && pool.used >= 0 ? ((pool.used / pool.size) * 100).toFixed(1) : "N/A";
                    const free = pool.size - pool.used;
                    const freePercent = pool.size ? (free / pool.size) * 100 : 100;
                    const isLowStorage = freePercent < 10;
                    return (
                        <Chip
                            key={pool.name || Math.random()}
                            label={`${pool.name || "Unnamed"} (${usagePercentage}% used)`}
                            size="small"
                            sx={{
                                backgroundColor: isLowStorage ? 'red' : 'default',
                                color: isLowStorage ? 'white' : 'inherit'
                            }}
                        />
                    );
                })}
            </Box>
        );
    }, [pools]);

    return <StatCard title="Pools" value={poolCount} subtitle={subtitle} onClick={handleClick} isLoading={isLoading}/>;
});

// ==================== NETWORKS ====================
export const GridNetworks = memo(({networks, onClick}) => {
    const [isLoading, setIsLoading] = useState(false);
    const handleCardClick = useCallback(() => {
        setIsLoading(true);
        prepareForNavigation();
        setTimeout(() => {
            onClick();
            setIsLoading(false);
        }, 50);
    }, [onClick]);

    const subtitle = useMemo(() => (
        <Box sx={{display: "flex", flexWrap: "wrap", gap: 1, justifyContent: 'flex-start'}}>
            {networks.map((network) => {
                const usagePercentage = network.size ? ((network.used / network.size) * 100).toFixed(1) : 0;
                const free = network.size - network.used;
                const freePercent = network.size ? (free / network.size) * 100 : 100;
                const isLowStorage = freePercent < 10;
                return (
                    <Chip
                        key={network.name}
                        label={`${network.name} (${usagePercentage}% used)`}
                        size="small"
                        sx={{
                            backgroundColor: isLowStorage ? 'red' : 'default',
                            color: isLowStorage ? 'white' : 'inherit'
                        }}
                    />
                );
            })}
        </Box>
    ), [networks]);

    return <StatCard title="Networks" value={networks.length} subtitle={subtitle} onClick={handleCardClick}
                     isLoading={isLoading}/>;
});

// ==================== KINDS ====================
export const GridKinds = memo(({kindCount, kindSubtitle, onClick}) => {
    const [loadingKind, setLoadingKind] = useState('');
    const [isCardLoading, setIsCardLoading] = useState(false);

    const handleCardClick = useCallback(() => {
        setIsCardLoading(true);
        prepareForNavigation();
        setTimeout(() => {
            onClick('/kinds');
            setIsCardLoading(false);
        }, 50);
    }, [onClick]);

    const subtitle = useMemo(() => (
        <Box sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            pt: 1,
            justifyContent: 'flex-start'
        }}>
            {kindSubtitle.map(({kind, status}) => (
                <KindChip
                    key={kind}
                    kind={kind}
                    status={status}
                    isLoading={loadingKind === kind}
                    onClick={onClick}
                    onLoadingChange={setLoadingKind}
                />
            ))}
        </Box>
    ), [kindSubtitle, loadingKind, onClick]);

    return (
        <StatCard
            title="Kinds"
            value={kindCount}
            subtitle={subtitle}
            onClick={handleCardClick}
            isLoading={isCardLoading}
            dynamicHeight={true}
            maxSubtitleHeight={220}
        />
    );
});

const KindChip = memo(({kind, status, isLoading, onClick, onLoadingChange}) => {
    const getStatusColor = useCallback((stat) => {
        const colors = {
            up: 'green',
            warn: 'orange',
            down: 'red',
            'n/a': 'grey',
            unprovisioned: 'red'
        };
        return colors[stat] || 'grey';
    }, []);

    const handleStatClick = useCallback((stat, e) => {
        e.stopPropagation();
        onLoadingChange(kind);
        prepareForNavigation();
        setTimeout(() => {
            onClick(`/objects?kind=${kind}&globalState=${stat === 'unprovisioned' ? 'unprovisioned' : stat}`);
            onLoadingChange('');
        }, 50);
    }, [kind, onClick, onLoadingChange]);

    const statusElements = useMemo(() => {
        const elements = [];
        const statusTypes = ['up', 'warn', 'down', 'unprovisioned'];
        for (const stat of statusTypes) {
            const count = status[stat] || 0;
            if (count > 0) {
                elements.push(
                    <Tooltip key={stat}
                             title={stat === "unprovisioned" ? "Not Provisioned" : stat.charAt(0).toUpperCase() + stat.slice(1)}>
                        <Box
                            sx={{
                                width: 15.5,
                                height: 15.5,
                                borderRadius: stat === "unprovisioned" ? '3px' : '50%',
                                clipPath: stat === "unprovisioned" ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
                                backgroundColor: getStatusColor(stat),
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 7.8,
                                fontWeight: 'bold',
                                border: '1px solid white',
                                cursor: 'pointer',
                                zIndex: 1,
                                opacity: isLoading ? 0.5 : 1
                            }}
                            onClick={(e) => !isLoading && handleStatClick(stat, e)}
                            aria-label={`${stat} status for kind ${kind}: ${count} objects`}
                        >
                            {count}
                        </Box>
                    </Tooltip>
                );
            }
        }
        return elements;
    }, [kind, status, isLoading, handleStatClick, getStatusColor]);

    const handleChipClick = useCallback((e) => {
        e.stopPropagation();
        if (isLoading) return;
        onLoadingChange(kind);
        prepareForNavigation();
        setTimeout(() => {
            onClick(`/objects?kind=${kind}`);
            onLoadingChange('');
        }, 50);
    }, [kind, isLoading, onClick, onLoadingChange]);

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'inline-flex',
                flexShrink: 0,
                margin: "4px",
                alignItems: "center",
                opacity: isLoading ? 0.7 : 1
            }}
        >
            <Chip
                label={kind}
                size="small"
                sx={{
                    backgroundColor: 'default',
                    cursor: isLoading ? 'default' : 'pointer',
                    minWidth: "100px",
                    px: 2,
                    height: 24,
                    pr: 4
                }}
                onClick={handleChipClick}
                disabled={isLoading}
            />
            <Box sx={{
                position: 'absolute',
                top: -8,
                right: -4,
                display: 'flex',
                gap: 0.5,
                flexWrap: 'wrap'
            }}>
                {statusElements}
            </Box>
            {isLoading && (
                <Box sx={{position: 'absolute', top: -5, right: -5}}>
                    <CircularProgress size={16}/>
                </Box>
            )}
        </Box>
    );
});
