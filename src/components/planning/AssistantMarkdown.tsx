import type { BlockNode, InlineNode } from "@/lib/ai/markdown";
import { parseAssistantMarkdown } from "@/lib/ai/markdown";

function tidy(text: string): string {
  return text
    .replace(/\s+—\s+/g, ": ")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === "text") return <span key={index}>{node.value}</span>;
        if (node.type === "strong") {
          return (
            <strong
              key={index}
              className="font-semibold text-[var(--color-navy-800)]"
            >
              <Inline nodes={node.children} />
            </strong>
          );
        }
        if (node.type === "em") {
          return (
            <em key={index}>
              <Inline nodes={node.children} />
            </em>
          );
        }
        if (node.type === "code") {
          return (
            <code
              key={index}
              className="rounded bg-[var(--color-canvas)] px-1 py-0.5 font-mono text-[11px] text-[var(--color-navy-600)]"
            >
              {node.value}
            </code>
          );
        }
        return (
          <span
            key={index}
            title={`Source ${node.id}`}
            className="ml-1 inline-flex items-center rounded bg-[var(--color-canvas)] px-1 py-0.5 align-middle font-mono text-[10px] text-[var(--color-navy-500)]"
          >
            {node.id}
          </span>
        );
      })}
    </>
  );
}

function listItemText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.type === "strong" || node.type === "em") {
        return listItemText(node.children);
      }
      if (node.type === "code") return node.value;
      return "";
    })
    .join("");
}

function Block({ block }: { block: BlockNode }) {
  if (block.type === "heading") {
    const Tag = block.level === 2 ? "h3" : "h4";
    return (
      <Tag className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-navy-400)] first:mt-0">
        <Inline nodes={block.children} />
      </Tag>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-navy-700)] first:mt-0">
        <Inline nodes={block.children} />
      </p>
    );
  }

  if (block.type === "list") {
    const labeled = block.items.every((item) => listItemText(item).includes(":"));
    if (labeled && !block.ordered) {
      return (
        <dl className="mt-1.5 divide-y divide-[var(--color-hairline)] first:mt-0">
          {block.items.map((item, index) => {
            const raw = listItemText(item);
            const split = raw.indexOf(":");
            const label = split >= 0 ? raw.slice(0, split).trim() : raw;
            const citations = item.filter((node) => node.type === "citation");
            return (
              <div
                key={index}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <dt className="text-[11px] text-[var(--color-navy-500)]">
                  {label}
                </dt>
                <dd className="text-right text-xs font-medium text-[var(--color-navy-800)]">
                  <Inline
                    nodes={
                      split >= 0
                        ? [
                            {
                              type: "text",
                              value: raw.slice(split + 1).trim(),
                            },
                            ...citations,
                          ]
                        : item
                    }
                  />
                </dd>
              </div>
            );
          })}
        </dl>
      );
    }

    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag
        className={
          block.ordered
            ? "mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-[var(--color-navy-700)] first:mt-0"
            : "mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[var(--color-navy-700)] first:mt-0"
        }
      >
        {block.items.map((item, index) => (
          <li key={index}>
            <Inline nodes={item} />
          </li>
        ))}
      </Tag>
    );
  }

  if (block.type === "quote") {
    return (
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-navy-600)] first:mt-0">
        <Inline nodes={block.children} />
      </p>
    );
  }

  return null;
}

export default function AssistantMarkdown({ text }: { text: string }) {
  const blocks = parseAssistantMarkdown(tidy(text)).filter(
    (block) => block.type !== "rule",
  );
  if (blocks.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-[var(--color-navy-700)]">
        {tidy(text)}
      </p>
    );
  }
  return (
    <div className="min-w-0">
      {blocks.map((block, index) => {
        if (index === 0 && block.type === "paragraph") {
          return (
            <p
              key={index}
              className="text-sm font-medium leading-relaxed text-[var(--color-navy-800)]"
            >
              <Inline nodes={block.children} />
            </p>
          );
        }
        return <Block key={index} block={block} />;
      })}
    </div>
  );
}
