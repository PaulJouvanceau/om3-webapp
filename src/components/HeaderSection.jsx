import React from 'react';
import {
    Box,
    Typography,
    Tooltip,
    IconButton,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
} from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import {blue, red} from '@mui/material/colors';
import {OBJECT_ACTIONS} from '../constants/actions';
import {isActionAllowedForSelection} from '../utils/objectUtils';
import logger from '../utils/logger.js';

const HeaderSection = ({
                           decodedObjectName,
                           globalStatus,
                           actionInProgress,
                           objectMenuAnchor,
                           setObjectMenuAnchor,
                           handleObjectActionClick,
                           getObjectStatus,
                           getColor,
                           objectMenuAnchorRef,
                       }) => {
    const isNotProvisioned = globalStatus?.provisioned === "false" || globalStatus?.provisioned === false;
    const {globalExpect} = getObjectStatus();

    return (
        globalStatus && (
            <Box
                sx={{
                    p: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography variant="h4" fontWeight="bold" noWrap>
                        {decodedObjectName}
                    </Typography>
                </Box>

                <Box sx={{display: 'flex', alignItems: 'center', gap: 2, position: 'relative'}}>
                    {globalExpect && (
                        <Box
                            sx={{
                                width: "70px",
                                display: "flex",
                                justifyContent: "center",
                                position: "absolute",
                                left: 0,
                            }}
                        >
                            <Tooltip title={globalExpect}>
                                <Typography variant="caption" sx={{fontSize: "0.75rem"}}>
                                    {globalExpect}
                                </Typography>
                            </Tooltip>
                        </Box>
                    )}

                    <Box sx={{ml: globalExpect ? "70px" : 0, display: 'flex', alignItems: 'center', gap: 1}}>
                        <Tooltip title={getObjectStatus().avail || 'unknown'}>
                            <FiberManualRecordIcon
                                sx={{color: getColor(getObjectStatus().avail), fontSize: '1.2rem'}}
                            />
                        </Tooltip>
                        {getObjectStatus().frozen === 'frozen' && (
                            <Tooltip title="frozen">
                                <AcUnitIcon sx={{color: blue[300], fontSize: '1.2rem'}}/>
                            </Tooltip>
                        )}
                        {isNotProvisioned && (
                            <Tooltip title="Not Provisioned">
                                <PriorityHighIcon
                                    sx={{color: red[500], fontSize: '1.2rem'}}
                                    aria-label="Object is not provisioned"
                                />
                            </Tooltip>
                        )}
                    </Box>

                    <IconButton
                        onClick={(e) => {
                            setObjectMenuAnchor(e.currentTarget);
                            logger.info("Object menu opened at:", e.currentTarget.getBoundingClientRect());
                        }}
                        disabled={actionInProgress}
                        aria-label="Object actions"
                        ref={objectMenuAnchorRef}
                    >
                        <Tooltip title="Actions">
                            <MoreVertIcon sx={{fontSize: '1.2rem'}}/>
                        </Tooltip>
                    </IconButton>

                    <Menu
                        anchorEl={objectMenuAnchor}
                        open={Boolean(objectMenuAnchor)}
                        onClose={() => setObjectMenuAnchor(null)}
                    >
                        {OBJECT_ACTIONS.map(({name, icon, color}) => {
                            const isAllowed = isActionAllowedForSelection(name, [decodedObjectName]);
                            return (
                                <MenuItem
                                    key={name}
                                    onClick={() => {
                                        handleObjectActionClick(name);
                                        setObjectMenuAnchor(null);
                                    }}
                                    disabled={!isAllowed || actionInProgress}
                                    sx={{
                                        color: isAllowed
                                            ? (color === "red" ? "error.main" : "inherit")
                                            : "text.disabled",
                                        '&.Mui-disabled': {opacity: 0.5},
                                    }}
                                    aria-label={`Object ${name} action`}
                                >
                                    <ListItemIcon
                                        sx={{
                                            minWidth: 40,
                                            color: isAllowed
                                                ? (color === "red" ? "error.main" : "inherit")
                                                : "text.disabled"
                                        }}>
                                        {icon}
                                    </ListItemIcon>
                                    <ListItemText>
                                        {name.charAt(0).toUpperCase() + name.slice(1)}
                                    </ListItemText>
                                </MenuItem>
                            );
                        })}
                    </Menu>
                </Box>
            </Box>
        )
    );
};

export default HeaderSection;
