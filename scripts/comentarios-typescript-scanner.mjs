// P10-25: adaptador único sobre typescript@7.0.2/unstable; si Microsoft cambia la API, se arregla acá.
import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import {
  computeLineStarts,
  createScanner,
  forEachLeadingCommentRange,
  forEachTrailingCommentRange,
} from "typescript/unstable/ast/scanner";

export {
  LanguageVariant,
  SyntaxKind,
  computeLineStarts,
  createScanner,
  forEachLeadingCommentRange,
  forEachTrailingCommentRange,
};

/** @returns {{ ok: boolean, mensaje?: string }} */
export function contratoTypescriptScannerOk() {
  const faltantes = [];
  if (typeof createScanner !== "function") faltantes.push("createScanner");
  if (typeof computeLineStarts !== "function") faltantes.push("computeLineStarts");
  if (typeof forEachLeadingCommentRange !== "function") faltantes.push("forEachLeadingCommentRange");
  if (typeof forEachTrailingCommentRange !== "function") faltantes.push("forEachTrailingCommentRange");
  if (LanguageVariant?.Standard === undefined) faltantes.push("LanguageVariant.Standard");
  if (LanguageVariant?.JSX === undefined) faltantes.push("LanguageVariant.JSX");
  if (SyntaxKind?.EndOfFile === undefined) faltantes.push("SyntaxKind.EndOfFile");
  if (SyntaxKind?.SingleLineCommentTrivia === undefined) faltantes.push("SyntaxKind.SingleLineCommentTrivia");
  if (SyntaxKind?.MultiLineCommentTrivia === undefined) faltantes.push("SyntaxKind.MultiLineCommentTrivia");
  if (faltantes.length) {
    return {
      ok: false,
      mensaje: `contrato typescript scanner roto (${faltantes.join(", ")}): actualizá scripts/comentarios-typescript-scanner.mjs; la versión fijada es typescript@7.0.2 en package.json.`,
    };
  }
  return { ok: true };
}