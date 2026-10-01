import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

/** Half-open source offsets. UTF-16 by default, matching String.slice. */
export interface MagicBoxSpan<T = unknown> {
  readonly id: string;
  readonly label: string;
  readonly start: number;
  readonly end: number;
  readonly value?: T;
  readonly confidence?: number | null;
  readonly tone?: "ember" | "sage" | "sky" | "lilac";
}

export type OffsetUnit = "utf16" | "codepoint";
export type MagicBoxStatus = "idle" | "extracting" | "success" | "error";

export interface ExtractionContext<TSchema = unknown> {
  readonly signal: AbortSignal;
  readonly schema?: TSchema | undefined;
}

export type MagicBoxExtractor<T = unknown, TSchema = unknown> = (
  text: string,
  context: ExtractionContext<TSchema>,
) => Promise<readonly MagicBoxSpan<T>[]>;

export interface UseMagicBoxOptions<T = unknown, TSchema = unknown> {
  value?: string;
  defaultValue?: string;
  /** Passed to the host extractor. Replace its reference to change the extraction target. */
  schema?: TSchema;
  /** Initial annotations for the initial source. Later work goes through onExtract. */
  defaultSpans?: readonly MagicBoxSpan<T>[];
  onValueChange?: (value: string) => void;
  onExtract: MagicBoxExtractor<T, TSchema>;
  onResult?: (spans: readonly MagicBoxSpan<T>[], text: string) => void;
  onError?: (error: Error) => void;
  offsetUnit?: OffsetUnit;
}

export interface MagicBoxController<T = unknown> {
  readonly value: string;
  readonly status: MagicBoxStatus;
  readonly spans: readonly MagicBoxSpan<T>[];
  readonly selectedSpan: MagicBoxSpan<T> | null;
  readonly error: Error | null;
  readonly canExtract: boolean;
  setValue: (value: string) => void;
  extract: () => Promise<void>;
  cancel: () => void;
  edit: () => void;
  clear: () => void;
  select: (id: string) => void;
}

export interface MagicBoxLabels {
  source: string;
  placeholder: string;
  extract: string;
  extracting: string;
  cancel: string;
  edit: string;
  clear: string;
  ready: string;
  empty: string;
  fields: string;
  selected: string;
  results: (count: number) => string;
  confidence: (value: number) => string;
  sourceRange: (start: number, end: number) => string;
  previous: string;
  next: string;
  navigation: string;
  position: (selectedIndex: number, count: number) => string;
  field: (label: string, sourceText: string, index: number) => string;
  highlight: (label: string, sourceText: string) => string;
}

export interface MagicBoxProps<T = unknown, TSchema = unknown> extends UseMagicBoxOptions<
  T,
  TSchema
> {
  id?: string;
  sourceTitle?: string;
  className?: string;
  style?: CSSProperties;
  /** Native wrapper attributes and events. The component owns its children and state attributes. */
  rootProps?: Omit<ComponentPropsWithoutRef<"div">, "children" | "dangerouslySetInnerHTML"> & {
    [key: `data-${string}`]: string | number | boolean | undefined;
  };
  theme?: "dark" | "light" | "auto";
  unstyled?: boolean;
  disabled?: boolean;
  labels?: Partial<MagicBoxLabels>;
  /** Used as the textarea's native name for host forms. No nested form is created. */
  name?: string;
  rows?: number;
  maxLength?: number;
  textareaProps?: Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "defaultValue" | "onChange" | "id" | "name" | "rows" | "maxLength" | "disabled"
  >;
  renderValue?: (span: MagicBoxSpan<T>, source: string) => ReactNode;
  onSelectionChange?: (span: MagicBoxSpan<T>) => void;
}
