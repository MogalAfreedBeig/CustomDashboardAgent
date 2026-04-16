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

  // 🧠 Models
  private sqlModel: string;
  private intentModel: string;

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

    // 🔥 Two-model setup
    this.sqlModel = llmConfig.deploymentName || llmConfig.model;
    // this.intentModel = "gpt-4o-mini";
    this.intentModel = this.sqlModel;

    this.temperature = llmConfig.temperature;
    this.maxTokens = llmConfig.maxTokens;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  async naturalLanguageToSQL(
    userQuery: string,
    conversationHistory: { role: "user" | "assistant", content: string }[] = []
  ): Promise<SQLGenerationResult> {
    
    try {
      console.log("\n===============================");
      console.log("🧑 User Query:", userQuery);

      // 🔁 STEP 0: Resolve follow-up query using conversation context
      const resolvedQuery = await this.resolveFollowupQuery(
        userQuery,
        conversationHistory
      );

      console.log("🔁 Resolved Query:", resolvedQuery);

      // 🧠 STEP 1: Intent Understanding
      // const intentData = await this.classifyIntent(userQuery);
      const intentData = await this.classifyIntent(
          resolvedQuery,
          conversationHistory
      );
      console.log("🧠 Intent Output:", JSON.stringify(intentData, null, 2));

      // 🧠 STEP 2: Enhance Query
      const enhancedQuery = this.enhanceQuery(resolvedQuery, intentData);
      console.log("📝 Enhanced Query:", enhancedQuery);

      // STEP 3: Schema Context
      const schemaContext = await this.buildSchemaContext();

      // STEP 4: Few-shot Examples
      const fewShotExamples = this.getFewShotExamples();

      // STEP 5: Prompt
      const prompt = this.buildNLToSQLPrompt({
        userQuery: enhancedQuery,
        schemaContext,
        fewShotExamples,
        // conversationHistory,
      });

      // STEP 6: SQL Model Call
      const response = await this.openai.chat.completions.create({
        model: this.sqlModel,
        messages: [
          {
            role: "system",
            content: `${this.getSystemPrompt()}
IMPORTANT:
- Respond ONLY with VALID JSON
- Do NOT include markdown
- No explanation outside JSON`,
          },
          ...conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error("Empty response from LLM");
      }

      console.log("🤖 Raw LLM Response:", content);

      // ✅ Safe JSON parsing with markdown cleanup
      let result: SQLGenerationResult;
      try {
        // Remove triple backticks or markdown tags
        const cleanContent = content
          .replace(/```json\s*/i, '')   // ```json at start
          .replace(/```/g, '')          // any remaining ```
          .trim();

        result = JSON.parse(cleanContent);
      } catch (err) {
        console.error("❌ Invalid JSON from LLM:", content);
        throw new Error("LLM returned invalid JSON");
      }

      console.log("🧾 Generated SQL:\n", result.sql);

      return {
        ...result,
        sql: this.validateAndFixSQL(result.sql),
      };

    } catch (error: any) {
      console.error("❌ NL to SQL error:", error);
      throw new Error(`Failed to generate SQL: ${error.message}`);
    }
  }

  
  // ============================================================================
  // 🧠 INTENT MODEL
  // ============================================================================

  // async classifyIntent(userQuery: string) {
  async classifyIntent(
    userQuery: string,
    conversationHistory: { role: "user" | "assistant"; content: string }[] = []
  )  {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.intentModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in understanding analytics queries.',
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
      console.error('Intent classification error:', error);
      return { intent: 'unknown', entities: {} };
    }
  }
  
  // ============================================================================
  // 🧠 QUERY ENHANCER
  // ============================================================================

//   private enhanceQuery(userQuery: string, intentData: any): string {
//     return `
// Original Query:
// ${userQuery}

// Interpreted Context:
// - Intent: ${intentData.intent}
// - Metric: ${intentData.entities?.metric || 'N/A'}
// - Dimension: ${intentData.entities?.dimension || 'N/A'}
// - Time Range: ${intentData.entities?.time_range || 'N/A'}
// - Filters: ${intentData.entities?.filter || 'N/A'}

// Rewrite the query clearly including metric, dimension, filters, and time range.
// Final Query:
// `;
//   }
  

  private enhanceQuery(userQuery: string, intentData: any): string {
    return `
  Original Query:
  ${userQuery}

  Interpreted Context:
  - Intent: ${intentData.intent}
  - Metric: ${intentData.entities?.metric || 'N/A'}
  - Dimension: ${intentData.entities?.dimension || 'N/A'}
  - Time Range: ${intentData.entities?.time_range || 'N/A'}
  - Filters: ${intentData.entities?.filter || 'N/A'}

  IMPORTANT:
  - You MUST use the metric exactly as extracted above
  - If metric = clicks → use SUM(clicks)
  - If metric = impressions → use SUM(impressions)
  - If metric = spend or costs → use SUM(costs_local)
  - DO NOT fallback to other metrics
  - DO NOT change metric

  Rewrite the query clearly including metric, dimension, filters, and time range.
  Final Query:
  `;
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
        `👋 Hi! I'm your Analytics Bot assistant.

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

//     context += `
// COMMON METRICS:
// - ROAS = revenue / spend
// - CTR = clicks / impressions * 100
// - CPC = spend / clicks
// - CPM = spend / impressions * 1000
// `;

    context += `
      
      DERIVED METRICS:
      - CTR = clicks / impressions * 100
      - CPC = costs_local / clicks
      - CPM = costs_local / impressions * 1000

      IMPORTANT:
      - revenue is NOT available
      - ROI is NOT available
      - ROAS is NOT available

      If user asks unavailable metric:
      RETURN empty SQL and explanation:
      "Requested metric not available"
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
  "xAxis": "",
  "yAxis": ""
}
`;
  }

//   private getSystemPrompt(): string {
// //     return `
// // You are an expert BigQuery SQL generator for campaign analytics.
// // You ONLY receive schema metadata.
// // You NEVER receive real data.
// // Respond ONLY with valid JSON.
// // `;
//     return `
//     You are an expert BigQuery SQL generator for campaign analytics.

//     STRICT RULES:
//     - Only use metrics present in schema
//     - Do NOT invent columns
//     - If metric not available, return:
//     {
//     "sql": "",
//     "explanation": "Metric not available",
//     "chartType": "table",
//     "confidence": 0
//     }

//     Respond ONLY with valid JSON.
//     `;
//   }

  private getSystemPrompt(): string {
      return `
    You are an expert BigQuery SQL generator for campaign analytics.

    STRICT RULES:

    1. Only generate SQL for campaign analytics queries
    2. Use ONLY metrics and columns present in schema
    3. NEVER invent columns or tables
    4. If user asks something unrelated to analytics (weather, jokes, general chat, etc)
      return:
    {
      "sql": "",
      "explanation": "This question is not related to campaign analytics.",
      "chartType": "table",
      "confidence": 0
    }

    5. If query is incomplete BUT conversation context exists,
      infer missing metric/dimension from previous conversation

    Example:
    User: Top campaigns by spend
    User: now least 10
    → interpret as: Bottom 10 campaigns by spend

    6. If metric truly not available in schema return:
    {
      "sql": "",
      "explanation": "Requested metric not available",
      "chartType": "table",
      "confidence": 0
    }

    Respond ONLY with valid JSON.
    `;
    }

  // private validateAndFixSQL(sql: string): string {
  //   let fixed = sql;

  //   if (!/limit\s+\d+/i.test(fixed)) {
  //     fixed += '\nLIMIT 1000';
  //   }

  //   if (!fixed.includes('custom_dashboard_mvp.')) {
  //     fixed = fixed.replace(/FROM\s+(\w+)/gi, 'FROM custom_dashboard_mvp.$1');
  //     fixed = fixed.replace(/JOIN\s+(\w+)/gi, 'JOIN custom_dashboard_mvp.$1');
  //   }

  //   return fixed;
  // }

  private async resolveFollowupQuery(
    userQuery: string,
    conversationHistory: { role: "user" | "assistant"; content: string }[]
  ): Promise<string> {

    if (!conversationHistory.length) {
      return userQuery;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.intentModel,
        messages: [
          {
            role: "system",
            content: `
  You rewrite follow-up analytics queries into complete standalone queries.

  Rules:
  - Use previous conversation context
  - Fill missing metric/dimension
  - Keep same intent
  - If already complete, return as-is

  Examples:

  User: Top 10 campaigns by spend
  Followup: now least 10
  Rewrite: Bottom 10 campaigns by spend

  User: CTR by device
  Followup: last 7 days
  Rewrite: CTR by device for last 7 days

  Return ONLY rewritten query text.
  `
          },
          ...conversationHistory
              .filter(m => m.role === "user")
              .slice(-2)
              .map(m => ({
                role: "user" as const,
                content: m.content
              })),
          {
            role: "user",
            content: userQuery
          }
        ],
        temperature: 0,
        max_tokens: 100
      });

      return response.choices[0]?.message?.content?.trim() || userQuery;

    } catch {
      return userQuery;
    }
  }

  // updated

  private validateAndFixSQL(sql: string): string {

    // 🚨 DO NOT FIX EMPTY SQL
    if (!sql || !sql.trim()) {
      return "";
    }

    let fixed = sql;

    // add limit
    if (!/limit\s+\d+/i.test(fixed)) {
      fixed += '\nLIMIT 1000';
    }

    // dataset prefix fix
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
        model: this.intentModel,
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
}

export const llmService = new LLMService();
export default llmService;