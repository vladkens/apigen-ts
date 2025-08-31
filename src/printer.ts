import path from "node:path"
import ts from "typescript"

export const printCode = (nodes: ts.Node[]) => {
  const printer = ts.createPrinter()
  const sourceFile = ts.createSourceFile(
    "temp.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  )

  return nodes
    .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile))
    .join("\n\n")
    .replaceAll("}, ", "},\n\n")
}

export const formatCode = async (code: string) => {
  try {
    const prettier = await import("prettier")
    // file: https://github.com/prettier/prettier/issues/10698#issuecomment-845075379
    const options = await prettier.resolveConfig(path.join(process.cwd(), "file"))
    return prettier.format(code, { ...options, parser: "typescript" })
  } catch (e) {
    return code
  }
}
