import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";
import type { BlockNode, InlineNode } from "./parse";
import { parseMarkdown } from "./parse";
import { highlight, type CodeSpan } from "./highlight";

const CODE_COLOR: Record<string, string> = {
  R: "#ff6b6b",
  string: "#a6e3a1",
  comment: "#6c7086",
  number: "#f9e2af",
  keyword: "#89b4fa",
  type: "#94e2d5",
  punctuation: "#cdd6f4",
  plain: "#cdd6f4",
  function: "#fab387",
};

export function Markdown({ text, width }: { text: string; width?: number }): React.JSX.Element {
  const blocks = parseMarkdown(text);
  return (
    <Box flexDirection="column" width={width}>
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
    </Box>
  );
}

function BlockRenderer({ block }: { block: BlockNode }): React.JSX.Element {
  const theme = useTheme();
  switch (block.kind) {
    case "heading":
      return (
        <Box marginTop={1} marginBottom={block.level === 1 ? 1 : 0}>
          <Text bold color={block.level === 1 ? theme.primary : block.level === 2 ? theme.secondary : theme.foreground}>
            {block.level === 1 ? "" : block.level === 2 ? "## " : "### "}
            <Inline children={block.children} />
          </Text>
        </Box>
      );
    case "paragraph":
      return (
        <Box>
          <Text>
            <Inline children={block.children} />
          </Text>
        </Box>
      );
    case "code":
      return <CodeBlock lang={block.lang} code={block.text} />;
    case "list":
      return (
        <Box flexDirection="column">
          {block.items.map((item, idx) => (
            <Box key={idx} flexDirection="row">
              <Text color={theme.muted}>{block.ordered ? `${idx + 1}.` : "•"} </Text>
              <Text>
                <Inline children={item} />
              </Text>
            </Box>
          ))}
        </Box>
      );
    case "quote":
      return (
        <Box borderLeft borderColor={theme.primary} paddingLeft={1} marginY={1}>
          <Text color={theme.muted} italic>
            <Inline children={block.children} />
          </Text>
        </Box>
      );
    case "hr":
      return <Text color={theme.border}>{"─".repeat(40)}</Text>;
    case "table":
      return <TableBlock header={block.header} rows={block.rows} />;
    default:
      return <></>;
  }
}

function CodeBlock({ lang, code }: { lang: string; code: string }): React.JSX.Element {
  const theme = useTheme();
  const lines = code.split("\n");
  return (
    <Box flexDirection="column" marginY={1} paddingX={1} paddingY={1} borderStyle="round" borderColor={theme.border}>
      {lang ? (
        <Text color={theme.muted} dimColor>
          {lang}
        </Text>
      ) : null}
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={theme.code}>
            {highlight(lang, line).map((span: CodeSpan, j) => (
              <Text key={j} color={CODE_COLOR[span.color] ?? theme.code}>
                {span.text}
              </Text>
            ))}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function TableBlock({ header, rows }: { header: string[]; rows: string[][] }): React.JSX.Element {
  const theme = useTheme();
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const renderRow = (cells: string[], bold: boolean) => (
    <Box flexDirection="row">
      {cells.map((cell, i) => (
        <Text key={i} bold={bold} color={bold ? theme.primary : theme.foreground}>
          {cell.padEnd(widths[i] ?? 0)} {"  "}
        </Text>
      ))}
    </Box>
  );
  return (
    <Box flexDirection="column" marginY={1}>
      {renderRow(header, true)}
      <Text color={theme.border}>{widths.map((w) => "─".repeat(w + 2)).join("")}</Text>
      {rows.map((row, i) => renderRow(row, false))}
    </Box>
  );
}

export function Inline({ children }: { children: InlineNode[] }): React.JSX.Element {
  const theme = useTheme();
  const render = (node: InlineNode, key: number): React.JSX.Element => {
    switch (node.kind) {
      case "text":
        return <Text key={key}>{node.text}</Text>;
      case "bold":
        return (
          <Text key={key} bold>
            {node.children.map((c, i) => render(c, i))}
          </Text>
        );
      case "italic":
        return (
          <Text key={key} italic>
            {node.children.map((c, i) => render(c, i))}
          </Text>
        );
      case "code":
        return (
          <Text key={key} color={theme.code} backgroundColor={theme.codeBackground}>
            {node.text}
          </Text>
        );
      case "link":
        return (
          <Text key={key} color={theme.primary} underline>
            {node.text}
          </Text>
        );
      case "strike":
        return (
          <Text key={key} color={theme.muted}>
            {node.children.map((c, i) => render(c, i))}
          </Text>
        );
    }
  };
  return <>{children.map((node, i) => render(node, i))}</>;
}