export type Labels = Readonly<Record<string, string>>;

export interface DiffSpan {
  readonly text: string;
  readonly style: string;
  readonly token: string;
  readonly tooltip: string | null;
}

export interface DiffCell {
  readonly oldLine: number | string | null;
  readonly newLine: number | null;
  readonly style: string;
  readonly spans: ReadonlyArray<DiffSpan>;
  readonly noEofNewline: boolean;
  readonly anchor: {
    readonly side: "old" | "new";
    readonly line: number;
    readonly group: number;
  } | null;
}

export type DiffAnchor = NonNullable<DiffCell["anchor"]>;

export interface DiffView {
  readonly language: string;
  readonly added: number;
  readonly removed: number;
  readonly whitespaceOnlyHidden: boolean;
  readonly rows: ReadonlyArray<{
    readonly cells: ReadonlyArray<DiffCell>;
    readonly fullWidth: boolean;
  }>;
}
