const globals = require("globals");
const pluginJs = require("@eslint/js");

const millbrookPlugin = {
  rules: {
    "jsx-uses-vars": {
      meta: {
        type: "problem",
        docs: {
          description: "Mark JSX identifiers as used for no-unused-vars",
        },
        schema: [],
      },
      create(context) {
        function markJsxNameAsUsed(node) {
          if (!node) {
            return;
          }

          if (node.type === "JSXIdentifier") {
            if (node.name !== "Fragment") {
              context.sourceCode.markVariableAsUsed(node.name, node);
            }
            return;
          }

          if (node.type === "JSXMemberExpression") {
            markJsxNameAsUsed(node.object);
            return;
          }

          if (node.type === "JSXNamespacedName") {
            context.sourceCode.markVariableAsUsed(node.namespace?.name, node);
          }
        }

        return {
          JSXOpeningElement(node) {
            markJsxNameAsUsed(node.name);
          },
          JSXOpeningFragment() {
            context.sourceCode.markVariableAsUsed("Fragment");
          },
        };
      },
    },
  },
};

module.exports = [
  {
    files: ["src/**/*.{js,jsx}"],
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "src/components/ui/**/*",
    ],
    ...pluginJs.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      millbrook: millbrookPlugin,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      "millbrook/jsx-uses-vars": "error",
      "no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^(React|_)$",
          args: "after-used",
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["src/**/*.{test,spec}.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.jest,
        ...globals.node,
        vi: "readonly",
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
];
