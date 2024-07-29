import { Transaction, TransactionContext } from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export enum ToolSubmissionStatus {
  PENDING = 'pending',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export function isValidToolSubmissionStatus(status: string): status is ToolSubmissionStatus {
  return Object.values(ToolSubmissionStatus).includes(status as ToolSubmissionStatus);
}

export function toToolSubmissionStatus(status: string): ToolSubmissionStatus {
  if (isValidToolSubmissionStatus(status)) {
    return status;
  }
  throw new Error(`Invalid tool submission status: ${status}`);
}


export interface WorkflowOrchestrationFeature {
  id: number;
  name: string;
  description: string;
  importance: number;
}

export interface WorkflowOrchestrationTool {
  id: number;
  name: string;
  description: string;
  website_url: string;
  transactional_execution: boolean;
  high_performance: boolean;
  cloud_scalability: boolean;
  primary_language: string;
  status: ToolSubmissionStatus;
  slot_number: number | null;
  submitted_at: Date;
  updated_at: Date;
}


export class ShopUtilities {

  // Workflow Orchestration
  @Transaction({ readOnly: true })
  static async retrieveAllFeatures(ctxt: KnexTransactionContext): Promise<WorkflowOrchestrationFeature[]> {
    return await ctxt.client<WorkflowOrchestrationFeature>('workflow_orchestration_features')
      .select("*")
      .orderBy('importance', 'desc');
  }

  @Transaction()
  static async createFeature(ctxt: KnexTransactionContext, feature: Omit<WorkflowOrchestrationFeature, 'id'>): Promise<WorkflowOrchestrationFeature> {
    const [newFeature] = await ctxt.client<WorkflowOrchestrationFeature>('workflow_orchestration_features')
      .insert(feature)
      .returning('*');
    return newFeature;
  }

  // Workflow Orchestration Tools methods
  @Transaction({ readOnly: true })
  static async retrieveAllTools(ctxt: KnexTransactionContext): Promise<WorkflowOrchestrationTool[]> {
    return await ctxt.client<WorkflowOrchestrationTool>('workflow_orchestration_tools')
      .select("*");
  }

  @Transaction({ readOnly: true })
  static async getToolsWithSlots(ctxt: KnexTransactionContext): Promise<(WorkflowOrchestrationTool | null)[]> {
    const MAX_SLOTS = 6;
  
    const result = await ctxt.client.raw(`
      WITH slots AS (
        SELECT generate_series(1, ?) AS slot_number
      )
      SELECT 
        t.id,
        t.name,
        t.description,
        t.website_url,
        t.transactional_execution,
        t.high_performance,
        t.cloud_scalability,
        t.primary_language,
        t.status,
        s.slot_number,
        t.submitted_at,
        t.updated_at
      FROM slots s
      LEFT JOIN workflow_orchestration_tools t ON s.slot_number = t.slot_number
        AND t.status IN ('pending', 'in_review', 'approved')
      ORDER BY s.slot_number
    `, [MAX_SLOTS]);
  
    return result.rows.map((row: any) => {
      if (row.id === null) {
        return null;
      }
      return {
        ...row,
        transactional_execution: row.transactional_execution === true,
        high_performance: row.high_performance === true,
        cloud_scalability: row.cloud_scalability === true,
        status: toToolSubmissionStatus(row.status)
      };
    });
  }


  @Transaction()
  static async getAvailableSlot(ctxt: KnexTransactionContext): Promise<number | null> {
    const occupiedSlots = await ctxt.client<{ slot_number: number }>('workflow_orchestration_tools')
      .select('slot_number')
      .whereIn('status', [ToolSubmissionStatus.PENDING, ToolSubmissionStatus.IN_REVIEW, ToolSubmissionStatus.APPROVED])
      .whereNotNull('slot_number');
    
    const occupiedSlotNumbers = occupiedSlots.map(slot => slot.slot_number);
    for (let i = 1; i <= 6; i++) {
      if (!occupiedSlotNumbers.includes(i)) {
        return i;
      }
    }
    return null;
  }

  @Transaction()
    static async createPendingTool(ctxt: KnexTransactionContext, slot_number: number): Promise<number | null> {
        try {
            const [newTool] = await ctxt.client<WorkflowOrchestrationTool>('workflow_orchestration_tools')
                .insert({
                    name: 'Pending Submission',
                    description: 'Tool submission in progress',
                    website_url: '',
                    transactional_execution: false,
                    high_performance: false,
                    cloud_scalability: false,
                    primary_language: '',
                    status: ToolSubmissionStatus.PENDING,
                    slot_number: slot_number
                })
                .returning('id');
            return newTool.id;
        } catch (error) {
            // Check if the error is due to a unique constraint violation
            if (error instanceof Error && error.message.includes('unique constraint')) {
                ctxt.logger.warn(`Slot ${slot_number} is already taken`);
                return null;
            }
            ctxt.logger.error(`Failed to create pending tool for slot ${slot_number}: ${error}`);
            throw error;
        }
    }

    @Transaction()
    static async updatePendingTool(ctxt: KnexTransactionContext, id: number, toolData: Omit<WorkflowOrchestrationTool, 'id' | 'status' | 'slot_number' | 'submitted_at' | 'updated_at'>): Promise<void> {
      const updatedCount = await ctxt.client<WorkflowOrchestrationTool>('workflow_orchestration_tools')
        .where({ id: id, status: ToolSubmissionStatus.PENDING })
        .update({
          ...toolData,
          updated_at: ctxt.client.fn.now()
        });
      
      if (updatedCount === 0) {
        throw new Error(`Tool with id ${id} not found or is not in PENDING status`);
      }
    }

  @Transaction()
  static async createTool(ctxt: KnexTransactionContext, tool: Omit<WorkflowOrchestrationTool, 'id' | 'status' | 'slot_number' | 'submitted_at' | 'updated_at'>): Promise<number> {
    const availableSlot = await ShopUtilities.getAvailableSlot(ctxt);
    if (availableSlot === null) {
      throw new Error("No available slots for new tool submissions");
    }

    const [newTool] = await ctxt.client<WorkflowOrchestrationTool>('workflow_orchestration_tools')
      .insert({
        ...tool,
        status: ToolSubmissionStatus.PENDING,
        slot_number: availableSlot
      })
      .returning('id');

    return newTool.id;
  }

  @Transaction()
  static async moveToolToReview(ctxt: KnexTransactionContext, toolId: number): Promise<void> {
    await ctxt.client('workflow_orchestration_tools')
      .where({ id: toolId, status: ToolSubmissionStatus.PENDING })
      .update({ status: ToolSubmissionStatus.IN_REVIEW, updated_at: ctxt.client.fn.now() });
  }

  @Transaction()
  static async approveTool(ctxt: KnexTransactionContext, toolId: number): Promise<void> {
    await ctxt.client('workflow_orchestration_tools')
      .where({ id: toolId, status: ToolSubmissionStatus.IN_REVIEW })
      .update({ status: ToolSubmissionStatus.APPROVED, updated_at: ctxt.client.fn.now() });
  }

  @Transaction()
  static async rejectTool(ctxt: KnexTransactionContext, toolId: number): Promise<void> {
    const tool = await ctxt.client('workflow_orchestration_tools')
      .where({ id: toolId, status: ToolSubmissionStatus.IN_REVIEW })
      .first();
    
    if (tool) {
      await ctxt.client('workflow_orchestration_tools')
        .where({ id: toolId })
        .update({ status: ToolSubmissionStatus.REJECTED, slot_number: null, updated_at: ctxt.client.fn.now() });
    } else {
      throw new Error(`Tool with id ${toolId} not found or not in review`);
    }
  }

  @Transaction()
  static async cancelTool(ctxt: KnexTransactionContext, id: number): Promise<void> {
    const updatedCount = await ctxt.client<WorkflowOrchestrationTool>('workflow_orchestration_tools')
      .where({ id: id })
      .update({ 
        status: ToolSubmissionStatus.CANCELLED,
        slot_number: null,
        updated_at: ctxt.client.fn.now()
      });
    
    if (updatedCount === 0) {
      throw new Error(`Tool with id ${id} not found`);
    }
  }

  @Transaction({ readOnly: true })
  static async getToolById(ctxt: KnexTransactionContext, id: number): Promise<WorkflowOrchestrationTool> {
    const tool = await ctxt.client<WorkflowOrchestrationTool>('workflow_orchestration_tools')
      .where({ id })
      .first();
    
    if (!tool) {
      throw new Error(`Tool with id ${id} not found`);
    }

    return {
      ...tool,
      status: toToolSubmissionStatus(tool.status)
    };
  }

  @Transaction({ readOnly: true })
  static async getToolsByStatus(ctxt: KnexTransactionContext, status: ToolSubmissionStatus): Promise<WorkflowOrchestrationTool[]> {
    const tools = await ctxt.client<WorkflowOrchestrationTool>('workflow_orchestration_tools')
      .where({ status })
      .orderBy('submitted_at', 'asc');

    return tools.map(tool => ({
      ...tool,
      status: toToolSubmissionStatus(tool.status)
    }));
  }

  @Transaction()
  static async validateToolUrl(ctxt: KnexTransactionContext, url: string): Promise<boolean> {
    ctxt.logger.info(`Starting URL validation for: ${url}`);
    // throw new Error("Random URL service failure");
    await new Promise(resolve => setTimeout(resolve, 30000));
    try {
      new URL(url);
      ctxt.logger.info(`URL validation successful for: ${url}`);
      return true;
    } catch (error) {
      ctxt.logger.warn(`URL validation failed for: ${url}.`);
      return false;
    }
  }
}
