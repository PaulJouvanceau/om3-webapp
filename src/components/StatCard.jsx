import React, {memo} from 'react';
import {Paper, Typography, Box, CircularProgress} from "@mui/material";

const StatCard = memo(({
                           title,
                           value,
                           subtitle,
                           onClick,
                           dynamicHeight = false,
                           isLoading = false,
                           maxSubtitleHeight = 160
                       }) => {
    const handleClick = (e) => {
        if (onClick && !isLoading) onClick(e);
    };

    return (
        <Paper
            elevation={3}
            sx={(theme) => ({
                p: 2,
                height: dynamicHeight ? 'auto' : '240px',
                minHeight: dynamicHeight ? '120px' : undefined,
                display: 'flex',
                flexDirection: 'column',
                cursor: onClick && !isLoading ? 'pointer' : 'default',
                transition: 'box-shadow 0.3s ease, background-color 0.3s ease, border-color 0.3s ease',
                border: '2px solid transparent',
                '&:hover': onClick && !isLoading ? {
                    boxShadow: theme.shadows[12],
                    backgroundColor: theme.palette.action.hover,
                    borderColor: theme.palette.primary.main,
                } : {},
                borderRadius: 2,
                textAlign: 'center',
                opacity: isLoading ? 0.7 : 1,
                position: 'relative',
                overflow: 'hidden'
            })}
            onClick={handleClick}
        >
            {isLoading && (
                <Box sx={{position: 'absolute', top: 8, right: 8}}>
                    <CircularProgress size={24}/>
                </Box>
            )}
            <Typography variant="h6" gutterBottom>{title}</Typography>
            <Typography variant="h3" color="primary" sx={{mb: 1}}>
                {isLoading ? <CircularProgress/> : value}
            </Typography>
            {subtitle && (
                <Box
                    sx={{
                        flex: dynamicHeight ? 'none' : 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end'
                    }}
                >
                    <Box
                        sx={{
                            maxHeight: dynamicHeight ? `${maxSubtitleHeight}px` : '100%',
                            overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch',
                            pr: 0.5,
                            '&::-webkit-scrollbar': {
                                width: '4px',
                            },
                            '&::-webkit-scrollbar-track': {
                                background: 'transparent',
                            },
                            '&::-webkit-scrollbar-thumb': {
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: '2px',
                            },
                        }}
                    >
                        {typeof subtitle === 'string' ? (
                            <Typography variant="body2">{subtitle}</Typography>
                        ) : (
                            subtitle
                        )}
                    </Box>
                </Box>
            )}
        </Paper>
    );
});

export default StatCard;
