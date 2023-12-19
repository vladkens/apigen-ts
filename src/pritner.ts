import * as prettier from "prettier"
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
  const options = await prettier.resolveConfig(import.meta.url)
  return prettier.format(code, { ...options, parser: "typescript" })
}
