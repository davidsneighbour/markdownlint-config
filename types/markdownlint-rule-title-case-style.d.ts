// markdownlint-rule-title-case-style ships no type definitions. It is a
// legacy rule: its function reads markdown-it tokens from `params.tokens`.
declare module "markdownlint-rule-title-case-style" {
  import type { MarkdownItToken, Rule, RuleOnError, RuleParams } from "markdownlint";

  const rule: Omit<Rule, "function"> & {
    function: (
      params: RuleParams & { tokens: readonly MarkdownItToken[] },
      onError: RuleOnError,
    ) => void;
  };
  export default rule;
}
