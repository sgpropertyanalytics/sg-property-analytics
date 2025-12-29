/**
 * ESLint Rule: require-tabular-nums
 *
 * Warns when elements displaying numeric values are missing
 * the tabular-nums class for proper alignment.
 *
 * VIOLATION CODE: TYPO-002, TYPO-003
 *
 * @example
 * // Warning - numeric value without tabular-nums
 * <span className="font-mono">{price}</span>
 *
 * // Good - has tabular-nums
 * <span className="font-mono tabular-nums">{price}</span>
 *
 * // Good - complete KPI styling
 * <span className="font-mono tabular-nums whitespace-nowrap">{value}</span>
 */

// Props that indicate numeric content
const NUMERIC_PROP_PATTERNS = [
  'value',
  'price',
  'psf',
  'count',
  'median',
  'avg',
  'average',
  'total',
  'sum',
  'percentage',
  'percent',
  'amount',
  'quantity',
  'number',
  'num',
  'cost',
  'rate',
];

// Component names that typically display numbers
const NUMERIC_COMPONENT_PATTERNS = ['kpi', 'stat', 'metric', 'price', 'value', 'count', 'number'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require tabular-nums on numeric display values',
      category: 'Design System',
      recommended: true,
    },
    schema: [],
    messages: {
      missingTabularNums:
        '[TYPO-002] Numeric value should have "tabular-nums" class for proper alignment.',
      missingFontMono:
        '[TYPO-003] Numeric value should have "font-mono" class for consistent character width.',
      missingWhitespaceNowrap:
        '[TYPO-004] KPI/price value should have "whitespace-nowrap" to prevent wrapping.',
    },
  },

  create(context) {
    /**
     * Check if className contains a specific class
     */
    function hasClass(classString, targetClass) {
      if (!classString || typeof classString !== 'string') return false;
      const classes = classString.split(/\s+/);
      return classes.includes(targetClass);
    }

    /**
     * Check if element has font-data class (Bloomberg Terminal style)
     * This class combines font-mono + tabular-nums + medium weight
     */
    function hasFontData(classString) {
      return hasClass(classString, 'font-data');
    }

    /**
     * Check if element has font-mono already (indicates numeric intent)
     */
    function hasFontMono(classString) {
      return hasClass(classString, 'font-mono');
    }

    /**
     * Check if element has tabular-nums
     */
    function hasTabularNums(classString) {
      return hasClass(classString, 'tabular-nums');
    }

    /**
     * Check if element has whitespace-nowrap
     */
    function hasWhitespaceNowrap(classString) {
      return hasClass(classString, 'whitespace-nowrap');
    }

    /**
     * Check if any attribute name suggests numeric content
     */
    function hasNumericProp(attributes) {
      return attributes.some((attr) => {
        if (attr.type !== 'JSXAttribute' || !attr.name) return false;
        const propName = (attr.name.name || '').toLowerCase();
        return NUMERIC_PROP_PATTERNS.some(
          (pattern) => propName.includes(pattern) || propName === pattern
        );
      });
    }

    /**
     * Check if component name suggests numeric content
     */
    function isNumericComponent(elementName) {
      if (!elementName) return false;
      const name = elementName.toLowerCase();
      return NUMERIC_COMPONENT_PATTERNS.some((pattern) => name.includes(pattern));
    }

    /**
     * Extract className string from JSX attribute
     */
    function getClassNameString(classNameAttr) {
      if (!classNameAttr || !classNameAttr.value) return '';

      if (classNameAttr.value.type === 'Literal') {
        return classNameAttr.value.value || '';
      }

      // For expressions, we can't easily extract the string
      // but we can check if tabular-nums appears in template literals
      if (classNameAttr.value.type === 'JSXExpressionContainer') {
        const expr = classNameAttr.value.expression;
        if (expr.type === 'TemplateLiteral') {
          return expr.quasis.map((q) => q.value.raw).join(' ');
        }
        if (expr.type === 'Literal' && typeof expr.value === 'string') {
          return expr.value;
        }
      }

      return '';
    }

    /**
     * Get element name from JSX opening element
     */
    function getElementName(openingElement) {
      if (!openingElement || !openingElement.name) return '';
      if (openingElement.name.type === 'JSXIdentifier') {
        return openingElement.name.name;
      }
      if (openingElement.name.type === 'JSXMemberExpression') {
        return openingElement.name.property ? openingElement.name.property.name : '';
      }
      return '';
    }

    return {
      JSXOpeningElement(node) {
        const attributes = node.attributes || [];
        const classNameAttr = attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name && attr.name.name === 'className'
        );

        const className = getClassNameString(classNameAttr);
        const elementName = getElementName(node);

        // Skip if no className attribute
        if (!classNameAttr) return;

        // Skip all checks if font-data class is present
        // font-data combines: font-mono + tabular-nums + medium weight (Bloomberg style)
        if (hasFontData(className)) {
          return;
        }

        // Check 1: Element has font-mono but not tabular-nums
        // This strongly indicates numeric content intent
        if (hasFontMono(className) && !hasTabularNums(className)) {
          context.report({
            node: classNameAttr,
            messageId: 'missingTabularNums',
          });
        }

        // Check 2: Element has numeric props but no tabular-nums or font-mono
        // This is a weaker signal, so we only check for tabular-nums if font-mono is present
        if (hasNumericProp(attributes)) {
          if (hasFontMono(className) && !hasTabularNums(className)) {
            // Already reported above
          } else if (!hasFontMono(className) && isNumericComponent(elementName)) {
            // Component name suggests numeric, but no font-mono
            context.report({
              node: classNameAttr,
              messageId: 'missingFontMono',
            });
          }
        }

        // Check 3: KPI-like components should have whitespace-nowrap
        if (isNumericComponent(elementName)) {
          if (hasFontMono(className) && hasTabularNums(className) && !hasWhitespaceNowrap(className)) {
            context.report({
              node: classNameAttr,
              messageId: 'missingWhitespaceNowrap',
            });
          }
        }
      },
    };
  },
};
