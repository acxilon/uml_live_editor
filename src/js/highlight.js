import { HighlightStyle, LanguageSupport, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const plantumlKeywords = new Set(
  `startuml enduml startgantt endgantt startmindmap endmindmap startwbs endwbs startjson endjson startyaml endyaml
  actor participant boundary control entity database collections queue class interface abstract enum annotation object
  component package namespace node folder frame cloud rectangle storage artifact card usecase state agent together
  hide show skinparam title caption header footer legend note end ref over left right top bottom of as is and
  if then else elseif endif start stop end fork forkagain endfork split splitagain endsplit repeat repeatwhile
  backward while endwhile switch case endswitch partition group box endbox alt opt loop par break critical return
  activate deactivate destroy create autonumber autolabel newpage sequence newpage
  left to right direction top bottom portrait landscape
  allowmixing allow_mixing scale
  true false`
    .split(/\s+/)
    .filter(Boolean),
);

const plantumlState = () => ({ blockComment: false, afterArrow: false });

function plantumlToken(stream, state) {
  if (stream.sol()) state.afterArrow = false;

  if (state.blockComment) {
    if (stream.match(/^.*?'\//)) state.blockComment = false;
    else stream.skipToEnd();
    return 'comment';
  }

  if (stream.match(/^\s+/)) return null;

  if (stream.match(/^\/'/)) {
    state.blockComment = true;
    if (stream.match(/^.*?'\//)) state.blockComment = false;
    else stream.skipToEnd();
    return 'comment';
  }

  if (stream.match(/^'.*/)) return 'comment';
  if (stream.match(/^\/\/.*/)) return 'comment';

  if (stream.match(/^@[A-Za-z]+/)) return 'meta';
  if (stream.match(/^!\[?[A-Za-z_][\w]*/)) return 'meta';

  if (stream.match(/^"[^"]*"?/)) return 'string';
  if (stream.match(/^<<.*?>>/)) return 'typeName';

  if (stream.match(/^#(?:[0-9a-fA-F]{3,8}|[A-Za-z]+)/)) return 'atom';
  if (stream.match(/^\$[A-Za-z_]\w*/)) return 'variableName';

  if (state.afterArrow && stream.peek() === ':') {
    stream.skipToEnd();
    state.afterArrow = false;
    return 'string';
  }

  if (
    stream.match(
      /^(?:<\|?|\*|o|#|\+|\[|\()?(?:-{2,}|\.{2,}|={2,}|~{2,}|-|\.)(?:\[[^\]]*\])?(?:\|?>|>>|>|\*|o|#|X|x|\+|\^|\/\/|\\\\)?/,
    )
  ) {
    state.afterArrow = true;
    return 'operator';
  }

  if (stream.match(/^[{}[\]()]/)) return 'bracket';
  if (stream.match(/^[,;:]/)) return 'punctuation';
  if (stream.match(/^\d+(?:\.\d+)?/)) return 'number';

  const word = stream.match(/^[A-Za-z_\u00c0-\uffff][\w\u00c0-\uffff.$-]*/);
  if (word) {
    const raw = String(word[0] ?? '');
    if (plantumlKeywords.has(raw.toLowerCase())) return 'keyword';
    if (/^[A-Z]/.test(raw)) return 'variableName';
    return 'variableName';
  }

  stream.next();
  return null;
}

const mermaidKeywords = new Set(
  `graph flowchart sequenceDiagram classDiagram stateDiagram stateDiagram-v2 erDiagram gantt pie journey gitGraph
  mindmap timeline quadrantChart requirementDiagram sankey-beta sankey xychart-beta xychart block-beta packet-beta
  architecture-beta kanban radar-beta treemap venn-beta usecase-beta treeView-beta swimlane-beta
  subgraph end direction participant actor autonumber activate deactivate note over loop alt else opt par and critical
  break rect linkStyle classDef class style click callback href call state note left right of title section
  dateFormat axisFormat excludes todayMarker weekday commit branch merge checkout cherr-pick tag
  showData pie journey milestone done active crit until
  LR RL TB TD BT lr rl tb td bt`
    .split(/\s+/)
    .filter(Boolean),
);

const mermaidState = () => ({ afterArrow: false });

function mermaidToken(stream, state) {
  if (stream.sol()) state.afterArrow = false;
  if (stream.match(/^\s+/)) return null;
  if (stream.match(/^%%.*/)) return 'comment';
  if (stream.match(/^"[^"]*"?/)) return 'string';
  if (stream.match(/^\|[^|]*\|/)) return 'string';

  if (stream.match(/^#(?:[0-9a-fA-F]{3,8})/)) return 'number';
  if (stream.match(/^:::[\w-]+/)) return 'typeName';

  if (state.afterArrow && stream.peek() === ':') {
    stream.skipToEnd();
    state.afterArrow = false;
    return 'string';
  }

  if (
    stream.match(
      /^(?:<-->|<--|-->>|-->|->>|-.->|-\.-|==>|===|--x|--o|--\)|--\(|--|---|--|->|\.\.|~~+|==+|<\|--|\*--|o--|x--)/,
    )
  ) {
    state.afterArrow = true;
    return 'operator';
  }

  if (stream.match(/^[{}[\]()]/)) return 'bracket';
  if (stream.match(/^[,;:]/)) return 'punctuation';
  if (stream.match(/^\d+(?:\.\d+)?/)) return 'number';

  const word = stream.match(/^[A-Za-z_\u00c0-\uffff][\w\u00c0-\uffff-]*/);
  if (word) {
    const raw = String(word[0] ?? '');
    if (mermaidKeywords.has(raw) || mermaidKeywords.has(raw.toLowerCase())) return 'keyword';
    if (/^(LR|RL|TB|TD|BT)$/i.test(raw)) return 'typeName';
    return 'variableName';
  }

  stream.next();
  return null;
}

export const plantumlLanguage = StreamLanguage.define({
  name: 'plantuml',
  startState: plantumlState,
  token: plantumlToken,
});

export const mermaidLanguage = StreamLanguage.define({
  name: 'mermaid',
  startState: mermaidState,
  token: mermaidToken,
});

export function languageSupport(language) {
  return new LanguageSupport(language === 'mermaid' ? mermaidLanguage : plantumlLanguage);
}

/**
 * Highlight colours are CSS variables so a theme switch is a pure CSS change.
 */
export const diagramHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syn-keyword)', fontWeight: '550' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--syn-meta)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.operator, t.operatorKeyword], color: 'var(--syn-operator)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syn-type)' },
  { tag: [t.variableName, t.propertyName, t.labelName], color: 'var(--syn-variable)' },
  { tag: [t.punctuation, t.bracket], color: 'var(--text-3)' },
  { tag: t.invalid, color: 'var(--danger)' },
]);

export const diagramSyntaxHighlighting = syntaxHighlighting(diagramHighlightStyle);
