import { toolPage } from "@/components/free/ToolFrame";
import { SiteCheck } from "@/components/free/SiteCheck";

const p = toolPage("site-check", () => <SiteCheck />);
export const generateMetadata = p.meta;
export default p.Page;
