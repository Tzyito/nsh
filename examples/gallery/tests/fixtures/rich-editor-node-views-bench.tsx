import { effect, mount, signal, Text, View } from "nsh";

// How many times the tags' props changed after they were made.
const updates = signal(0);
import { RichEditor, StarterKit, createRichEditor, defineExtension, type RichNodeViewProps } from "nsh/base";

// 300 inline tags (30 paragraphs of 10) rendered with a TSX component, to
// time typing in a paragraph that holds some (`nsh test --trace`). `plain`
// leaves the tags without a view (drawn as their `renderText`), the
// baseline.
const plain = false;

function Tag(props: RichNodeViewProps) {
  let first = true;
  effect(() => {
    void props.node;
    void props.selected;
    if (!first) updates.update((n) => n + 1);
    first = false;
  });
  return (
    <View class="flex-row items-center gap-1 rounded px-1 bg-muted">
      <Text>{`$${props.node.attrs.name}`}</Text>
      <Text class="text-xs">{props.node.attrs.trend === "2" ? "▼" : "▲"}</Text>
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
    attrs: { name: { default: "" }, trend: { default: "1" } },
    renderText: "name",
  },
  ...(plain ? {} : { addNodeView: () => Tag }),
});

const paragraph = (p: number) => ({
  type: "paragraph",
  content: Array.from({ length: 10 }, (_, i) => [
    { type: "text", text: `word${p}-${i} ` },
    { type: "securityTag", attrs: { name: `S${p * 10 + i}`, trend: i % 2 ? "2" : "1" } },
  ]).flat(),
});

function App() {
  const editor = createRichEditor({
    extensions: [StarterKit, SecurityTag],
    doc: { type: "doc", content: Array.from({ length: 30 }, (_, p) => paragraph(p)) },
  });
  return (
    <View class="flex-1 pt-16 px-4 gap-2">
      <Text>Bench ready</Text>
      <Text>{`updates: ${updates()}`}</Text>
      <RichEditor editor={editor} testID="editor" class="flex-1 text-foreground" />
    </View>
  );
}

mount(App);
