import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const specsRoot = path.join(root, "specs");

const walk = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    });

const relative = (file) => path.relative(root, file);
const markdownFiles = walk(specsRoot).filter((file) => file.endsWith(".md"));
const activeFiles = markdownFiles.filter((file) => {
  const name = relative(file);
  return (
    name.startsWith("specs/common/") ||
    name.startsWith("specs/modules/") ||
    ["specs/BOARD.md", "specs/WAL.md", "specs/TECHDEBT.md"].includes(name)
  );
});
const specFiles = activeFiles.filter((file) =>
  /\/(PROP|FEAT|INFRA)-\d{3}[^/]*\.md$/.test(file),
);
const implementationFiles = [
  "src",
  "test",
  "scripts",
  "deploy",
  "integrations",
]
  .map((directory) => path.join(root, directory))
  .filter((directory) => fs.existsSync(directory))
  .flatMap(walk)
  .filter((file) => !file.endsWith(".zip"));
const checkedFiles = [...activeFiles, ...implementationFiles];

const errors = [];
const ids = new Map();

for (const file of specFiles) {
  const content = fs.readFileSync(file, "utf8");
  const id = path.basename(file).match(/^(PROP|FEAT|INFRA)-\d{3}/)?.[0];
  if (!id) continue;

  const previous = ids.get(id);
  if (previous) {
    errors.push(`duplicate ${id}: ${relative(previous)} and ${relative(file)}`);
  }
  ids.set(id, file);

  if (!content.includes("{#root}")) {
    errors.push(`${relative(file)}: missing #root`);
  }
  if (!content.includes("{#plain-language}")) {
    errors.push(`${relative(file)}: missing #plain-language`);
  }
  if (!content.includes("{#changelog}")) {
    errors.push(`${relative(file)}: missing #changelog`);
  }
}

const specReference =
  /spec:\/\/(common|modules\/[^/]+)\/([A-Z]+-\d{3}[^#`\s]*)#([A-Za-z0-9._-]+)/g;

for (const file of checkedFiles) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const match of content.matchAll(specReference)) {
    const [, area, name, anchor] = match;
    const base =
      area === "common"
        ? path.join(specsRoot, "common")
        : path.join(specsRoot, area);
    const target = path.join(base, `${name}.md`);

    if (!fs.existsSync(target)) {
      errors.push(`${relative(file)}: missing ${relative(target)}`);
      continue;
    }

    const targetContent = fs.readFileSync(target, "utf8");
    if (!targetContent.includes(`{#${anchor}}`)) {
      errors.push(
        `${relative(file)}: missing #${anchor} in ${relative(target)}`,
      );
    }
  }
}

for (const file of activeFiles.filter(
  (candidate) =>
    relative(candidate).startsWith("specs/common/") ||
    relative(candidate).startsWith("specs/modules/"),
)) {
  const content = fs.readFileSync(file, "utf8");
  if (/<[A-Za-z][^>]*>|YYYY-MM-DD|<module>|<Entity>/.test(content)) {
    errors.push(`${relative(file)}: placeholder remains`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `spec lint: ${specFiles.length} specs, ${ids.size} unique IDs, references OK`,
  );
}
