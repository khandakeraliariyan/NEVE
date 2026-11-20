import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
    ...nextVitals,
    { ignores: [".next/**", "node_modules/**", "dist/**", "eval/results/**"] },
    {
        rules: {
            "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
            // Plain apostrophes in JSX text render fine.
            "react/no-unescaped-entities": "off",
            // Newer React Compiler-era checks the code predates; surfaced, not blocking.
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/refs": "warn",
            "react-hooks/purity": "warn",
            // Cell values passed to <Row cells> are keyed inside Row.
            "react/jsx-key": "warn",
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
