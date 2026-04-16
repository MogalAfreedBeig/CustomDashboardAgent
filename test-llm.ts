import { llmService } from './server/src/services/llmService.ts';

const testQueries = [
  "top campaigns by spend",
  "daily spend trend",
  "roas last month",
  "compare device performance",
  "top creatives by impressions",
];

async function runTests() {
  for (const query of testQueries) {
    console.log("\n===============================");
    console.log("🧑 User Query:", query);

    try {
      const result = await llmService.naturalLanguageToSQL(query);

      console.log("🧠 SQL Generated:\n", result.sql);
      console.log("📊 Explanation:", result.explanation);
      console.log("📈 Chart Type:", result.chartType);
      console.log("🎯 Confidence:", result.confidence);

    } catch (error) {
      console.error("❌ Error:", error);
    }
  }
}

runTests();