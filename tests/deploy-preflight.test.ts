import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

/**
 * Guards the deploy workflow's pre-flight checks.
 *
 * This exists because the guard meant to catch a missing VPS secret did not work,
 * and it failed in the worst possible way. `Configure SSH` wrote the key material
 * first and tested the *result* with `[ ! -s ~/.ssh/known_hosts ]`:
 *
 *   printf '%s\n' "$VPS_SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
 *
 * A GitHub secret that does not exist arrives as an empty string, so that line
 * writes one newline byte. The file exists, it is non-empty, `-s` is false, and
 * the guard passes. The job then ran `ssh "${VPS_USER}@${VPS_HOST}"` with both
 * unset, which collapsed the destination to the single character `@` and made
 * ssh print its own usage text and exit 255. Nothing in the log named the missing
 * secret or pointed at the fix; the only clue was three empty values in the
 * runner's environment dump.
 *
 * The failure was still visible, so this is not a silent-corruption class of bug.
 * It is here because the check exists to produce one clear sentence, and instead
 * it produced a usage dump. The workflow now validates the secret *values* before
 * writing anything, and separately checks the ssh destination.
 *
 * These tests extract the real `run:` blocks from the real workflow file with a
 * YAML parser and execute them under bash, so they fail if the behaviour is
 * weakened. Where no bash is available (a Windows machine without Git Bash) the
 * behavioural cases are skipped and the structural ones still run, so the suite
 * never passes vacuously.
 */

/** Resolved from this repo, not from the test runner's own module graph. */
const require = createRequire(new URL("../package.json", import.meta.url));
const yaml = require("js-yaml") as { load: (input: string) => unknown };

interface Job {
  needs?: string | string[];
  steps?: Step[];
}

interface Step {
  name: string;
  run?: string;
}

const WORKFLOW = new URL("../.github/workflows/deploy.yml", import.meta.url);
const workflow = yaml.load(readFileSync(WORKFLOW, "utf8")) as {
  jobs: Record<string, Job>;
};

/** Every step that carries a `run:` block, in file order. */
const runSteps = Object.values(workflow.jobs).flatMap((job) =>
  (job.steps ?? []).filter((step) => typeof step.run === "string"),
);

function runOf(stepName: string): string {
  const step = runSteps.find((candidate) => candidate.name === stepName);
  if (!step?.run) throw new Error(`no step named "${stepName}" with a run: block`);
  return step.run;
}

/**
 * Finds a bash interpreter. GitHub's ubuntu runners always have one; on Windows
 * Git Bash is the realistic source.
 */
function findBash(): string | null {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Git\\bin\\bash.exe",
          "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
          join(process.env["LOCALAPPDATA"] ?? "", "Programs", "Git", "bin", "bash.exe"),
        ]
      : ["/usr/bin/bash", "/bin/bash"];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  const onPath = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" });
  return onPath.status === 0 ? "bash" : null;
}

const BASH = findBash();

/**
 * Builds a throwaway HOME containing a usable known_hosts.
 *
 * The guard reads `~/.ssh/known_hosts`, so every case gets its own. Without this
 * the result depends on whose machine is running the suite: a developer with a
 * populated known_hosts sees the guard pass, a fresh CI runner has no file at
 * all and sees it refuse. That is exactly how the first version of this file
 * passed locally and failed on GitHub.
 */
function fakeHome(contents = "203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...\n"): string {
  const home = mkdtempSync(join(tmpdir(), "deploy-home-"));
  mkdirSync(join(home, ".ssh"), { recursive: true });
  writeFileSync(join(home, ".ssh", "known_hosts"), contents);
  return home;
}

/**
 * Runs a shell script body under bash with the given variables set, and returns
 * its exit code and stderr. `null` means "leave this variable unset", which is
 * distinct from the empty string a real missing secret produces. HOME defaults
 * to a throwaway directory and can be overridden per case.
 */
function runBash(body: string, vars: Record<string, string | null> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-guard-"));
  const script = join(dir, "guard.sh");
  const effective = { HOME: fakeHome(), ...vars };
  const prelude = Object.entries(effective)
    .map(([name, value]) => (value === null ? `unset ${name}` : `export ${name}=${JSON.stringify(value)}`))
    .join("\n");
  // The prelude must come first: it establishes the variables the guard reads.
  writeFileSync(script, `${prelude}\n${body}\n`);
  const result = spawnSync(BASH!, ["-c", `bash ${JSON.stringify(script)}`], { encoding: "utf8" });
  return { code: result.status, stderr: result.stderr ?? "" };
}

