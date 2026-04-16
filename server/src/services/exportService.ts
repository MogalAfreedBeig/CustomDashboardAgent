// Export Service - PDF and PowerPoint Generation
import puppeteer, { type Browser } from 'puppeteer';
import * as PptxGenJS from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import type { ExportConfig, ExportSection, ExportTheme } from '../types/index.js';
import type { VisualizationConfig } from '@shared/types/index.js';

/**
 * Export Service - Professional Report Generation
 * 
 * Features:
 * - PDF export with charts and tables
 * - PowerPoint export with multiple slides
 * - Custom branding and templates
 * - Chart image generation
 */

class ExportService {
  private defaultTheme: ExportTheme = {
    primaryColor: '#3B82F6',
    secondaryColor: '#10B981',
    fontFamily: 'Inter, system-ui, sans-serif',
    backgroundColor: '#FFFFFF',
  };

  private unwrapExportValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value;

    if (typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
      const nested = (value as { value?: unknown }).value;
      if (nested !== undefined) {
        return this.unwrapExportValue(nested);
      }
    }

    return value;
  }

  private formatExportCell(value: unknown): string {
    const normalized = this.unwrapExportValue(value);

    if (normalized === null || normalized === undefined) return '';

    if (normalized instanceof Date) {
      return normalized.toLocaleString();
    }

    if (typeof normalized === 'number') {
      return Number.isFinite(normalized) ? normalized.toLocaleString() : String(normalized);
    }

    if (typeof normalized === 'boolean') {
      return normalized ? 'true' : 'false';
    }

    if (Array.isArray(normalized)) {
      return normalized.map((item) => this.formatExportCell(item)).join(', ');
    }

    if (typeof normalized === 'object') {
      try {
        return JSON.stringify(normalized);
      } catch {
        return String(normalized);
      }
    }

    return String(normalized);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Export to PDF
   */
  async exportToPDF(config: ExportConfig): Promise<Buffer> {
    const theme = { ...this.defaultTheme, ...config.theme };

    // Generate HTML content
    const html = this.generatePDFHTML(config, theme);
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '40px',
          right: '40px',
          bottom: '40px',
          left: '40px',
        },
      });

      return Buffer.from(pdf);
    } catch (error) {
      console.warn('Puppeteer PDF export failed. Falling back to jsPDF.', error);
      return this.exportToPDFWithJsPdf(config, theme);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Export to PowerPoint
   */
  async exportToPPT(config: ExportConfig): Promise<Buffer> {
    const theme = { ...this.defaultTheme, ...config.theme };

    // Create presentation
    const PptxGen = ((PptxGenJS as any).default || PptxGenJS) as any;
    const pres = new PptxGen();

    // Set metadata
    pres.title = config.title;
    pres.author = config.metadata.author;
    pres.company = config.metadata.company;
    pres.subject = config.subtitle || '';

    // Set layout
    pres.layout = 'LAYOUT_16x9';

    // Define master slide
    pres.defineSlideMaster({
      title: 'MASTER_SLIDE',
      background: { color: theme.backgroundColor || 'FFFFFF' },
      objects: [
        {
          rect: { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: theme.primaryColor.replace('#', '') } },
        },
        {
          text: {
            text: config.metadata.company || '',
            options: { x: 0.5, y: 7.2, w: 5, h: 0.3, fontSize: 10, color: '666666' },
          },
        },
        {
          text: {
            text: config.metadata.confidential ? 'CONFIDENTIAL' : '',
            options: { x: 9, y: 7.2, w: 3, h: 0.3, fontSize: 10, color: '666666', align: 'right' },
          },
        },
      ],
    });

    // Add slides
    for (const section of config.sections) {
      await this.addSlide(pres, section, theme);
    }

    // Generate buffer
    return await pres.write({ outputType: 'nodebuffer' }) as Buffer;
  }

  /**
   * Add a slide to PowerPoint presentation
   */
  private async addSlide(
    pres: any,
    section: ExportSection,
    theme: ExportTheme
  ): Promise<void> {
    switch (section.type) {
      case 'header':
        this.addTitleSlide(pres, section.content, theme);
        break;
      case 'text':
        this.addTextSlide(pres, section.content, theme);
        break;
      case 'chart':
        await this.addChartSlide(pres, section.content, theme);
        break;
      case 'table':
        this.addTableSlide(pres, section.content, theme);
        break;
      case 'insights':
        this.addInsightsSlide(pres, section.content, theme);
        break;
    }
  }

  /**
   * Add title slide
   */
  private addTitleSlide(
    pres: any,
    content: { title: string; subtitle?: string; date?: string },
    theme: ExportTheme
  ): void {
    const slide = pres.addSlide({ masterName: 'MASTER_SLIDE' });

    slide.addText(content.title, {
      x: 0.5,
      y: 2,
      w: 9,
      h: 1.5,
      fontSize: 36,
      bold: true,
      color: theme.primaryColor.replace('#', ''),
      align: 'center',
    });

    if (content.subtitle) {
      slide.addText(content.subtitle, {
        x: 0.5,
        y: 3.5,
        w: 9,
        h: 0.5,
        fontSize: 18,
        color: '666666',
        align: 'center',
      });
    }

    if (content.date) {
      slide.addText(content.date, {
        x: 0.5,
        y: 5,
        w: 9,
        h: 0.3,
        fontSize: 12,
        color: '999999',
        align: 'center',
      });
    }
  }

  /**
   * Add text slide
   */
  private addTextSlide(
    pres: any,
    content: { title: string; body: string },
    theme: ExportTheme
  ): void {
    const slide = pres.addSlide({ masterName: 'MASTER_SLIDE' });

    slide.addText(content.title, {
      x: 0.5,
      y: 1,
      w: 9,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: theme.primaryColor.replace('#', ''),
    });

    slide.addText(content.body, {
      x: 0.5,
      y: 1.8,
      w: 9,
      h: 5,
      fontSize: 14,
      color: '333333',
    });
  }

  /**
   * Add chart slide
   */
  private async addChartSlide(
    pres: any,
    content: { title: string; chartConfig: VisualizationConfig; data: any[] },
    theme: ExportTheme
  ): Promise<void> {
    const slide = pres.addSlide({ masterName: 'MASTER_SLIDE' });

    slide.addText(content.title, {
      x: 0.5,
      y: 1,
      w: 9,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: theme.primaryColor.replace('#', ''),
    });

    const chartData = this.transformChartData(content.data, content.chartConfig);
    if (chartData.length === 0) {
      slide.addText('Chart data unavailable', {
        x: 0.5,
        y: 2.4,
        w: 9,
        h: 0.5,
        fontSize: 14,
        color: '666666',
        align: 'center',
      });
      return;
    }

    const chartOptions: Record<string, unknown> = {
      x: 0.5,
      y: 1.8,
      w: 9,
      h: 4.5,
      chartColors: content.chartConfig.config.colors?.map(c => c.replace('#', '').slice(0, 6)),
      showLegend: content.chartConfig.config.showLegend,
      showValue: true,
    };

    if (content.chartConfig.type === 'stacked_bar') {
      chartOptions.barGrouping = 'stacked';
    }

    slide.addChart(this.mapChartType(content.chartConfig.type, pres), chartData, chartOptions);
  }

  /**
   * Add table slide
   */
  private addTableSlide(
    pres: any,
    content: { title: string; headers: string[]; rows: any[][] },
    theme: ExportTheme
  ): void {
    const slide = pres.addSlide({ masterName: 'MASTER_SLIDE' });

    slide.addText(content.title, {
      x: 0.5,
      y: 1,
      w: 9,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: theme.primaryColor.replace('#', ''),
    });

    const tableData = [
      content.headers.map(h => ({
        text: this.formatExportCell(h),
        options: { bold: true, fill: theme.primaryColor.replace('#', ''), color: 'FFFFFF' },
      })),
      ...content.rows.map((row) => row.map((cell) => this.formatExportCell(cell))),
    ];

    slide.addTable(tableData, {
      x: 0.5,
      y: 1.8,
      w: 9,
      h: 4.5,
      fontSize: 10,
      border: { type: 'solid', pt: 0.5, color: 'CCCCCC' },
      colW: content.headers.map(() => 9 / content.headers.length),
    });
  }

  /**
   * Add insights slide
   */
  private addInsightsSlide(
    pres: any,
    content: { title: string; insights: string[] },
    theme: ExportTheme
  ): void {
    const slide = pres.addSlide({ masterName: 'MASTER_SLIDE' });

    slide.addText(content.title, {
      x: 0.5,
      y: 1,
      w: 9,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: theme.primaryColor.replace('#', ''),
    });

    const insightsText = content.insights.map((insight, i) =>
      `${i + 1}. ${insight}`
    ).join('\n\n');

    slide.addText(insightsText, {
      x: 0.5,
      y: 1.8,
      w: 9,
      h: 5,
      fontSize: 14,
      color: '333333',
      bullet: true,
    });
  }

  /**
   * Map internal chart type to PptxGenJS chart type
   */
  private mapChartType(type: string, pres: any): any {
    const chartTypes: Record<string, any> = {
      bar: pres.ChartType.bar,
      grouped_bar: pres.ChartType.bar,
      stacked_bar: pres.ChartType.bar,
      line: pres.ChartType.line,
      pie: pres.ChartType.pie,
      donut: pres.ChartType.doughnut,
      area: pres.ChartType.area,
      combo: pres.ChartType.bar,
    };

    return chartTypes[type] || pres.ChartType.bar;
  }

  /**
   * Transform chart data for PptxGenJS
   */
  private transformChartData(data: any[], config: VisualizationConfig): any[] {
    const xAxisField = config.config.xAxis?.field;
    const yAxisField = config.config.yAxis?.field;

    if (!xAxisField || !yAxisField) return [];
    if (data.length === 0) return [];

    const labels = data.map((row) => String(row[xAxisField] ?? ''));
    const values = data.map((row) => {
      const numericValue = Number(row[yAxisField]);
      return Number.isFinite(numericValue) ? numericValue : 0;
    });

    return [
      {
        name: String(yAxisField),
        labels,
        values,
      },
    ];
  }

  private exportToPDFWithJsPdf(config: ExportConfig, theme: ExportTheme): Buffer {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    const addWrappedText = (text: string, fontSize: number, lineHeight: number) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(String(text ?? ''), maxWidth);
      ensureSpace(lines.length * lineHeight);
      doc.text(lines, margin, y);
      y += lines.length * lineHeight + 8;
    };

    config.sections.forEach((section) => {
      if (section.type === 'header') {
        ensureSpace(90);
        doc.setTextColor(theme.primaryColor);
        addWrappedText(section.content.title, 22, 26);
        doc.setTextColor('#333333');
        if (section.content.subtitle) addWrappedText(section.content.subtitle, 13, 17);
        if (section.content.date) addWrappedText(`Generated: ${section.content.date}`, 10, 14);
        y += 8;
        return;
      }

      if (section.type === 'text') {
        ensureSpace(50);
        doc.setTextColor(theme.primaryColor);
        addWrappedText(section.content.title, 16, 20);
        doc.setTextColor('#333333');
        addWrappedText(section.content.body, 11, 15);
        return;
      }

      if (section.type === 'insights') {
        ensureSpace(40);
        doc.setTextColor(theme.primaryColor);
        addWrappedText(section.content.title, 16, 20);
        doc.setTextColor('#333333');
        section.content.insights.forEach((insight) => {
          addWrappedText(`- ${insight}`, 11, 15);
        });
        return;
      }

      if (section.type === 'table') {
        ensureSpace(60);
        doc.setTextColor(theme.primaryColor);
        addWrappedText(section.content.title, 16, 20);
        doc.setTextColor('#333333');
        addWrappedText(section.content.headers.join(' | '), 11, 15);
        section.content.rows.forEach((row) => {
          const printableRow = row.map((cell) => this.formatExportCell(cell)).join(' | ');
          addWrappedText(printableRow, 10, 14);
        });
        return;
      }

      if (section.type === 'chart') {
        ensureSpace(40);
        doc.setTextColor(theme.primaryColor);
        addWrappedText(section.content.title, 16, 20);
        doc.setTextColor('#666666');
        addWrappedText('Chart is available in PPT export.', 10, 14);
      }
    });

    return Buffer.from(doc.output('arraybuffer'));
  }

  /**
   * Generate HTML for PDF export
   */
  private generatePDFHTML(config: ExportConfig, theme: ExportTheme): string {
    const sections = config.sections.map((section: ExportSection) =>
      this.renderPDFSection(section, theme)
    ).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${config.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: ${theme.fontFamily};
      font-size: 12pt;
      line-height: 1.6;
      color: #333;
      background: #fff;
    }
    
    .page {
      page-break-after: always;
      padding: 40px;
      min-height: 100vh;
    }
    
    .page:last-child {
      page-break-after: avoid;
    }
    
    .header {
      background: ${theme.primaryColor};
      color: white;
      padding: 30px;
      margin: -40px -40px 30px -40px;
    }
    
    .header h1 {
      font-size: 28pt;
      margin-bottom: 10px;
    }
    
    .header .subtitle {
      font-size: 14pt;
      opacity: 0.9;
    }
    
    .header .meta {
      font-size: 10pt;
      margin-top: 20px;
      opacity: 0.8;
    }
    
    h2 {
      color: ${theme.primaryColor};
      font-size: 18pt;
      margin-bottom: 15px;
      border-bottom: 2px solid ${theme.primaryColor};
      padding-bottom: 5px;
    }
    
    .content {
      margin-bottom: 20px;
    }
    
    .insight-box {
      background: #f8f9fa;
      border-left: 4px solid ${theme.primaryColor};
      padding: 15px;
      margin-bottom: 15px;
    }
    
    .insight-box h3 {
      color: ${theme.primaryColor};
      font-size: 14pt;
      margin-bottom: 10px;
    }
    
    .insight-list {
      list-style: none;
    }
    
    .insight-list li {
      padding: 8px 0;
      padding-left: 25px;
      position: relative;
    }
    
    .insight-list li:before {
      content: "▸";
      color: ${theme.primaryColor};
      position: absolute;
      left: 0;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    
    th {
      background: ${theme.primaryColor};
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    tr:nth-child(even) {
      background: #f9fafb;
    }
    
    .footer {
      position: fixed;
      bottom: 20px;
      left: 40px;
      right: 40px;
      font-size: 9pt;
      color: #666;
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
    }
    
    .confidential {
      color: #dc2626;
      font-weight: bold;
    }
  </style>
</head>
<body>
  ${sections}
  
  <div class="footer">
    <span>${this.escapeHtml(config.metadata.company || 'C9H')}</span>
    <span style="float: right;">
      ${config.metadata.confidential ? '<span class="confidential">CONFIDENTIAL</span> | ' : ''}
      Page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </span>
  </div>
</body>
</html>
`;
  }

  /**
   * Render a single section for PDF
   */
  private renderPDFSection(section: ExportSection, theme: ExportTheme): string {
    switch (section.type) {
      case 'header':
        return `
          <div class="page">
            <div class="header">
              <h1>${section.content.title}</h1>
              ${section.content.subtitle ? `<div class="subtitle">${section.content.subtitle}</div>` : ''}
              <div class="meta">
                ${section.content.date ? `Generated: ${section.content.date}<br>` : ''}
                ${section.content.author ? `Author: ${section.content.author}` : ''}
              </div>
            </div>
          </div>
        `;

      case 'text':
        return `
          <div class="page">
            <h2>${section.content.title}</h2>
            <div class="content">${section.content.body}</div>
          </div>
        `;

      case 'insights':
        return `
          <div class="page">
            <div class="insight-box">
              <h3>${section.content.title}</h3>
              <ul class="insight-list">
                ${section.content.insights.map((i: string) => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          </div>
        `;

      case 'table':
        return `
          <div class="page">
            <h2>${this.escapeHtml(section.content.title)}</h2>
            <table>
              <thead>
                <tr>
                  ${section.content.headers
                    .map((h: string) => `<th>${this.escapeHtml(this.formatExportCell(h))}</th>`)
                    .join('')}
                </tr>
              </thead>
              <tbody>
                ${section.content.rows.map((row: any[]) => `
                  <tr>${row.map((cell: any) => `<td>${this.escapeHtml(this.formatExportCell(cell))}</td>`).join('')}</tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

      default:
        return '';
    }
  }

  /**
   * Create export config from query result
   */
  createExportConfigFromResult(
    query: string,
    result: any,
    metadata?: { author?: string; company?: string }
  ): ExportConfig {
    const exportAuthor = metadata?.author || 'Analytics Assistant';
    const exportCompany = 'C9H';

    const sections: ExportSection[] = [
      {
        type: 'header',
        content: {
          title: 'Analytics Bot Report',
          subtitle: query,
          date: new Date().toLocaleDateString(),
          author: exportAuthor,
        },
      },
    ];

    // Add visualization if available
    if (result.visualization && result.visualization.type !== 'table') {
      sections.push({
        type: 'chart',
        content: {
          title: result.visualization.title,
          chartConfig: result.visualization,
          data: result.data,
        },
      });
    }

    // Add insights if available
    if (result.insights && result.insights.length > 0) {
      sections.push({
        type: 'insights',
        content: {
          title: 'Key Insights',
          insights: result.insights,
        },
      });
    }

    // Add data table
    if (result.data && result.data.length > 0) {
      const headers = Object.keys(result.data[0]);
      const rows = result.data.slice(0, 50).map((row: any) =>
        headers.map((h) => this.formatExportCell(row[h]))
      );

      sections.push({
        type: 'table',
        content: {
          title: 'Data Details',
          headers,
          rows,
        },
      });
    }

    return {
      format: 'pdf',
      title: 'Analytics Bot Report',
      includeDate: true,
      sections,
      theme: this.defaultTheme,
      metadata: {
        author: exportAuthor,
        company: exportCompany,
        confidential: true,
      },
    };
  }

  async exportChatToPPT(messages: any[]): Promise<Buffer> {

    const sections: ExportSection[] = [
      {
        type: 'header',
        content: {
          title: 'Chat Conversation Report',
          subtitle: 'Analytics Chat Export',
          date: new Date().toLocaleDateString(),
          author: 'Analytics Assistant',
        },
      },
    ];

    for (const message of messages) {
      // user message
      if (message.role === 'user') {
        sections.push({
          type: 'text',
          content: {
            title: 'User',
            body: message.content,
          },
        });
      }

      // assistant message
      if (message.role === 'assistant') {
        const result = message.queryResult;

        // TEXT
        sections.push({
          type: 'text',
          content: {
            title: 'Assistant',
            body: message.content,
          },
        });

        // CHART
        if (message.visualization && result?.data?.length) {
          sections.push({
            type: 'chart',
            content: {
              title: message.visualization.title || 'Chart',
              chartConfig: message.visualization,
              data: result.data,
            },
          });
        }

        // TABLE
        if (result?.data?.length) {
          const headers = Object.keys(result.data[0]);
          const rows = result.data.map((row: any) =>
            headers.map((h) => this.formatExportCell(row[h]))
          );

          sections.push({
            type: 'table',
            content: {
              title: 'Data Table',
              headers,
              rows,
            },
          });
        }

        // INSIGHTS
        if (result?.insights?.length) {
          sections.push({
            type: 'insights',
            content: {
              title: 'Key Insights',
              insights: result.insights,
            },
          });
        }
      }
    }

    return this.exportToPPT({
      format: 'ppt',
      title: 'Chat Export',
      includeDate: true,
      sections,
      theme: this.defaultTheme,
      metadata: {
        author: 'Analytics Assistant',
        company: 'C9H',
        confidential: false,
      },
    });
  }

  async exportChatToPDF(messages: any[]): Promise<Buffer> {
    const sections: ExportSection[] = [
      {
        type: 'header',
        content: {
          title: 'Chat Conversation Report',
          subtitle: 'Analytics Chat Export',
          date: new Date().toLocaleDateString(),
          author: 'Analytics Assistant',
        },
      },
    ];

    for (const message of messages) {
      // USER
      if (message.role === 'user') {
        sections.push({
          type: 'text',
          content: {
            title: 'User',
            body: message.content,
          },
        });
      }

      // ASSISTANT
      if (message.role === 'assistant') {
        const result = message.queryResult;

        // TEXT
        sections.push({
          type: 'text',
          content: {
            title: 'Assistant',
            body: message.content,
          },
        });

        // INSIGHTS
        if (result?.insights?.length) {
          sections.push({
            type: 'insights',
            content: {
              title: 'Key Insights',
              insights: result.insights,
            },
          });
        }

        // TABLE
        if (result?.data?.length) {
          const headers = Object.keys(result.data[0]);
          const rows = result.data.map((row: any) =>
            headers.map((h) => this.formatExportCell(row[h]))
          );

          sections.push({
            type: 'table',
            content: {
              title: 'Data Table',
              headers,
              rows,
            },
          });
        }
      }
    }

    return this.exportToPDF({
      format: 'pdf',
      title: 'Chat Export',
      includeDate: true,
      sections,
      theme: this.defaultTheme,
      metadata: {
        author: 'Analytics Assistant',
        company: 'C9H',
        confidential: false,
      },
    });
  }
}

export const exportService = new ExportService();
export default exportService;
