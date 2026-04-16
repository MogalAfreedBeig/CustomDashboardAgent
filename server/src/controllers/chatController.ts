// Chat Controller - Handles conversational queries
import type { Request, Response } from 'express';
import { queryService } from '../services/queryService.js';
import { exportService } from '../services/exportService.js';
import type { QueryRequest } from '../types/index.ts';

export class ChatController {
  /**
   * Execute a natural language query
   */
  async executeQuery(req: Request, res: Response): Promise<void> {
    try {
      const { query, conversationId, context } = req.body as QueryRequest;

      if (!query || query.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_QUERY', message: 'Query is required' },
        });
        return;
      }

      // Get user from auth
      const userId = (req as any).user?.id || 'anonymous';

      // Execute query with streaming updates
      const result = await queryService.executeQuery(
        { query, conversationId, context },
        userId,
        (update) => {
          // In a real implementation, this would stream via WebSocket
          // For now, we just log
          console.log('Query update:', update.type);
        }
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Query execution error:', error);
      if (error instanceof Error)
        res.status(500).json({
          success: false,
          error: {
            code: 'QUERY_FAILED',
            message: (error?.message) ? error.message : 'Please try again later.',
          },
        });
    }
  }

  /**
   * Get conversation history
   */
  // async getConversation(req: Request, res: Response): Promise<void> {
  //   try {
  //     const { conversationId } = req.params;

  //     const messages = queryService.getConversation(conversationId as string);

  //     res.json({
  //       success: true,
  //       data: { conversationId, messages },
  //     });
  //   } catch (error) {
  //     if (error instanceof Error)
  //       res.status(500).json({
  //         success: false,
  //         error: { code: 'FETCH_FAILED', message: error.message },
  //       });
  //   }
  // }

  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;

      const messages = await queryService.getConversation(conversationId as string);

      res.json({
        success: true,
        data: { conversationId, messages },
      });
    } catch (error) {
      if (error instanceof Error)
        res.status(500).json({
          success: false,
          error: { code: 'FETCH_FAILED', message: error.message },
        });
    }
  }

  /**
   * Get user's conversations
   */
  // async getUserConversations(req: Request, res: Response): Promise<void> {
  //   try {
  //     const userId = (req as any).user?.id || 'anonymous';

  //     const conversations = queryService.getUserConversations(userId);

  //     res.json({
  //       success: true,
  //       data: conversations,
  //     });
  //   } catch (error) {
  //     if (error instanceof Error)
  //       res.status(500).json({
  //         success: false,
  //         error: { code: 'FETCH_FAILED', message: error.message },
  //       });
  //   }
  // }

  async getUserConversations(req: Request, res: Response) {
    try {
      const userId = "anonymous";

      const conversations =
        await queryService.getUserConversations(userId);

      res.json({
        success: true,
        data: conversations,
      });

    } catch (error) {
      console.error("getUserConversations error:", error);

      res.status(500).json({
        success: false,
        error: "Failed to fetch conversations",
      });
    }
  }

  /**
   * Delete a conversation
   */
  // async deleteConversation(req: Request, res: Response): Promise<void> {
  //   try {
  //     const { conversationId } = req.params;

  //     // In a real implementation, delete from database

  //     res.json({
  //       success: true,
  //       data: { deleted: true },
  //     });
  //   } catch (error) {
  //     if (error instanceof Error)
  //       res.status(500).json({
  //         success: false,
  //         error: { code: 'DELETE_FAILED', message: error.message },
  //       });
  //   }
  // }

  async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = req.params.conversationId as string;

      await queryService.deleteConversation(conversationId);

      res.json({
        success: true,
        data: { deleted: true },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: 'DELETE_FAILED', message: 'Failed to delete chat' },
      });
    }
  }

  async exportToPDF(req: Request, res: Response): Promise<void> {
    try {
      const { messages } = req.body;

      const pdfBuffer = await exportService.exportChatToPDF(messages);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="chat-report.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      if (error instanceof Error)
        res.status(500).json({
          success: false,
          error: { code: 'EXPORT_FAILED', message: error.message },
        });
    }
  }

  async exportToPPT(req: Request, res: Response): Promise<void> {
    try {
      const { messages } = req.body;

      const pptBuffer = await exportService.exportChatToPPT(messages);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="chat-report.pptx"'
      );

      res.send(pptBuffer);
    } catch (error) {
      if (error instanceof Error)
        res.status(500).json({
          success: false,
          error: { code: 'EXPORT_FAILED', message: error.message },
        });
    }
  }
}

export const chatController = new ChatController();
export default chatController;