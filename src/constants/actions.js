import {
    ArrowLeftIcon,
    BanIcon,
    CaretRightIcon,
    CheckIcon,
    CloseIcon,
    CpuIcon,
    CubeIcon,
    DatabaseIcon,
    DownloadIcon,
    DropIcon,
    FileIcon,
    GearIcon,
    InfoIcon,
    PauseIcon,
    PlayIcon,
    PowerIcon,
    PowerOffIcon,
    PuzzleIcon,
    RefreshIcon,
    ResetIcon,
    SearchIcon,
    SnowflakeIcon,
    StateIcon,
    StepBackwardIcon,
    StepForwardIcon,
    StopIcon,
    SunIcon,
    SwapIcon,
    TerminalIcon,
    ToggleOffIcon,
    ToggleOnIcon,
    TrashIcon,
} from "../ui/icons";
import i18n from "../i18n";

// Action icons of the oc3 icon set (src/ui/icons), sized by the menus that show
// them. `color: "red"` marks the destructive actions, tinted by those menus.
// `endpoint` is the API path of the action; `kinds` limits it to some object kinds.
// The `name` of an action is its identifier (API, menus): show actionLabel(name) instead.
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const labelKey = (name) => name.replace(/\s+(\w)/g, (_, c) => c.toUpperCase());

/** The translated label of an action name ("restart daemon" → "Restart daemon"), the capitalized name if unknown. */
export const actionLabel = (name) => {
    if (typeof name !== "string" || !name) return "";
    return i18n.t(`actions.labels.${labelKey(name)}`, {defaultValue: capitalize(name)});
};

const icon = (Icon) => <Icon className="h-4 w-4"/>;

export const OBJECT_ACTIONS = [
    {name: "start", icon: icon(PlayIcon), endpoint: "action/start"},
    {name: "stop", icon: icon(StopIcon), endpoint: "action/stop"},
    {name: "restart", icon: icon(RefreshIcon), endpoint: "action/restart"},
    {name: "freeze", icon: icon(SnowflakeIcon), endpoint: "action/freeze"},
    {name: "unfreeze", icon: icon(SunIcon), endpoint: "action/unfreeze"},
    {name: "provision", icon: icon(GearIcon), endpoint: "action/provision"},
    {name: "unprovision", icon: icon(BanIcon), endpoint: "action/unprovision"},
    {name: "switch", icon: icon(SwapIcon), endpoint: "action/switch"},
    {name: "giveback", icon: icon(ArrowLeftIcon), endpoint: "action/giveback"},
    {name: "abort", icon: icon(CloseIcon), endpoint: "action/abort"},
    {name: "enable", icon: icon(ToggleOnIcon), endpoint: "enable", kinds: ["svc"]},
    {name: "disable", icon: icon(ToggleOffIcon), endpoint: "disable", kinds: ["svc"]},
    {name: "delete", icon: icon(TrashIcon), endpoint: "action/delete", color: "red"},
    {name: "purge", icon: icon(TrashIcon), endpoint: "action/purge", color: "red"},
];

export const INSTANCE_ACTIONS = [
    // Lifecycle
    {name: "start", icon: icon(PlayIcon), endpoint: "start"},
    {name: "stop", icon: icon(StopIcon), endpoint: "stop"},
    {name: "restart", icon: icon(RefreshIcon), endpoint: "restart"},
    {name: "run", icon: icon(CaretRightIcon), endpoint: "run"},
    {name: "boot", icon: icon(PowerIcon), endpoint: "boot"},
    {name: "shutdown", icon: icon(PowerOffIcon), endpoint: "shutdown"},
    {name: "start standby", icon: icon(PauseIcon), endpoint: "startstandby"},

    // Freeze state
    {name: "freeze", icon: icon(SnowflakeIcon), endpoint: "freeze"},
    {name: "unfreeze", icon: icon(SunIcon), endpoint: "unfreeze"},

    // Provisioning
    {name: "provision", icon: icon(GearIcon), endpoint: "provision"},
    {name: "unprovision", icon: icon(BanIcon), endpoint: "unprovision"},

    // Replication
    {name: "prstart", icon: icon(StepForwardIcon), endpoint: "prstart"},
    {name: "prstop", icon: icon(StepBackwardIcon), endpoint: "prstop"},
    {name: "sync ingest", icon: icon(DownloadIcon), endpoint: "sync/ingest"},

    // Placement groups
    {name: "pg reset", icon: icon(ResetIcon), endpoint: "pg/reset"},
    {name: "pg update", icon: icon(RefreshIcon), endpoint: "pg/update"},

    // Info
    {name: "info", icon: icon(InfoIcon), endpoint: "info"},
    {name: "status", icon: icon(StateIcon), endpoint: "status"},

    // Destructive
    {name: "delete", icon: icon(TrashIcon), endpoint: "delete", color: "red"},
];

export const RESOURCE_ACTIONS = [
    {name: "start", icon: icon(PlayIcon)},
    {name: "stop", icon: icon(StopIcon)},
    {name: "restart", icon: icon(RefreshIcon)},
    {name: "run", icon: icon(CaretRightIcon)},
    {name: 'console', icon: icon(TerminalIcon)},
];

export const NODE_ACTIONS = [

    // Node-level actions
    {name: "freeze", icon: icon(SnowflakeIcon), endpoint: "action/freeze"},
    {name: "unfreeze", icon: icon(SunIcon), endpoint: "action/unfreeze"},
    {name: "abort", icon: icon(CloseIcon), endpoint: "action/abort"},
    {name: "clear", icon: icon(CheckIcon), endpoint: "action/clear"},
    {name: "dequeue", icon: icon(BanIcon), endpoint: "action/dequeue"},
    {name: "drain", icon: icon(DropIcon), endpoint: "action/drain"},
    {name: "scsi scan", icon: icon(SearchIcon), endpoint: "action/scsi/scan"},
    {name: "asset", icon: icon(CpuIcon), endpoint: "action/push/asset"},
    {name: "disk", icon: icon(DatabaseIcon), endpoint: "action/push/disk"},
    {name: "pkg", icon: icon(CubeIcon), endpoint: "action/push/pkg"},
    {name: "capabilities", icon: icon(PuzzleIcon), endpoint: "action/scan/capabilities"},
    {name: "sysreport", icon: icon(FileIcon), endpoint: "action/sysreport"},

    // Daemon-level actions
    {name: "restart daemon", icon: icon(RefreshIcon), endpoint: "daemon/action/restart"},
    {name: "stop", icon: icon(StopIcon), endpoint: "daemon/action/stop", color: "red"},
    {name: "shutdown", icon: icon(PowerOffIcon), endpoint: "daemon/action/shutdown", color: "red"},
];
