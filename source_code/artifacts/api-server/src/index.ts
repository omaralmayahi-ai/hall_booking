import "./env"; // must stay first
import { applyPendingRestore } from "./lib/restore-pending";

// A restore scheduled from System Settings is applied before the database opens.
await applyPendingRestore();
await import("./server");
