import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
    ...nextVitals,
    { ignores: [".next/**", "node_modules/**", "dist/**", "eval/results/**"] },
    {
        rules: {
            "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
            // Plain apostrophes in JSX text render fine.
            "react/no-unescaped-entities": "off",
            // Photos are user uploads on short-lived signed storage URLs from varying hosts,
            // which next/image can't optimise (it needs a fixed host list), so plain <img> is right.
            "@next/next/no-img-element": "off",
        },
    },
    {
        // API code, tests and tooling: unused callback arguments, caught
        // errors and omitted rest-destructuring keys are deliberate there.
        files: ["src/server/**", "src/app/api/**", "test/**", "eval/**", "scripts/**"],
        rules: {
            "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
        },
    },
];

export default config;
