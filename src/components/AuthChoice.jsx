import React, {useEffect} from "react";
import opensvcLogo from "../ui/assets/opensvc-logo.svg";
import {ProductTag} from "../ui/components/ProductTag";
import {Button} from "../ui/components/Button";
import {Spinner} from "../ui/components/Spinner";
import {KeyIcon, UserIcon} from "../ui/icons";
import useAuthInfo from "../hooks/AuthInfo.jsx";
import oidcConfiguration from "../config/oidcConfiguration.js";
import {useNavigate} from "react-router-dom";
import {useOidc} from "../context/OidcAuthContext.tsx";
import logger from '../utils/logger.js';

function AuthChoice({authInfo: authInfoProp}) {
    const {userManager, recreateUserManager} = useOidc();
    const localAuthInfo = useAuthInfo();
    const authInfo = authInfoProp ?? localAuthInfo;
    const navigate = useNavigate();

    const handleAuthChoice = async (choice) => {
        if (choice === "openid") {
            if (!userManager) {
                logger.info("handleAuthChoice openid skipped: can't create userManager");
                return;
            }
            try {
                await userManager.signinRedirect();
            } catch (err) {
                logger.error("handleAuthChoice signinRedirect:", err);
            }
        } else if (choice === "basic") {
            return navigate('/auth/login');
        }
    };

    useEffect(() => {
        if (authInfo?.openid?.issuer && !userManager) {
            (async () => {
                try {
                    const config = await oidcConfiguration(authInfo);
                    recreateUserManager(config);
                } catch (error) {
                    logger.error("Failed to initialize OIDC config:", error);
                }
            })();
        }
    }, [authInfo, recreateUserManager, userManager]);

    return (
        <section
            aria-labelledby="auth-choice-title"
            className="mx-auto mt-[15vh] max-w-sm space-y-3 rounded-(--radius-panel) border border-line bg-surface-raised p-4"
        >
            <div className="flex items-center gap-2">
                <img src={opensvcLogo} alt="" className="h-8 w-8"/>
                <h1 id="auth-choice-title" className="text-title font-semibold">
                    Authentication Methods
                </h1>
                <span className="ml-auto"><ProductTag/></span>
            </div>
            <p className="text-ink-muted">
                Please select one of the authentication methods the cluster advertises.
            </p>

            {!authInfo ? (
                <div className="flex justify-center py-2">
                    <Spinner label="Loading authentication methods"/>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {authInfo.openid?.issuer && (
                        <Button
                            variant="primary"
                            icon={<KeyIcon/>}
                            className="w-full"
                            onClick={() => handleAuthChoice("openid")}
                        >
                            OpenID
                        </Button>
                    )}
                    {authInfo.methods?.includes("basic") && (
                        <Button
                            variant="secondary"
                            icon={<UserIcon/>}
                            className="w-full"
                            onClick={() => handleAuthChoice("basic")}
                        >
                            Login
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}

export default AuthChoice;
