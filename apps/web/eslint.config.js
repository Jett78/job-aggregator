import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    rules: {
      // TypeScript covers prop validation; this rule only adds noise.
      "react/prop-types": "off",
    },
  },
];
