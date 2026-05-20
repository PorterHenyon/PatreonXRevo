import { config as loadEnv } from "dotenv";
loadEnv();

import { getDb, closeDb } from "../db/index.js";
import { runStartupCheck, printStartupCheck } from "../startup-check.js";

getDb();
const report = runStartupCheck();
printStartupCheck(report);
closeDb();
process.exit(report.ready ? 0 : 1);
