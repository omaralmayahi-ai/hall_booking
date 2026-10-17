// Helper for "control app.bat" — writes the WinSW service definition with correct UTF-8 paths.
// Usage: node tools/service.mjs write-xml <serviceDir> <serviceId> <appDir> <dataDir> <logDir> <configFile> <port>
import fs from "node:fs";
import path from "node:path";

const [cmd, serviceDir, serviceId, appDir, dataDir, logDir, configFile, port] = process.argv.slice(2);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

if (cmd === "write-xml") {
  const entry = path.join(appDir, "artifacts", "api-server", "dist", "index.mjs");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<service>
  <id>${esc(serviceId)}</id>
  <name>Hall Booking Platform</name>
  <description>Hall booking, scheduling and maintenance platform - port ${esc(port)}</description>
  <executable>${esc(process.execPath)}</executable>
  <arguments>"${esc(entry)}"</arguments>
  <workingdirectory>${esc(appDir)}</workingdirectory>
  <env name="NODE_ENV" value="production" />
  <env name="PORT" value="${esc(port)}" />
  <env name="DATA_DIR" value="${esc(dataDir)}" />
  <env name="ENV_FILE" value="${esc(configFile)}" />
  <env name="TZ" value="Asia/Baghdad" />
  <logpath>${esc(logDir)}</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="5 sec" />
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>25 sec</stoptimeout>
  <startmode>Automatic</startmode>
</service>
`;
  fs.mkdirSync(serviceDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(serviceDir, `${serviceId}.xml`), xml, "utf8");
  console.log("[+] service definition written");
} else if (cmd === "restore-snapshot") {
  // node tools/service.mjs restore-snapshot <file.tar.gz> <targetDir>
  const [file, target] = [serviceDir, serviceId];
  const { PGlite } = await import("@electric-sql/pglite");
  if (fs.existsSync(target)) throw new Error("target directory already exists");
  const blob = new Blob([fs.readFileSync(file)]);
  const pg = new PGlite(target, { loadDataDir: blob });
  await pg.waitReady;
  const r = await pg.query("select count(*)::int as n from public.users");
  await pg.close();
  console.log(`[+] snapshot restored (${r.rows[0].n} users)`);
} else {
  console.error("unknown command");
  process.exit(2);
}
