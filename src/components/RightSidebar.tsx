import { useStore } from "../store";
import { OutlinePanel } from "./OutlinePanel";
import { BacklinksPanel } from "./BacklinksPanel";
import { GraphPanel } from "./GraphPanel";
import { AiPanel } from "./AiPanel";
import { SmartLookupPanel } from "./SmartLookupPanel";

export function RightSidebar() {
  const view = useStore((s) => s.rightSidebarView);
  switch (view) {
    case "backlinks":
      return <BacklinksPanel />;
    case "graph":
      return <GraphPanel />;
    case "smartlookup":
      return <SmartLookupPanel />;
    case "ai":
      return <AiPanel />;
    case "outline":
    default:
      return <OutlinePanel />;
  }
}
