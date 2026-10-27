import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { diagramSyntaxHighlighting, languageSupport } from './highlight.js';

function editorTheme(dark) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'var(--editor-bg)',
        color: 'var(--text)',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        fontSize: '12.8px',
        lineHeight: '1.72',
        overscrollBehavior: 'contain',
      },
      '.cm-content': {
        caretColor: 'var(--accent)',
        padding: '13px 0 40px',
        minHeight: '100%',
      },
      '.cm-line': {
        padding: '0 22px 0 10px',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--accent)',
        borderLeftWidth: '2px',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--editor-bg)',
        color: 'var(--editor-gutter)',
        border: 'none',
        paddingLeft: '7px',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 7px 0 8px',
        minWidth: '27px',
        fontSize: '10px',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--editor-active-line)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'var(--text-2)',
      },
      '.cm-foldGutter, .cm-gutter-lint': {
        display: 'none',
      },
      '.cm-selectionBackground, .cm-selectionBackground *': {
        backgroundColor: 'var(--selection) !important',
      },
      '&.cm-focused .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--selection) !important',
      },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: 'var(--accent-soft)',
        outline: '1px solid var(--border-strong)',
        color: 'var(--text-strong)',
        borderRadius: '2px',
      },
      '.cm-nonmatchingBracket': {
        color: 'var(--danger)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--selection-match)',
        borderRadius: '2px',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--accent-soft)',
        outline: '1px solid var(--accent)',
      },
      '.cm-selectionMatch': {
        backgroundColor: 'var(--accent-soft)',
      },
      '.cm-panels': {
        backgroundColor: 'var(--surface-2)',
        color: 'var(--text)',
      },
      '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid var(--border)',
      },
      '.cm-panels.cm-panels-bottom': {
        borderTop: '1px solid var(--border)',
      },
      '.cm-search': {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px',
        padding: '7px 10px',
        fontFamily: 'var(--font-ui)',
        fontSize: '11px',
      },
      '.cm-search label': {
        color: 'var(--text-3)',
        fontSize: '10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
      },
      '.cm-search input, .cm-search select': {
        height: '24px',
        padding: '0 7px',
        border: '1px solid var(--border-strong)',
        borderRadius: '6px',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontSize: '11px',
        outline: 'none',
      },
      '.cm-search input:focus': {
        borderColor: 'var(--accent)',
      },
      '.cm-search button': {
        height: '24px',
        padding: '0 8px',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        background: 'var(--surface-2)',
        color: 'var(--text-2)',
        fontSize: '10.5px',
        backgroundImage: 'none',
      },
      '.cm-search button:hover': {
        background: 'var(--surface-3)',
        color: 'var(--text)',
      },
      '.cm-search button[name="close"]': {
        position: 'relative',
        width: '24px',
        padding: '0',
        color: 'transparent',
        marginLeft: 'auto',
      },
      '.cm-search button[name="close"]::before': {
        content: '"×"',
        position: 'absolute',
        inset: '0',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-3)',
        fontSize: '15px',
        lineHeight: '1',
      },
      '.cm-tooltip': {
        border: '1px solid var(--border-strong)',
        borderRadius: '8px',
        backgroundColor: 'var(--surface-2)',
        color: 'var(--text)',
        boxShadow: 'var(--toast-shadow)',
        overflow: 'hidden',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'var(--accent-soft)',
        color: 'var(--text)',
      },
      '.cm-tooltip-autocomplete ul li': {
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        padding: '3px 8px',
      },
      '.cm-completionIcon': {
        opacity: '0.55',
      },
      '.cm-placeholder': {
        color: 'var(--text-3)',
        fontStyle: 'normal',
        opacity: '0.8',
      },
      '.cm-textfield': {
        backgroundColor: 'var(--surface)',
      },
      '.cm-button': {
        backgroundImage: 'none',
      },
      '.cm-scroller::-webkit-scrollbar': {
        width: '11px',
        height: '11px',
      },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        background: 'var(--scroll-thumb)',
        border: '3px solid var(--editor-bg)',
        borderRadius: '8px',
      },
    },
    { dark },
  );
}

function placeholderFor(language) {
  return language === 'mermaid'
    ? '输入 Mermaid 代码，例如：flowchart LR\n  A[想法] --> B[成品]'
    : '输入 PlantUML 代码，例如：@startuml\nAlice -> Bob : Hello\n@enduml';
}

export class CodeEditor {
  constructor(parent, options = {}) {
    this.onChange = options.onChange ?? (() => {});
    this.onCursor = options.onCursor ?? (() => {});
    this.language = options.language ?? 'plantuml';
    this.dark = options.dark !== false;
    this.silent = false;

    this.languageConf = new Compartment();
    this.themeConf = new Compartment();

    this.view = new EditorView({
      parent,
      state: this._createState(options.doc ?? '', this.language, this.dark),
    });

    this._emitCursor();
  }

  _createState(doc, language, dark) {
    return EditorState.create({
      doc,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        this.languageConf.of(languageSupport(language)),
        this.themeConf.of(editorTheme(dark)),
        diagramSyntaxHighlighting,
        placeholder(placeholderFor(language)),
        keymap.of([indentWithTab]),
        EditorView.contentAttributes.of({
          'aria-label': language === 'mermaid' ? 'Mermaid 源码编辑器' : 'PlantUML 源码编辑器',
          spellcheck: 'false',
          autocapitalize: 'off',
          autocomplete: 'off',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.silent) {
            this.onChange(update.state.doc.toString(), update);
            this._emitCursor(update.state);
          } else if (update.selectionSet) {
            this._emitCursor(update.state);
          }
        }),
      ],
    });
  }

  _emitCursor(state = this.view.state) {
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    this.onCursor({
      line: line.number,
      column: selection.head - line.from + 1,
      length: state.doc.length,
      selected: selection.to - selection.from,
    });
  }

  /** Replace the whole document while keeping undo history. */
  setValue(text) {
    const current = this.view.state.doc;
    this.silent = true;
    this.view.dispatch({
      changes: { from: 0, to: current.length, insert: text },
      selection: { anchor: 0 },
      scrollIntoView: true,
    });
    this.silent = false;
    this._emitCursor();
  }

  /** Swap language/document and start with a fresh undo history. */
  setDocument(text, language, dark = this.dark) {
    this.language = language;
    this.dark = dark;
    this.silent = true;
    this.view.setState(this._createState(text, language, dark));
    this.silent = false;
    this.view.scrollDOM.scrollTop = 0;
    this._emitCursor();
  }

  setTheme(dark) {
    this.dark = dark;
    this.view.dispatch({
      effects: this.themeConf.reconfigure(editorTheme(dark)),
    });
  }

  getValue() {
    return this.view.state.doc.toString();
  }

  getCursor() {
    const state = this.view.state;
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    return {
      line: line.number,
      column: selection.head - line.from + 1,
      length: state.doc.length,
    };
  }

  focus() {
    this.view.focus();
  }
}
