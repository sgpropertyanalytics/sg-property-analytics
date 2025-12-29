/**
 * ESLint Rule: no-arbitrary-font-size
 *
 * Disallows arbitrary font sizes in Tailwind classes unless they're
 * in the approved exceptions list.
 *
 * VIOLATION CODE: TYPO-001
 *
 * @example
 * // Bad - arbitrary size not in approved list
 * <div className="text-[13px]">...</div>
 * <div className="text-[1.5rem]">...</div>
 *
 * // Good - standard Tailwind scale
 * <div className="text-sm">...</div>
 * <div className="text-base">...</div>
 *
 * // Good - approved exceptions
 * <div className="text-[22px]">...</div>  // KPI hero values
 * <div className="text-[10px]">...</div>  // Footnotes
 */

// Approved arbitrary sizes (from design-rules.js)
const ALLOWED_ARBITRARY_SIZES = [
  'text-[7px]',
  'text-[8px]',
  'text-[9px]',
  'text-[10px]',
  'text-[11px]',
  'text-[22px]',
  'text-[28px]',
  'text-[32px]',
];

// Standard Tailwind sizes
const STANDARD_SIZES = [
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
];

// Size mapping for suggestions
const SIZE_SUGGESTIONS = {
  '12px': 'text-xs',
  '13px': 'text-sm',
  '14px': 'text-sm',
  '15px': 'text-base',
  '16px': 'text-base',
  '17px': 'text-lg',
  '18px': 'text-lg',
  '19px': 'text-xl',
  '20px': 'text-xl',
  '21px': 'text-xl',
  '22px': 'text-[22px]',
  '23px': 'text-2xl',
  '24px': 'text-2xl',
  '25px': 'text-2xl',
  '26px': 'text-2xl',
  '27px': 'text-2xl',
  '28px': 'text-[28px]',
  '29px': 'text-3xl',
  '30px': 'text-3xl',
  '31px': 'text-3xl',
  '32px': 'text-[32px]',
};

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow arbitrary font sizes in Tailwind classes',
      category: 'Design System',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      arbitraryFontSize:
        '[TYPO-001] Arbitrary font size "{{size}}" is not allowed. Use {{suggestion}}.',
    },
  },

  create(context) {
    /**
     * Extract arbitrary size classes from a className string
     */
    function findArbitrarySizes(classString) {
      if (!classString || typeof classString !== 'string') return [];

      const arbitraryPattern = /text-\[(\d+(?:\.\d+)?(?:px|rem|em))\]/g;
      const matches = [];
      let match;

      while ((match = arbitraryPattern.exec(classString)) !== null) {
        matches.push({
          full: match[0],
          value: match[1],
          index: match.index,
        });
      }

      return matches;
    }

    /**
     * Get suggestion for a size value
     */
    function getSuggestion(sizeValue) {
      // If it's an approved exception, no suggestion needed
      const fullClass = `text-[${sizeValue}]`;
      if (ALLOWED_ARBITRARY_SIZES.includes(fullClass)) {
        return null;
      }

      // Look up in size map
      if (SIZE_SUGGESTIONS[sizeValue]) {
        return SIZE_SUGGESTIONS[sizeValue];
      }

      // Parse numeric value and suggest closest
      const numericMatch = sizeValue.match(/^(\d+(?:\.\d+)?)/);
      if (numericMatch) {
        const num = parseFloat(numericMatch[1]);
        if (num <= 12) return 'text-xs';
        if (num <= 14) return 'text-sm';
        if (num <= 16) return 'text-base';
        if (num <= 18) return 'text-lg';
        if (num <= 20) return 'text-xl';
        if (num <= 24) return 'text-2xl';
        if (num <= 30) return 'text-3xl';
        return 'text-4xl';
      }

      return 'a standard Tailwind size (text-xs, text-sm, text-base, etc.)';
    }

    /**
     * Check className attribute
     */
    function checkClassNameAttribute(node) {
      // Handle string literal className
      if (node.value && node.value.type === 'Literal') {
        const classString = node.value.value;
        const arbitrarySizes = findArbitrarySizes(classString);

        for (const size of arbitrarySizes) {
          const fullClass = size.full;

          // Skip if it's an allowed exception
          if (ALLOWED_ARBITRARY_SIZES.includes(fullClass)) {
            continue;
          }

          const suggestion = getSuggestion(size.value);

          context.report({
            node: node.value,
            messageId: 'arbitraryFontSize',
            data: {
              size: fullClass,
              suggestion: suggestion || 'a standard Tailwind size',
            },
            fix(fixer) {
              if (suggestion && !suggestion.includes('(')) {
                const newValue = classString.replace(fullClass, suggestion);
                return fixer.replaceText(node.value, `"${newValue}"`);
              }
              return null;
            },
          });
        }
      }

      // Handle template literal className
      if (node.value && node.value.type === 'JSXExpressionContainer') {
        const expr = node.value.expression;

        // Handle simple template literals
        if (expr.type === 'TemplateLiteral') {
          for (const quasi of expr.quasis) {
            const classString = quasi.value.raw;
            const arbitrarySizes = findArbitrarySizes(classString);

            for (const size of arbitrarySizes) {
              if (!ALLOWED_ARBITRARY_SIZES.includes(size.full)) {
                const suggestion = getSuggestion(size.value);
                context.report({
                  node: quasi,
                  messageId: 'arbitraryFontSize',
                  data: {
                    size: size.full,
                    suggestion: suggestion || 'a standard Tailwind size',
                  },
                });
              }
            }
          }
        }

        // Handle string concatenation or conditionals containing strings
        if (expr.type === 'Literal' && typeof expr.value === 'string') {
          const arbitrarySizes = findArbitrarySizes(expr.value);
          for (const size of arbitrarySizes) {
            if (!ALLOWED_ARBITRARY_SIZES.includes(size.full)) {
              const suggestion = getSuggestion(size.value);
              context.report({
                node: expr,
                messageId: 'arbitraryFontSize',
                data: {
                  size: size.full,
                  suggestion: suggestion || 'a standard Tailwind size',
                },
              });
            }
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
