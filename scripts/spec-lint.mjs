import fs from "node:fs";
import path from "node:path";

/**
 * @spec spec://common/PROP-000-workflow#quality
 */

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
const workFiles = markdownFiles.filter((file) =>
  relative(file).startsWith("specs/work/"),
);
const activeWorkFiles = workFiles.filter((file) =>
  /^specs\/work\/WI-\d{3}[^/]*\.md$/.test(relative(file)),
);
const activeFiles = markdownFiles.filter((file) => {
  const name = relative(file);
  return (
    name.startsWith("specs/common/") ||
    name.startsWith("specs/modules/") ||
    name.startsWith("specs/work/") ||
    [
      "specs/SPEC-MAP.md",
      "specs/BOARD.md",
      "specs/WAL.md",
      "specs/TECHDEBT.md",
    ].includes(name)
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
const wiIds = new Map();

const markdownCanon = (content) =>
  content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");

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

for (const file of workFiles.filter((candidate) =>
  /\/WI-\d{3}[^/]*\.md$/.test(candidate),
)) {
  const content = fs.readFileSync(file, "utf8");
  const id = path.basename(file).match(/^WI-\d{3}/)?.[0];
  if (!id) continue;

  const previous = wiIds.get(id);
  if (previous) {
    errors.push(`duplicate ${id}: ${relative(previous)} and ${relative(file)}`);
  }
  wiIds.set(id, file);

  for (const marker of [
    "- Kind: `",
    "- Canon action: `",
    "## Outcome",
    "## Specs",
    "## Scope",
    "## Acceptance",
    "## Result",
  ]) {
    if (!content.includes(marker)) {
      errors.push(`${relative(file)}: missing ${marker}`);
    }
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

  if (file.endsWith(".md")) content = markdownCanon(content);

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
  const content = markdownCanon(fs.readFileSync(file, "utf8"));
  if (/<[A-Za-z][^>]*>|YYYY-MM-DD|<module>|<Entity>/.test(content)) {
    errors.push(`${relative(file)}: placeholder remains`);
  }
}

const specMap = fs.readFileSync(path.join(specsRoot, "SPEC-MAP.md"), "utf8");
for (const file of specFiles) {
  const name = path.basename(file);
  if (!specMap.includes(`](${relative(file).replace(/^specs\//, "")})`)) {
    errors.push(`specs/SPEC-MAP.md: missing registration for ${name}`);
  }
}

const board = fs.readFileSync(path.join(specsRoot, "BOARD.md"), "utf8");
const boardWiCounts = new Map();
for (const match of board.matchAll(/\[(WI-\d{3})\]\((work\/[^)]+\.md)\)/g)) {
  const [, id, target] = match;
  boardWiCounts.set(id, (boardWiCounts.get(id) ?? 0) + 1);
  if (!fs.existsSync(path.join(specsRoot, target))) {
    errors.push(`specs/BOARD.md: missing specs/${target}`);
  }
}
for (const file of activeWorkFiles) {
  const id = path.basename(file).match(/^WI-\d{3}/)?.[0];
  if (id && boardWiCounts.get(id) !== 1) {
    errors.push(
      `${relative(file)}: expected exactly one BOARD row, found ${boardWiCounts.get(id) ?? 0}`,
    );
  }
}
for (const [id, count] of boardWiCounts) {
  if (count !== 1) errors.push(`specs/BOARD.md: ${id} appears ${count} times`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `spec lint: ${specFiles.length} specs, ${ids.size} unique spec IDs, ${wiIds.size} unique WI IDs, references OK`,
  );
}
