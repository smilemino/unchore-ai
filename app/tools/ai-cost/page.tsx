import { toolPage } from "@/components/free/ToolFrame";
import { AiCost } from "@/components/free/AiCost";
import { liveModels } from "@/lib/free-tools/ai-cost";

// Prices come live from OpenRouter (kept a day) — a new model or a price change shows up here the next day by itself.
const p = toolPage("ai-cost", async () => { const { models, at } = await liveModels(); return <AiCost models={models} at={at} />; });
export const generateMetadata = p.meta;
export default p.Page;
