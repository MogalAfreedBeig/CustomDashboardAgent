// Visualization Service - Chart Configuration Generator
import type {
  VisualizationConfig,
  ChartConfig,
  ChartType,
  ColumnMetadata
} from '../types/index.js';

/**
 * Visualization Service - Auto-generates chart configurations
 * 
 * Features:
 * - Automatic chart type selection
 * - Smart axis detection
 * - Color palette generation
 * - Format detection
 */

class VisualizationService {
  private colorPalettes = {
    default: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],
    categorical: ['#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#F97316', '#FBBF24'],
    sequential: ['#DBEAFE', '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF'],
    diverging: ['#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#E5E7EB', '#BBF7D0', '#86EFAC', '#4ADE80', '#22C55E'],
  };

  /**
   * Generate visualization configuration from query results
   */
  async generateVisualization(
    data: any[],
    columns: ColumnMetadata[],
    options: {
      type?: ChartType;
      title: string;
      xAxis?: string;
      yAxis?: string;
    }
  ): Promise<VisualizationConfig | undefined> {
    const { type, title, xAxis, yAxis } = options;
    
    console.log("\n🎯 ===== VIS SERVICE START =====");
    console.log("Requested Type:", type);
    console.log("Data Length:", data.length);
    console.log("Columns:", columns.map(c => c.name));

    // Auto-detect chart type if not specified
    let chartType = type || this.detectChartType(data, columns);

    // Auto-detect axes if not specified
    const detectedAxes = this.detectAxes(data, columns, xAxis, yAxis);

    // If data/axes are insufficient, skip chart generation entirely (table + insights only)
    if (!this.hasSufficientDataForChart(chartType, data, detectedAxes)) {
      return undefined;
    }

    // Generate chart configuration
    const config = this.buildChartConfig(
      chartType,
      data,
      columns,
      detectedAxes,
      title
    );

    return {
      type: chartType,
      title,
      description: this.generateDescription(chartType, detectedAxes),
      config,
    };
  }

  /**
   * Detect the best chart type for the data
   */
  private detectChartType(data: any[], columns: ColumnMetadata[]): ChartType {
    const rowCount = data.length;
    const dateColumns = columns.filter(c =>
      c.type === 'DATE' || c.type === 'TIMESTAMP' ||
      (c.name.toLowerCase().includes('date') || c.name.toLowerCase().includes('time'))
    );
    const numericColumns = columns.filter(c =>
      c.type === 'INTEGER' || c.type === 'NUMERIC'
    );
    const stringColumns = columns.filter(c => c.type === 'STRING');

    // Single value
    if (rowCount === 1 && numericColumns.length === 1) {
      return 'metric';
    }

    // Time series
    if (dateColumns.length > 0 && numericColumns.length > 0) {
      if (numericColumns.length === 1) {
        return 'line';
      }
      return 'combo';
    }

    // Part-to-whole (categorical with single metric)
    if (stringColumns.length === 1 && numericColumns.length === 1) {
      if (rowCount <= 6) {
        return 'donut';
      }
      return 'bar';
    }

    // Multiple metrics comparison
    if (numericColumns.length >= 2 && stringColumns.length === 1) {
      return 'grouped_bar';
    }

    // Single metric with categories
    if (numericColumns.length === 1 && stringColumns.length >= 1) {
      return 'bar';
    }

    // Default to table for complex data
    return 'table';
  }

  /**
   * Detect appropriate axes for the chart
   */
  private detectAxes(
    data: any[],
    columns: ColumnMetadata[],
    preferredX?: string,
    preferredY?: string
  ): { xAxis?: string; yAxis?: string; yAxis2?: string; series?: string[] } {

    const dateColumns = columns.filter(c =>
      c.type === 'DATE' || c.type === 'TIMESTAMP' ||
      c.name.toLowerCase().includes('date')
    );

    let numericColumns = columns.filter(c =>
      c.type === 'INTEGER' || c.type === 'NUMERIC'
    );

    // Fallback: infer numeric columns from data values if metadata is incomplete
    if (numericColumns.length === 0) {
      numericColumns = columns.filter(c =>
        data.some(row => this.isNumericValue(row?.[c.name]))
      );
    }

    const stringColumns = columns.filter(c => c.type === 'STRING');

    // X-axis: prefer date, then string, then first column
    let xAxis = preferredX && this.hasColumn(columns, preferredX) ? preferredX : undefined;
    if (!xAxis) {
      if (dateColumns.length > 0) {
        xAxis = dateColumns[0].name;
      } else if (stringColumns.length > 0) {
        xAxis = stringColumns[0].name;
      } else {
        xAxis = columns[0]?.name;
      }
    }

    // Y-axis: prefer numeric columns
    let yAxis = preferredY && this.hasColumn(columns, preferredY) ? preferredY : undefined;
    let yAxis2: string | undefined;
    let series: string[] = [];

    if (!yAxis && numericColumns.length > 0) {
      yAxis = numericColumns[0].name;
    }

    if (yAxis) {
      const remainingNumeric = numericColumns
        .map(c => c.name)
        .filter((name) => name !== yAxis && name !== xAxis);

      if (remainingNumeric.length > 0) {
        // Reserve one secondary metric for combo charts; keep full list for multi-series rendering.
        yAxis2 = remainingNumeric[0];
        series = remainingNumeric;
      }
    }

    return { xAxis, yAxis, yAxis2, series };
  }

  /**
   * Build chart configuration
   */
  private buildChartConfig(
    chartType: ChartType,
    data: any[],
    columns: ColumnMetadata[],
    axes: { xAxis?: string; yAxis?: string; yAxis2?: string; series?: string[] },
    title: string
  ): ChartConfig {
    const baseConfig: ChartConfig = {
      colors: this.selectColorPalette(chartType, data.length),
      showLegend: chartType !== 'metric',
      showGrid: true,
      showTooltip: true,
      animate: true,
    };

    if (axes.xAxis) {
      baseConfig.xAxis = {
        field: axes.xAxis,
        label: this.formatLabel(axes.xAxis),
        format: this.detectFormat(axes.xAxis, columns),
      };
    }

    // if (axes.yAxis) {
    //   baseConfig.yAxis = {
    //     field: axes.yAxis,
    //     label: this.formatLabel(axes.yAxis),
    //     format: this.detectFormat(axes.yAxis, columns),
    //   };
    // }

    // updated 
    if (axes.yAxis) {
      baseConfig.yAxis = {
        field: axes.yAxis,
        label: this.formatLabel(axes.yAxis),
        format: this.detectFormat(axes.yAxis, columns),
      };

      // ✅ ADD PRIMARY SERIES COLOR
      baseConfig.series = [
        {
          field: axes.yAxis,
          label: this.formatLabel(axes.yAxis),
          color: this.colorPalettes.default[0],
          type: this.getSeriesTypeForChart(chartType),
        }
      ];
    }

    // Add series configuration for multi-series charts
    // const seriesFields = (axes.series || []).filter(
    //   (field) => !(chartType === 'combo' && field === axes.yAxis2)
    // );
    // if (seriesFields.length > 0) {
    //   baseConfig.series = seriesFields.map((field, index) => ({
    //     field,
    //     label: this.formatLabel(field),
    //     color: this.colorPalettes.default[index % this.colorPalettes.default.length],
    //     type: this.getSeriesTypeForChart(chartType),
    //   }));
    // }

    const seriesFields = (axes.series || []).filter(
        (field) => !(chartType === 'combo' && field === axes.yAxis2)
      );

      if (seriesFields.length > 0) {
        baseConfig.series = [
          ...(baseConfig.series || []),
          ...seriesFields.map((field, index) => ({
            field,
            label: this.formatLabel(field),
            color: this.colorPalettes.default[(index + 1) % this.colorPalettes.default.length],
            type: this.getSeriesTypeForChart(chartType),
          }))
        ];
      }

    // Add second Y-axis for combo charts
    if (axes.yAxis2 && chartType === 'combo') {
      baseConfig.yAxis2 = {
        field: axes.yAxis2,
        label: this.formatLabel(axes.yAxis2),
        format: this.detectFormat(axes.yAxis2, columns),
      };
    }

    return baseConfig;
  }

  /**
   * Select appropriate color palette
   */
  private selectColorPalette(chartType: ChartType, dataCount: number): string[] {
    switch (chartType) {
      case 'pie':
      case 'donut':
        return this.colorPalettes.categorical;
      case 'heatmap':
        return this.colorPalettes.sequential;
      case 'bar':
      case 'line':
        return this.colorPalettes.default;
      default:
        return this.colorPalettes.default;
    }
  }

  /**
   * Detect format for a field
   */
  private detectFormat(fieldName: string | undefined, columns: ColumnMetadata[]): any {
    if (!fieldName) return 'string';
    const column = columns.find(c => c.name === fieldName);
    if (!column) return 'string';

    const name = fieldName.toLowerCase();

    // Currency detection
    if (name.includes('spend') || name.includes('revenue') ||
      name.includes('budget') || name.includes('cost') ||
      name.includes('price') || name.includes('amount')) {
      return 'currency';
    }

    // Percentage detection
    if (name.includes('rate') || name.includes('percentage') ||
      name.includes('ctr') || name.includes('cpm') || name.includes('cpc')) {
      return 'percentage';
    }

    // Number detection
    if (column.type === 'INTEGER' || column.type === 'NUMERIC') {
      return 'number';
    }

    return 'string';
  }

  /**
   * Format field name for display
   */
  private formatLabel(fieldName: string | undefined): string {
    if (!fieldName) return 'Value';
    return fieldName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^\s+/, '')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Generate chart description
   */
  private generateDescription(
    chartType: ChartType,
    axes: { xAxis?: string; yAxis?: string }
  ): string {
    const descriptions: Record<ChartType, string> = {
      metric: `Key metric: ${this.formatLabel(axes.yAxis)}`,
      bar: `${this.formatLabel(axes.yAxis)} by ${this.formatLabel(axes.xAxis)}`,
      line: `${this.formatLabel(axes.yAxis)} trend over ${this.formatLabel(axes.xAxis)}`,
      area: `${this.formatLabel(axes.yAxis)} cumulative trend`,
      pie: `${this.formatLabel(axes.yAxis)} distribution`,
      donut: `${this.formatLabel(axes.yAxis)} breakdown`,
      stacked_bar: `${this.formatLabel(axes.yAxis)} composition`,
      grouped_bar: `${this.formatLabel(axes.yAxis)} comparison`,
      funnel: `Conversion funnel`,
      heatmap: `${this.formatLabel(axes.yAxis)} matrix`,
      scatter: `Correlation analysis`,
      combo: `Multi-metric view`,
      table: `Detailed data view`,
    };

    return descriptions[chartType] || 'Data visualization';
  }

  private hasColumn(columns: ColumnMetadata[], fieldName: string): boolean {
    return columns.some(c => c.name === fieldName);
  }

  private getSeriesTypeForChart(chartType: ChartType): 'bar' | 'line' | 'area' {
    if (chartType === 'line') return 'line';
    if (chartType === 'area') return 'area';
    if (chartType === 'combo') return 'line';
    return 'bar';
  }

  private hasFieldValue(data: any[], field?: string): boolean {
    if (!field) return false;
    return data.some((row) => row?.[field] !== null && row?.[field] !== undefined);
  }

  private hasSufficientDataForChart(
    chartType: ChartType,
    data: any[],
    axes: { xAxis?: string; yAxis?: string; yAxis2?: string; series?: string[] }
  ): boolean {
    if (!data || data.length === 0) return false;
    if (chartType === 'table') return false;

    const hasX = this.hasFieldValue(data, axes.xAxis);
    const hasY = this.hasFieldValue(data, axes.yAxis);
    const hasSeries = (axes.series || []).some((field) => this.hasFieldValue(data, field));

    switch (chartType) {
      case 'metric':
        return hasY;
      case 'line':
      case 'area':
      case 'combo':
        return data.length >= 2 && hasX && (hasY || hasSeries);
      case 'grouped_bar':
      case 'stacked_bar':
        return hasX && (hasY || hasSeries);
      case 'bar':
      case 'pie':
      case 'donut':
      case 'funnel':
      case 'heatmap':
      case 'scatter':
        return hasX && hasY;
      default:
        return hasX && hasY;
    }
  }

  private isNumericValue(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(trimmed);
  }

  /**
   * Transform data for specific chart types
   */
  transformDataForChart(data: any[], chartType: ChartType, config: ChartConfig): any[] {
    switch (chartType) {
      case 'funnel':
        return this.transformForFunnel(data, config);
      case 'heatmap':
        return this.transformForHeatmap(data, config);
      default:
        return data;
    }
  }

  /**
   * Transform data for funnel chart
   */
  private transformForFunnel(data: any[], config: ChartConfig): any[] {
    // Sort by value descending for funnel
    return [...data].sort((a, b) =>
      (b[config.yAxis!.field] || 0) - (a[config.yAxis!.field] || 0)
    );
  }

  /**
   * Transform data for heatmap
   */
  private transformForHeatmap(data: any[], config: ChartConfig): any[] {
    // Heatmap needs matrix format
    // This is a simplified transformation
    return data;
  }
}

export const visualizationService = new VisualizationService();