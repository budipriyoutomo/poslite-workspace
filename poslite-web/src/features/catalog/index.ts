// Public API of the catalog feature.
export { markAvailability } from "./application/availability";
export { type Catalog, useCatalog } from "./application/use-catalog";
export { AvailabilityDialog } from "./components/AvailabilityDialog";
export { type LineChoice, LineEditorDialog } from "./components/LineEditorDialog";
export { ProductGrid, ProductGridSkeleton } from "./components/ProductGrid";
export { type ModifierGroup, type ModifierOption, type SelectionError, toggleOption, validateSelection } from "./domain/modifier-selection";
