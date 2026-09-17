# CLAUDE.md

Guidance for Claude Code, and for anyone else, working in this repository.

## What this repo is

A GitHub profile repo and the site published from it at
<https://mureinik.github.io/mureinik/>. `README.md` is the profile page;
`articles.md` is maintained by hand.

## The talks list has one source of truth

`public_speaking.json` holds every talk. Two things render it:

| File | How it gets the data |
| --- | --- |
| `public_speaking.html` | `fetch('public_speaking.json')` at page load, rendered by its inline `<script>` |
| `public_speaking.md` | **generated** by `scripts/generate_md.js`, and committed |

**Never hand-edit `public_speaking.md`** — the next `node scripts/generate_md.js`
overwrites it. Edit the JSON (or the generator) and regenerate:

```sh
node scripts/generate_md.js
```

Commit the regenerated `public_speaking.md` together with the change that caused
it, so the two never drift apart.

A pre-commit hook does this for you, once installed. It is tracked at
`scripts/hooks/pre-commit`, and each clone opts in once:

```sh
git config core.hooksPath scripts/hooks
```

`public_speaking.md` has exactly one legitimate reason to change — a source
changed — and the hook enforces that from both directions:

- A commit touching `public_speaking.json` **or** `scripts/generate_md.js`
  regenerates the markdown and adds it to that same commit.
- A commit touching `public_speaking.md` on its own is **refused**, since a
  hand-edit there is undone by the next regeneration.

Commits touching none of the three are left alone, and `git commit --no-verify`
skips the hook entirely — which is also the escape hatch for deliberately
committing a `public_speaking.md` that had already drifted out of sync.

Three cases make the hook stop the commit rather than guess: the markdown being
committed on its own, either source having unstaged changes (the generator reads
the working tree, so the output would not match the sources in the commit), and
`node` not being on `PATH`.

The same invariant is enforced in CI by `.github/workflows/talks-markdown.yml`,
which runs on any pull request touching one of the three files. It regenerates
the markdown and fails if the result differs from what is committed. It only
reports — it never commits or pushes a regenerated file, so fixing a failure
means running the generator locally and committing the result. This is the
backstop for clones that never ran the `core.hooksPath` install, and for commits
made with `--no-verify`.

Note that `core.hooksPath` redirects *all* hooks to `scripts/hooks`, so anything
you had in `.git/hooks` stops running.

## Keeping the workflow's pins current

`.github/dependabot.yml` opens a daily pull request when a newer version of an
action used in a workflow is released.

Its `github-actions` entry covers the `uses:` lines, and its `npm` entry covers
the lint tooling in `scripts/package.json`. Dependabot has no ecosystem for
GitHub Actions runner images or for a Node.js runtime version, so two pins are
bumped by hand: `runs-on: ubuntu-24.04` in the workflows, and the Node version.

That pin is a real requirement locally, not just a CI detail: the two link
scripts and `check_tag_categories.js` use `Map.prototype.getOrInsertComputed`,
which arrived in Node 26. On anything
older they fail with a `TypeError` naming the method rather than the version, so
if a script dies that way, check `node --version` against `engines.node` first.
Nothing enforces it — these run as plain `node`, so npm never sees the manifest.

The Node version lives in one place, `engines.node` in `scripts/package.json`.
The workflow does not repeat it — `actions/setup-node` reads it from there via
`node-version-file`, so CI runs the generator on the same Node the script
declares. It is pinned to an exact version rather than a range on purpose; see
below.

When bumping the Node version, check that the generator still produces
byte-identical output under it before merging: the generator formats dates
through `toLocaleDateString('en-GB', …)`, which depends on the runtime's ICU
data. A pull request touching `scripts/package.json` runs the markdown check for
exactly this reason, so a bump that shifts the output fails there.

That trigger is on the file, not on the pin — a path filter cannot look inside
one. So the check also runs for a `bin` entry or a Dependabot version bump,
which is expected rather than a misfire: it costs seconds, where missing a Node
bump would let a generated file change without anyone seeing it.

The two renderers share no code, so a change to how talks display usually has to
be made twice, once in each. Keeping them in step is manual.

## Per-link caveats in the JSON

Two optional fields mark individual links rather than the whole talk, because a
talk routinely mixes healthy and unhealthy links — a dead conference page next
to a live YouTube recording, or a gated course page next to a public SlideShare
deck.

`archived` — the host is gone; each value is the Wayback Machine timestamp to
serve that link's copy from. Here the conference page and the slides are dead
while the recording is still live, so only the first two are listed:

