// Visualization Controller - Handles chart generation
import type { Request, Response } from 'express';
import { visualizationService } from '../services/visualizationService.js';

export class VisualizationController {
  /**
   * Generate visualization from data
   */
  async generateVisualization(req: Request, res: Response): Promise<void> {
    try {
      const { data, columns, config } = req.body;

      if (!data || !Array.isArray(data)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_DATA', message: 'Data array is required' },
        });
        return;
      }

      const visualization = await visualizationService.generateVisualization(
        data,
        columns,
        config
      );

      res.json({
        success: true,
        data: visualization ?? null,
      });
    } catch (error) {
      if (error instanceof Error)
        res.status(500).json({
          success: false,
          error: { code: 'GENERATION_FAILED', message: error.message },
        });
    }
  }

  /**
   * Get available chart types
   */
  async getChartTypes(req: Request, res: Response): Promise<void> {
    const chartTypes = [
      { type: 'metric', name: 'Metric Card', description: 'Single KPI display' },
      { type: 'bar', name: 'Bar Chart', description: 'Category comparison' },
      { type: 'line', name: 'Line Chart', description: 'Time-series trends' },
      { type: 'area', name: 'Area Chart', description: 'Cumulative trends' },
      { type: 'pie', name: 'Pie Chart', description: 'Part-to-whole' },
      { type: 'donut', name: 'Donut Chart', description: 'Modern part-to-whole' },
      { type: 'stacked_bar', name: 'Stacked Bar', description: 'Composition' },
      { type: 'grouped_bar', name: 'Grouped Bar', description: 'Multi-metric comparison' },
      { type: 'funnel', name: 'Funnel Chart', description: 'Conversion flow' },
      { type: 'heatmap', name: 'Heatmap', description: 'Matrix patterns' },
      { type: 'scatter', name: 'Scatter Plot', description: 'Correlation analysis' },
      { type: 'combo', name: 'Combo Chart', description: 'Mixed visualization' },
      { type: 'table', name: 'Data Table', description: 'Detailed view' },
    ];

    res.json({
      success: true,
      data: chartTypes,
    });
  }

  /**
   * Update chart configuration
   */
  async updateChartConfig(req: Request, res: Response): Promise<void> {
    try {
      const { chartId, config } = req.body;

      // In a real implementation, update stored chart config

      res.json({
        success: true,
        data: { chartId, config },
      });
    } catch (error) {
      if (error instanceof Error)
        res.status(500).json({
          success: false,
          error: { code: 'UPDATE_FAILED', message: error.message },
        });
    }
  }
}

export const visualizationController = new VisualizationController();
export default visualizationController;
