// The subset of markdown-it that the rule tests use to build the parser that
// markdownlint expects. markdown-it ships no type definitions.
declare module "markdown-it" {
  import type { MarkdownItFactory } from "markdownlint";

  const markdownIt: (options?: { html?: boolean }) => Awaited<ReturnType<MarkdownItFactory>>;
  export default markdownIt;
}
