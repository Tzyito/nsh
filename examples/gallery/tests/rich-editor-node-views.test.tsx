// Nodes an extension renders with a TSX component (`addNodeView`): an
// inline stock tag with a bullish / bearish pill, and a block card with a
// remove button. The component runs once per node, its props follow the
// node, and the controls in it keep their presses from the editor.
import { expect, open, test } from "nsh/test";

const openEditor = async () => {
  const app = await open("./fixtures/rich-editor-node-views.tsx");
  await app.waitFor("text:$NVDA");
  await app.waitFor("text:order 42");
  return app;
};

test("the pill changes the tag's attribute, in place, as one undo step", async () => {
  const app = await openEditor();
  await app.press("id:tag-pill");
  await app.waitFor("text:trend: 2");
  await app.waitFor("text:Bearish");
  // The pill kept its press: the selection stayed where it was.
  expect(app.shows("text:selection: text 1")).toBe(true);
  // Its props changed; the component did not run again.
  expect(app.shows("text:tag renders: 1")).toBe(true);
  // The pill took no focus either: back in the text, undo takes it back.
  await app.press("text:/^End/");
  await app.keyboard.press("mod+z");
  await app.waitFor("text:trend: 1");
  await app.waitFor("text:Bullish");
});

test("typing before a tag sends its component nothing", async () => {
  const app = await openEditor();
  await app.press("text:/^End/");
  await app.keyboard.press("mod+up");
  await app.type("id:editor", "Do ");
  await app.waitFor("text:/Do Buy/");
  expect(app.shows("text:tag renders: 1")).toBe(true);
  // Its position moved with the text: the pill still changes it.
  await app.press("id:tag-pill");
  await app.waitFor("text:trend: 2");
});

test("the caret steps over an inline tag as one position", async () => {
  const app = await openEditor();
  await app.press("text:/^End/");
  await app.keyboard.press("mod+up");
  // "Buy " is four positions; the tag is the fifth.
  for (let i = 0; i < 4; i++) await app.keyboard.press("right");
  await app.waitFor("text:selection: text 5");
  await app.keyboard.press("right");
  await app.waitFor("text:selection: text 6");
  await app.keyboard.press("left");
  await app.waitFor("text:selection: text 5");
});

test("a press on the tag's own area selects it", async () => {
  const app = await openEditor();
  await app.press("text:$NVDA");
  await app.waitFor("text:selection: node 5");
  await app.waitFor("text:tag selected");
});

test("a press on the card selects it, and Backspace deletes it", async () => {
  const app = await openEditor();
  await app.press("text:order 42");
  await app.waitFor("text:card selected");
  await app.keyboard.press("backspace");
  await app.waitFor("text:blocks: 2");
  expect(app.shows("text:order 42")).toBe(false);
  await app.keyboard.press("mod+z");
  await app.waitFor("text:order 42");
});

test("the card's button deletes its node", async () => {
  const app = await openEditor();
  await app.press("id:card-remove");
  await app.waitFor("text:blocks: 2");
  expect(app.shows("text:order 42")).toBe(false);
});
