// Staff-only bytes preview; original accounting strings remain strings.
export type FileFormat='csv'|'xlsx'|'xlsb';
export interface ColumnBinding {column:number;representation:'display'|'raw'|'excel-year'} // 1 based
export interface FilePreviewCell {type:string;raw:unknown;display:string;format:string|null;formula:string|null;dateCandidate:{year:number;month:number;day:number}|null;dateIssue:string|null}
export interface FilePreviewSheet {name:string;nonEmptyRows:number;rows:{row:number;cells:(FilePreviewCell|null)[]}[]}
export interface FilePreviewInput {
 branchId:string;sourceNamespace:string;format:FileFormat;base64:string;
 mapping:{sheet:string;startRow:number;mode:'funds'|'documents';columns:Record<string,ColumnBinding>;defaults:Record<string,unknown>;catalog?:unknown};
}
