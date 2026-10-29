import { lazily } from "react-lazily";

import CsUiGuard from "@/entrypoints/contexts/content-scripts/services/ui-guard/CsUiGuard";
import { csUiMount } from "@/entrypoints/contexts/content-scripts/ui-groups/_root/CsUiRoot";

const { TocPanel } = lazily(() => import("@/plugins/_thread/toc/TocPanel"));

// The panel portals itself and positions with `position: fixed`, so it doesn't
// hang off the navbar group — Computer tasks have a different navbar.
function TocPanelWrapper() {
  return (
    <CsUiGuard
      location={["thread", "computer"]}
      dependentPluginIds={["thread:toc"]}
    >
      <TocPanel />
    </CsUiGuard>
  );
}

export default function () {
  csUiMount({
    id: "plugin:thread:tocPanel",
    component: <TocPanelWrapper />,
  });
}