```json
{
  "id": "august-penguin-2013",
  "conferenceUrl": "http://ap.hamakor.org.il/2013/",
  "slides": "http://ap.hamakor.org.il/2013/slides/JU.svg",
  "recording": "https://www.youtube.com/watch?v=XmFk_x66T5Q",
  "archived": {
    "conferenceUrl": "20150714001830",
    "slides": "20151113041525"
  }
}
```

`requiresLogin` — the link works, but only for a signed-in visitor. Here the two
SciFiDevCon course pages need an account while the slides, recording and code sit
on public SlideShare, YouTube and GitHub:

```json
{
  "id": "scifidevcon-2022",
  "conferenceUrl": "https://www.scifidevcon.com/courses/scifidevcon-presents-31-days-of-may-the-fourth-be-with-you-2022",
  "talkUrl": "https://www.scifidevcon.com/courses/scifidevcon-presents-31-days-of-may-the-fourth-be-with-you-2022/contents/63dd5e802a2dc",
  "slides": "https://www.slideshare.net/AllonMureinik/we-are-the-borg-you-will-be-interviewed/",
  "requiresLogin": ["conferenceUrl", "talkUrl"]
}
```

Both are keyed by field name (`conferenceUrl`, `talkUrl`, `slides`, `recording`,
`code`). `archived` is a map because each entry carries a timestamp;
`requiresLogin` is a plain array because there is nothing to store per entry.

The original URL always stays in its own field — the renderers compose
`https://web.archive.org/web/<timestamp>/<original>` from the two. That keeps a
record of where the talk actually lived, and reviving a link later means deleting
one entry.

Marked links render with a glyph, a dashed underline and hover text explaining
why (🗄️ archived, 🔒 login). Archived links are also dimmed; gated ones are not,
since they work fine once you sign in. When a link is somehow both, archived
wins — no login gets you into a host that is down.

YouTube recordings are stored as `https://www.youtube.com/watch?v=<id>`, never
as `youtu.be/<id>`. The short form is a share-link shortener: it answers 303 and
forwards to the `watch?v=` form with a `&feature=youtu.be` parameter appended,
and the video's own page declares the long form canonical. Recording it directly
costs a redirect less and keeps every YouTube entry the same shape, which is
what makes it obvious that one id appears under two talks.

## Every tag has a category

`public_speaking.json` opens with `tagCategories`, a map from a category name to
the tags in it, sitting above the talks that use those tags:

```json
"tagCategories": {
  "Security": ["Security", "DoS", "Injection", "OWASP"],
  "Languages & Tools": ["Java", "Node.js", "Mockito", "oVirt"],
  "Craft": ["Software Engineering", "Testing"],
  "People & Career": ["Management", "Career", "Remote work", "Inclusion", "Cognitive bias"],
  "Open Source & Community": ["Open Source", "Community"]
}
```

Only the topic cloud in `public_speaking.html` reads it. The generator ignores
it — `scripts/generate_md.js` reads `data.talks` and nothing else — so a change
here leaves `public_speaking.md` untouched.

The cloud encodes two different things at once. A word's **size** is the number
of talks carrying that tag, linear in the count. Its **color** is the category.
Color used to rank the count as well, which meant the biggest word was also the
reddest and color told you nothing size had not.

Categories are colored by their **position** in the JSON, through `--cat-1`
… `--cat-5`, rather than by name. Renaming a category in the data therefore
cannot quietly leave it uncolored; reordering the categories does shuffle the
palette, which is visible the moment you look.

Those five variables are defined twice, once per color scheme, exactly as the
accents are. That is not stylistic. Text needs 4.5:1 against its background, and
no single color clears that against both `#0f1117` and `#ffffff`: the first
demands a relative luminance of at least 0.198, the second at most 0.183. Every
palette on this page has to be two palettes. The ten in use run from 5.3:1 to
11.9:1 against their own background.

The legend under the canvas is the only thing that says what a color means, so
it is not decoration. Its swatches hold `var(--cat-N)` rather than a resolved
hex, which is why they follow a color-scheme flip by themselves while the
canvas — pixels, not elements — has to be repainted by the `matchMedia`
listener. The `sr-only` tag buttons carry the same two facts in words: their
labels name the category and the talk count.

The two halves of the file have to name exactly the same tags, and nothing about
adding a talk prompts anyone to revisit the map:

```sh
node scripts/check_tag_categories.js
```

It reports four faults, all of them at once rather than stopping at the first —
a tag a talk uses that no category names, a tag two categories name, a tag no
talk uses, and a category naming no tags at all. The renderer survives the first
of those by falling back to `--text-muted`, which is deliberately unremarkable:
a gray word reads as a category of its own, so the fallback keeps a working tree
rendering mid-edit rather than excusing the state.

