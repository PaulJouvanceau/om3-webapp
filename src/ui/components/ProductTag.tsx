/** Name of this frontend, set apart from the collector one (oc3) that looks the same. */
export const PRODUCT_NAME = "Cluster";

/**
 * The "Cluster" tag after the OpenSVC name: the webapp of an om3 cluster borrows the
 * look of oc3, the collector frontend, and this tag tells the two apart at a glance.
 */
export function ProductTag() {
  return (
    <span
      title="OpenSVC om3 cluster webapp"
      className="rounded-(--radius-control) bg-accent-soft px-1.5 py-px text-data font-semibold text-accent"
    >
      {PRODUCT_NAME}
    </span>
  );
}
