import { getDb, closeDb } from "./index.js";

getDb();
console.log("Database migrated successfully.");
closeDb();
