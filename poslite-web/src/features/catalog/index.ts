// Public API of the catalog feature.
export { type Catalog, useCatalog } from "./application/use-catalog";
export { type LineChoice, LineEditorDialog } from "./components/LineEditorDialog";
export { ProductGrid } from "./components/ProductGrid";
export { type ModifierGroup, type ModifierOption, type SelectionError, toggleOption, validateSelection } from "./domain/modifier-selection";
