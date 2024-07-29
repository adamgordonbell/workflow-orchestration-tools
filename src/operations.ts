import { WorkflowContext, Workflow, HandlerContext, PostApi, ArgOptional, GetApi, ArgRequired } from '@dbos-inc/dbos-sdk';
import { ShopUtilities, WorkflowOrchestrationFeature, WorkflowOrchestrationTool, ToolSubmissionStatus } from './utilities';
export { Frontend } from './frontend';

export const TOOL_REVIEW_TOPIC = "tool_review";
export const TOOL_SUBMISSION_URL_EVENT = "tool_submission_url";
export const TOOL_SUBMISSION_TOPIC = "tool_submission";


export class Shop {

  @GetApi('/features')
  static async getAllFeatures(ctxt: HandlerContext): Promise<WorkflowOrchestrationFeature[]> {
    return await ctxt.invoke(ShopUtilities).retrieveAllFeatures();
  }

  @GetApi('/tools')
  static async getAllTools(ctxt: HandlerContext): Promise<WorkflowOrchestrationTool[]> {
    return await ctxt.invoke(ShopUtilities).retrieveAllTools();
  }

  @PostApi('/features')
  static async createFeature(ctxt: HandlerContext, name: string, description: string, importance: number): Promise<WorkflowOrchestrationFeature> {
    return await ctxt.invoke(ShopUtilities).createFeature({ name, description, importance });
  }

  @PostApi('/submit-tool')
  static async submitTool(
    ctxt: HandlerContext,
    @ArgRequired toolId: number,
    @ArgRequired workflowUUID: string,
    @ArgRequired name: string,
    @ArgRequired description: string,
    @ArgRequired website_url: string,
    @ArgOptional transactional_execution: boolean = false,
    @ArgOptional high_performance: boolean = false,
    @ArgOptional cloud_scalability: boolean = false,
    @ArgRequired primary_language: string
  ): Promise<string> {
    try {
      const toolData = {
        name,
        description,
        website_url,
        transactional_execution,
        high_performance,
        cloud_scalability,
        primary_language
      };
      ctxt.logger.info(`POST /submit-tool ${toolId}`);
      await ctxt.invoke(ShopUtilities).updatePendingTool(toolId, toolData);
      ctxt.logger.info(`updatePendingTool in DB for ToolID: ${toolId}`);
      await ctxt.send(workflowUUID, toolId.toString(), TOOL_SUBMISSION_TOPIC);
      ctxt.logger.info(`tool ${toolId} submitted`);
      return "Tool submitted successfully. It will be automatically reviewed.";
    } catch (error) {
      ctxt.logger.error(`Error submitting tool: ${error}`);
      if (error instanceof Error && error.message.includes('not found or is not in PENDING status')) {
        ctxt.logger.error(`Tool ${toolId} not found or is not in PENDING status`);
        return "Failed to submit tool. The submission may have expired or the tool was already processed.";
      }
      return "An unexpected error occurred. Please try again later.";
    }
  }

  @Workflow()
  static async toolSubmissionWorkflow(ctxt: WorkflowContext, toolId: number): Promise<void> {
    try {
      ctxt.logger.info(`Starting tool submission workflow for tool ${toolId}`);

      const submission = await ctxt.recv<string>(TOOL_SUBMISSION_TOPIC, 30);

      if (!submission) {
        ctxt.logger.warn(`Tool submission ${toolId} timed out`);
        await ctxt.invoke(ShopUtilities).cancelTool(toolId);
        return;
      }

      await ctxt.invoke(ShopUtilities).moveToolToReview(toolId);
      ctxt.logger.info(`Tool ${toolId} set to in_review`);

      const tool = await ctxt.invoke(ShopUtilities).getToolById(toolId);
      
      ctxt.logger.info(`Validating tool URL for tool ${toolId}`);
      const isUrlValid = await ctxt.invoke(ShopUtilities).validateToolUrl(tool.website_url);
      if (!isUrlValid) {
        await ctxt.invoke(ShopUtilities).rejectTool(toolId);
        ctxt.logger.info(`Tool ${toolId} rejected due to invalid URL`);
        await ctxt.setEvent('TOOL_STATUS', { id: toolId, status: 'rejected', reason: 'Invalid URL' });
        return;
      }
      ctxt.logger.info(`Tool ${toolId} approved by external service`);
      await ctxt.invoke(ShopUtilities).approveTool(toolId);
      await ctxt.setEvent('TOOL_STATUS', { id: toolId, status: 'approved' });

    } catch (error) {
      ctxt.logger.error(`Error in tool submission workflow for tool ${toolId}: ${error}`);
      await ctxt.invoke(ShopUtilities).cancelTool(toolId);
      await ctxt.setEvent('TOOL_STATUS', { id: toolId, status: 'cancelled', reason: 'Workflow error' });
    }
  }

  @GetApi('/tool-submissions')
  static async getToolSubmissions(ctxt: HandlerContext, @ArgOptional status?: string): Promise<WorkflowOrchestrationTool[]> {
    if (status && Object.values(ToolSubmissionStatus).includes(status as ToolSubmissionStatus)) {
      return await ctxt.invoke(ShopUtilities).getToolsByStatus(status as ToolSubmissionStatus);
    } else {
      return await ctxt.invoke(ShopUtilities).retrieveAllTools();
    }
  }

  @PostApi('/create-pending-tool')
  static async createPendingTool(ctxt: HandlerContext, slot_number: number): Promise<{ toolId: number | null, workflowUUID?: string }> {
      try {
          ctxt.logger.info(`createPendingTool for ${slot_number}`);
          const toolId = await ctxt.invoke(ShopUtilities).createPendingTool(slot_number);
          ctxt.logger.info(`createPendingTool DB Success for ${slot_number}: toolId ${toolId}`);
          
          if (toolId) {
              const handle = await ctxt.startWorkflow(Shop).toolSubmissionWorkflow(toolId);
              return { toolId: toolId, workflowUUID: handle.getWorkflowUUID() };
          } else {
              return { toolId: null };
          }
      } catch (error) {
          ctxt.logger.error(`Error creating pending tool for slot ${slot_number}: ${error}`);
          return { toolId: null };
      }
  }

}
