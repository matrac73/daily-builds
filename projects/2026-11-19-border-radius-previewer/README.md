# radius-preview

Preview any CSS `border-radius` right in your terminal, tweak it corner by corner, and copy the resulting CSS to the clipboard.

```
$ radius-preview 30% 70% 70% 30% / 30% 30% 70% 70% --columns 40

            ▄▄▄███████████▄▄▄▄▄▄
          ▄████████████████████████▄▄▄
        ▄███████████████████████████████▄▄
       ████████████████████████████████████▄
      ▄██████████████████████████████████████
      ████████████████████████████████████████
      ████████████████████████████████████████
      ███████████████████████████████████████▀
       █████████████████████████████████████▀
       ████████████████████████████████████
        ▀███████████████████████████████▀
          ██████████████████████████▀
            ▀█████████████████▀▀

border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
```

(The real output is drawn with a colour gradient, a table of the radii and a CSS panel.)

## Features

- **Live shape preview** drawn with Unicode half-blocks, so pixels are square and the box keeps its aspect ratio.
- **All 8 values**: each corner takes a horizontal and a vertical radius (`--tl 80/30`), or use the full CSS shorthand with `/`.
- **Pixels and percentages**, resolved against the box size exactly like a browser (`--size 320x180`).
- **Spec-accurate overlap handling**: when radii are too large for the box they are scaled down proportionally, and the preview tells you by how much.
- **Shortest CSS output**: `10px 20px 10px 20px` is written as `border-radius: 10px 20px;`.
- **Copy to clipboard** with `--copy` (uses `clip`, `pbcopy`, `wl-copy`, `xclip` or `xsel`).
- **Interactive mode** (`-i`): change corners with short commands and watch the shape update.
- `--css-only` for scripting and pipes.

## Quick start

Requires Python 3.10+.

```bash
git clone <this-repo> radius-preview
cd radius-preview
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

radius-preview                   # show the default blob
```

Without installing the command, `python -m radius_preview` works the same way (only `rich` is needed).

## Usage

```bash
radius-preview 40                      # four equal corners
radius-preview 10 40 80 20             # top-left, top-right, bottom-right, bottom-left
radius-preview 50% 20% / 10% 40%       # 8 values, CSS shorthand syntax
radius-preview 20 --tl 80/30 --br 50%  # start from 20px, override two corners
radius-preview 9999 --size 300x100     # a pill: radii get scaled to fit
radius-preview 12 24 --copy            # preview, then copy the CSS
radius-preview 12 24 --css-only        # prints: border-radius: 12px 24px;
```

Values without a unit are pixels. Run `radius-preview --help` for every option.

### Interactive mode

```bash
radius-preview -i
```

| Command            | Effect                                                 |
| ------------------ | ------------------------------------------------------ |
| `tl 40`, `br 25%`  | set one corner (`tl`, `tr`, `br`, `bl`)                |
| `tl 80/30`         | elliptical corner: horizontal / vertical radius        |
| `all 30`           | set the four corners at once                           |
| `set 10 40% / 50%` | replace everything with a CSS shorthand value          |
| `size 320x180`     | resize the box                                         |
| `copy`             | copy the CSS to the clipboard                          |
| `reset`            | back to the starting shape                             |
| `help`, `quit`     |                                                        |

## Project structure

```
radius_preview/
  geometry.py    parsing, CSS shorthand output, radius resolution, rasterisation (pure logic)
  session.py     state and command language of the interactive mode (pure logic)
  render.py      rich renderables: gradient shape, radii table, CSS panel
  clipboard.py   cross-platform clipboard access
  cli.py         argument parsing, one-shot and interactive entry points
tests/           pytest suite
```

## Tests

```bash
pip install -e ".[dev]"
pytest
```

The suite covers shorthand parsing and round-tripping, overlap scaling, point-in-shape geometry, rasterisation, the interactive commands, clipboard selection and the CLI end to end.

## License

[MIT](LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/Border-Radius-Previewer.md) idea bank.
