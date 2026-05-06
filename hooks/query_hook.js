// Note: the "@anthropic-ai/claude-code" package has been renamed
// to "@anthropic-ai/claude-agent-sdk"
import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";

const REVIEW_DIR = "client/src";

async function main() {
  // Read JSON input from stdin
  const input = await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });

  const hookData = JSON.parse(input);
  const toolInput = hookData.tool_input;

  // Check if this is a file modification in client/src
  const filePath = toolInput.file_path || toolInput.path;
  if (!filePath) {
    process.exit(0);
  }

  // Normalize paths for comparison
  const normalizedFilePath = path.resolve(filePath);
  const reviewDir = path.resolve(process.cwd(), REVIEW_DIR);

  // Check if file is within review directory (handles subdirectories too)
  if (!normalizedFilePath.startsWith(reviewDir + path.sep)) {
    process.exit(0);
  }

  // Prepare prompt for analysis
  const newContent =
    toolInput.content || toolInput.contents || toolInput.new_string;
  const prompt = `You are reviewing a proposed change to a React component or utility file in a nutrition app.
Your ONLY job is to detect ACTUAL CODE DUPLICATION — where the exact same function or component
already exists in a DIFFERENT file in the codebase and is being unnecessarily re-implemented.

IMPORTANT — Do NOT flag any of the following:
- New functions or components that don't already exist anywhere else
- Refactoring opportunities (e.g., "this could be extracted to a shared utility")
- Architecture or code organization suggestions
- Cases where the same file is being rewritten or updated
- Functions that only exist in the file currently being changed

ONLY flag if: a function or component with identical logic already exists in a DIFFERENT file
within ./client/src, and this change re-implements it instead of importing it from there.

File being changed: ${filePath}
New content:
<new_content>
${newContent}
</new_content>

Search ./client/src for functions or components that ALREADY EXIST in a different file
and are being duplicated here. Exclude the file being changed itself from the search.

If actual duplicates exist in other files, name the specific file and function.
If no such duplicates exist, say exactly: "Changes look appropriate."`;

  const messages = [];
  for await (const message of query({
    prompt,
  })) {
    messages.push(message);
  }

  // Extract the analysis result
  const resultMessage = messages.find((m) => m.type === "result");
  if (!resultMessage || resultMessage.subtype !== "success") {
    process.exit(0);
  }

  // If changes are appropriate, allow them
  if (resultMessage.result.includes("Changes look appropriate")) {
    process.exit(0);
  }

  // Otherwise, block with feedback
  console.error(`Duplication detected:\n\n${resultMessage.result}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(`Hook error: ${err.message}`);
  process.exit(1);
});
