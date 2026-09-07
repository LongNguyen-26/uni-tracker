import { execFileSync } from "node:child_process";
// A release record alone must not trigger another application release.
try {
  const message = execFileSync("git", ["log", "-1", "--format=%s"], {
    encoding: "utf8",
  }).trim();
  const files = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  if (
    message.startsWith("docs: record deployment") &&
    files.length === 1 &&
    files[0] === "AGENTS.md"
  ) {
    console.log(
      "Only the verified delivery record changed; keep the existing application deployment.",
    );
    process.exit(0);
  }
} catch {
  /* Missing Git history should always build. */
}
process.exit(1);
