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
| `public_speaking.md` | **generated** by `generate_md.js`, and committed |

**Never hand-edit `public_speaking.md`** — the next `node generate_md.js`
overwrites it. Edit the JSON (or the generator) and regenerate:

```sh
node generate_md.js
```

Commit the regenerated `public_speaking.md` together with the change that caused
it, so the two never drift apart.

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

There is no test suite and no `package.json`, so verification is manual.

For a change to `generate_md.js`, run it and read the diff. It is deterministic:
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
