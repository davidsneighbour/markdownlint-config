// @ts-check

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import markdownIt from "markdown-it";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/promise";
import dnbTitleCaseStyle from "../rules/dnb-title-case-style.mjs";

const properNouns = ["Samui", "Koh", "Ang Thong Marine Park", "The Oyster Bar x Samui"];

/**
 * Lints `markdown` with only `dnb-title-case-style` enabled.
 *
 * @param {string} markdown
 * @param {Record<string, unknown>} [config]
 */
const run = async (markdown, config = { ignore: ["JavaScript"], properNouns }) => {
  const results = await lint({
    strings: { doc: markdown },
    config: { default: false, "dnb-title-case-style": config },
    customRules: [dnbTitleCaseStyle],
    // The same parser options that markdownlint-cli2 uses.
    markdownItFactory: () => markdownIt({ html: true }),
  });
  const errors = results["doc"] ?? [];
  return { errors, fixed: applyFixes(markdown, errors) };
};

describe("dnb-title-case-style", () => {
  /** @type {[string, string][]} Heading and expected result after fixing. */
  const fixedCases = [
    ["## Island hopping samui-style {.mt-5}", "## Island hopping Samui-style {.mt-5}"],
    [
      "## This Heading Is Wrong {#custom-id .text-center}",
      "## This heading is wrong {#custom-id .text-center}",
    ],
    ["## A trip of 8.5 hours. then more", "## A trip of 8.5 hours. Then more"],
    [
      "## Premium Seafood Platters by The Oyster Bar x Samui",
      "## Premium seafood platters by The Oyster Bar x Samui",
    ],
    ["## Visit samui and *koh* samui", "## Visit Samui and *Koh* Samui"],
  ];

  for (const [heading, expected] of fixedCases) {
    it(`fixes "${heading}"`, async () => {
      const { errors, fixed } = await run(`${heading}\n`);
      assert.ok(errors.length > 0);
      assert.equal(fixed, `${expected}\n`);
    });
  }

  const acceptedCases = [
    "## Island hopping Samui-style {.mt-5}",
    "# AGENTS.md",
    "## Notes on index.html",
    "## Booking via example-charter.com today",
    "## Day 1 – departure from Koh Samui & sailing to Ang Thong Marine Park",
    "## Learn JavaScript basics",
  ];

  for (const heading of acceptedCases) {
    it(`accepts "${heading}"`, async () => {
      const { errors } = await run(`${heading}\n`);
      assert.deepEqual(errors, []);
    });
  }

  it("reports text that is not on the line without a fix", async () => {
    const { errors } = await run("## Fish &amp; Chips Today\n");
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.fixInfo, null);
    assert.match(errors[0]?.errorDetail ?? "", /Expected: 'Fish & chips today'/u);
  });

  it("passes ignore through to the wrapped rule", async () => {
    const { fixed } = await run("## Learn JavaScript basics\n", {});
    assert.equal(fixed, "## Learn javaScript basics\n");
  });

  it("applies proper nouns in list order", async () => {
    const { fixed } = await run("## Book on Independence-yacht-charter.com\n", {
      properNouns: ["Independence", "independence-yacht-charter.com"],
    });
    assert.equal(fixed, "## Book on independence-yacht-charter.com\n");
  });

  it("supports title case", async () => {
    const { fixed } = await run("## departure from koh samui\n", {
      case: "title",
      properNouns,
    });
    assert.equal(fixed, "## Departure From Koh Samui\n");
  });

  it("rejects invalid properNouns", async () => {
    await assert.rejects(run("## Heading\n", { properNouns: "Samui" }), /properNouns/u);
  });
});

describe("shared configuration with markdownlint-cli2", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const cli = join(root, "node_modules", "markdownlint-cli2", "markdownlint-cli2-bin.mjs");
  const sharedConfig = join(root, ".markdownlint-cli2.jsonc");

  it("fixes headings with project proper nouns, run from a consumer folder", async () => {
    const project = await mkdtemp(join(tmpdir(), "dnb-title-case-style-"));
    try {
      // A project rule config replaces the shared one, so it repeats `ignore`.
      await writeFile(
        join(project, ".markdownlint-cli2.jsonc"),
        JSON.stringify({
          config: {
            "dnb-title-case-style": { ignore: ["JavaScript"], properNouns },
          },
        }),
      );
      const file = join(project, "doc.md");
      await writeFile(
        file,
        [
          "# AGENTS.md",
          "",
          "## Island hopping samui-style {.mt-5}",
          "",
          "## Learn JavaScript Basics",
          "",
        ].join("\n"),
      );
      await promisify(execFile)(
        process.execPath,
        [cli, "--config", sharedConfig, "--fix", "doc.md"],
        { cwd: project },
      ).catch(() => undefined);
      assert.equal(
        await readFile(file, "utf8"),
        [
          "# AGENTS.md",
          "",
          "## Island hopping Samui-style {.mt-5}",
          "",
          "## Learn JavaScript basics",
          "",
        ].join("\n"),
      );
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
