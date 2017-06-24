#!/usr/bin/env node
/*!
**  Kickout -- Conveniently Release Git-Versioned NPM Package
**  Copyright (c) 2017 Ralf S. Engelschall <rse@engelschall.com>
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
var Promise    = require("bluebird")
var fs         = require("fs")
var yargs      = require("yargs")
var co         = require("co")
var exeq       = require("exeq")
var chalk      = require("chalk")
var semver     = require("semver")
var escRE      = require("escape-string-regexp")
var UN         = require("update-notifier")

co(function * () {
    /*  load my own information  */
    var my = require("./package.json")

    /*  automatic update notification (with 2 days check interval)  */
    var notifier = UN({ pkg: my, updateCheckInterval: 1000 * 60 * 60 * 24 * 2 })
    notifier.notify()

    /*  command-line option parsing  */
    var argv = yargs
        .usage("Usage: $0 [-h] [-V] [-C] [-m <message>] [-t <tag>] major|minor|patch")
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
        process.stderr.write("Copyright (c) 2017 " + my.author.name + " <" + my.author.url + ">\n")
        process.stderr.write("Licensed under " + my.license + " <http://spdx.org/licenses/" + my.license + ".html>\n")
        process.exit(0)
    }

    /*  gather argument  */
    if (argv._.length !== 1)
        throw new Error("invalid number of arguments")
    var bump = argv._[0]
    if (!bump.match(/^(?:major|minor|patch)$/))
        throw new Error("invalid bumping mode")

    /*  helper functions  */
    var out = (txt) => {
        if (argv.noColor)
            txt = chalk.stripColor(txt)
        process.stdout.write(txt)
    }
    var cmd = (cmd, noop) => {
        if (noop) {
            out(`$ ${chalk.blue("# " + cmd)}\n`)
            return Promise.resolve({ stdout: "", stderr: "" })
        }
        else {
            out(`$ ${chalk.blue(cmd)}\n`)
            return exeq(cmd)
                .then((res) => res[0])
                .catch((/* err */) => { throw new Error("shell command failed") })
        }
    }

    /*  step 1: read old package configuration  */
    if (!fs.existsSync("package.json")) {
        out(`** ${chalk.red.bold("ERROR:")} cannot find NPM package configuration file "package.json"\n`)
        process.exit(1)
    }
    var pkgData = fs.readFileSync("package.json", { encoding: "utf8" })
    var pkg = JSON.parse(pkgData)
    if (typeof pkg !== "object") {
        out(`** ${chalk.red.bold("ERROR:")} invalid NPM package configuration file "package.json"\n`)
        process.exit(1)
    }

    /*  step 2: check Git working copy status  */
    var status = yield (cmd("git status --porcelain", false).then(({ stdout, stderr }) => {
        if (stdout === "" && stderr === "")
            return "clean"
        else if (stderr === "")
            return "changes"
        else
            return "error"
    }).catch((/* err */) => {
        return "error"
    }))
    if (status !== "clean") {
        out(`** ${chalk.red.bold("ERROR:")} Git working copy status: ${chalk.bold(status)}\n`)
        process.exit(1)
    }

    /*  step 3: optionally run NPM pre-publish scripts  */
    if (typeof pkg.scripts === "object" && typeof pkg.scripts.prepublish === "string")
        yield (cmd("npm run prepublish", argv.noop))
    else if (typeof pkg.scripts === "object" && typeof pkg.scripts.prepublishOnly === "string")
        yield (cmd("npm run prepublishOnly", argv.noop))

    /*  step 4: determine latest published NPM version  */
    var versionOld = yield (cmd(`npm view ${pkg.name} version`, false).then((res) => res.stdout))
    versionOld = versionOld.replace(/\r?\n$/, "")

    /*  step 5: bump version number in package.json  */
    if (semver.neq(pkg.version, versionOld)) {
        out(`** ${chalk.red.bold("ERROR:")} latest published NPM package version not equal current version in package.json\n`)
        process.exit(1)
    }
    var versionNew = semver.inc(pkg.version, bump)
    var re = new RegExp(`(["']version["'][ \t\r\n]*:[ \t\r\n]*["'])${escRE(versionOld)}(["'])`)
    var pkgDataNew = pkgData.replace(re, `$1${versionNew}$2`)
    if (pkgDataNew === pkgData)
        throw new Error("failed to update package configuration from version \"" + versionOld + "\" to \"" + versionNew + "\"")
    if (!argv.noop)
        fs.writeFileSync("package.json", pkgDataNew, { encoding: "utf8" })

    /*  step 6: commit changes to Git  */
    var message = argv.message !== "" ? argv.message : `release version ${versionNew}`
    message = message.replace(/"/g, "\\\"").replace(/\$/g, "\\$")
    yield (cmd(`git commit -m "${message}" package.json`, argv.noop))

    /*  step 7: create a Git tag for the new version  */
    yield (cmd(`git tag ${versionNew}`, argv.noop))

    /*  step 8: push changes to upstream repository  */
    yield (cmd("git push && git push --tags", argv.noop))

    /*  step 9: publish new NPM package version  */
    yield (cmd(`npm publish --tag=${argv.tag}`, argv.noop))
}).catch(function (err) {
    /*  fatal error  */
    process.stderr.write("** " + chalk.red.bold("ERROR:") + " " + err.toString() + "\n")
    process.exit(1)
})

