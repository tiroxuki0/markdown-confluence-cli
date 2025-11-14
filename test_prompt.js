// Test the new prompt structure
const mockDiff = `diff --git a/test.txt b/test.txt
index abc..def 100644
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-old content
+new content`;

const promptFeatureName = "test-feature";

const prompt = `## TASK
Analyze this git diff and create documentation for the "${promptFeatureName}" feature.

## REQUIREMENTS
- Extract specific details from the actual code changes
- Document real files, functions, and code snippets that changed
- Map code changes to user-facing features
- Create actionable QA test scenarios
- NO placeholders - use real details from the diff

## OUTPUT FORMAT
\`\`\`yaml
---
connie-publish: true
title: "${promptFeatureName}"
tags: documentation, qa, feature-update, ${promptFeatureName.toLowerCase().replace(/[^a-z0-9]/g, '-')}
---

## Overview
[What users can now do + business value + technical changes]

## Feature Flow & User Journey
[Actual user flows affected by code changes]

## Technical Implementation Details
[Real code changes from diff with file names and snippets]

## QA & Testing Guide
[Actionable test scenarios based on actual code logic]

## Usage Examples & Configuration
[Real examples from the code changes]
\`\`\`

---

## CODE CHANGES TO ANALYZE

${mockDiff}

---

Create comprehensive documentation that developers and QA can immediately use to understand and test "${promptFeatureName}".`;

console.log("=== NEW PROMPT ANALYSIS ===");
console.log("Total prompt length:", prompt.length, "characters");
console.log("Prompt structure:");
console.log(prompt.split('\n').slice(0, 10).join('\n'));
console.log("...");
console.log("Contains diff:", prompt.includes(mockDiff));
console.log("Contains placeholders:", prompt.includes('[What users can now do]'));
console.log("=== END ANALYSIS ===");
