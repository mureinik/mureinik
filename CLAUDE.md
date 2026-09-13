# CLAUDE.md

Guidance for Claude Code, and for anyone else, working in this repository.

## What this repo is

A GitHub profile repo and the site published from it at
<https://mureinik.github.io/mureinik/>. `README.md` is the profile page;
`articles.md` is maintained by hand.

## The talks list has one source of truth

`public_speaking.json` holds every talk. Two things render it:

| File | How it gets the data |
|---|---|
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

`.github/workflows/lint.yml` runs exactly that on any pull request touching
`scripts/`. The rules live in `scripts/eslint.config.js`; the workflow only runs
them. The inline `<script>` in `public_speaking.html` is **not** linted — it is
browser code inside a markup file, which neither rule set fits.

Two consequences of `eslint-plugin-n` worth knowing before adding a script here.
It reads a shebang as a claim that the file is an entry point, so a new
executable script needs a matching `bin` entry in `scripts/package.json` or
`n/hashbang` fails the build. And it resolves every `require()`, so a module
that is not core and not a declared dependency fails too.

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
