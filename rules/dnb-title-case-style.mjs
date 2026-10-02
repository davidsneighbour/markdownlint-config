// @ts-check

/**
 * `dnb-title-case-style`: heading letter case that keeps proper nouns,
 * in-word dots, and trailing attribute blocks.
 *
 * Wraps `markdownlint-rule-title-case-style` and corrects its result:
 *
 * - A `.` inside a word (`AGENTS.md`, `index.html`, `example.com`) is not a
 *   sentence end. The wrapped rule treats every `.` as one.
 * - Every entry in `properNouns` keeps its configured spelling, also inside
 *   compounds such as `Samui-style`. Headings that the wrapped rule accepts
 *   are checked for proper nouns too.
 * - A trailing attribute block such as `{.mt-5}` or `{#id .class}` (Hugo,
 *   Goldmark, and other Markdown attribute syntaxes) is kept as written.
 * - Fixes use the column of the text the wrapped rule reports. When the text
 *   is not on the line (for example `&amp;`), the error has no fix instead of
 *   an exception.
 *
 * Options:
 *   case         "sentence" | "title", passed to the wrapped rule.
 *   ignore       string[], passed to the wrapped rule.
 *   properNouns  string[], words or phrases with fixed spelling, applied in
 *                list order (a later entry can override an earlier one).
 */

import titleCaseStyle from "markdownlint-rule-title-case-style";

/**
 * @typedef {import("markdownlint").MarkdownItToken} MarkdownItToken
 * @typedef {import("markdownlint").Rule} Rule
 * @typedef {import("markdownlint").RuleOnErrorInfo} RuleOnErrorInfo
 */

/**
 * A text child of a heading, with its 1-based column on the line, or
 * `undefined` when the text is not found on the line.
 *
 * @typedef {object} HeadingText
 * @property {string} content
 * @property {number} lineNumber
 * @property {number | undefined} column
 * @property {boolean} reported
 */

const attributeBlock = /\s*\{[^{}]*\}\s*$/u;

/** @param {string} value */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * @param {string} text
 * @param {readonly string[]} properNouns
 */
const restoreProperNouns = (text, properNouns) =>
  properNouns.reduce(
    (result, noun) =>
      result.replace(
        new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(noun)}(?![\\p{L}\\d])`, "giu"),
        noun,
      ),
    text,
  );

/**
 * Keeps the text after an in-word `.` as written. Case changes keep the
 * length, so offsets in `expected` and `actual` match.
 *
 * @param {string} expected
 * @param {string} actual
 */
const restoreInWordDots = (expected, actual) =>
  expected.length === actual.length
    ? expected.replace(/\.[^\s.!?]+/gu, (match, /** @type {number} */ offset) =>
        actual.slice(offset, offset + match.length),
      )
    : expected;

/**
 * @param {string} expected
 * @param {string} actual
 */
const restoreAttributeBlock = (expected, actual) => {
  const attribute = attributeBlock.exec(actual);
  return attribute ? expected.replace(attributeBlock, attribute[0]) : expected;
};

/**
 * The expected heading text, corrected for proper nouns, in-word dots, and
 * attribute blocks.
 *
 * @param {string} expected
 * @param {string} actual
 * @param {readonly string[]} properNouns
 */
const correct = (expected, actual, properNouns) =>
  restoreAttributeBlock(
    restoreInWordDots(restoreProperNouns(expected, properNouns), actual),
    actual,
  );

/**
 * Text children of heading inline tokens. Columns are found from left to
 * right, so repeated text gets the column of the right occurrence.
 *
 * @param {readonly MarkdownItToken[]} tokens
 * @param {readonly string[]} lines
 * @returns {HeadingText[]}
 */
const headingTexts = (tokens, lines) => {
  /** @type {HeadingText[]} */
  const result = [];
  let inHeading = false;
  for (const token of tokens) {
    if (token.type === "heading_open") {
      inHeading = true;
    } else if (token.type === "heading_close") {
      inHeading = false;
    } else if (token.type === "inline" && inHeading) {
      // Child tokens have no line number; use the inline token's.
      const line = lines[token.lineNumber - 1] ?? "";
      let cursor = 0;
      for (const child of token.children ?? []) {
        if (child.content === "") {
          continue;
        }
        const index = line.indexOf(child.content, cursor);
        if (index >= 0) {
          cursor = index + child.content.length;
        }
        if (child.type === "text") {
          result.push({
            content: child.content,
            lineNumber: token.lineNumber,
            column: index >= 0 ? index + 1 : undefined,
            reported: false,
          });
        }
      }
    }
  }
  return result;
};

/**
 * @param {unknown} config
 * @returns {{ inner: Record<string, unknown>, properNouns: string[] }}
 */
const parseConfig = (config) => {
  if (!config || typeof config !== "object") {
    return { inner: {}, properNouns: [] };
  }
  const { properNouns = [], ...inner } = /** @type {Record<string, unknown>} */ (
    config
  );
  if (
    !Array.isArray(properNouns) ||
    !properNouns.every((noun) => typeof noun === "string" && noun !== "")
  ) {
    throw new Error(
      "dnb-title-case-style: properNouns must be an array of non-empty strings",
    );
  }
  return { inner, properNouns };
};

/** @type {Rule} */
const dnbTitleCaseStyle = {
  names: ["dnb-title-case-style"],
  description:
    "Heading letter case (keeps proper nouns, in-word dots, and attribute blocks)",
  information: new URL(
    "https://github.com/davidsneighbour/markdownlint-config#dnb-title-case-style",
  ),
  tags: ["headings"],
  parser: "markdownit",
  function: (params, onError) => {
    const { inner, properNouns } = parseConfig(params.config);
    const tokens = params.parsers.markdownit.tokens;
    const texts = headingTexts(tokens, params.lines);

    /**
     * @param {HeadingText} text
     * @param {string} expected
     */
    const report = (text, expected) => {
      /** @type {RuleOnErrorInfo} */
      const error = {
        lineNumber: text.lineNumber,
        detail: `Expected: '${expected}'; Actual: '${text.content}'`,
      };
      if (text.column !== undefined) {
        error.fixInfo = {
          editColumn: text.column,
          deleteCount: text.content.length,
          insertText: expected,
        };
      }
      onError(error);
    };

    // The wrapped rule is a legacy rule that reads `params.tokens`.
    titleCaseStyle.function(
      { ...params, config: inner, tokens },
      (/** @type {RuleOnErrorInfo} */ error) => {
        const insertText = error.fixInfo?.insertText;
        // The wrapped rule only changes case, so the reported text is the
        // first unreported heading text on the line that matches ignoring case.
        const text =
          insertText === undefined
            ? undefined
            : texts.find(
                (candidate) =>
                  !candidate.reported &&
                  candidate.lineNumber === error.lineNumber &&
                  candidate.content.toLowerCase() === insertText.toLowerCase(),
              );
        if (insertText === undefined || text === undefined) {
          onError({ lineNumber: error.lineNumber, detail: error.detail });
          return;
        }
        text.reported = true;
        const expected = correct(insertText, text.content, properNouns);
        if (expected !== text.content) {
          report(text, expected);
        }
      },
    );

    // Headings the wrapped rule accepts can still contain proper nouns in the
    // wrong case, for example `samui`.
    for (const text of texts) {
      if (text.reported) {
        continue;
      }
      const expected = correct(text.content, text.content, properNouns);
      if (expected !== text.content) {
        report(text, expected);
      }
    }
  },
};

export default dnbTitleCaseStyle;
