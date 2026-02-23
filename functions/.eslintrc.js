module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "google",
  ],
  parserOptions: {
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
  ],
  plugins: [
    "import",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "object-curly-spacing": ["error", "always"],
    "max-len": ["error", {
      "code": 100,
      "tabWidth": 2,
      "ignoreUrls": true, // URLの長さを無視
      "ignoreStrings": true, // 文字列の長さを無視
      "ignoreTemplateLiterals": true, // テンプレートリテラルの長さを無視
      "ignoreComments": true, // コメントの長さを無視
    }],
  },
  overrides: [
    {
      files: ["*.ts", "*.tsx"], // Target TypeScript files
      extends: [
        "plugin:import/typescript",
        "plugin:@typescript-eslint/recommended",
      ],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: ["tsconfig.json"],
        sourceType: "module",
      },
      plugins: [
        "@typescript-eslint",
      ],
      rules: {
        "indent": "off", // Disable the base indent rule for TypeScript files
        "@typescript-eslint/indent": ["error", 2], // Apply TypeScript-specific indent rule
      },
    },
  ],
};
