# Third-party notices

UML Live is built on the following open-source projects. Their full license
texts are distributed with the corresponding npm packages and, where relevant,
inside the packaged application.

| Component | Version | License | Project |
| --- | --- | --- | --- |
| Electron | 45.0.0 | MIT | https://github.com/electron/electron |
| Chromium | bundled with Electron | BSD-style + third-party licenses | https://www.chromium.org/ |
| CodeMirror | 6.x | MIT | https://codemirror.net/ |
| Lezer | 1.x | MIT | https://lezer.codemirror.net/ |
| Mermaid | 12.2.0 | MIT | https://github.com/mermaid-js/mermaid |
| @plantuml/core (PlantUML TeaVM build) | 1.2026.9 | MIT | https://github.com/plantuml/plantuml |
| Viz.js | 3.24.0 | MIT | https://github.com/mdaines/viz-js |
| Graphviz (compiled into Viz.js) | 14.1.1 | EPL-1.0 | https://graphviz.org/ |
| Expat (compiled into Viz.js) | — | MIT | https://libexpat.github.io/ |

Additional transitive dependencies bundled by Mermaid, CodeMirror and
Electron retain their respective licenses.

The PlantUML runtime files in `public/` (`plantuml.js`, `viz-global.js`,
`themes.js`, `emoji.js`, `openiconic.js`) are copied unmodified from
`@plantuml/core` by `scripts/copy-assets.mjs`. `public/PLANTUML_LICENSE.txt`
contains the PlantUML license text as shipped by that package.

UML Live itself is licensed under the MIT License; see `LICENSE`.
