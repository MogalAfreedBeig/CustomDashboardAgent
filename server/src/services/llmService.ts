// LLM Service - Natural Language to SQL with Privacy Preservation
import { AzureOpenAI } from "openai";
import { llmConfig } from '../config/index.js';
import { bigqueryService } from './bigqueryService.js';
import type { SQLGenerationResult, NLToSQLPrompt } from '../types/index.js';

/**
 * LLM Service - Privacy-Preserving NL to SQL
 *
 * Key Principle: LLM NEVER sees actual data, only schema metadata
 */
class LLMService {
  private openai: AzureOpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor() {
    if (llmConfig.provider === 'azure') {

      this.openai = new AzureOpenAI({
        apiKey: llmConfig.apiKey,
        endpoint: llmConfig.endpoint,
        apiVersion: llmConfig.apiVersion,
      });

    } else {
      this.openai = new AzureOpenAI({
        apiKey: llmConfig.apiKey,
      });
    }

    this.model = llmConfig.deploymentName || llmConfig.model;
    this.temperature = llmConfig.temperature;
    this.maxTokens = llmConfig.maxTokens;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  async naturalLanguageToSQL(
    userQuery: string,
    conversationHistory: string[] = []
  ): Promise<SQLGenerationResult> {
    try {
      // ✅ NEW: Handle greetings / generic messages
      // if (this.isGreetingOrGenericQuery(userQuery)) {
      //   return this.getGreetingResponse();
      // }

      // Step 1: Schema context
      const schemaContext = await this.buildSchemaContext();

      // Step 2: Few-shot examples
      const fewShotExamples = this.getFewShotExamples();

      // Step 3: Prompt
      const prompt = this.buildNLToSQLPrompt({
        userQuery,
        schemaContext,
        fewShotExamples,
        conversationHistory,
      });

      // Step 4: LLM call
      const response = await this.openai.chat.completions.create({
        // IMPORTANT: this must be the Azure DEPLOYMENT NAME
        model: this.model,

        messages: [
          {
            role: 'system',
            content: `${this.getSystemPrompt()}
IMPORTANT:
- Respond with VALID JSON only
- Do NOT include markdown
- Do NOT include explanations outside JSON`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],

        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const result: SQLGenerationResult = JSON.parse(content);

      return {
        ...result,
        sql: this.validateAndFixSQL(result.sql),
      };
    } catch (error: any) {
      console.error('NL to SQL error:', error);
      throw new Error(`Failed to generate SQL: ${error.message}`);
    }
  }

  // ============================================================================
  // GREETING / GENERIC HANDLING
  // ============================================================================

  private isGreetingOrGenericQuery(query: string): boolean {
    const q = query.trim().toLowerCase();

    const greetings = [
      'hi',
      'hello',
      'hey',
      'good morning',
      'good afternoon',
      'good evening',
    ];

    const generic = [
      'help',
      'how can i use you',
      'how can you help',
      'what can you do',
      'who are you',
    ];

    return (
      greetings.some(g => q === g || q.startsWith(g)) ||
      generic.some(g => q.includes(g))
    );
  }

  private getGreetingResponse(): SQLGenerationResult {
    return {
      sql: '',
      explanation:
        `👋 Hi! I'm your campaign analytics assistant.

I can help you turn **natural language questions into SQL queries** and analyze campaign performance — without exposing any raw data.

### Try asking things like:
• "Show me top campaigns by spend last month"
• "What was the ROAS for search campaigns in Q4?"
• "Daily spend trend for campaign XYZ"
• "Compare CTR between display and search campaigns"

Just ask your question in plain English.`,
      chartType: 'metric',
      confidence: 1.0,
      isGreeting: true,
    };
  }

  // ============================================================================
  // CORE NL → SQL PIPELINE
  // ============================================================================

  private async buildSchemaContext(): Promise<string> {
    const schemas = await bigqueryService.getAllSchemas();

    let context = 'DATABASE SCHEMA:\n\n';

    for (const schema of schemas) {
      context += `Table: ${schema.name}\n`;
      context += `Description: ${schema.description}\n`;
      context += 'Columns:\n';

      for (const column of schema.columns) {
        const encrypted = column.isEncrypted ? ' (encrypted)' : '';
        context += `  - ${column.name}: ${column.type}${encrypted}`;
        if (column.description) {
          context += ` - ${column.description}`;
        }
        context += '\n';
      }

      context += '\n';
    }

    context += `
COMMON METRICS:
- ROAS = revenue / spend
- CTR = clicks / impressions * 100
- CPC = spend / clicks
- CPM = spend / impressions * 1000
`;

    return context;
  }

  private getFewShotExamples(): string {
    return `
Example:
User: "Top campaigns by spend last month"
SQL: "SELECT
  camp.campaign_name,
  SUM(costs_local) as spend
FROM grminnexus1.custom_dashboard_mvp.mrt_cc__spend_calculated as cc_spend
LEFT JOIN grminnexus1.custom_dashboard_mvp.dim_multi_platform__campaign as camp on camp.campaign_id = cc_spend.campaign_id
GROUP BY campaign_name;
 
User: Show me top campaigns by ROI
SQL: SELECT
  camp.campaign_name,
  ((SUM(cc_spend.revenue_local)) / SUM(cc_spend.costs_local)) AS roi
FROM grminnexus1.custom_dashboard_mvp.mrt_cc__spend_calculated as cc_spend
LEFT JOIN grminnexus1.custom_dashboard_mvp.dim_multi_platform__campaign as camp on camp.campaign_id = cc_spend.campaign_id
GROUP BY campaign_name
ORDER BY roi DESC;
 
User: Daily spend trend for device level
SQL:SELECT
  device.device_category,
  cc_spend.event_date,
  SUM(costs_local) as spend
FROM grminnexus1.custom_dashboard_mvp.mrt_cc__spend_calculated as cc_spend
LEFT JOIN grminnexus1.custom_dashboard_mvp.dim_multi_platform__campaign as camp on camp.campaign_id = cc_spend.campaign_id
LEFT JOIN grminnexus1.custom_dashboard_mvp.dim_multi_platform__device as device on device.device_id = cc_spend.device_id
GROUP BY device_category, event_date
ORDER BY event_date DESC;

User: Give me top creatives by impressions
SQL: SELECT crt.creative_name, SUM(impressions) AS total_impressions
FROM grminnexus1.custom_dashboard_mvp.mrt_cc__spend_calculated as cc_spend
LEFT JOIN grminnexus1.custom_dashboard_mvp.dim_multi_platform__creative as crt on crt.creative_id = cc_spend.creative_id
GROUP BY creative_name
ORDER BY total_impressions
`;
  }

  private buildNLToSQLPrompt(prompt: NLToSQLPrompt): string {
    return `
${prompt.schemaContext}

EXAMPLES:
${prompt.fewShotExamples}

USER QUERY:
${prompt.userQuery}

RULES:
- Use BigQuery SQL
- Use only provided schema
- Add LIMIT if missing
- Handle division by zero with NULLIF
- Add aestric in project.dataset.table
- Make sure there shouldn't be semicolon in the end of query.
- instead of using dimensions id should get the name of the data dimensions eg avoid crt.creative_id use crt.creative_name

Respond ONLY with valid JSON:
{
  "sql": "",
  "explanation": "",
  "chartType": "bar|line|table|metric",
  "confidence": 0.0,
  "x_axis": "",
  "y_axis": ""
}
`;
  }

  private getSystemPrompt(): string {
    return `
You are an expert BigQuery SQL generator for campaign analytics.
You ONLY receive schema metadata.
You NEVER receive real data.
Respond ONLY with valid JSON.
`;
  }

  private validateAndFixSQL(sql: string): string {
    let fixed = sql;

    if (!/limit\s+\d+/i.test(fixed)) {
      fixed += '\nLIMIT 1000';
    }

    if (!fixed.includes('custom_dashboard_mvp.')) {
      fixed = fixed.replace(/FROM\s+(\w+)/gi, 'FROM custom_dashboard_mvp.$1');
      fixed = fixed.replace(/JOIN\s+(\w+)/gi, 'JOIN custom_dashboard_mvp.$1');
    }

    return fixed;
  }

  /**
   * Generate insights from query results
   */
  async generateInsights(userQuery: string, sql: string, data: any[], columns: any[]) {
    try {
      // Limit data for insights
      const sampleData = data.slice(0, 10);
      const prompt = `
  Based on the following query and results, generate 3-5 key insights:
  
  User Query: ${userQuery}
  SQL: ${sql}
  
  Results Summary:
  - Total rows: ${data.length}
  - Columns: ${columns.map((c: any) => c.name).join(', ')}
  
  Sample Data:
  ${JSON.stringify(sampleData, null, 2)}
  
  Generate insights that:
  1. Highlight key trends or patterns
  2. Point out anomalies or outliers
  3. Provide actionable recommendations
  4. Compare metrics where relevant
  
  Format each insight as a single sentence. Be concise and data-driven.
  `;
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a data analyst generating insights from campaign performance data.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });
      const content = response.choices[0]?.message?.content || '';
      // Parse insights (one per line)
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 10 && !line.startsWith('-'))
        .slice(0, 5);
    } catch (error) {
      console.error('Insights generation error:', error);
      return ['Unable to generate insights at this time.'];
    }
  }
  /**
   * Classify query intent
   */
  async classifyIntent(userQuery: string) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Classify the intent of analytics queries.',
          },
          {
            role: 'user',
            content: `Query: "${userQuery}"
  
  Classify intent and extract entities. Respond with JSON:
  {
    "intent": "trend|comparison|aggregation|drill_down|single_value",
    "entities": {
      "time_range": "...",
      "metric": "...",
      "dimension": "...",
      "filter": "..."
    }
  }`,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      });
      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (error) {
      return { intent: 'unknown', entities: {} };
    }
  }
}

export const llmService = new LLMService();
export default llmService;