`.github/workflows/tag-categories.yml` runs it on any pull request touching the
JSON, the script, or the workflow. There is no `schedule`, unlike the link
check: a tag cannot fall out of its category unattended, so the file changing is
the only thing worth checking. It makes no network calls, so it is instant to
run locally.

## Verifying a change

There is no test suite, so verification is manual. `scripts/package.json` exists
to pin the Node version and hold the lint tooling — it declares no runtime
dependencies, and the generator itself needs no `npm install` to run.

What is automated is the lint. `scripts/` is checked by ESLint against its own
recommended rules plus `eslint-plugin-n`'s `flat/recommended-script`, the
CommonJS half of that plugin's recommendation:

```sh
cd scripts && npm ci && npm run lint
```

`.github/workflows/eslint.yml` runs exactly that on any pull request touching
`scripts/`. The rules live in `scripts/eslint.config.js`; the workflow only runs
them. The inline `<script>` in `public_speaking.html` is **not** linted — see
below, where the markup is.

The markup of `public_speaking.html` is checked by `html-validate`, against its
recommended rules:

```sh
cd scripts && npm ci && npm run lint:html
```

`.github/workflows/html-lint.yml` runs that on any pull request touching the
page, the config, or the manifest the tool version is pinned in. The rules live
in `.htmlvalidate.json` at the repo root — `html-validate` resolves its config by
walking up from the file being linted, so the root is where a page at the root
finds it.

The inline `<script>` stays uncovered, and the reason is mechanical rather than
philosophical. Linting it needs ESLint with a browser configuration, and ESLint
resolves flat config upward from the linted file too — but unlike
`html-validate` it also refuses to lint anything outside its config's base path.
`scripts/eslint.config.js` therefore cannot reach a page at the repo root, and
the way it declines is the dangerous part:

```text
0:0  warning  File ignored because outside of base path
✖ 1 problem (0 errors, 1 warning)
exit: 0
```

It **passes**. A workflow wired that way would be green forever while checking
nothing. Covering the inline script properly means a root-level ESLint config,
and therefore root-level `node_modules` to import the plugins from — a second
manifest, or npm workspaces. That was judged not worth it for one `<script>`
block; revisit if it grows.

`html-validate` has no such trap. Pointed at a path that matches nothing it
prints `No files matching patterns` and exits 1, rather than reporting success
over an empty set.

Two consequences of `eslint-plugin-n` worth knowing before adding a script here.
It reads a shebang as a claim that the file is an entry point, so a new
executable script needs a matching `bin` entry in `scripts/package.json` or
`n/hashbang` fails the build. And it resolves every `require()`, so a module
that is not core and not a declared dependency fails too.

The markdown is linted too, by markdownlint, configured in
`.markdownlint-cli2.jsonc` — markdownlint's defaults with two rules turned off
and `.gitignore` honoured, all detailed below:

```sh
npx markdownlint-cli2 "**/*.md"
```

`.github/workflows/markdown-lint.yml` runs the same check on any pull request
touching a `*.md` file, through `markdownlint-cli2-action` — which bundles the
tool, so there is nothing to install and nothing in `scripts/package.json` for
it. Pass the glob rather than a filename: `gitignore` filtering, which is what
keeps `scripts/node_modules` out, only applies to globs.

That config turns off exactly two rules, both because they contradict something
deliberate here — `MD013` (a generated talk entry is one unwrappable
468-character line) and `MD041` (these files are fragments that open at `###`).
Everything else is on, so a new file gets the defaults.

It sits at the repo root rather than beside the workflow, and that is
load-bearing: `markdownlint-cli2` discovers the file by directory, and from
anywhere else it is simply not found. The failure is silent — the run lints
every dependency README under `scripts/node_modules` against unmodified default
rules and reports thousands of issues, rather than reporting a missing config.
Relocating it would mean passing `--config` on the action *and* on every local
invocation, with that same silent wrong answer whenever the flag is forgotten.
The config is also not CI-specific: the command above is the same check, so it
belongs with the repo rather than with the workflow.

`public_speaking.md` is linted like any other file, not excluded for being
generated — the generator is precisely the thing that could start emitting
malformed markdown with nobody reading the diff. That cuts both ways: a
generator change that upsets a rule has to be fixed in
`scripts/generate_md.js`, never in the output.

For a change to `scripts/generate_md.js`, run it and read the diff. It is deterministic:
a second run on unchanged input produces an identical file.

For a change to the rendering in `public_speaking.html`, the page fetches its
data at load time, so opening the file over `file://` will not render anything
useful. Either serve the directory:

```sh
python3 -m http.server 8000   # then open http://localhost:8000/public_speaking.html
```