/** Runs the checks only where a shell exists; otherwise the structural cases carry the file. */
const itWithBash = BASH ? it : it.skip;

describe("deploy workflow pre-flight", () => {
  it("runs the deploy job's shells in strict mode, starting with it", () => {
    // The first line specifically, not "contains": the Deploy block also embeds
    // `set -euo pipefail` inside the remote script it hands to ssh, so a
    // `toContain` check passes even when the step's own shell is left lenient.
    // Scoped to the deploy job because that is where the branching logic is; the
    // verify job runs single commands, and GitHub's default `bash -e` plus the
    // explicit `&&`-free step failure is enough there.
    const deploySteps = workflow.jobs["deploy"].steps ?? [];
    expect(deploySteps.length).toBeGreaterThan(0);
    for (const step of deploySteps) {
      if (step.name === "Summary") continue; // a deliberately-quoted subshell
      expect(step.run?.split("\n")[0]).toBe("set -euo pipefail");
    }
  });

  it("verifies the production build before it is deployed", () => {
    // `needs: verify` is the whole point of having two jobs: a broken build must
    // never reach the host that runs deploy.sh, which migrates the database.
    // Asserted on the parsed value, because job key order in the file is not a
    // dependency and stays correct even after `needs` is deleted.
    expect(workflow.jobs["deploy"].needs).toBe("verify");
    expect(workflow.jobs["verify"].needs).toBeUndefined();
  });

  it("does not accept any host key automatically", () => {
    // StrictHostKeyChecking=no is the usual shortcut and it removes MITM
    // protection from the one path that runs arbitrary code on production.
    // The refusal is asserted here so a future "make CI green" edit cannot add it.
    // Comments are stripped first: the file deliberately names the flag to
    // explain why it is not used, and a prose mention is not a setting.
    for (const step of runSteps) {
      const code = (step.run ?? "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      expect(code).not.toMatch(/StrictHostKeyChecking\s*=\s*no/);
      expect(code).not.toMatch(/StrictHostKeyChecking\s*=\s*accept-new/);
      expect(code).not.toMatch(/UserKnownHostsFile\s*=\s*\/dev\/null/);
    }
  });

  it("does require host key checking", () => {
    const code = runOf("Deploy")
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(code).toMatch(/StrictHostKeyChecking\s*=\s*yes/);
  });

  it("checks the ssh key secrets before writing them to disk", () => {
    const ssh = runOf("Configure SSH");
    const checksKey = ssh.indexOf("VPS_SSH_KEY");
    const writesKey = ssh.indexOf("> ~/.ssh/id_ed25519");
    const checksHosts = ssh.indexOf("VPS_SSH_KNOWN_HOSTS");
    const writesHosts = ssh.indexOf("> ~/.ssh/known_hosts");
    expect(checksKey).toBeGreaterThanOrEqual(0);
    expect(writesKey).toBeGreaterThanOrEqual(0);
    expect(checksKey).toBeLessThan(writesKey);
    expect(checksHosts).toBeLessThan(writesHosts);
  });

  it("checks the ssh destination before invoking ssh", () => {
    const deploy = runOf("Deploy");
    expect(deploy).toContain("VPS_HOST");
    expect(deploy).toContain("VPS_USER");
    const checks = deploy.search(/VPS_HOST:-/);
    const ssh = deploy.indexOf("ssh -i");
    expect(checks).toBeGreaterThanOrEqual(0);
    expect(checks).toBeLessThan(ssh);
  });

  itWithBash("lets a fully configured run through", () => {
    const guard = runOf("Configure SSH").split("\ninstall -d")[0];
    expect(runBash(guard, { VPS_SSH_KEY: "key", VPS_SSH_KNOWN_HOSTS: "host key" }).code).toBe(0);
  });

  itWithBash("refuses to run when the key secrets are missing, and says which", () => {
    const guard = runOf("Configure SSH").split("\ninstall -d")[0];

    // Empty string, not unset: this is what a missing GitHub secret actually
    // looks like inside the step. The old guard let this through.
    const result = runBash(guard, { VPS_SSH_KEY: "", VPS_SSH_KNOWN_HOSTS: "" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("VPS_SSH_KEY");
    expect(result.stderr).toContain("VPS_SSH_KNOWN_HOSTS");
  });

  itWithBash("refuses to run when only the host key secret is missing", () => {
    const guard = runOf("Configure SSH").split("\ninstall -d")[0];
    const result = runBash(guard, { VPS_SSH_KEY: "key", VPS_SSH_KNOWN_HOSTS: "" });
    expect(result.code).toBe(1);
    // It must name only the one that is actually missing, or the message is noise.
    expect(result.stderr).toContain("VPS_SSH_KNOWN_HOSTS");
    expect(result.stderr).not.toMatch(/-\s+VPS_SSH_KEY\s*$/m);
  });

  itWithBash("refuses to ssh when the destination is missing, before ssh can parse it", () => {
    const guard = runOf("Deploy").split("\nssh -i")[0];
    const result = runBash(guard, { VPS_HOST: "", VPS_USER: "", VPS_SSH_PORT: "" });
    // 255 was the observed symptom: ssh's own argument-parser failure.
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("VPS_HOST");
    expect(result.stderr).toContain("VPS_USER");
  });

  itWithBash("treats the ssh port as optional, since 22 is the default", () => {
    const guard = runOf("Deploy").split("\nssh -i")[0];
    const result = runBash(guard, { VPS_HOST: "203.0.113.10", VPS_USER: "deploy", VPS_SSH_PORT: null });
    expect(result.code).toBe(0);
  });

  itWithBash("refuses to ssh when known_hosts holds nothing usable", () => {
    const guard = runOf("Deploy").split("\nssh -i")[0];

    // An empty known_hosts is what a missing host key secret produces, and the
    // whole reason StrictHostKeyChecking=yes must not be relaxed: ssh would
    // otherwise be free to accept whatever key the server presents.
    const missingFile = fakeHome("");
    const absent = runBash(guard, { VPS_HOST: "203.0.113.10", VPS_USER: "deploy", HOME: missingFile });
    expect(absent.code).toBe(1);
    expect(absent.stderr).toContain("known_hosts");

    // A file that does not exist at all is the same condition and must also be
    // refused, not treated as "nothing to check".
    const noFile = mkdtempSync(join(tmpdir(), "deploy-home-"));
    mkdirSync(join(noFile, ".ssh"), { recursive: true });
    const absentEntirely = runBash(guard, { VPS_HOST: "203.0.113.10", VPS_USER: "deploy", HOME: noFile });
    expect(absentEntirely.code).toBe(1);

    // A single newline is what `printf '%s\n' ""` leaves behind, which is how
    // this whole bug started: -s says the file has content, and it does not.
    const blankOnly = fakeHome("\n");
    const blank = runBash(guard, { VPS_HOST: "203.0.113.10", VPS_USER: "deploy", HOME: blankOnly });
    expect(blank.code).toBe(1);
    expect(blank.stderr).toContain("known_hosts");

    // And with real content the guard lets it through, so the check is not
    // simply refusing everything.
    const populated = runBash(guard, { VPS_HOST: "203.0.113.10", VPS_USER: "deploy" });
    expect(populated.code).toBe(0);
  });

  it("explains where to set a missing secret instead of just failing", () => {
    // A failure that names the variable but not the location is only half a fix.
    for (const stepName of ["Configure SSH", "Deploy"]) {
      expect(runOf(stepName)).toContain("Settings");
    }
  });

  it("health-checks the public URL after deploying, not just from inside the host", () => {
    // A container-local check cannot see a bad certificate, a wrong
    // SITE_DOMAIN, or a proxy that never started. The URL itself comes from a
    // secret, so the check is that the script uses that variable and hits the
    // health endpoint rather than a hardcoded host.
    const tls = runOf("Verify the site is reachable over TLS");
    expect(tls).toContain("$SITE_URL/api/v1/health");
    expect(tls).toContain("curl");
    expect(tls).not.toMatch(/127\.0\.0\.1|localhost/);
  });

  it("retries the health check, because a first deploy must wait for its certificate", () => {
    // Caddy needs a few seconds to obtain a certificate after DNS changes. With
    // one attempt the pipeline fails the deploy it just performed, which reads
    // as a broken release rather than a slow one. The count is asserted as a
    // number, not just as `seq 1 <something>`, so shrinking the loop is caught.
    const tls = runOf("Verify the site is reachable over TLS");
    const attempts = Number(tls.match(/seq 1 (\d+)/)?.[1] ?? "0");
    expect(attempts).toBeGreaterThanOrEqual(5);
    expect(tls).toMatch(/sleep \d+/);
  });
});