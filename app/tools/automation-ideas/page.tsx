import { toolPage } from "@/components/free/ToolFrame";
import { Ideas } from "@/components/free/Ideas";

const p = toolPage("automation-ideas", () => <Ideas />);
export const generateMetadata = p.meta;
export default p.Page;
