import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
import { isChakraElement } from "../lib/isChakraElement";
import { ParserServices } from "@typescript-eslint/utils";
import {
  JSXAttribute,
  JSXElement,
  JSXOpeningElement,
} from "@typescript-eslint/utils/node_modules/@typescript-eslint/types/dist/ast-spec";
import { RuleFix } from "@typescript-eslint/utils/dist/ts-eslint";
import { getImportDeclarationOfJSX } from "../lib/getImportDeclaration";
import { findSpecificComponent } from "../lib/findSpecificComponent";

export const requireSpecificComponentRule: TSESLint.RuleModule<"requireSpecificComponent", []> = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforces the usage of specific Chakra component.",
      recommended: "error",
      url: "https://github.com/Monchi/eslint-plugin-chakra-ui/blob/master/docs/rules/require-specific-component.md",
    },
    messages: {
      requireSpecificComponent:
        "'{{invalidComponent}}' with attribute '{{attribute}}' could be replaced by '{{validComponent}}'.",
    },
    schema: [],
    fixable: "code",
  },

  create: ({ parserServices, report, getSourceCode }) => {
    if (!parserServices) {
      return {};
    }

    return {
      JSXOpeningElement(node) {
        if (!isChakraElement(node, parserServices)) {
          return;
        }

        const sourceCode = getSourceCode();
        const componentName = sourceCode.getText(node.name);
        if (componentName !== "Box") {
          return;
        }

        for (const attribute of node.attributes) {
          if (attribute.type !== AST_NODE_TYPES.JSXAttribute || attribute.value == null) {
            continue;
          }

          const specificComponent = findSpecificComponent(
            componentName,
            sourceCode.getText(attribute.name),
            sourceCode.getText(attribute.value)
          );
          if (specificComponent == null) {
            continue;
          }

          return report({
            node: node,
            messageId: "requireSpecificComponent",
            data: {
              invalidComponent: componentName,
              validComponent: specificComponent,
              attribute: sourceCode.getText(attribute),
            },
            fix(fixer) {
              const renameStartTag = fixer.replaceText(node.name, specificComponent);

              return [
                renameStartTag,
                createFixToRenameEndTag(node, specificComponent, fixer),
                createFixToRemoveAttribute(attribute, node, fixer),
                createFixToInsertImport(node, specificComponent, parserServices, fixer),
              ].filter((v) => !!v) as RuleFix[];
            },
          });
        }
      },
    };
  },
};

function createFixToRenameEndTag(jsxNode: JSXOpeningElement, validComponent: string, fixer: TSESLint.RuleFixer) {
  const endNode = (jsxNode.parent as JSXElement)?.closingElement;
  return endNode ? fixer.replaceText(endNode.name, validComponent) : null;
}

function createFixToRemoveAttribute(attribute: JSXAttribute, jsxNode: JSXOpeningElement, fixer: TSESLint.RuleFixer) {
  const attributeIndex = jsxNode.attributes.findIndex((a) => a === attribute);

  if (attributeIndex === jsxNode.attributes.length - 1) {
    // in case of last attribute
    const prevAttribute = jsxNode.attributes[attributeIndex - 1];
    return fixer.removeRange([prevAttribute.range[1], attribute.range[1]]);
  } else {
    const nextAttribute = jsxNode.attributes[attributeIndex + 1];
    return fixer.removeRange([attribute.range[0], nextAttribute.range[0]]);
  }
}

function createFixToInsertImport(
  jsxNode: JSXOpeningElement,
  validComponent: string,
  parserServices: ParserServices,
  fixer: TSESLint.RuleFixer
) {
  const importDecl = getImportDeclarationOfJSX(jsxNode, parserServices);
  if (!importDecl) {
    throw new Error("No ImportDeclaration found.");
  }

  const sameNameSpecifier = importDecl.specifiers.find(
    (sp) => sp.type === AST_NODE_TYPES.ImportSpecifier && sp.local.name === validComponent
  );
  if (sameNameSpecifier != null) {
    // in case of already imported
    return null;
  }

  const last = importDecl.specifiers[importDecl.specifiers.length - 1];
  if (importDecl.loc.start.line !== last.loc.start.line) {
    // in case of multi line
    const indent = " ".repeat(last.loc.start.column);
    return fixer.insertTextAfter(last, `,\n${indent}${validComponent}`);
  } else {
    return fixer.insertTextAfter(last, `, ${validComponent}`);
  }
}
