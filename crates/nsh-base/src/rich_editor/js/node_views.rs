//! Node views in TSX (Tiptap's `addNodeView` with `ReactNodeViewRenderer`):
//! an extension's `addNodeView` returns a component, and the editor
//! renders each node of the extension's type with it.
//!
//! The component is the app's JS function; a [`JsNodeView`] is the
//! kernel's side of it, a [`NodeView`] like any other, registered by a
//! plugin of the extension. Its element is a render of the editor
//! component's ([`Scope::renderer`]), reactive and keyed by the node
//! view's place (`NodeViewCx::key`): the value is the node, whether it is
//! selected and the extension, never its position, so typing, even right
//! before the node, sends JS nothing, and an attribute or selection change
//! updates the props of what the component rendered in place. `getPos`,
//! `updateAttributes` and `deleteNode` are methods of a [`RichNodeView`]
//! bound to its object; they run in the JS call, against the position the
//! view keeps current.

use std::{cell::RefCell, rc::Rc, sync::Arc};

use nsh_core::{
    JsonValue,
    element::{Callback, Instance, JsHost, JsIn, JsOwned, JsValue, PropError, Ret, TsTypes},
    prelude::*,
};

use super::{
    RichEditorSession,
    plugins::{CallGuard, HookRef},
};
use crate::rich_editor::{
    commands::CommandRegistry,
    model::{Attrs, Node},
    state::{Plugin, PluginKey, PluginSpec, ViewFactory},
    view::{EditorSession, NodeView, NodeViewCx, WeakSession},
};

/// The name the editor component renders node views under (no prop of
/// `RichEditor` has it).
const RENDER_NAME: &str = "nodeView";

/// TS: `RichNodeViewProps`.
const PROPS_TS: &str = "/** What a node view's component gets (`addNodeView`; Tiptap's `NodeViewProps`). The component runs once per node: these props follow the node, so read them where they are used (`props.node.attrs.trend`) rather than taking them apart. */
export interface RichNodeViewProps {
  /** The node: its type's name, its attributes and its text. */
  readonly node: { readonly type: string; readonly attrs: Record<string, unknown>; readonly textContent: string };
  /** Whether a node selection holds the node. */
  readonly selected: boolean;
  /** The editor the node is in. */
  readonly editor: RichEditorSession;
  /** The extension that renders it: its name and options. */
  readonly extension: { readonly name: string; readonly options: Record<string, unknown> };
  /** Where the node starts in the current document; `undefined` once it is gone. */
  getPos(): number | undefined;
  /** Merges `attrs` into the node's attributes, as one change that undo takes back. Throws when the node is gone or an attribute is not the type's. */
  updateAttributes(attrs: Record<string, unknown>): void;
  /** Deletes the node, as one change that undo takes back. */
  deleteNode(): void;
}";

/// The extension a node view renders for: its name and options.
#[derive(Debug, PartialEq)]
pub(crate) struct NodeViewExtension {
    pub(crate) name: String,
    pub(crate) options: JsonValue,
}

/// What a node view's component gets (TS: `RichNodeViewProps`). Equal
/// when the node, its selection and the extension are: what JS has
/// rendered stays for an equal value, and its `getPos` keeps answering,
/// since the position is read when it is called.
#[derive(Clone)]
pub(crate) struct RichNodeViewProps {
    node: Node,
    selected: bool,
    extension: Arc<NodeViewExtension>,
    session: EditorSession,
    view: Instance<RichNodeView>,
}

impl PartialEq for RichNodeViewProps {
    fn eq(&self, other: &Self) -> bool {
        (self.node.ptr_eq(&other.node) || self.node == other.node)
            && self.selected == other.selected
            && Arc::ptr_eq(&self.extension, &other.extension)
    }
}

impl JsValue for RichNodeViewProps {
    fn ts_type(types: &mut TsTypes) -> String {
        types.declare("RichNodeViewProps", |_| PROPS_TS.into())
    }

    fn from_js(value: JsIn<'_>) -> Result<Self, PropError> {
        Err(value.expected("a node view's props (made by the editor)"))
    }

    fn to_js<'a>(&self, host: &'a dyn JsHost) -> Result<JsOwned<'a>, PropError> {
        let data = serde_json::json!({
            "node": {
                "type": self.node.ty().name(),
                "attrs": JsonValue::Object(crate::rich_editor::model::json_object(
                    &mut self.node.attrs().iter().map(|(k, v)| (k.clone(), v.clone())),
                )),
                "textContent": self.node.text_content(),
            },
            "selected": self.selected,
            "extension": {
                "name": self.extension.name,
                "options": self.extension.options,
            },
        });
        let props = data.to_js(host)?;
        let object = props.get().raw();
        let editor = Ret::into_js(editor_of(&self.session), host)?;
        host.set_field(object, "editor", editor.into_raw())?;
        let view = Ret::into_js(self.view.clone(), host)?;
        for (field, method) in [
            ("getPos", "getPos"),
            ("updateAttributes", "updateAttributes"),
            ("deleteNode", "deleteNode"),
        ] {
            let bound = host.bind_method(view.get().raw(), method)?;
            host.set_field(object, field, bound)?;
        }
        Ok(props)
    }
}

/// The JS object of `session`: a `RichEditorSession` with the commands of
/// the editor `createRichEditor` made over it.
fn editor_of(session: &EditorSession) -> Instance<RichEditorSession> {
    let schema = session.state().schema().clone();
    let mut editor = RichEditorSession::over(session.clone(), schema);
    if let Some(commands) = commands_of(session) {
        editor.commands = commands;
    }
    Instance::new(editor)
}

