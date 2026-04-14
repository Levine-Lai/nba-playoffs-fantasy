import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const backendRoot = path.resolve(__dirname, "..");

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildInsert(tableName, columns, row, mode = "INSERT INTO") {
  const sqlColumns = columns.join(", ");
  const sqlValues = columns.map((column) => sqlLiteral(row[column])).join(", ");
  return `${mode} ${tableName} (${sqlColumns}) VALUES (${sqlValues});`;
}

export function writeSqlFile(relativePath, statements) {
  const outputPath = path.join(backendRoot, relativePath);
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, `${statements.join("\n")}\n`, "utf8");
  return outputPath;
}

export function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}
