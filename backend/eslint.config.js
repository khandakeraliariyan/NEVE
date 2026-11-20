import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
    ...nextVitals,
    { ignores: [".next/**", "node_modules/**", "eval/results/**"] },
    {
        rules: {
            // Unused callback arguments, caught errors and omitted
            // rest-destructuring keys are deliberate in this codebase.
            "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
        },
    },
];

export default config;
