import { getGameRules, getRuleValue, setRuleValue } from "./db.js";

const allowedRules = new Set(["initial_budget", "weekly_free_transfers", "first_deadline"]);
const [key, ...valueParts] = process.argv.slice(2);
const value = valueParts.join(" ");

function printRules() {
  const rules = getGameRules();
  if (!rules.length) {
    console.log("No game rules found. Run npm run import:data first.");
    return;
  }

  for (const rule of rules) {
    console.log(`${rule.key}=${rule.value}`);
  }
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!key) {
  printRules();
} else if (!allowedRules.has(key)) {
  fail(`Unknown rule "${key}". Allowed rules: ${[...allowedRules].join(", ")}`);
} else if (!value) {
  console.log(`${key}=${getRuleValue(key, "")}`);
} else {
  if (key === "first_deadline" && Number.isNaN(new Date(value).getTime())) {
    fail("first_deadline must be an ISO date, for example 2026-04-18T23:00:00Z.");
  } else if ((key === "initial_budget" || key === "weekly_free_transfers") && !Number.isFinite(Number(value))) {
    fail(`${key} must be numeric.`);
  } else {
    setRuleValue(key, value);
    console.log(`Updated ${key}=${value}`);
  }
}
