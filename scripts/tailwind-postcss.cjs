/**
 * The project's Tailwind PostCSS plugin (see postcss.config.mjs).
 *
 * Where Tailwind's native scanner loads, this simply is `@tailwindcss/postcss`.
 * Where Windows blocks it (see tailwind-engine.cjs), it builds the same
 * stylesheet with the WebAssembly scanner instead. That scanner extracts class
 * names fine but cannot walk a Windows folder itself, so the walking is done
 * here with Node — every source file under the folders in SOURCES — and the
 * contents are handed to it; Tailwind's own compiler then builds the CSS.
 */
const fs = require('node:fs');
const path = require('node:path');
const { nativeLoads, loadWasm } = require('./tailwind-engine.cjs');

const NAME = 'timeblock-tailwind';
/** Where class names are written, relative to the project folder. */
const SOURCES = ['app', 'components', 'lib', 'packages/core/src'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mdx', '.html']);
const SKIPPED = new Set(['node_modules', '.next', '.git', 'drizzle']);

function sourceFiles(dir, found) {
  if (!fs.existsSync(dir)) return found;
  found.dirs.push(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) sourceFiles(path.join(dir, entry.name), found);
    } else if (EXTENSIONS.has(path.extname(entry.name)) && !/\.test\.[cm]?[jt]sx?$/.test(entry.name)) {
      found.files.push(path.join(dir, entry.name));
    }
  }
  return found;
}

function withWasm() {
  const postcss = require('postcss');
  const { compile, optimize } = require('@tailwindcss/node');
  return {
    postcssPlugin: NAME,
    async Once(root, { result }) {
      // Only stylesheets that use Tailwind; anything else passes through untouched.
      let usesTailwind = false;
      root.walkAtRules((rule) => {
        if (['tailwind', 'theme', 'apply', 'source', 'utility', 'variant'].includes(rule.name)) usesTailwind = true;
        if (rule.name === 'import' && /["']tailwindcss/.test(rule.params)) usesTailwind = true;
      });
      if (!usesTailwind) return;

      const { Scanner } = loadWasm();
      const from = result.opts.from ?? path.join(process.cwd(), 'app', 'globals.css');
      const dependsOn = (message) => result.messages.push({ plugin: NAME, parent: from, ...message });
      const compiler = await compile(root.toString(), {
        base: path.dirname(from),
        from,
        onDependency: (file) => dependsOn({ type: 'dependency', file }),
      });

      const found = SOURCES.reduce((all, dir) => sourceFiles(path.join(process.cwd(), dir), all), { files: [], dirs: [] });
      // A changed, added or removed source file rebuilds the stylesheet in `next dev`.
      for (const dir of found.dirs) dependsOn({ type: 'dir-dependency', dir, glob: '**/*' });
      for (const file of found.files) dependsOn({ type: 'dependency', file });

      const candidates = new Scanner({}).scanFiles(
        found.files.map((file) => ({ content: fs.readFileSync(file, 'utf8'), extension: path.extname(file).slice(1) })),
      );
      const css = optimize(compiler.build(candidates), { file: from, minify: process.env.NODE_ENV === 'production' }).code;

      root.removeAll();
      root.append(postcss.parse(css, { from }).nodes);
    },
  };
}

function plugin(options) {
  return nativeLoads() ? require('@tailwindcss/postcss')(options) : withWasm();
}
plugin.postcss = true;

module.exports = plugin;