…or exercise the render path directly: extract the inline `<script>`, run
`renderTalkList()` in Node against the real `public_speaking.json` under a small
DOM shim, and assert on the HTML it returns. When asserting how many links got
marked, count them from the JSON rather than hardcoding a number, so that both
over-marking and under-marking fail the check.

The cloud is reachable the same way, by stubbing `WordCloud` and
`getComputedStyle` and reading what the page would have painted. Two things are
worth pinning there: that every tag in a category resolves to one color and
that the categories resolve to different ones — in **both** schemes, since each
has its own palette. Read the hexes out of the stylesheet rather than copying
them into the check, or the check goes on passing after the palette changes.

Whatever the change, confirm `public_speaking.json` still parses:

```sh
node -e "JSON.parse(require('fs').readFileSync('public_speaking.json','utf8')); console.log('ok')"
```

## Links rot

Most conference sites outlive their conference by only a few years. When a link
turns out to be dead, check for a Wayback snapshot before dropping it, and
prefer `archived` over deleting the URL. Note that an anonymous 404 does not
always mean gone: a private GitHub repo and a nonexistent one look identical to
a logged-out visitor.

`scripts/check_links.js` looks for that rot rather than waiting for someone to
click a dead link:

```sh
node scripts/check_links.js
```

It walks the five URL fields in every talk — `conferenceUrl`, `talkUrl`,
`slides`, `recording`, `code` — and skips what the JSON already accounts for: a
field named in that talk's `archived` map, and one named in its `requiresLogin`
array. Those two fields *are* the record of a link's state, so re-checking them
would only restate it. Today that is 101 links checked and 12 skipped.

`.github/workflows/link-check.yml` runs it weekly, on any pull request touching
the JSON or the script, and on demand. It fails the job and lists what died.

Three things about how it decides, each of which a naive checker gets wrong
here:

- **Redirects are followed, and are usually the healthy case.** `fosdem.org`
  hands its old years to `archive.fosdem.org`, `video.fosdem.org` hands
  recordings to a mirror, and SlideShare rewrote every old-style path. Roughly a
  third of the links redirect.
- **`HEAD` is tried first, then `GET`.** Most hosts answer `HEAD` and it is
  cheaper, but not all — one YouTube URL here times out on `HEAD` and returns
  200 to a `GET`.
- **A 4xx is final; a timeout, 429 or 5xx is retried.** Asking again after a 404
  gains nothing, while the other three are as often a bad moment as a dead link.

One exception to that last rule, in `BOT_BLOCKING_HOSTS`. Some hosts refuse
datacenter IP ranges outright: Sched serves every DevConf page here and answers
a GitHub Actions runner with 403 while serving the same URL normally to everyone
else. A 403 from a host on that list is reported as *could not be verified*
rather than dead, and does not fail the job.

Keep that list honest. It downgrades 403 and nothing else — a 404 from Sched is
still a 404 — and a 403 from any host not on it still counts as dead. Add a host
only with evidence that it blocks rather than that the link is gone: fetch the
URL from a normal connection and confirm it answers.

That excuse is only needed where the check is blocked, which is CI. From your own
machine those hosts answer normally, so run it without the excuse and get a
verdict on every link instead:

```sh
node scripts/check_links.js --strict
```

Under `--strict` the allowlist is inert and a 403 counts as dead wherever it
comes from. It is the better local mode, and the way to confirm a host on the
list is genuinely still serving.

The script declares no dependencies — the built-in `fetch` is enough — so the
workflow runs it with no install step. A URL used by several talks is fetched
once and reported under each talk that uses it.

## A link belongs to one talk

Fetching proves a link answers, not that it answers for the right talk. The
DevConf.CZ 2022 security entry carried the 2021 *Zoom Out!* recording for years:
alive, checked weekly, and wrong. Nothing that looks at HTTP status can catch
that.

`scripts/check_duplicate_links.js` catches the shape of it — the same URL under
two talks:

```sh
node scripts/check_duplicate_links.js
```

It covers `talkUrl`, `slides`, `recording` and `code`. **`conferenceUrl` is
exempt**, and has to be: several talks at one conference share its page by
definition, and five conferences here are represented that way. Adding it to the
list would make the check permanently red.

There is no opt-out marker, unlike `archived` and `requiresLogin`, because a
repeat in those four fields is always an error to fix in the data. Where a talk
really was given twice, the rule is the one the generated preamble states —
only the most relevant conference links the recording or the slides. That is why
the August Penguin 2018 deck is not also linked from DevConf.CZ 2019.

It runs as its own job in `.github/workflows/link-check.yml`, parallel to the
liveness check rather than gating it, so a pull request with both faults reports
both. It makes no network calls, so it is instant to run on its own.
