import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { go } from "@codemirror/lang-go";
import { StreamLanguage } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import type { FileKind } from "../types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  kind: FileKind;
  theme: "light" | "dark";
}

// Minimal stream language for .env files — keys, =, strings, # comments
const envLang = StreamLanguage.define<{ afterEq: boolean }>({
  name: "env",
  startState: () => ({ afterEq: false }),
  token(stream, state) {
    if (stream.sol()) state.afterEq = false;
    if (stream.eatSpace()) return null;
    if (stream.match(/^#.*$/)) return "comment";
    if (!state.afterEq && stream.match(/^[A-Za-z_][A-Za-z0-9_]*(?=\s*=)/)) {
      return "variableName";
    }
    if (stream.match(/^=/)) {
      state.afterEq = true;
      return "operator";
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^'(?:[^'\\]|\\.)*'/)) return "string";
    if (stream.match(/^-?\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^(true|false|null)\b/i)) return "atom";
    stream.next();
    return null;
  },
});

function langExt(kind: FileKind) {
  if (kind === "python") return [python()];
  if (kind === "markdown") return [markdown()];
  if (kind === "sql") return [sql()];
  if (kind === "json") return [json()];
  if (kind === "javascript") return [javascript({ jsx: true })];
  if (kind === "typescript") return [javascript({ jsx: true, typescript: true })];
  if (kind === "go") return [go()];
  if (kind === "env") return [envLang];
  return [];
}

export function CodeEditor({ value, onChange, kind, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        foldGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
        EditorView.lineWrapping,
        langCompartment.current.of(langExt(kind)),
        themeCompartment.current.of(theme === "dark" ? [oneDark] : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: langCompartment.current.reconfigure(langExt(kind)),
    });
  }, [kind]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(theme === "dark" ? [oneDark] : []),
    });
  }, [theme]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
