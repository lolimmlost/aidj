import { jsx } from 'react/jsx-runtime';
import { c as cn } from './ssr.mjs';

const Card = ({ className, ref, ...props }) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    ),
    ...props
  }
);
Card.displayName = "Card";
const CardHeader = ({ className, ref, ...props }) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn("flex flex-col space-y-1.5 p-6", className),
    ...props
  }
);
CardHeader.displayName = "CardHeader";
const CardTitle = ({ className, ref, ...props }) => /* @__PURE__ */ jsx(
  "h3",
  {
    ref,
    className: cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    ),
    ...props
  }
);
CardTitle.displayName = "CardTitle";
const CardDescription = ({ className, ref, ...props }) => /* @__PURE__ */ jsx(
  "p",
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
);
CardDescription.displayName = "CardDescription";
const CardContent = ({ className, ref, ...props }) => /* @__PURE__ */ jsx("div", { ref, className: cn("p-6 pt-0", className), ...props });
CardContent.displayName = "CardContent";

export { Card as C, CardHeader as a, CardTitle as b, CardContent as c, CardDescription as d };
//# sourceMappingURL=card-B5xu2Fa9.mjs.map
