import { toolPage } from "@/components/free/ToolFrame";
import { CronTool } from "@/components/free/CronTool";

const p = toolPage("cron", () => <CronTool />);
export const generateMetadata = p.meta;
export default p.Page;
