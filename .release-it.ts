import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  overrides: {
    git: {
      commitArgs: ["--no-verify"],
    },
    github: {
      skipChecks: true,
    },
  },
});

export default config;
