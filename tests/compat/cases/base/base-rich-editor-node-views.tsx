// A case of the API's test suite (docs/dev/compatibility.md): nodes an
// extension renders with a component (`addNodeView`): an inline tag whose
// pill updates its attribute in place, and a block card whose button
// deletes its node. The props' methods are `RichNodeView`'s, bound.
import { Text, View, signal } from "nsh";
import { Button, RichEditor, RichNodeView, StarterKit, createRichEditor, defineExtension, type RichNodeViewProps } from "nsh/base";

function Tag(props: RichNodeViewProps) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      <Text>{`NodeTag ${props.node.type} ${props.node.attrs.name} ${props.extension.name}`}</Text>
      <Button onPress={() => props.updateAttributes({ trend: props.node.attrs.trend === "1" ? "2" : "1" })}>
        <Text>{`TagPill ${props.node.attrs.trend}`}</Text>
      </Button>
    </View>
  );
}

function Card(props: RichNodeViewProps) {
  return (
    <View style={{ gap: 4 }}>
      <Text>{`NodeCard ${props.node.attrs.id} ${props.getPos()} ${props.selected}`}</Text>
      <Button onPress={() => props.deleteNode()}>
        <Text>CardRemove</Text>
      </Button>
    </View>
  );
}

const TagExtension = defineExtension({
  name: "tag",
  node: { group: "inline", inline: true, atom: true, attrs: { name: { default: "" }, trend: { default: "1" } } },
  addNodeView: () => Tag,
});

const CardExtension = defineExtension({
  name: "card",
  node: { group: "block", atom: true, attrs: { id: { default: "" } } },
  addNodeView: () => Card,
});

function App() {
  const editor = createRichEditor({
    extensions: [StarterKit, TagExtension, CardExtension],
    doc: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A " }, { type: "tag", attrs: { name: "ACME" } }] },
        { type: "card", attrs: { id: "c1" } },
      ],
    },
  });
  const blocks = signal(2);
  editor.on("transaction", () => blocks.set(editor.getJSON().content.length));
  return (
    <View style={{ flex: 1, paddingTop: 60, paddingLeft: 20, gap: 4 }}>
      <Text>{`NodeBlocks ${blocks()} ${typeof RichNodeView}`}</Text>
      <RichEditor editor={editor} style={{ height: 200 }} />
    </View>
  );
}

export default App;
