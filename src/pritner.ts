import path from "node:path"
import ts from "typescript"

const f = ts.factory

const addNewLines = <T extends ts.Node>(nodes: T[]) => {
  const result: T[] = []
  for (const node of nodes) {
    result.push(node)
    result.push(f.createIdentifier("\n") as unknown as T)
  }
  return result
}

export const printCode = (nodes: ts.Statement[]) => {
  return ts
    .createPrinter()
    .printFile(
      f.createSourceFile(
        addNewLines(nodes),
        f.createToken(ts.SyntaxKind.EndOfFileToken),
        ts.NodeFlags.None,
      ),
    )
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
