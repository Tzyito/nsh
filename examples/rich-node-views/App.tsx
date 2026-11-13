import { mount, signal, Text, View } from "nsh";
import {
  Button,
  RichEditor,
  StarterKit,
  createRichEditor,
  defineExtension,
  type RichNodeViewProps,
} from "nsh/base";

// Nodes rendered with TSX components (`addNodeView`, Tiptap's): an inline
// stock tag whose pill switches between bullish and bearish, and a block
// position card with a remove button. Each component runs once per node:
// its props follow the node, so a press on the pill updates the tag in
// place, and typing anywhere sends the components nothing. Buttons inside
// a view keep their presses; a press elsewhere on a view selects its node.

const BULLISH = "1";
const BEARISH = "2";

/** `$NVIDIA.US` and its trend pill. */
function StockTag(props: RichNodeViewProps) {
  const trend = () => props.node.attrs.trend as string;
  const bearish = () => trend() === BEARISH;
  return (
    <View
      class="flex-row items-center gap-1 rounded-md px-1"
      classList={{ "bg-primary/15": props.selected }}
    >
      <Text class="font-medium text-primary">
        {`$${props.node.attrs.name}.${props.node.attrs.market}`}
      </Text>
      <Button
        class="flex-row items-center rounded-full px-1.5"
        classList={{
          "bg-red-500/15": bearish(),
          "bg-green-500/15": !bearish(),
        }}
        onPress={() => props.updateAttributes({ trend: bearish() ? BULLISH : BEARISH })}
      >
        <Text
          class="text-xs font-medium"
          classList={{
            "text-red-600 dark:text-red-400": bearish(),
            "text-green-600 dark:text-green-400": !bearish(),
          }}
        >
          {bearish() ? "▼ Bearish" : "▲ Bullish"}
        </Text>
      </Button>
    </View>
  );
}

/** A position: its symbol, quantity and cost, and a remove button. */
function PositionCard(props: RichNodeViewProps) {
  const attr = (name: string) => String(props.node.attrs[name] ?? "");
  return (
    <View
      class="my-2 flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
      classList={{ "border-primary": props.selected }}
    >
      <View class="h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Text class="text-sm font-semibold text-foreground">{attr("symbol").slice(0, 2)}</Text>
      </View>
      <View class="flex-1 gap-0.5">
        <Text class="font-semibold text-card-foreground">{attr("symbol")}</Text>
        <Text class="text-sm text-muted-foreground">{`${attr("quantity")} shares at ${attr("cost")}`}</Text>
      </View>
      <Button class="rounded-md px-2 py-1 hover:bg-muted" onPress={() => props.deleteNode()}>
        <Text class="text-sm text-muted-foreground">Remove</Text>
      </Button>
    </View>
  );
}

const SecurityTag = defineExtension({
  name: "securityTag",
  node: {
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    attrs: { name: { default: "" }, market: { default: "US" }, trend: { default: BULLISH } },
  },
  addNodeView: () => StockTag,
});

const Position = defineExtension({
  name: "position",
  node: {
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    attrs: { symbol: { default: "" }, quantity: { default: 0 }, cost: { default: "" } },
  },
  addNodeView: () => PositionCard,
});

const tag = (name: string, trend = BULLISH) => ({ type: "securityTag", attrs: { name, market: "US", trend } });

function App() {
  const editor = createRichEditor({
    extensions: [StarterKit, SecurityTag, Position],
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Adding to " },
            tag("NVIDIA"),
            { type: "text", text: " on the dip, trimming " },
            tag("Tesla", BEARISH),
            { type: "text", text: " into earnings." },
          ],
        },
        { type: "position", attrs: { symbol: "NVDA", quantity: 120, cost: "$118.40" } },
        { type: "paragraph", content: [{ type: "text", text: "Press a pill to flip its trend, or a tag to select it." }] },
      ],
    },
  });
  const tags = signal(2);
  editor.on("transaction", () => {
    let count = 0;
    const walk = (node: { type: string; content?: unknown[] }) => {
      if (node.type === "securityTag") count += 1;
      for (const child of (node.content ?? []) as (typeof node)[]) walk(child);
    };
    walk(editor.getJSON());
    tags.set(count);
  });
  const insertTag = () => editor.insertContent(tag("Apple"));
  return (
    <View class="flex-1 gap-3 bg-background px-4 pt-16">
      <View class="flex-row items-center justify-between">
        <Text class="text-xl font-semibold text-foreground">Node views</Text>
        <Text class="text-sm text-muted-foreground">{`${tags()} tags`}</Text>
      </View>
      <View class="flex-row gap-2">
        <Button class="rounded-md border border-border px-3 py-1.5 hover:bg-muted" onPress={insertTag}>
          <Text class="text-sm text-foreground">Insert $Apple.US</Text>
        </Button>
      </View>
      <RichEditor
        editor={editor}
        class="flex-1 rounded-xl border border-border bg-background p-3 text-base leading-7 text-foreground"
      />
    </View>
  );
}

mount(App);
