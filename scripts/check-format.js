const { readdirSync, readFileSync } = require("node:fs");
const { extname, join, relative } = require("node:path");

const projectRoot = join(__dirname, "..");
const sourceRoots = ["assets", "backend", "scripts", "tests", "docs"];
const extensions = new Set([".js", ".css", ".py", ".ps1", ".html", ".md"]);

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__pycache__") return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return entry.isFile() && extensions.has(extname(path)) ? [path] : [];
  });
}

const files = [
  ...sourceRoots.flatMap((root) => collect(join(projectRoot, root))),
  ...readdirSync(projectRoot).filter((name) => extensions.has(extname(name))).map((name) => join(projectRoot, name))
];
const errors = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  const name = relative(projectRoot, file);
  if (content && !content.endsWith("\n")) errors.push(`${name}: falta salto de linea final`);
  content.split(/\r?\n/).forEach((line, index) => {
    if (/[ \t]+$/.test(line)) errors.push(`${name}:${index + 1}: espacios al final`);
  });
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  console.log(`Formato basico correcto en ${files.length} archivos.`);
}