thread_local! {
    /// The commands of the editors `createRichEditor` made, by session.
    static COMMANDS: RefCell<Vec<(WeakSession, Arc<CommandRegistry>)>> =
        RefCell::default();
}

/// Notes the commands of the editor made over `session`.
pub(crate) fn note_commands(session: &EditorSession, commands: Arc<CommandRegistry>) {
    COMMANDS.with(|list| {
        let mut list = list.borrow_mut();
        list.retain(|(s, _)| s.alive());
        list.push((session.downgrade(), commands));
    });
}

fn commands_of(session: &EditorSession) -> Option<Arc<CommandRegistry>> {
    COMMANDS.with(|list| {
        list.borrow()
            .iter()
            .find(|(s, _)| s.is(session))
            .map(|(_, c)| c.clone())
    })
}

/// A node view's handle on its node: what `RichNodeViewProps`' `getPos`,
/// `updateAttributes` and `deleteNode` call (bound to it). The editor makes
/// them; apps use the props.
#[class]
pub(crate) struct RichNodeView {
    session: EditorSession,
    get_pos: Rc<dyn Fn() -> Option<usize>>,
}

#[class]
impl RichNodeView {
    /// Where the node starts in the current document; `undefined` once it
    /// is gone.
    #[allow(non_snake_case)]
    pub(crate) fn getPos(&self) -> Option<u32> {
        self.pos().map(|(pos, _)| pos as u32)
    }

    /// Merges `attrs` into the node's attributes, as one change.
    #[allow(non_snake_case)]
    pub(crate) fn updateAttributes(&self, attrs: JsonValue) -> Result<(), String> {
        let JsonValue::Object(changes) = attrs else {
            return Err("updateAttributes takes an object of attributes".into());
        };
        let (pos, node) = self.pos().ok_or("the node is no longer in the document")?;
        let mut merged: Attrs = node.attrs().clone();
        for (name, value) in changes {
            merged.insert(name, value);
        }
        let mut tr = self.session.state().tr();
        tr.set_node_markup(pos, None, Some(merged), None)
            .map_err(|e| e.to_string())?;
        let _guard = CallGuard::enter();
        self.session.dispatch(tr).map_err(|e| e.to_string())
    }

    /// Deletes the node, as one change.
    #[allow(non_snake_case)]
    pub(crate) fn deleteNode(&self) -> Result<(), String> {
        let (pos, node) = self.pos().ok_or("the node is no longer in the document")?;
        let mut tr = self.session.state().tr();
        tr.delete(pos, pos + node.node_size())
            .map_err(|e| e.to_string())?;
        let _guard = CallGuard::enter();
        self.session.dispatch(tr).map_err(|e| e.to_string())
    }
}

impl RichNodeView {
    /// The node's position and the node there now.
    fn pos(&self) -> Option<(usize, Node)> {
        let pos = (self.get_pos)()?;
        let node = self.session.state().doc().node_at(pos)?;
        Some((pos, node))
    }
}

/// The kernel's side of an extension's `addNodeView`: renders the nodes of
/// its type with the app's component.
pub(crate) struct JsNodeView {
    /// Its component, in the table of the thread that made it.
    component: Arc<HookRef>,
    extension: Arc<NodeViewExtension>,
}

impl JsNodeView {
    /// The view of `component` for `extension`'s nodes.
    pub(crate) fn new(
        component: Callback<RichNodeViewProps>,
        extension: NodeViewExtension,
    ) -> Arc<Self> {
        let hooks = HookRef::new();
        hooks.update(|h| h.node_view = Some(component));
        Arc::new(Self {
            component: hooks,
            extension: Arc::new(extension),
        })
    }
}

impl NodeView for JsNodeView {
    fn create(&self, cx: &NodeViewCx, _node: &Node) -> AnyElement {
        let (Some(component), Some(scope)) =
            (self.component.get().and_then(|h| h.node_view), cx.scope)
        else {
            return view().into_element();
        };
        let renderer = scope.renderer(RENDER_NAME, &component).reactive();
        let key = cx.key.clone();
        let session = cx.session.clone();
        let view = Instance::new(RichNodeView {
            session: session.clone(),
            get_pos: cx.get_pos(),
        });
        let (node, selected) = (cx.node(), cx.selected());
        let extension = self.extension.clone();
        dynamic(move || {
            renderer.render(
                key.clone(),
                RichNodeViewProps {
                    node: node.get(),
                    selected: selected.get(),
                    extension: extension.clone(),
                    session: session.clone(),
                    view: view.clone(),
                },
            )
        })
        .into_element()
    }

    // Its element follows the node: the props update in place.
    fn update(&self, _node: &Node, _decorations: &[crate::rich_editor::state::Decoration]) -> bool {
        true
    }
}

/// The plugin registering an extension's node view for its node type.
pub(crate) struct NodeViewPlugin {
    key: PluginKey,
    name: String,
    view: Arc<dyn NodeView>,
}

/// The plugin of `view`, rendering the nodes of type `name`.
pub(crate) fn node_view_plugin(name: &str, view: Arc<JsNodeView>) -> Plugin {
    Arc::new(NodeViewPlugin {
        key: PluginKey::new(&format!("{name}$nodeView")),
        name: name.to_owned(),
        view,
    })
}

impl PluginSpec for NodeViewPlugin {
    fn key(&self) -> PluginKey {
        self.key.clone()
    }

    fn node_views(&self) -> Vec<(String, ViewFactory)> {
        let factory: ViewFactory = Arc::new(self.view.clone());
        vec![(self.name.clone(), factory)]
    }
}
