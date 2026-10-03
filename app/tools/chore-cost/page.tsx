import { toolPage } from "@/components/free/ToolFrame";
import { ChoreCost } from "@/components/free/ChoreCost";

const p = toolPage("chore-cost", () => <ChoreCost />);
export const generateMetadata = p.meta;
export default p.Page;
