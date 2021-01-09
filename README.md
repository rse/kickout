
Kickout
=======

**Conveniently Release Git-Versioned NPM Package**

<p/>
<img src="https://nodei.co/npm/kickout.png?downloads=true&stars=true" alt=""/>

<p/>
<img src="https://david-dm.org/rse/kickout.png" alt=""/>

Abstract
--------

This is a small opinionated Command-Line Interface (CLI) for
conveniently releasing a Git-versioned NPM package. It performs sanity
checks, bumps the semantic version in `package.json`, commits the changes to Git,
tags the repository with the new version and publishes the package via
NPM. The particular executed command are:

```
$ git status --porcelain
$ npm prepublish
$ npm view <package-name> version
# update package.json with <package-version>
$ git commit -m "release version <package-version>" package.json
$ git tag <package-version>
$ git push && git push --tags
$ npm publish --tag=<package-tag>
```

Attention
---------

The executed shell commands might garble or even destroy some of your
data. Hence, be very careful and use the Kickout command on your own
risk. Especially, perform a dry-run with option `--noop` always first
to see what particular commands would be executed. Also notice that the
initial "npm publish" intentionally has to be performed manually.

Installation
------------

```
$ npm install -g kickout
```

Usage
-----

```
$ kickout [-h] [-V] [-C] [-m <message>] [-t <tag>] major|minor|patch
```

- `-h`, `--help`<br/>
  Show program help information.
- `-V`, `--version`<br/>
  Show program version information.
- `-C`, `--noColor`<br/>
  Do not use any colors in output.
- `-n`, `--noop`<br/>
  Do not execute any destructive commands at all.
- `-m <message>`, `--message <message>`<br/>
  Use custom commit message (instead of `release version <version>`).
- `-t <tag>`, `--tag <tag>`<br/>
  Use particular NPM package tag (instead of `latest`).

License
-------

Copyright (c) 2017-2021 Dr. Ralf S. Engelschall (http://engelschall.com/)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

