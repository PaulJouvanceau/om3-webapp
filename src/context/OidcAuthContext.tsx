import React, {createContext, useContext, useState, useRef, useEffect} from "react";
import {UserManager, UserManagerSettings, Log} from "oidc-client-ts";
import {serializeSilentRenew} from "./serialRenewal";
import logger from "../utils/logger.js";

type OidcLog = {
    logger?: Console;
    level?: number;
    DEBUG?: number;
};

export interface OidcContextType {
    userManager: UserManager | null;
    recreateUserManager: (settings: UserManagerSettings) => void;
    isInitialized: boolean;
}

const OidcContext = createContext<OidcContextType | null>(null);

export const OidcProvider = ({children}: { children: React.ReactNode }) => {
    const [userManager, setUserManager] = useState<UserManager | null>(null);
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const userManagerRef = useRef<UserManager | null>(null);
    // The settings the manager was built with: asked again the same, it is kept.
    const settingsRef = useRef<UserManagerSettings | null>(null);

    const recreateUserManager = (settings: UserManagerSettings) => {
        // App, AuthChoice and OidcCallback each build one when none is there, after
        // reading the configuration: the same asked twice, a second manager would renew
        // the same refresh token beside the first, the provider refusing one of them.
        if (userManagerRef.current !== null && sameSettings(settingsRef.current, settings)) {
            logger.debug("UserManager kept: built with the same settings");
            return;
        }
        logger.info("Recreating UserManager with settings:", settings);
        cleanupUserManager(userManagerRef.current);
        // Ensure oidc-client-ts has verbose logging during development
        try {
            const oidcLog = Log as unknown as OidcLog;
            oidcLog.logger = console;
            if (typeof oidcLog.DEBUG !== 'undefined') {
                oidcLog.level = oidcLog.DEBUG;
            }
        } catch (e) {
            logger.debug('Failed to configure oidc-client-ts Log:', e);
        }

        // One renewal at a time, whoever asks: the refresh token rotates (serialRenewal).
        const newUserManager = serializeSilentRenew(new UserManager(settings));
        setUserManager(newUserManager);
        userManagerRef.current = newUserManager;
        settingsRef.current = settings;
        setIsInitialized(true);
    };

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            cleanupUserManager(userManagerRef.current);
        };
    }, []);

    return (
        <OidcContext.Provider value={{userManager, recreateUserManager, isInitialized}}>
            {children}
        </OidcContext.Provider>
    );
};

// Hook to use the UserManager from Context
export const useOidc = () => {
    const context = useContext(OidcContext);
    if (!context) {
        throw new Error("useOidc must be used within an OidcProvider");
    }
    return context;
};

/** Whether two settings build the same manager: the same provider, client and addresses. */
const SETTINGS_KEYS = ["authority", "client_id", "redirect_uri", "silent_redirect_uri", "post_logout_redirect_uri", "scope", "response_type"] as const;
const sameSettings = (a: UserManagerSettings | null, b: UserManagerSettings) =>
    a !== null && SETTINGS_KEYS.every((key) => a[key] === b[key]);

/**
 * Retires a manager replaced or gone: its automatic renewal stopped, which else goes
 * on with its own timers, renewing the refresh token beside the new manager. The
 * listeners on its events are their owners' to remove (App, on the manager changing).
 */
export function cleanupUserManager(userManager: UserManager | null) {
    if (!userManager) return;
    logger.debug("Stopping the silent renewal of the UserManager replaced");
    try {
        userManager.stopSilentRenew();
    } catch (e) {
        logger.debug('Error stopping the silent renewal:', e);
    }
    userManager.clearStaleState()
        .catch(error => {
            logger.debug('Error during clearStaleState:', error);
        });
}
