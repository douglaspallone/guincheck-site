import type { Block, Inline } from "@/lib/legal/types"

// Desenha a árvore de blocos já interpretada pelo servidor. Todo texto entra como nó de texto do React
// (nunca como HTML) e links só passam se forem https:// ou mailto: (revalidado em lib/legal/document.ts).

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((item, index) => {
        if (item.t === "strong") return <strong key={index} className="font-semibold text-foreground">{item.v}</strong>
        if (item.t === "link") {
          const external = item.href.startsWith("https://") && !item.href.startsWith("https://guincheck.com.br")
          return (
            <a
              key={index}
              href={item.href}
              className="font-medium text-primary underline underline-offset-2 hover:no-underline"
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {item.v}
            </a>
          )
        }
        return <span key={index}>{item.v}</span>
      })}
    </>
  )
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.t === "h") {
          return (
            <h3 key={index} className="pt-2 text-base font-semibold text-foreground break-after-avoid">
              <Inlines items={block.c} />
            </h3>
          )
        }
        if (block.t === "p") {
          return (
            <p key={index} className="leading-relaxed text-foreground/85">
              <Inlines items={block.c} />
            </p>
          )
        }
        const items = block.items.map((item, i) => (
          <li key={i} className="pl-1 leading-relaxed text-foreground/85">
            <Inlines items={item} />
          </li>
        ))
        return block.t === "ul" ? (
          <ul key={index} className="list-disc space-y-1.5 pl-6 marker:text-muted-foreground">{items}</ul>
        ) : (
          <ol key={index} start={block.start} className="list-decimal space-y-1.5 pl-6 marker:text-muted-foreground">{items}</ol>
        )
      })}
    </div>
  )
}
