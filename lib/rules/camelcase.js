/**
 * @fileoverview Rule to flag non-camelcased identifiers
 * @author Nicholas C. Zakas
 */

"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description: "enforce camelcase naming convention",
            category: "Stylistic Issues",
            recommended: false
        },

        schema: [
            {
                type: "object",
                properties: {
                    properties: {
                        enum: ["always", "never"]
                    }
                },
                additionalProperties: false
            }
        ],

        fixable: "whitespace"
    },

    create(context) {

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        // keep the sourceCode object for later to fix
        const sourceCode = context.getSourceCode();

        // contains reported nodes to avoid reporting twice on destructuring with shorthand notation
        const reported = [];
        const ALLOWED_PARENT_TYPES = new Set(["CallExpression", "NewExpression"]);

        /**
         * Checks if a string contains an underscore and isn't all upper-case
         * @param {string} name The string to check.
         * @returns {boolean} if the string is underscored
         * @private
         */
        function isUnderscored(name) {

            // if there's an underscore, it might be A_CONSTANT, which is okay
            return name.indexOf("_") > -1 && name !== name.toUpperCase();
        }

        /**
         * Removes underscores in the given text. If an underscore is followed by another character,
         * it will be uppercased so that it will match the camelCase rule.
         * @param {string} text The text to remove underscores from.
         * @returns {string} The text with underscores removed.
         * @private
         */
        function removeUnderscore(text) {
            const privateFlagPrefixRegExp = new RegExp(/^_+/);
            const privateFlagSuffixRegExp = new RegExp(/_+$/);
            let privateFlagPrefix = "";
            let privateFlagSuffix = "";

            if (privateFlagPrefixRegExp.test(text)) {
                privateFlagPrefix = privateFlagPrefixRegExp.exec(text)[0];
            }

            if (privateFlagSuffixRegExp.test(text)) {
                privateFlagSuffix = privateFlagSuffixRegExp.exec(text)[0];
            }

            const targetText = text.replace(/^_+|_+$/g, "");
            let newText = "";
            let wasUnderscore = false;

            /*
             * Remove all underscores and uppercase the following character in the given text.
            */
            for (let i = 0; i < targetText.length; i++) {
                let str = targetText[i];

                if (str === "_") {
                    wasUnderscore = true;
                    continue;
                }

                if (wasUnderscore) {
                    str = str.toUpperCase();
                    wasUnderscore = false;
                }
                newText = newText.concat(str);
            }

            newText = privateFlagPrefix.concat(newText, privateFlagSuffix);

            return newText;
        }

        /**
         * Reports an AST node as a rule violation.
         * @param {ASTNode} node The node to report.
         * @returns {void}
         * @private
         */
        function report(node) {
            if (reported.indexOf(node) < 0) {
                reported.push(node);
                context.report({
                    node,
                    message: "Identifier '{{name}}' is not in camel case.",
                    data: { name: node.name },
                    fix(fixer) {
                        const text = sourceCode.getText(node);
                        const newText = removeUnderscore(text);

                        return fixer.replaceText(node, newText);
                    }
                });
            }
        }

        const options = context.options[0] || {};
        let properties = options.properties || "";

        if (properties !== "always" && properties !== "never") {
            properties = "always";
        }

        return {

            Identifier(node) {

                /*
                 * Leading and trailing underscores are commonly used to flag
                 * private/protected identifiers, strip them
                 */
                const name = node.name.replace(/^_+|_+$/g, ""),
                    effectiveParent = (node.parent.type === "MemberExpression") ? node.parent.parent : node.parent;

                // MemberExpressions get special rules
                if (node.parent.type === "MemberExpression") {

                    // "never" check properties
                    if (properties === "never") {
                        return;
                    }

                    // Always report underscored object names
                    if (node.parent.object.type === "Identifier" &&
                            node.parent.object.name === node.name &&
                            isUnderscored(name)) {
                        report(node);

                    // Report AssignmentExpressions only if they are the left side of the assignment
                    } else if (effectiveParent.type === "AssignmentExpression" &&
                            isUnderscored(name) &&
                            (effectiveParent.right.type !== "MemberExpression" ||
                            effectiveParent.left.type === "MemberExpression" &&
                            effectiveParent.left.property.name === node.name)) {
                        report(node);
                    }

                // Properties have their own rules
                } else if (node.parent.type === "Property") {

                    // "never" check properties
                    if (properties === "never") {
                        return;
                    }

                    if (node.parent.parent && node.parent.parent.type === "ObjectPattern" &&
                            node.parent.key === node && node.parent.value !== node) {
                        return;
                    }

                    if (isUnderscored(name) && !ALLOWED_PARENT_TYPES.has(effectiveParent.type)) {
                        report(node);
                    }

                // Check if it's an import specifier
                } else if (["ImportSpecifier", "ImportNamespaceSpecifier", "ImportDefaultSpecifier"].indexOf(node.parent.type) >= 0) {

                    // Report only if the local imported identifier is underscored
                    if (node.parent.local && node.parent.local.name === node.name && isUnderscored(name)) {
                        report(node);
                    }

                // Report anything that is underscored that isn't a CallExpression
                } else if (isUnderscored(name) && !ALLOWED_PARENT_TYPES.has(effectiveParent.type)) {
                    report(node);
                }
            }

        };

    }
};
