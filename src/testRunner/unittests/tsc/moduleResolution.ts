import { dedent } from "../../_namespaces/Utils";
import { jsonToReadableText } from "../helpers";
import {
    getFsConentsForAlternateResultAtTypesPackageJson,
    getFsContentsForAlternateResult,
    getFsContentsForAlternateResultDts,
    getFsContentsForAlternateResultPackageJson,
} from "../helpers/alternateResult";
import { libContent } from "../helpers/contents";
import { verifyTsc } from "../helpers/tsc";
import { verifyTscWatch } from "../helpers/tscWatch";
import { loadProjectFromFiles } from "../helpers/vfs";
import { createWatchedSystem } from "../helpers/virtualFileSystemWithWatch";

describe("unittests:: tsc:: moduleResolution::", () => {
    verifyTsc({
        scenario: "moduleResolution",
        subScenario: "alternateResult",
        fs: () => loadProjectFromFiles(getFsContentsForAlternateResult()),
        commandLineArgs: ["-p", "/home/src/projects/project"],
        baselinePrograms: true,
        edits: [
            {
                caption: "delete the alternateResult in @types",
                edit: fs => fs.unlinkSync("/home/src/projects/project/node_modules/@types/bar/index.d.ts"),
            },
            {
                caption: "delete the ndoe10Result in package/types",
                edit: fs => fs.unlinkSync("/home/src/projects/project/node_modules/foo/index.d.ts"),
            },
            {
                caption: "add the alternateResult in @types",
                edit: fs => fs.writeFileSync("/home/src/projects/project/node_modules/@types/bar/index.d.ts", getFsContentsForAlternateResultDts("bar")),
            },
            {
                caption: "add the ndoe10Result in package/types",
                edit: fs => fs.writeFileSync("/home/src/projects/project/node_modules/foo/index.d.ts", getFsContentsForAlternateResultDts("foo")),
            },
            {
                caption: "update package.json from @types so error is fixed",
                edit: fs => fs.writeFileSync("/home/src/projects/project/node_modules/@types/bar/package.json", getFsConentsForAlternateResultAtTypesPackageJson("bar", /*addTypesCondition*/ true)),
            },
            {
                caption: "update package.json so error is fixed",
                edit: fs => fs.writeFileSync("/home/src/projects/project/node_modules/foo/package.json", getFsContentsForAlternateResultPackageJson("foo", /*addTypes*/ true, /*addTypesCondition*/ true)),
            },
            {
                caption: "update package.json from @types so error is introduced",
                edit: fs => fs.writeFileSync("/home/src/projects/project/node_modules/@types/bar2/package.json", getFsConentsForAlternateResultAtTypesPackageJson("bar2", /*addTypesCondition*/ false)),
            },
            {
                caption: "update package.json so error is introduced",
                edit: fs => fs.writeFileSync("/home/src/projects/project/node_modules/foo2/package.json", getFsContentsForAlternateResultPackageJson("foo2", /*addTypes*/ true, /*addTypesCondition*/ false)),
            },
            {
                caption: "delete the alternateResult in @types",
                edit: fs => fs.unlinkSync("/home/src/projects/project/node_modules/@types/bar2/index.d.ts"),
            },
            {
                caption: "delete the ndoe10Result in package/types",
                edit: fs => fs.unlinkSync("/home/src/projects/project/node_modules/foo2/index.d.ts"),
            },
            {
                caption: "add the alternateResult in @types",
                edit: fs => fs.writeFileSync("/home/src/projects/project/node_modules/@types/bar2/index.d.ts", getFsContentsForAlternateResultDts("bar2")),
            },
            {
                caption: "add the ndoe10Result in package/types",
                edit: fs => fs.writeFileSync("/home/src/projects/project/node_modules/foo2/index.d.ts", getFsContentsForAlternateResultDts("foo2")),
            },
        ],
    });

    verifyTscWatch({
        scenario: "moduleResolution",
        subScenario: "pnpm style layout",
        sys: () =>
            createWatchedSystem({
                // button@0.0.1
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+button@0.0.1/node_modules/@component-type-checker/button/src/index.ts": dedent`
                    export interface Button {
                        a: number;
                        b: number;
                    }
                    export function createButton(): Button {
                        return {
                            a: 0,
                            b: 1,
                        };
                    }
                `,
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+button@0.0.1/node_modules/@component-type-checker/button/package.json": jsonToReadableText({
                    name: "@component-type-checker/button",
                    version: "0.0.1",
                    main: "./src/index.ts",
                }),

                // button@0.0.2
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+button@0.0.2/node_modules/@component-type-checker/button/src/index.ts": dedent`
                    export interface Button {
                        a: number;
                        c: number;
                    }
                    export function createButton(): Button {
                        return {
                            a: 0,
                            c: 2,
                        };
                    }
                `,
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+button@0.0.2/node_modules/@component-type-checker/button/package.json": jsonToReadableText({
                    name: "@component-type-checker/button",
                    version: "0.0.2",
                    main: "./src/index.ts",
                }),

                // @component-type-checker+components@0.0.1_@component-type-checker+button@0.0.1
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+components@0.0.1_@component-type-checker+button@0.0.1/node_modules/@component-type-checker/button": {
                    symLink: "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+button@0.0.1/node_modules/@component-type-checker/button",
                },
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+components@0.0.1_@component-type-checker+button@0.0.1/node_modules/@component-type-checker/components/src/index.ts": dedent`
                    export { createButton, Button } from "@component-type-checker/button";
                `,
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+components@0.0.1_@component-type-checker+button@0.0.1/node_modules/@component-type-checker/components/package.json": jsonToReadableText({
                    name: "@component-type-checker/components",
                    version: "0.0.1",
                    main: "./src/index.ts",
                    peerDependencies: {
                        "@component-type-checker/button": "*",
                    },
                    devDependencies: {
                        "@component-type-checker/button": "0.0.2",
                    },
                }),

                // @component-type-checker+components@0.0.1_@component-type-checker+button@0.0.2
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+components@0.0.1_@component-type-checker+button@0.0.2/node_modules/@component-type-checker/button": {
                    symLink: "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+button@0.0.2/node_modules/@component-type-checker/button",
                },
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+components@0.0.1_@component-type-checker+button@0.0.2/node_modules/@component-type-checker/components/src/index.ts": dedent`
                    export { createButton, Button } from "@component-type-checker/button";
                `,
                "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+components@0.0.1_@component-type-checker+button@0.0.2/node_modules/@component-type-checker/components/package.json": jsonToReadableText({
                    name: "@component-type-checker/components",
                    version: "0.0.1",
                    main: "./src/index.ts",
                    peerDependencies: {
                        "@component-type-checker/button": "*",
                    },
                    devDependencies: {
                        "@component-type-checker/button": "0.0.2",
                    },
                }),

                // sdk => @component-type-checker+components@0.0.1_@component-type-checker+button@0.0.1
                "/home/src/projects/component-type-checker/packages/sdk/src/index.ts": dedent`
                    export { Button, createButton } from "@component-type-checker/components";
                    export const VERSION = "0.0.2";
                `,
                "/home/src/projects/component-type-checker/packages/sdk/package.json": jsonToReadableText({
                    name: "@component-type-checker/sdk1",
                    version: "0.0.2",
                    main: "./src/index.ts",
                    dependencies: {
                        "@component-type-checker/components": "0.0.1",
                        "@component-type-checker/button": "0.0.1",
                    },
                }),
                "/home/src/projects/component-type-checker/packages/sdk/node_modules/@component-type-checker/button": {
                    symLink: "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+button@0.0.1/node_modules/@component-type-checker/button",
                },
                "/home/src/projects/component-type-checker/packages/sdk/node_modules/@component-type-checker/components": {
                    symLink: "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+components@0.0.1_@component-type-checker+button@0.0.1/node_modules/@component-type-checker/components",
                },

                // app => @component-type-checker+components@0.0.1_@component-type-checker+button@0.0.2
                "/home/src/projects/component-type-checker/packages/app/src/app.tsx": dedent`
                    import { VERSION } from "@component-type-checker/sdk";
                    import { Button } from "@component-type-checker/components";
                    import { createButton } from "@component-type-checker/button";
                    const button: Button = createButton();
                `,
                "/home/src/projects/component-type-checker/packages/app/package.json": jsonToReadableText({
                    name: "app",
                    version: "1.0.0",
                    dependencies: {
                        "@component-type-checker/button": "0.0.2",
                        "@component-type-checker/components": "0.0.1",
                        "@component-type-checker/sdk": "0.0.2",
                    },
                }),
                "/home/src/projects/component-type-checker/packages/app/tsconfig.json": jsonToReadableText({
                    compilerOptions: {
                        target: "es5",
                        module: "esnext",
                        lib: ["ES5"],
                        moduleResolution: "node",
                        baseUrl: ".",
                        outDir: "dist",
                    },
                    include: ["src"],
                }),
                "/home/src/projects/component-type-checker/packages/app/node_modules/@component-type-checker/button": {
                    symLink: "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+button@0.0.2/node_modules/@component-type-checker/button",
                },
                "/home/src/projects/component-type-checker/packages/app/node_modules/@component-type-checker/components": {
                    symLink: "/home/src/projects/component-type-checker/node_modules/.pnpm/@component-type-checker+components@0.0.1_@component-type-checker+button@0.0.2/node_modules/@component-type-checker/components",
                },
                "/home/src/projects/component-type-checker/packages/app/node_modules/@component-type-checker/sdk": {
                    symLink: "/home/src/projects/component-type-checker/packages/sdk",
                },
                "/a/lib/lib.es5.d.ts": libContent,
            }, { currentDirectory: "/home/src/projects/component-type-checker/packages/app" }),
        commandLineArgs: ["--traceResolution", "--explainFiles"],
    });
});
