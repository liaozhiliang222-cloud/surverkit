import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = process.argv[2];
const previewPath = process.argv[3];
const input = await FileBlob.load(source);
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = await workbook.inspect({ kind: "workbook,sheet,table,region", maxChars: 10000, tableMaxRows: 30, tableMaxCols: 12, tableMaxCellChars: 100 });
console.log(summary.ndjson);
const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 2000 });
console.log(sheets.ndjson);
const preview = await workbook.render({ sheetName: "定性小结", autoCrop: "all", scale: 1.5, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
