// API Routes
import { Router } from 'express';
import { chatController } from '../controllers/chatController.js';
import { visualizationController } from '../controllers/visualizationController.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chat/Query routes
router.post('/chat/query', chatController.executeQuery);
router.get('/chat/conversations', chatController.getUserConversations);
// router.get('/chat/conversations', chatController.getConversations);
router.get('/chat/conversation/:conversationId', chatController.getConversation);
router.delete('/chat/conversation/:conversationId', chatController.deleteConversation);

// Export routes
router.post('/export/pdf', chatController.exportToPDF);
router.post('/export/ppt', chatController.exportToPPT);

// Visualization routes
router.post('/visualizations/generate', visualizationController.generateVisualization);
router.get('/visualizations/types', visualizationController.getChartTypes);
router.post('/visualizations/update', visualizationController.updateChartConfig);

// Schema routes
router.get('/schema', async (req, res) => {
  try {
    const { bigqueryService } = await import('../services/bigqueryService.js');
    const schemas = await bigqueryService.getAllSchemas();
    res.json({ success: true, data: schemas });
  } catch (error) {
    if (error instanceof Error)
      res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
