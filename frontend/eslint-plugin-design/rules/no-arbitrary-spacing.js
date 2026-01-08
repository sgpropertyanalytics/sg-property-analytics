/**
 * ESLint Rule: no-arbitrary-spacing
 *
 * Disallows arbitrary pixel spacing values like p-[13px] or gap-[5px].
 * Use the spacing scale tokens instead.
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow arbitrary pixel spacing values in Tailwind classes',
      category: 'Design System',
      recommended: true,
    },
    schema: [],
    messages: {
      arbitrarySpacing:
        '[SPACE-001] Arbitrary pixel spacing "{{value}}" is not allowed. Use the spacing scale tokens.',
    },
  },

  create(context) {
    function findArbitrarySpacing(classString) {
      if (!classString || typeof classString !== 'string') return [];

      const pattern = /\[[0-9]+px\]/g;
      const matches = [];
      let match;

      while ((match = pattern.exec(classString)) !== null) {
        matches.push({
          value: match[0],
          index: match.index,
        });
      }

      return matches;
    }

    function checkClassNameAttribute(node) {
      if (node.value && node.value.type === 'Literal') {
        const classString = node.value.value;
        const matches = findArbitrarySpacing(classString);

        for (const spacing of matches) {
          context.report({
            node: node.value,
            messageId: 'arbitrarySpacing',
            data: { value: spacing.value },
          });
        }
      }

      if (node.value && node.value.type === 'JSXExpressionContainer') {
        const expr = node.value.expression;

        if (expr.type === 'TemplateLiteral') {
          for (const quasi of expr.quasis) {
            const classString = quasi.value.raw;
            const matches = findArbitrarySpacing(classString);

            for (const spacing of matches) {
              context.report({
                node: quasi,
                messageId: 'arbitrarySpacing',
                data: { value: spacing.value },
              });
            }
          }
        }

        if (expr.type === 'Literal' && typeof expr.value === 'string') {
          const matches = findArbitrarySpacing(expr.value);
          for (const spacing of matches) {
            context.report({
              node: expr,
              messageId: 'arbitrarySpacing',
              data: { value: spacing.value },
            });
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name && node.name.name === 'className') {
          checkClassNameAttribute(node);
        }
      },
    };
  },
};
