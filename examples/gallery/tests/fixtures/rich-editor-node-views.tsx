import { mount, signal, Text, View } from "nsh";
import {
  Button,
  RichEditor,
  StarterKit,
  createRichEditor,
  defineExtension,
  type RichNodeViewProps,
} from "nsh/base";

// Nodes rendered with TSX components (`addNodeView`): an inline stock tag
// with a bullish / bearish pill, and a block card with a remove button.
let tagRenders = 0;

function StockTag(props: RichNodeViewProps) {
  tagRenders += 1;
  const trend = () => props.node.attrs.trend as string;
  return (
    <View class="flex-row items-center gap-1">
      <Text>{`$${props.node.attrs.name}`}</Text>
      <Button testID="tag-pill" onPress={() => props.updateAttributes({ trend: trend() === "1" ? "2" : "1" })}>
        <Text>{trend() === "2" ? "Bearish" : "Bullish"}</Text>
      </Button>
      <Text>{props.selected ? "tag selected" : "tag idle"}</Text>
    </View>
  );
}

function OrderCard(props: RichNodeViewProps) {
  return (
    <View class="p-3 gap-2">
      <Text testID="card-title">{`order ${props.node.attrs.id}`}</Text>
      <Text>{props.selected ? "card selected" : "card idle"}</Text>
      <Button testID="card-remove" onPress={() => props.deleteNode()}>
        <Text>Remove</Text>
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
    attrs: { name: { default: "" }, trend: { default: "0" } },
  },
  addNodeView: () => StockTag,
});

const OrderCardExtension = defineExtension({
  name: "orderCard",
  node: { group: "block", atom: true, selectable: true, draggable: true, attrs: { id: { default: "" } } },
  addNodeView: () => OrderCard,
});

function App() {
  const editor = createRichEditor({
    extensions: [StarterKit, SecurityTag, OrderCardExtension],
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Buy " },
            { type: "securityTag", attrs: { name: "NVDA", trend: "1" } },
            { type: "text", text: " now" },
          ],
        },
        { type: "orderCard", attrs: { id: "42" } },
        { type: "paragraph", content: [{ type: "text", text: "End" }] },
      ],
    },
  });
  const trend = signal("1");
  const blocks = signal(3);
  const selection = signal("none");
  const renders = signal(0);
  editor.on("transaction", () => {
    const doc = editor.getJSON();
    blocks.set(doc.content.length);
    const tag = (doc.content[0]?.content ?? []).find((n: { type: string }) => n.type === "securityTag");
    trend.set(String(tag?.attrs?.trend ?? "none"));
    const s = editor.state.selection;
    selection.set(`${s.type} ${s.anchor}`);
    renders.set(tagRenders);
  });
  return (
    <View class="flex-1 pt-16 px-4 gap-2">
      <Text>{`trend: ${trend()}`}</Text>
      <Text>{`blocks: ${blocks()}`}</Text>
      <Text>{`selection: ${selection()}`}</Text>
      <Text>{`tag renders: ${renders()}`}</Text>
      <RichEditor editor={editor} testID="editor" class="h-80 text-foreground" />
    </View>
  );
}

mount(App);
