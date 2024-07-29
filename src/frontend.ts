import { GetApi, HandlerContext } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ShopUtilities, WorkflowOrchestrationFeature,WorkflowOrchestrationTool, ToolSubmissionStatus  } from "./utilities";
import { Liquid } from "liquidjs";

const engine = new Liquid({
  root: path.resolve(__dirname, '..', 'public'),
  extname: ".liquid"
});

async function render(file: string, ctx?: object): Promise<string> {
  return await engine.renderFile(file, ctx) as string;
}

interface SentinelTool {
  isSentinel: true;
  slot_number: number;
}

type ToolOrSentinel = WorkflowOrchestrationTool | SentinelTool;

export class Frontend {

  @GetApi('/')
  static async home(ctxt: HandlerContext) {
    const features: WorkflowOrchestrationFeature[] = await ctxt.invoke(ShopUtilities).retrieveAllFeatures();
    const toolsWithSlots: (WorkflowOrchestrationTool | null)[] = await ctxt.invoke(ShopUtilities).getToolsWithSlots();
  
    const tools: (WorkflowOrchestrationTool | SentinelTool)[] = toolsWithSlots.map((tool, index) => {
      if (tool === null) {
        return {
          isSentinel: true,
          slot_number: index + 1
        };
      }
      return tool;
    });
  
    return await render("home", {
      features: features,
      tools: tools
    });
  }

  @GetApi('/add-feature')
  static async addFeatureForm(_ctxt: HandlerContext) {
    return await render("add_feature", {});
  }

  @GetApi('/add-tool/:id')
  static async addToolForm(_ctxt: HandlerContext, id: number) {
    return await render("add_tool", { toolId: id });
  }

  @GetApi('/tool-submissions')
  static async toolSubmissions(ctxt: HandlerContext) {
    const allTools: WorkflowOrchestrationTool[] = await ctxt.invoke(ShopUtilities).retrieveAllTools();

    const pendingTools = allTools.filter(tool => tool.status === ToolSubmissionStatus.PENDING);
    const inReviewTools = allTools.filter(tool => tool.status === ToolSubmissionStatus.IN_REVIEW);
    const approvedTools = allTools.filter(tool => tool.status === ToolSubmissionStatus.APPROVED);
    const rejectedTools = allTools.filter(tool => tool.status === ToolSubmissionStatus.REJECTED);
    const cancelledTools = allTools.filter(tool => tool.status === ToolSubmissionStatus.CANCELLED);

    return await render("tool_submissions", {
      pendingTools,
      inReviewTools,
      approvedTools,
      rejectedTools,
      cancelledTools
    });
  }

  @GetApi('/tool-submission/:id')
  static async toolSubmission(ctxt: HandlerContext, id: number) {
    const tool = await ctxt.invoke(ShopUtilities).getToolById(id);
    return await render("tool_submission_detail", {
      tool
    });
  }
}
