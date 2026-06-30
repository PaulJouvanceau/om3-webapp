import React, {useState} from "react";
import {
    Box,
    Typography,
    Tooltip,
    Checkbox,
    IconButton,
} from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import ArticleIcon from "@mui/icons-material/Article";
import {grey, blue, red} from "@mui/material/colors";
import logger from '../utils/logger.js';

const InstanceCard = ({
                          node,
                          nodeData = {},
                          selectedNodes = [],
                          toggleNode = () => logger.warn("toggleNode not provided"),
                          actionInProgress = false,
                          setIndividualNodeMenuAnchor = () => logger.warn("setIndividualNodeMenuAnchor not provided"),
                          setCurrentNode = () => logger.warn("setCurrentNode not provided"),
                          getColor = () => grey[500],
                          getNodeState = () => ({avail: "unknown", frozen: "unfrozen", state: null}),
                          instanceName,
                          onOpenLogs = () => logger.warn("onOpenLogs not provided"),
                          onViewInstance,
                      }) => {
    const resolvedInstanceName = instanceName || nodeData?.instanceName || nodeData?.name || node;
    const [isHovered, setIsHovered] = useState(false);

    if (!node) {
        logger.error("Node name is required");
        return null;
    }

    const {avail, frozen, state} = getNodeState(node);
    const isInstanceNotProvisioned = nodeData?.provisioned === false || nodeData?.provisioned === "false";

    const handleCardClick = (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.no-click')) {
            return;
        }
        if (onViewInstance && typeof onViewInstance === 'function') {
            onViewInstance(node);
        }
    };

    const handleMenuOpen = (e) => {
        e.stopPropagation();
        setCurrentNode(node);
        setIndividualNodeMenuAnchor(e.currentTarget);
    };

    return (
        <Box
            sx={{
                mb: 2,
                display: "flex",
                flexDirection: "column",
                width: "100%",
                maxWidth: "1400px",
                cursor: onViewInstance ? 'pointer' : 'default',
                transition: 'background-color 0.2s ease',
                position: 'relative',
                p: 2,
                backgroundColor: isHovered && onViewInstance ? 'action.hover' : 'transparent',
                borderRadius: 1,
                '&:hover': onViewInstance ? {
                    backgroundColor: 'action.hover',
                } : {},
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleCardClick}
        >
            <Box sx={{display: "flex", alignItems: "center"}}>
                <Box sx={{display: "flex", alignItems: "center", gap: 1, flexWrap: 'wrap'}}>
                    <Box onClick={(e) => e.stopPropagation()} className="no-click">
                        <Checkbox
                            checked={selectedNodes.includes(node)}
                            onChange={() => toggleNode(node)}
                            aria-label={`Select node ${node}`}
                        />
                    </Box>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                        <Typography variant="h6">
                            {node}
                        </Typography>
                        {isHovered && onViewInstance && (
                            <Typography
                                variant="body2"
                                color="primary"
                                sx={{fontStyle: 'italic', ml: 1, opacity: 0.8}}
                            >
                                (view resources)
                            </Typography>
                        )}
                    </Box>
                </Box>

                <Box sx={{display: "flex", alignItems: "center", gap: 1, ml: "auto"}} className="no-click">
                    {isInstanceNotProvisioned && (
                        <Tooltip title="Not Provisioned">
                            <PriorityHighIcon
                                sx={{color: red[500], fontSize: "1.2rem"}}
                                aria-label={`Instance on node ${node} is not provisioned`}
                            />
                        </Tooltip>
                    )}
                    {state && <Typography variant="caption">{state}</Typography>}
                </Box>

                <Box sx={{display: "flex", alignItems: "center", gap: 2}} className="no-click">
                    <Tooltip title={avail || "unknown"}>
                        <FiberManualRecordIcon
                            sx={{
                                fontSize: "1.2rem",
                                color: typeof getColor === "function" ? getColor(avail) : grey[500]
                            }}
                        />
                    </Tooltip>

                    {frozen === "frozen" && (
                        <Tooltip title="frozen">
                            <AcUnitIcon sx={{fontSize: "medium", color: blue[300]}}/>
                        </Tooltip>
                    )}

                    <IconButton
                        onClick={handleMenuOpen}
                        disabled={actionInProgress}
                        aria-label={`Node ${node} actions`}
                    >
                        <Tooltip title="Actions">
                            <MoreVertIcon/>
                        </Tooltip>
                    </IconButton>

                    <Tooltip title="View instance logs">
                        <IconButton
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenLogs(node, resolvedInstanceName);
                            }}
                            color="primary"
                            aria-label={`View logs for instance ${resolvedInstanceName || node}`}
                        >
                            <ArticleIcon/>
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </Box>
    );
};

export default InstanceCard;
