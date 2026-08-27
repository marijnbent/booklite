import fs from "node:fs";
import path from "node:path";

export const resolveContainedPath = (root: string, candidate: string): string => {
  if (!candidate.trim()) {
    throw new Error("Stored path is empty");
  }

  const resolvedRoot = fs.realpathSync(root);
  const resolvedCandidate = path.resolve(resolvedRoot, candidate);
  const finalCandidate = fs.existsSync(resolvedCandidate)
    ? fs.realpathSync(resolvedCandidate)
    : resolvedCandidate;
  if (
    finalCandidate === resolvedRoot ||
    !finalCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Stored path escapes its configured data directory");
  }
  return finalCandidate;
};
