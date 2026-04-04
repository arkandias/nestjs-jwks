import type { Config } from "prettier";

const config: Config = {
  plugins: ["@trivago/prettier-plugin-sort-imports"],
  importOrder: [
    "^node:",
    "<THIRD_PARTY_MODULES>",
    "^[@.][.]?/(?!(css|components|pages)/)",
    "^[@.][.]?/css/",
    "^[@.][.]?/(components|pages)/",
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderGroupNamespaceSpecifiers: true,
  importOrderCaseInsensitive: false,
  importOrderParserPlugins: ["typescript", "decorators-legacy"],
  importOrderSideEffects: true,
};

export default config;
