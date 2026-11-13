//! Inline node views: their `getPos` follows edits before them, and their
//! `selected` follows node selections. (A press on their box is checked on
//! the platforms, `examples/gallery/tests/rich-editor-node-views.test.tsx`:
//! the headless model does not place a text's inline views in its lines.)

use std::sync::Arc;

use nsh_base::rich_editor::{
    model::Node,
    state::{EditorState, EditorStateConfig, NodeSelection, TextSelection},
    view::{EditorSession, NodeView, NodeViewCx, NodeViews},
};
use nsh_core::{element::Root, prelude::*};
use nsh_engine::EngineConfig;
use nsh_testing::Headless;
use serde_json::json;

use super::{Harness, HarnessProps, schema, see};

/// Renders mentions as a chip saying where it is and whether it is
/// selected (read again as the selection changes).
struct Chip;

impl NodeView for Chip {
    fn create(&self, cx: &NodeViewCx, _node: &Node) -> AnyElement {
        let get_pos = cx.get_pos();
        let selected = cx.selected();
        view()
            .w(px(60.0))
            .child(text(move || {
                let pos = get_pos().map_or(-1, |p| p as i64);
                let state = if selected.get() { "selected" } else { "idle" };
                format!("Chip {pos} {state}")
            }))
            .into_element()
    }
}

/// A paragraph `ab`, a mention, `cd`: the mention is at 3.
fn session() -> EditorSession {
    let schema = schema();
    let doc = schema
        .node_from_json(
            &json!({"type": "doc", "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "ab"},
                {"type": "mention", "attrs": {"id": "1", "label": "Ann"}},
                {"type": "text", "text": "cd"}
            ]}]}),
        )
        .unwrap();
    let state = EditorState::create(EditorStateConfig::new(schema).doc(doc)).unwrap();
    EditorSession::new(state, NodeViews::new().with("mention", Arc::new(Chip)))
}

fn start(session: EditorSession) -> Headless {
    let config = EngineConfig {
        viewport: Size::new(px(800.0), px(900.0)),
        ..EngineConfig::new(Root::new::<Harness>(move || HarnessProps {
            session: Some(session.clone()),
        }))
    };
    let mut app = Headless::start(config).expect("the engine starts");
    app.wait_for("text:Ready").unwrap();
    app
}

fn select(
    session: &EditorSession,
    f: impl FnOnce(&EditorState) -> nsh_base::rich_editor::state::Selection,
) {
    let state = session.state();
    let mut tr = state.tr();
    tr.set_selection(f(&state));
    session.dispatch(tr).unwrap();
}

#[test]
fn an_inline_views_position_and_selection_follow_the_document() {
    let session = session();
    let mut app = start(session.clone());
    see(&mut app, "Chip 3 idle");
    select(&session, |s| NodeSelection::create(s.doc(), 3));
    see(&mut app, "Chip 3 selected");
    // Typing before it moves it; its element is not made again.
    select(&session, |s| TextSelection::create(s.doc(), 1, None));
    app.type_text("id:editor", "xy").unwrap();
    see(&mut app, "Doc \"xyab@cd\"");
    select(&session, |s| NodeSelection::create(s.doc(), 5));
    see(&mut app, "Chip 5 selected");
}
