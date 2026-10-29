// Names of the BIM assistant tools (port of cic-hud services/ai/bimToolNames). No browser or Supabase imports: the
// future server assistant (plan section 5, AI-6) reads the same lists. verify-bim-ai.test.ts checks that every name
// here has a schema in toolSchemas.ts and vice versa.

/** Tools that drive or read the 3D viewer in the browser. */
export const BIM_VIEWER_TOOL_LIST = [
  'viewer_isolate_elements',
  'viewer_highlight_elements',
  'viewer_xray_elements',
  'viewer_hide_elements',
  'viewer_show_all',
  'viewer_fly_to_element',
  'viewer_set_section',
  'viewer_set_section_box',
  'viewer_get_section_context',
  'viewer_set_view',
  'viewer_toggle_discipline',
  'viewer_measure_distance',
  'viewer_save_view',
  'viewer_list_saved_views',
  'viewer_apply_view',
  'viewer_show_clash_cluster',
  'viewer_undo',
] as const;

/** Uniclass 2015 tools over the codes the converter read from IfcClassificationReference. */
export const BIM_UNICLASS_TOOL_LIST = ['get_bim_uniclass', 'viewer_filter_uniclass'] as const;

export type BimViewerToolName = (typeof BIM_VIEWER_TOOL_LIST)[number];
export type BimUniclassToolName = (typeof BIM_UNICLASS_TOOL_LIST)[number];
export type BimToolName = BimViewerToolName | BimUniclassToolName;

export const BIM_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  ...BIM_VIEWER_TOOL_LIST,
  ...BIM_UNICLASS_TOOL_LIST,
]);

/** Tools that change the view: run one after another, each preceded by an undo checkpoint. */
export const BIM_VIEW_CHANGING_TOOLS: ReadonlySet<string> = new Set<string>([
  'viewer_isolate_elements',
  'viewer_highlight_elements',
  'viewer_xray_elements',
  'viewer_hide_elements',
  'viewer_show_all',
  'viewer_fly_to_element',
  'viewer_set_section',
  'viewer_set_section_box',
  'viewer_set_view',
  'viewer_toggle_discipline',
  'viewer_apply_view',
  'viewer_show_clash_cluster',
  'viewer_filter_uniclass',
]);

/** Tools that write data: the assistant only prepares a draft that the user confirms in the app. */
export const BIM_DRAFT_TOOL_NAMES: ReadonlySet<string> = new Set<string>(['viewer_save_view']);
