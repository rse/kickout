#!/usr/bin/env node
/*!
**  Kickout -- Conveniently Release Git-Versioned NPM Package
**  Copyright (c) 2017-2025 Dr. Ralf S. Engelschall <rse@engelschall.com>
**
**  Permission is hereby granted, free of charge, to any person obtaining
**  a copy of this software and associated documentation files (the
**  "Software"), to deal in the Software without restriction, including
**  without limitation the rights to use, copy, modify, merge, publish,
**  distribute, sublicense, and/or sell copies of the Software, and to
**  permit persons to whom the Software is furnished to do so, subject to
**  the following conditions:
**
**  The above copyright notice and this permission notice shall be included
**  in all copies or substantial portions of the Software.
**
**  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
**  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
**  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
**  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
**  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
**  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
**  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*  external requirements  */
import fs         from "fs"
import yargs      from "yargs"
import { execa }  from "execa"
import getStream  from "get-stream"
import chalk      from "chalk"
import stripAnsi  from "strip-ansi"
import semver     from "semver"
import escRE      from "escape-string-regexp"
import UN         from "update-notifier"

;(async () => {
    /*  load my own information  */
    const my = JSON.parse(await fs.promises.readFile(new URL("./package.json", import.meta.url)))

    /*  automatic update notification (with 2 days check interval)  */
    const notifier = UN({ pkg: my, updateCheckInterval: 1000 * 60 * 60 * 24 * 2 })
    notifier.notify()

    /*  command-line option parsing  */
    const argv = yargs()
        .usage("Usage: $0 [-h] [-V] [-C] [-m <message>] [-t <tag>] major|minor|patch|X.Y.Z")
        .help("h").alias("h", "help").default("h", false)
        .describe("h", "show usage help")
        .boolean("V").alias("V", "version").default("V", false)
        .describe("V", "show program version information")
        .boolean("C").alias("C", "noColor").default("C", false)
        .describe("C", "do not use any colors in output")
        .boolean("n").alias("n", "noop").default("n", false)
        .describe("n", "do not execute any destructive commands at all")
        .string("m").nargs("m", 1).alias("m", "message").default("m", "")
        .describe("m", "use custom commit message")
        .string("t").nargs("t", 1).alias("t", "tag").default("t", "latest")
        .describe("t", "set particular NPM package tag")
        .strict()
        .showHelpOnFail(true)
        .demand(1)
        .parse(process.argv.slice(2))

    /*  short-circuit processing of "-V" command-line option  */
    if (argv.version) {
        process.stderr.write(my.name + " " + my.version + " <" + my.homepage + ">\n")
        process.stderr.write(my.description + "\n")
        process.stderr.write("Copyright (c) 2017-2025 " + my.author.name + " <" + my.author.url + ">\n")
        process.stderr.write("Licensed under " + my.license + " <http://spdx.org/licenses/" + my.license + ".html>\n")
        process.exit(0)
    }

    /*  gather argument  */
    if (argv._.length !== 1)
        throw new Error("invalid number of arguments")
    const bump = argv._[0]
    if (!bump.match(/^(?:major|minor|patch|\d+\.\d+\.\d+)$/))
        throw new Error("invalid bumping mode")

    /*  helper functions  */
    const out = (txt) => {
        if (argv.noColor)
            txt = stripAnsi(txt)
        process.stdout.write(txt)
    }
    const cmd = (cmd, noop) => {
        if (noop) {
            out(`$ ${chalk.blue("# " + cmd)}\n`)
            return Promise.resolve({ stdout: "", stderr: "" })
        }
        else {
            out(`$ ${chalk.blue(cmd)}\n`)
            const child = execa(cmd, { shell: true })
            child.stdout.pipe(process.stdout)
            child.stderr.pipe(process.stderr)
            return Promise.all([
                child,
                getStream(child.stdout),
                getStream(child.stderr)
            ]).then(([ result, stdout, stderr ]) => {
                result.stdout = stdout
                result.stderr = stderr
                return result
            }).catch((/* err */) => {
                throw new Error("shell command failed")
            })
        }
    }

    /*  step 1: read old package configuration  */
    if (!fs.existsSync("package.json")) {
        out(`** ${chalk.red.bold("ERROR:")} cannot find NPM package configuration file "package.json"\n`)
        process.exit(1)
    }
    const pkgData = fs.readFileSync("package.json", { encoding: "utf8" })
    const pkg = JSON.parse(pkgData)
    if (typeof pkg !== "object") {
        out(`** ${chalk.red.bold("ERROR:")} invalid NPM package configuration file "package.json"\n`)
        process.exit(1)
    }

    /*  step 2: check Git working copy status  */
    const status = await cmd("git status --porcelain", false).then(({ stdout, stderr }) => {
        if (stdout === "" && stderr === "")
            return "clean"
        else if (stderr === "")
            return "changes"
        else
            return "error"
    }).catch((/* err */) => {
        return "error"
    })
    if (status !== "clean") {
        out(`** ${chalk.red.bold("ERROR:")} Git working copy status: ${chalk.bold(status)}\n`)
        process.exit(1)
    }

    /*  step 3: optionally run NPM pre-publish scripts  */
    if (typeof pkg.scripts === "object" && typeof pkg.scripts.prepublish === "string")
        await cmd("npm run prepublish", argv.noop)
    else if (typeof pkg.scripts === "object" && typeof pkg.scripts.prepublishOnly === "string")
        await cmd("npm run prepublishOnly", argv.noop)

    /*  step 4: determine latest published NPM version  */
    let versionOld = await cmd(`npm view ${pkg.name} version`, false).then((res) => res.stdout)
    versionOld = versionOld.replace(/\r?\n$/, "")

    /*  step 5: bump version number in package.json  */
    if (semver.neq(pkg.version, versionOld)) {
        out(`** ${chalk.red.bold("ERROR:")} latest published NPM package version not equal current version in package.json\n`)
        process.exit(1)
    }
    const versionNew = bump.match(/^(?:major|minor|patch)$/) ? semver.inc(pkg.version, bump) : bump
    const re = new RegExp(`(["']version["'][ \t\r\n]*:[ \t\r\n]*["'])${escRE(versionOld)}(["'])`)
    const pkgDataNew = pkgData.replace(re, `$1${versionNew}$2`)
    if (pkgDataNew === pkgData)
        throw new Error(`failed to update package configuration from version "${versionOld}" to "${versionNew}"`)
    if (!argv.noop)
        fs.writeFileSync("package.json", pkgDataNew, { encoding: "utf8" })

    /*  step 6: commit changes to Git  */
    let message = argv.message !== "" ? argv.message : `release version ${versionNew}`
    message = message.replace(/"/g, "\\\"").replace(/\$/g, "\\$")
    await cmd(`git commit -m "${message}" package.json`, argv.noop)

    /*  step 7: create a Git tag for the new version  */
    await cmd(`git tag ${versionNew}`, argv.noop)

    /*  step 8: push changes to upstream repository  */
    await cmd("git push && git push --tags", argv.noop)

    /*  step 9: publish new NPM package version  */
    await cmd(`npm publish --tag=${argv.tag}`, argv.noop)
})().catch((err) => {
    /*  fatal error  */
    process.stderr.write(`** ${chalk.red.bold("ERROR:")} ${err.toString()}\n`)
    process.exit(1)
})

