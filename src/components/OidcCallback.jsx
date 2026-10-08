import React, {useEffect, useCallback, useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuthDispatch, SetAccessToken, SetAuthChoice, Login} from "../context/AuthProvider.jsx";
import oidcConfiguration from "../config/oidcConfiguration.js";
import useAuthInfo from "../hooks/AuthInfo.jsx";
import {useOidc} from "../context/OidcAuthContext.tsx";
import logger from '../utils/logger.js';
import {clearObjectCache} from "../hooks/useEventStore.js";

const OidcCallback = () => {
    const {userManager, recreateUserManager} = useOidc();
    const authDispatch = useAuthDispatch();
    const authInfo = useAuthInfo();
    const navigate = useNavigate();
    const eventHandlersSet = useRef(false);

    const handleLogout = useCallback(() => {
        if (authDispatch) {
            authDispatch({type: SetAccessToken, data: null});
        }
        localStorage.removeItem('authToken');
        clearObjectCache();
        localStorage.removeItem('tokenExpiration');
        localStorage.removeItem('authChoice');

        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('auth-channel');
            channel.postMessage({type: 'logout'});
            channel.close();
        }
        navigate('/auth-choice');
    }, [authDispatch, navigate]);

    const onUserRefreshed = useCallback((user) => {
        logger.info("User refreshed:", user.profile?.preferred_username, "expires_at:", user.expires_at);
        if (authDispatch) {
            authDispatch({type: SetAccessToken, data: user.access_token});
        }
        localStorage.setItem('authToken', user.access_token);
        localStorage.setItem('tokenExpiration', user.expires_at?.toString() || '');

        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('auth-channel');
            channel.postMessage({type: 'tokenUpdated', data: user.access_token, expires_at: user.expires_at});
            channel.close();
        }
    }, [authDispatch]);

    const handleTokenExpired = useCallback(() => {
        logger.warn('Access token expired, redirecting to /auth-choice');
        handleLogout();
    }, [handleLogout]);

    const handleSilentRenewError = useCallback((error) => {
        logger.error('Silent renew failed:', error);
        handleLogout();
    }, [handleLogout]);

    const setupEventHandlers = useCallback(() => {
        if (eventHandlersSet.current || !userManager) return;
        userManager.events.addUserLoaded(onUserRefreshed);
        userManager.events.addAccessTokenExpiring(() => {
            logger.debug('Access token is about to expire, attempting silent renew...');
        });
        userManager.events.addAccessTokenExpired(handleTokenExpired);
        userManager.events.addSilentRenewError(handleSilentRenewError);
        eventHandlersSet.current = true;
    }, [userManager, onUserRefreshed, handleTokenExpired, handleSilentRenewError]);

    const handleSigninRedirect = useCallback(() => {
        userManager.signinRedirectCallback()
            .then((user) => {
                onUserRefreshed(user);
                if (authDispatch) {
                    authDispatch({type: SetAuthChoice, data: "openid"});
                    authDispatch({type: Login, data: user.profile.preferred_username});
                }
                setupEventHandlers();
                navigate('/');
            })
            .catch((err) => {
                logger.error("signinRedirectCallback failed:", err);
                navigate('/auth-choice');
            });
    }, [userManager, authDispatch, navigate, onUserRefreshed, setupEventHandlers]);

    useEffect(() => {
        const initializeUserManager = async () => {
            if (authInfo && !userManager) {
                logger.info("Initializing UserManager with authInfo");
                try {
                    const config = await oidcConfiguration(authInfo);
                    recreateUserManager(config);
                } catch (error) {
                    logger.error("Failed to initialize OIDC config:", error);
                    navigate('/auth-choice');
                }
            }
        };
        initializeUserManager().catch(error => {
            logger.error("Unhandled error in initializeUserManager:", error);
            navigate('/auth-choice');
        });
    }, [authInfo, userManager, recreateUserManager, navigate]);

    useEffect(() => {
        if (userManager) {
            logger.debug("Handling OIDC callback or session check");

            if (typeof userManager.getUser === 'function') {
                userManager.getUser().then((user) => {
                    if (user && !user.expired) {
                        logger.info("Existing user session found:", user.profile?.preferred_username);
                        onUserRefreshed(user);
                        setupEventHandlers();
                        navigate('/');
                    } else {
                        handleSigninRedirect();
                    }
                }).catch((err) => {
                    logger.error("Failed to get user:", err);
                    handleSigninRedirect();
                });
            } else {
                handleSigninRedirect();
            }
        }
    }, [userManager, handleSigninRedirect, setupEventHandlers, onUserRefreshed, navigate]);

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel('auth-channel');
        channel.onmessage = (event) => {
            const {type, data, expires_at} = event.data || {};
            if (type === 'logout') {
                logger.info('Logout triggered from another tab');
                handleLogout();
            } else if (type === 'tokenUpdated' && data && expires_at) {
                logger.info('Token updated from another tab');
                if (authDispatch) {
                    authDispatch({type: SetAccessToken, data});
                }
                localStorage.setItem('authToken', data);
                localStorage.setItem('tokenExpiration', expires_at.toString());
            }
        };
        return () => channel.close();
    }, [authDispatch, handleLogout]);

    return <>Logging ...</>;
};

export default OidcCallback;
