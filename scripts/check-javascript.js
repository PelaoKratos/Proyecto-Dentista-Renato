const { readdirSync } = require("node:fs");
const { join, relative } = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = join(__dirname, "..");
const sourceRoots = ["assets", "tests"];

function collectJavaScript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScript(path);
    return entry.isFile() && path.endsWith(".js") ? [path] : [];
  });
}

const files = sourceRoots.flatMap((sourceRoot) => collectJavaScript(join(projectRoot, sourceRoot)));
const failures = files.filter((file) => {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status === 0) return false;
  process.stderr.write(`${relative(projectRoot, file)}\n${result.stderr}`);
  return true;
});

if (failures.length) process.exitCode = 1;
else console.log(`Sintaxis JavaScript correcta en ${files.length} archivos.`);
